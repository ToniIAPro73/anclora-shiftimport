-- Migration 0013: introduce the MVP membership roles and backfill OWNER.
-- Forward-safe: existing ADMIN/EMPLOYEE values remain valid. The backfill is
-- idempotent and only runs for organizations that do not already have OWNER.
-- The empty organization exception was remediated and audited before this
-- migration was applied to Neon development.

BEGIN;

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'));

-- Pick the oldest ADMIN per organization, breaking created_at ties by UUID.
-- Existing OWNER rows are left untouched so a retry cannot create another
-- owner or reassign an established owner.
UPDATE memberships AS candidate
SET role = 'OWNER'
WHERE candidate.role = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1
    FROM memberships AS existing_owner
    WHERE existing_owner.organization_id = candidate.organization_id
      AND existing_owner.role = 'OWNER'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM memberships AS earlier_admin
    WHERE earlier_admin.organization_id = candidate.organization_id
      AND earlier_admin.role = 'ADMIN'
      AND (earlier_admin.created_at, earlier_admin.user_id)
        < (candidate.created_at, candidate.user_id)
  );

COMMIT;

-- Migration 0015: assign an optional area scope to PLANNER memberships.
-- NULL means organization scope for PLANNER; OWNER/ADMIN/EMPLOYEE never use it.

BEGIN;

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS scoped_area_id UUID REFERENCES areas (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS memberships_scoped_area_idx
  ON memberships (scoped_area_id);

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_scoped_area_role_check;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_scoped_area_role_check
    CHECK (scoped_area_id IS NULL OR role = 'PLANNER');

COMMIT;

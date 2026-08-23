-- Migration 0007: forward-only update of memberships.role constraint to remove
-- MANAGER. Runs on existing DBs that already have the old CHECK constraint
-- allowing ('ADMIN', 'MANAGER', 'EMPLOYEE').
--
-- Steps:
--   1. Migrate any existing MANAGER rows to ADMIN (this was the functional role
--      for team management before the spec cleanup).
--   2. Drop old constraint.
--   3. Add new constraint restricting to ('ADMIN', 'EMPLOYEE').
--
-- Idempotency-safe: if run twice, step 1 is a no-op (no MANAGER rows remain),
-- and the constraint change is idempotent via IF NOT EXISTS pattern tricks.

BEGIN;

-- Step 1: Map any existing MANAGER → ADMIN (data migration)
UPDATE memberships
SET role = 'ADMIN'
WHERE role = 'MANAGER';

-- Step 2: Drop old constraint (if it still exists — after migration it won't
-- because we've already removed all MANAGER rows, but the constraint itself
-- remains until we drop+add it). No DO $$ block: db/migrate.mjs splits
-- statements on ";" at end-of-line, which shatters PL/pgSQL bodies —
-- DROP CONSTRAINT IF EXISTS is the splitter-safe equivalent.
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;

-- Step 3: Add new constraint
ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('ADMIN', 'EMPLOYEE'));

COMMIT;
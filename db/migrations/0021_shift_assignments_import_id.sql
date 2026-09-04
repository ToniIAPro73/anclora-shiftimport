-- Migration 0021: persistent provenance for future assignments created by an
-- import. One import may feed several weekly ScheduleVersions, so this is a
-- many-assignments-to-one-import link; imports.schedule_version_id is
-- intentionally not introduced.

BEGIN;

ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS import_id UUID
  REFERENCES imports (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shift_assignments_import_idx
  ON shift_assignments (import_id);

COMMIT;

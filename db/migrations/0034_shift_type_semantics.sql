-- Migration 0034: persist the effective shift-type semantics.
-- Working types require times; non-working types may intentionally have NULL
-- times. Existing rows are preserved and existing assignments default to the
-- historical working-shift behavior.

BEGIN;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS counts_as_work BOOLEAN;
ALTER TABLE shifts ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE shifts ALTER COLUMN end_time DROP NOT NULL;

ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS shift_type TEXT NOT NULL DEFAULT 'Regular';
ALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS counts_as_work BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE shift_assignments ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE shift_assignments ALTER COLUMN end_time DROP NOT NULL;

ALTER TABLE shift_assignments
  DROP CONSTRAINT IF EXISTS shift_assignments_time_semantics_check;
ALTER TABLE shift_assignments
  ADD CONSTRAINT shift_assignments_time_semantics_check
  CHECK (
    (counts_as_work = TRUE AND start_time IS NOT NULL AND end_time IS NOT NULL)
    OR counts_as_work = FALSE
  );

COMMIT;

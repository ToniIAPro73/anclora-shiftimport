-- Migration 0020: preserve the schedule version that materialized a shift.
-- Nullable and additive: imported/manual rows keep NULL and remain unchanged.

BEGIN;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS schedule_version_id UUID
  REFERENCES schedule_versions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shifts_schedule_version_idx
  ON shifts (schedule_version_id);

COMMIT;

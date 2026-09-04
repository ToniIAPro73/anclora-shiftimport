-- Migration 0019: planned employee shifts inside a schedule version.
-- Overlap/rest validation is intentionally handled by the Scheduling domain
-- in R3-M06/R3-M07, not by a generic database constraint here.

BEGIN;

CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_version_id UUID NOT NULL REFERENCES schedule_versions (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shift_assignments_version_employee_date_idx
  ON shift_assignments (schedule_version_id, employee_id, date);

CREATE INDEX IF NOT EXISTS shift_assignments_employee_idx
  ON shift_assignments (employee_id);

COMMIT;

-- Migration 0022: independent acknowledgement state for employee portal shifts.
-- Rows are created lazily on the first successful acknowledgement; existing
-- shifts therefore read as PENDING without a backfill.

BEGIN;

-- The composite lookup makes the employee_id part of the same database
-- invariant as shift_id: an acknowledgement cannot be attached to a shift
-- while naming a different employee.
CREATE UNIQUE INDEX IF NOT EXISTS shifts_id_employee_unique_idx
  ON shifts (id, employee_id);

CREATE TABLE IF NOT EXISTS shift_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACKNOWLEDGED')),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_acknowledgements_shift_employee_fk
    FOREIGN KEY (shift_id, employee_id)
    REFERENCES shifts (id, employee_id) ON DELETE CASCADE,
  CONSTRAINT shift_acknowledgements_shift_unique UNIQUE (shift_id)
);

CREATE INDEX IF NOT EXISTS shift_acknowledgements_employee_idx
  ON shift_acknowledgements (employee_id);

CREATE INDEX IF NOT EXISTS shift_acknowledgements_status_idx
  ON shift_acknowledgements (status);

COMMIT;

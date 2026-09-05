-- Migration 0023: append-only employee comments on own shifts.
-- Comments are a separate resource; no column or lifecycle state is added to
-- shifts. The composite FK preserves shift_id + employee_id ownership.

BEGIN;

CREATE TABLE IF NOT EXISTS shift_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  body TEXT NOT NULL
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_comments_shift_employee_fk
    FOREIGN KEY (shift_id, employee_id)
    REFERENCES shifts (id, employee_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shift_comments_shift_created_idx
  ON shift_comments (shift_id, created_at, id);

CREATE INDEX IF NOT EXISTS shift_comments_employee_idx
  ON shift_comments (employee_id);

COMMIT;

-- Migration 0024: employee-owned change requests with an independent lifecycle.
-- Approval and rejection are intentionally reserved for R5.

BEGIN;

CREATE TABLE IF NOT EXISTS change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  request_type TEXT NOT NULL
    CHECK (request_type IN ('TIME_CHANGE', 'OTHER')),
  reason TEXT NOT NULL
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT change_requests_shift_employee_fk
    FOREIGN KEY (shift_id, employee_id)
    REFERENCES shifts (id, employee_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS change_requests_employee_status_idx
  ON change_requests (employee_id, status, created_at);

CREATE INDEX IF NOT EXISTS change_requests_shift_idx
  ON change_requests (shift_id, created_at);

CREATE INDEX IF NOT EXISTS change_requests_organization_idx
  ON change_requests (organization_id, created_at);

COMMIT;

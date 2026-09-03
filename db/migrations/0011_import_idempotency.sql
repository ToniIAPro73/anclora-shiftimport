-- Migration 0011: server-side import and shift idempotency.
-- The client still previews and reconciles for UX, but those checks cannot
-- protect against a second browser, a retry, or concurrent requests.
-- These keys are derived from the session organization/employee and a
-- content fingerprint; organization and employee values are never trusted
-- from the client without the data-layer membership checks.

BEGIN;

ALTER TABLE imports ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees (id) ON DELETE SET NULL;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS context_fingerprint TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS semantic_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS imports_idempotency_key_idx
  ON imports (organization_id, employee_id, file_fingerprint, context_fingerprint)
  WHERE employee_id IS NOT NULL
    AND file_fingerprint IS NOT NULL
    AND context_fingerprint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shifts_semantic_idempotency_idx
  ON shifts (organization_id, employee_id, semantic_fingerprint)
  WHERE semantic_fingerprint IS NOT NULL;

COMMIT;

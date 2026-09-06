-- Migration 0033: persist the outcome of every import attempt.
-- Forward-only and additive: existing import rows remain completed, while
-- blocked/failed attempts become visible and recoverable. Pending is retained
-- because it was part of the original 0001 compatibility contract.

BEGIN;

ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_status_check;
ALTER TABLE imports ADD CONSTRAINT imports_status_check
  CHECK (status IN ('pending', 'completed', 'partial', 'blocked', 'failed'));

ALTER TABLE imports ADD COLUMN IF NOT EXISTS outcome_reason TEXT;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS outcome_detail JSONB;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS blocking_employee_id UUID
  REFERENCES employees (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS imports_outcome_status_idx
  ON imports (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS imports_blocking_employee_idx
  ON imports (organization_id, blocking_employee_id)
  WHERE blocking_employee_id IS NOT NULL;

-- P1/P2 audit events share the existing append-only log. This is the only
-- migration in the post-audit program, so the event vocabulary is extended
-- here instead of introducing a parallel audit table.
ALTER TABLE organization_audit_events
  DROP CONSTRAINT IF EXISTS organization_audit_events_event_type_check;
ALTER TABLE organization_audit_events
  ADD CONSTRAINT organization_audit_events_event_type_check CHECK (event_type IN (
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'MEMBER_ROLE_CHANGED',
    'AREA_CREATED',
    'AREA_UPDATED',
    'AREA_DEACTIVATED',
    'EMPLOYEE_USER_LINKED',
    'EMPLOYEE_USER_UNLINKED',
    'EMPLOYEE_AREA_CHANGED',
    'IMPORT_BLOCKED',
    'IMPORT_FAILED',
    'PLAN_LIMIT_REJECTED',
    'approval_request.created',
    'approval_request.approved',
    'approval_request.rejected'
  ));

COMMIT;

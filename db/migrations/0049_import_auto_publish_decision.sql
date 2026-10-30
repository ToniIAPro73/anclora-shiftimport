-- Migration 0049: auto-publish import decision. Additive and idempotent.
-- The Neon branch is shared by every Git branch (AGENTS.md): code that predates this must keep working.

-- imports.import_decision: the two existing values stay valid; one explicit value is added.
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_import_decision_check;
ALTER TABLE imports ADD CONSTRAINT imports_import_decision_check
  CHECK (import_decision IS NULL OR import_decision IN ('historical-only', 'historical-and-plan', 'historical-and-auto-publish'));

-- Per-import publication result (weeks published / split / retained, retained pairs with reason). NULL for every existing import.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS publication_summary JSONB;

-- Audit: exact superset of the list in 0048 (copied, then extended).
ALTER TABLE organization_audit_events DROP CONSTRAINT IF EXISTS organization_audit_events_event_type_check;
ALTER TABLE organization_audit_events ADD CONSTRAINT organization_audit_events_event_type_check CHECK (event_type IN (
  'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'AREA_CREATED', 'AREA_UPDATED',
  'AREA_DEACTIVATED', 'AREA_REACTIVATED', 'EMPLOYEE_USER_LINKED', 'EMPLOYEE_USER_UNLINKED', 'EMPLOYEE_AREA_CHANGED',
  'IMPORT_BLOCKED', 'IMPORT_FAILED', 'PLAN_LIMIT_REJECTED', 'approval_request.created',
  'approval_request.approved', 'approval_request.rejected', 'OWNERSHIP_TRANSFERRED',
  'PLANNER_SCOPE_CHANGED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_REMOVED',
  'EMPLOYEE_ANNUAL_TARGET_SET', 'EMPLOYEE_ANNUAL_TARGET_UPDATED',
  'EMPLOYEE_WORKTIME_TARGET_VERSION_CREATED', 'CALENDAR_CHANGE_APPLIED', 'CALENDAR_DAY_RECONCILED',
  'schedule.auto_published_on_import'
));

-- Migration 0031: allow Approval Lite decisions in the organization audit log.

BEGIN;

ALTER TABLE organization_audit_events DROP CONSTRAINT IF EXISTS organization_audit_events_event_type_check;

ALTER TABLE organization_audit_events
  ADD CONSTRAINT organization_audit_events_event_type_check
  CHECK (event_type IN (
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'MEMBER_ROLE_CHANGED',
    'AREA_CREATED',
    'AREA_UPDATED',
    'AREA_DEACTIVATED',
    'EMPLOYEE_USER_LINKED',
    'EMPLOYEE_USER_UNLINKED',
    'EMPLOYEE_AREA_CHANGED',
    'approval_request.created',
    'approval_request.approved',
    'approval_request.rejected'
  ));

COMMIT;

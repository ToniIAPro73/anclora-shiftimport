-- Migration 0050: time-off requests and unified approval envelope. Additive and idempotent.
-- INNER JOINs on change_requests in deployed code hide time-off rows, so older code keeps working.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  requested_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  -- Explicit type (OD-03). The CHECK is the closed catalogue; which types the API accepts is a code allow-list
  -- (MVP: VACATION only), so enabling another type needs no migration. 'SICK_LEAVE' keeps its medical meaning (INV-14).
  request_type TEXT NOT NULL CHECK (request_type IN ('VACATION', 'SICK_LEAVE', 'PERMISSION', 'OTHER')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  requested_days INTEGER NOT NULL CHECK (requested_days BETWEEN 1 AND 366),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  rejection_reason TEXT,
  -- Effective range actually materialised on approval (OD-08); NULL until APPROVED.
  applied_start_date DATE,
  applied_days INTEGER CHECK (applied_days IS NULL OR applied_days >= 1),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT time_off_requests_dates_check
    CHECK (end_date >= start_date AND requested_days = (end_date - start_date) + 1),
  CONSTRAINT time_off_requests_rejection_reason_check
    CHECK (status <> 'REJECTED' OR length(btrim(COALESCE(rejection_reason, ''))) > 0),
  CONSTRAINT time_off_requests_employee_org_fk
    FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees (id, organization_id) ON DELETE CASCADE,
  -- A person cannot hold two live requests over the same days.
  CONSTRAINT time_off_requests_no_live_overlap
    EXCLUDE USING gist (employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
    WHERE (status IN ('PENDING', 'APPROVED'))
);

CREATE INDEX IF NOT EXISTS time_off_requests_org_status_idx
  ON time_off_requests (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS time_off_requests_employee_idx
  ON time_off_requests (employee_id, status, start_date);

-- Approval envelope: exactly one subject (shift change XOR time off).
ALTER TABLE approval_requests ALTER COLUMN change_request_id DROP NOT NULL;
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS time_off_request_id UUID REFERENCES time_off_requests (id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_time_off_request_unique
  ON approval_requests (time_off_request_id) WHERE time_off_request_id IS NOT NULL;
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_subject_xor_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_subject_xor_check
  CHECK ((change_request_id IS NOT NULL) <> (time_off_request_id IS NOT NULL));

-- Link a materialised absence to the request that produced it (protection, provenance panel).
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS time_off_request_id UUID REFERENCES time_off_requests (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shifts_time_off_request_idx
  ON shifts (time_off_request_id) WHERE time_off_request_id IS NOT NULL;

-- Notifications: superset of 0028.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('SHIFT_PUBLISHED', 'CHANGE_REQUEST_RESOLVED', 'APPROVAL_REQUEST_CREATED', 'TIME_OFF_REQUEST_RESOLVED'));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_resource_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_resource_type_check
  CHECK (resource_type IN ('SHIFT', 'CHANGE_REQUEST', 'APPROVAL_REQUEST', 'TIME_OFF_REQUEST'));

-- Audit: exact superset of the list in 0049 (which already adds schedule.auto_published_on_import).
ALTER TABLE organization_audit_events DROP CONSTRAINT IF EXISTS organization_audit_events_event_type_check;
ALTER TABLE organization_audit_events ADD CONSTRAINT organization_audit_events_event_type_check CHECK (event_type IN (
  'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'AREA_CREATED', 'AREA_UPDATED',
  'AREA_DEACTIVATED', 'AREA_REACTIVATED', 'EMPLOYEE_USER_LINKED', 'EMPLOYEE_USER_UNLINKED', 'EMPLOYEE_AREA_CHANGED',
  'IMPORT_BLOCKED', 'IMPORT_FAILED', 'PLAN_LIMIT_REJECTED', 'approval_request.created',
  'approval_request.approved', 'approval_request.rejected', 'OWNERSHIP_TRANSFERRED',
  'PLANNER_SCOPE_CHANGED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_REMOVED',
  'EMPLOYEE_ANNUAL_TARGET_SET', 'EMPLOYEE_ANNUAL_TARGET_UPDATED',
  'EMPLOYEE_WORKTIME_TARGET_VERSION_CREATED', 'CALENDAR_CHANGE_APPLIED', 'CALENDAR_DAY_RECONCILED',
  'time_off_request.created', 'time_off_request.approved', 'time_off_request.rejected',
  'time_off_request.cancelled', 'time_off_request.manual_override',
  'schedule.auto_published_on_import'
));

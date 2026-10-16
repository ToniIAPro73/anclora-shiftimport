-- Migration 0041: effective calendar semantics, change trail and per-employee
-- annual working-time targets.
--
-- Model:  COMPANY PLAN -> CHANGES -> EFFECTIVE CALENDAR -> WORKTIME -> ANNUAL TARGET
--
-- * shifts keeps every historical row (nothing is deleted). New columns say
--   which layer a row belongs to, where it came from, whether it is part of
--   the effective calendar and which company-plan revision it represents.
-- * calendar_changes is the auditable change trail (who/when/why/before/after).
-- * employee_annual_targets holds the contract range per employee AND year.
--   The margin is derived (maximum - minimum), never stored twice.
--
-- Forward-only, additive, idempotent. No employee-specific data lives here.

-- Composite key so child tables can enforce organization/employee consistency.
CREATE UNIQUE INDEX IF NOT EXISTS employees_id_org_unique
  ON employees (id, organization_id);

CREATE TABLE IF NOT EXISTS calendar_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'ADD_SHIFT', 'TIME_CHANGE', 'CANCEL_SHIFT', 'ADD_EXTRA', 'PARTIAL_ABSENCE',
    'TYPE_CHANGE', 'REPLACE_DAY', 'RECONCILIATION'
  )),
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE', 'SYSTEM')),
  self_change BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL CHECK (source IN (
    'COMPANY_IMPORT', 'MANUAL_ADMIN_CHANGE', 'EMPLOYEE_REQUEST',
    'SCHEDULE_PUBLICATION', 'MIGRATION', 'SYSTEM'
  )),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  before_state JSONB NOT NULL DEFAULT '[]'::jsonb,
  after_state JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_status TEXT NOT NULL DEFAULT 'APPLIED'
    CHECK (approval_status IN ('APPLIED', 'PENDING', 'APPROVED', 'REJECTED')),
  approved_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_request_id UUID REFERENCES approval_requests (id) ON DELETE SET NULL,
  change_request_id UUID REFERENCES change_requests (id) ON DELETE SET NULL,
  original_shift_id UUID REFERENCES shifts (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_changes_employee_org_fk
    FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS calendar_changes_employee_date_idx
  ON calendar_changes (organization_id, employee_id, date, created_at);
CREATE INDEX IF NOT EXISTS calendar_changes_org_created_idx
  ON calendar_changes (organization_id, created_at DESC);

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS layer TEXT NOT NULL DEFAULT 'COMPANY_PLAN';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS provenance TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS legacy_origin TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS duty_role TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS effective_state TEXT NOT NULL DEFAULT 'EFFECTIVE';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS plan_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS change_id UUID REFERENCES calendar_changes (id) ON DELETE SET NULL;

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_layer_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_layer_check CHECK (layer IN ('COMPANY_PLAN', 'CHANGE'));

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_provenance_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_provenance_check CHECK (provenance IS NULL OR provenance IN (
  'COMPANY_IMPORT', 'MANUAL_ADMIN_CHANGE', 'EMPLOYEE_REQUEST',
  'SCHEDULE_PUBLICATION', 'MIGRATION', 'SYSTEM'
));

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_legacy_origin_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_legacy_origin_check CHECK (legacy_origin IS NULL OR legacy_origin IN ('PDF', 'MAN'));

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_duty_role_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_duty_role_check CHECK (duty_role IS NULL OR duty_role IN ('shift_lead'));

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_effective_state_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_effective_state_check CHECK (effective_state IN (
  'EFFECTIVE', 'SUPERSEDED', 'ABSORBED', 'METADATA_ONLY', 'REQUIRES_REVIEW'
));

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_plan_revision_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_plan_revision_check CHECK (plan_revision >= 1);

-- Deterministic provenance for rows that predate the taxonomy. Only the new
-- metadata columns are written; no existing column changes value.
UPDATE shifts SET layer = 'CHANGE', provenance = 'MANUAL_ADMIN_CHANGE'
 WHERE origin = 'MAN' AND provenance IS NULL;
UPDATE shifts SET provenance = 'SCHEDULE_PUBLICATION'
 WHERE origin = 'schedule' AND provenance IS NULL;
UPDATE shifts s SET provenance = 'MIGRATION'
  FROM imports i
 WHERE s.import_id = i.id AND i.source_format = 'groundsync' AND s.provenance IS NULL;
UPDATE shifts SET provenance = 'COMPANY_IMPORT'
 WHERE origin = 'IMP' AND provenance IS NULL;

CREATE INDEX IF NOT EXISTS shifts_org_employee_date_state_idx
  ON shifts (organization_id, employee_id, date, effective_state);
CREATE INDEX IF NOT EXISTS shifts_review_idx
  ON shifts (organization_id, employee_id, date) WHERE effective_state = 'REQUIRES_REVIEW';

CREATE TABLE IF NOT EXISTS employee_annual_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  minimum_annual_minutes INTEGER NOT NULL CHECK (minimum_annual_minutes >= 0),
  maximum_annual_minutes INTEGER NOT NULL CHECK (maximum_annual_minutes >= 0),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  source TEXT NOT NULL DEFAULT 'ADMIN_UI',
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_annual_targets_range_check
    CHECK (maximum_annual_minutes >= minimum_annual_minutes),
  CONSTRAINT employee_annual_targets_employee_org_fk
    FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT employee_annual_targets_unique UNIQUE (organization_id, employee_id, year)
);

CREATE INDEX IF NOT EXISTS employee_annual_targets_org_year_idx
  ON employee_annual_targets (organization_id, year);

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
    'approval_request.rejected',
    'OWNERSHIP_TRANSFERRED',
    'PLANNER_SCOPE_CHANGED',
    'ASSIGNMENT_CREATED',
    'ASSIGNMENT_UPDATED',
    'ASSIGNMENT_REMOVED',
    'EMPLOYEE_ANNUAL_TARGET_SET',
    'EMPLOYEE_ANNUAL_TARGET_UPDATED',
    'CALENDAR_CHANGE_APPLIED',
    'CALENDAR_DAY_RECONCILED'
  ));

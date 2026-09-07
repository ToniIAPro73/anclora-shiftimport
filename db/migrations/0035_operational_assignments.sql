-- Migration 0035: effective-dated operational assignments & planner scope modes.
-- Forward-only, additive, and idempotent.
-- Preserves existing employee.area_id and membership.scoped_area_id as cached snapshots for backward compatibility.

BEGIN;

CREATE TABLE IF NOT EXISTS operational_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('EMPLOYEE_AREA', 'PLANNER_AREA', 'PLANNER_EMPLOYEE')),
  subject_id UUID NOT NULL,
  target_id UUID NOT NULL,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operational_assignments_valid_range_check CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Partial unique index: an employee can have at most ONE active area assignment at any time
CREATE UNIQUE INDEX IF NOT EXISTS op_assign_emp_active_area_idx
  ON operational_assignments (organization_id, subject_id)
  WHERE assignment_type = 'EMPLOYEE_AREA' AND valid_to IS NULL;

-- Partial unique index: a planner cannot be assigned twice to the same active area
CREATE UNIQUE INDEX IF NOT EXISTS op_assign_planner_area_unique_idx
  ON operational_assignments (organization_id, subject_id, target_id)
  WHERE assignment_type = 'PLANNER_AREA' AND valid_to IS NULL;

-- Partial unique index: a planner cannot be assigned twice to the same active employee
CREATE UNIQUE INDEX IF NOT EXISTS op_assign_planner_emp_unique_idx
  ON operational_assignments (organization_id, subject_id, target_id)
  WHERE assignment_type = 'PLANNER_EMPLOYEE' AND valid_to IS NULL;

-- Lookup and performance indexes
CREATE INDEX IF NOT EXISTS op_assign_org_type_idx
  ON operational_assignments (organization_id, assignment_type);

CREATE INDEX IF NOT EXISTS op_assign_org_subject_idx
  ON operational_assignments (organization_id, subject_id);

CREATE INDEX IF NOT EXISTS op_assign_org_target_idx
  ON operational_assignments (organization_id, target_id);

CREATE INDEX IF NOT EXISTS op_assign_valid_range_idx
  ON operational_assignments (organization_id, valid_from, valid_to);

-- Add explicit planner_scope_type on memberships ('ORGANIZATION', 'AREAS', 'EMPLOYEES')
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS planner_scope_type TEXT;

ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_planner_scope_type_check;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_planner_scope_type_check
  CHECK (planner_scope_type IS NULL OR planner_scope_type IN ('ORGANIZATION', 'AREAS', 'EMPLOYEES'));

-- Backfill existing employee area relationships into active operational assignments
INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
SELECT e.organization_id, 'EMPLOYEE_AREA', e.id, e.area_id, CURRENT_DATE, NULL
FROM employees e
WHERE e.area_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM operational_assignments oa
    WHERE oa.organization_id = e.organization_id
      AND oa.assignment_type = 'EMPLOYEE_AREA'
      AND oa.subject_id = e.id
      AND oa.valid_to IS NULL
  );

-- Backfill planner scope type for existing PLANNER memberships
UPDATE memberships
SET planner_scope_type = CASE WHEN scoped_area_id IS NOT NULL THEN 'AREAS' ELSE 'ORGANIZATION' END
WHERE role = 'PLANNER' AND planner_scope_type IS NULL;

-- Backfill existing planner scoped_area_id into active operational assignments
INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id, valid_from, valid_to)
SELECT m.organization_id, 'PLANNER_AREA', m.user_id, m.scoped_area_id, CURRENT_DATE, NULL
FROM memberships m
WHERE m.role = 'PLANNER'
  AND m.scoped_area_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM operational_assignments oa
    WHERE oa.organization_id = m.organization_id
      AND oa.assignment_type = 'PLANNER_AREA'
      AND oa.subject_id = m.user_id
      AND oa.target_id = m.scoped_area_id
      AND oa.valid_to IS NULL
  );

-- Extend organization audit event types with P5.7 domain vocabulary
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
    'ASSIGNMENT_REMOVED'
  ));

COMMIT;

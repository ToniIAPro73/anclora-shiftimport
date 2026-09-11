-- Migration 0036: Normalized temporal organizational model (Phase 1).
-- Forward-only, additive, and idempotent.
-- Introduces:
--   1. organization_people: central multi-tenant person entity.
--   2. employee_profiles: laboral identity and employment attributes.
--   3. person_role_periods: temporal role history with non-overlapping exclusion.
--   4. employee_area_periods: multi-area employment history with single primary exclusion.
--   5. person_access_scope_periods: temporal access authorization scopes (ORGANIZATION, AREA, PERSON).
--   6. reporting_relationship_periods: organizational supervision hierarchy with anti-cycle and primary supervisor constraints.
-- Preserves existing legacy tables (employees, memberships, operational_assignments, area_responsibles) for backward compatibility.
-- Provides canonical read views: current_person_roles, current_employee_areas, current_person_access_scopes, current_reporting_relationships.

BEGIN;

-- Enable btree_gist extension for multi-column temporal exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Ensure areas has a composite unique constraint on (id, organization_id) to support composite foreign keys
ALTER TABLE areas
  DROP CONSTRAINT IF EXISTS areas_id_organization_id_key;

ALTER TABLE areas
  ADD CONSTRAINT areas_id_organization_id_key UNIQUE (id, organization_id);

-- 1. organization_people
CREATE TABLE IF NOT EXISTS organization_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING_INVITATION')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_people_org_user_unique UNIQUE (organization_id, user_id),
  CONSTRAINT organization_people_id_org_unique UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS org_people_org_idx ON organization_people (organization_id);
CREATE INDEX IF NOT EXISTS org_people_user_idx ON organization_people (user_id);
CREATE INDEX IF NOT EXISTS org_people_status_idx ON organization_people (organization_id, status);

-- 2. employee_profiles
CREATE TABLE IF NOT EXISTS employee_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  organization_person_id UUID NOT NULL,
  external_employee_id TEXT,
  employee_name TEXT NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED')),
  started_on DATE,
  ended_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_profiles_person_unique UNIQUE (organization_person_id),
  CONSTRAINT employee_profiles_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT employee_profiles_person_org_fkey
    FOREIGN KEY (organization_person_id, organization_id)
    REFERENCES organization_people (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT employee_profiles_dates_check
    CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS emp_profiles_org_external_id_idx
  ON employee_profiles (organization_id, external_employee_id)
  WHERE external_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS emp_profiles_org_idx ON employee_profiles (organization_id);
CREATE INDEX IF NOT EXISTS emp_profiles_person_idx ON employee_profiles (organization_person_id);
CREATE INDEX IF NOT EXISTS emp_profiles_status_idx ON employee_profiles (organization_id, employment_status);

-- 3. person_role_periods
CREATE TABLE IF NOT EXISTS person_role_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  organization_person_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE')),
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT person_role_periods_person_org_fkey
    FOREIGN KEY (organization_person_id, organization_id)
    REFERENCES organization_people (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT person_role_periods_dates_check
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT person_role_periods_no_overlap_excl
    EXCLUDE USING gist (
      organization_person_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    )
);

CREATE INDEX IF NOT EXISTS person_role_periods_org_idx ON person_role_periods (organization_id);
CREATE INDEX IF NOT EXISTS person_role_periods_person_idx ON person_role_periods (organization_person_id);
CREATE INDEX IF NOT EXISTS person_role_periods_role_idx ON person_role_periods (organization_id, role);
CREATE INDEX IF NOT EXISTS person_role_periods_dates_idx ON person_role_periods (organization_id, valid_from, valid_to);

-- 4. employee_area_periods
CREATE TABLE IF NOT EXISTS employee_area_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  employee_profile_id UUID NOT NULL,
  area_id UUID NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_area_periods_employee_org_fkey
    FOREIGN KEY (employee_profile_id, organization_id)
    REFERENCES employee_profiles (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT employee_area_periods_area_org_fkey
    FOREIGN KEY (area_id, organization_id)
    REFERENCES areas (id, organization_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT employee_area_periods_dates_check
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT employee_area_periods_no_same_area_overlap_excl
    EXCLUDE USING gist (
      employee_profile_id WITH =,
      area_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ),
  CONSTRAINT employee_area_periods_single_primary_overlap_excl
    EXCLUDE USING gist (
      employee_profile_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (is_primary = true)
);

CREATE INDEX IF NOT EXISTS emp_area_periods_org_idx ON employee_area_periods (organization_id);
CREATE INDEX IF NOT EXISTS emp_area_periods_emp_idx ON employee_area_periods (employee_profile_id);
CREATE INDEX IF NOT EXISTS emp_area_periods_area_idx ON employee_area_periods (area_id);
CREATE INDEX IF NOT EXISTS emp_area_periods_dates_idx ON employee_area_periods (organization_id, valid_from, valid_to);

-- 5. person_access_scope_periods
CREATE TABLE IF NOT EXISTS person_access_scope_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  organization_person_id UUID NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('ORGANIZATION', 'AREA', 'PERSON')),
  area_id UUID,
  target_person_id UUID,
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT person_access_scope_periods_person_org_fkey
    FOREIGN KEY (organization_person_id, organization_id)
    REFERENCES organization_people (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT person_access_scope_periods_area_org_fkey
    FOREIGN KEY (area_id, organization_id)
    REFERENCES areas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT person_access_scope_periods_target_person_org_fkey
    FOREIGN KEY (target_person_id, organization_id)
    REFERENCES organization_people (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT person_access_scope_periods_dates_check
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT person_access_scope_periods_structure_check CHECK (
    (scope_type = 'ORGANIZATION' AND area_id IS NULL AND target_person_id IS NULL) OR
    (scope_type = 'AREA' AND area_id IS NOT NULL AND target_person_id IS NULL) OR
    (scope_type = 'PERSON' AND target_person_id IS NOT NULL AND area_id IS NULL)
  ),
  CONSTRAINT person_access_scope_org_no_overlap_excl
    EXCLUDE USING gist (
      organization_person_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (scope_type = 'ORGANIZATION'),
  CONSTRAINT person_access_scope_area_no_overlap_excl
    EXCLUDE USING gist (
      organization_person_id WITH =,
      area_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (scope_type = 'AREA'),
  CONSTRAINT person_access_scope_person_no_overlap_excl
    EXCLUDE USING gist (
      organization_person_id WITH =,
      target_person_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (scope_type = 'PERSON')
);

CREATE INDEX IF NOT EXISTS person_access_scope_periods_org_idx ON person_access_scope_periods (organization_id);
CREATE INDEX IF NOT EXISTS person_access_scope_periods_person_idx ON person_access_scope_periods (organization_person_id);
CREATE INDEX IF NOT EXISTS person_access_scope_periods_area_idx ON person_access_scope_periods (area_id);
CREATE INDEX IF NOT EXISTS person_access_scope_periods_target_idx ON person_access_scope_periods (target_person_id);
CREATE INDEX IF NOT EXISTS person_access_scope_periods_dates_idx ON person_access_scope_periods (organization_id, valid_from, valid_to);

-- 6. reporting_relationship_periods
CREATE TABLE IF NOT EXISTS reporting_relationship_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  supervisor_person_id UUID NOT NULL,
  subordinate_person_id UUID NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('ADMIN_PLANNER', 'ADMIN_EMPLOYEE', 'PLANNER_EMPLOYEE')),
  valid_from DATE NOT NULL,
  valid_to DATE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reporting_relationship_periods_supervisor_org_fkey
    FOREIGN KEY (supervisor_person_id, organization_id)
    REFERENCES organization_people (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT reporting_relationship_periods_subordinate_org_fkey
    FOREIGN KEY (subordinate_person_id, organization_id)
    REFERENCES organization_people (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT reporting_relationship_periods_self_supervision_check
    CHECK (supervisor_person_id <> subordinate_person_id),
  CONSTRAINT reporting_relationship_periods_dates_check
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT reporting_relationship_periods_no_dup_overlap_excl
    EXCLUDE USING gist (
      supervisor_person_id WITH =,
      subordinate_person_id WITH =,
      relationship_type WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ),
  CONSTRAINT reporting_relationship_periods_single_primary_overlap_excl
    EXCLUDE USING gist (
      subordinate_person_id WITH =,
      relationship_type WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (is_primary = true)
);

CREATE INDEX IF NOT EXISTS reporting_rel_org_idx ON reporting_relationship_periods (organization_id);
CREATE INDEX IF NOT EXISTS reporting_rel_supervisor_idx ON reporting_relationship_periods (supervisor_person_id);
CREATE INDEX IF NOT EXISTS reporting_rel_subordinate_idx ON reporting_relationship_periods (subordinate_person_id);
CREATE INDEX IF NOT EXISTS reporting_rel_dates_idx ON reporting_relationship_periods (organization_id, valid_from, valid_to);

-- =========================================================================
-- DETERMINISTIC BACKFILL FROM LEGACY SCHEMAS
-- =========================================================================

-- Backfill 1: Create organization_people from memberships
INSERT INTO organization_people (id, organization_id, user_id, status, created_at, updated_at)
SELECT gen_random_uuid(), m.organization_id, m.user_id, 'ACTIVE', m.created_at, m.created_at
FROM memberships m
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Backfill 2: Create organization_people for employees with user_id who had no membership
INSERT INTO organization_people (id, organization_id, user_id, status, created_at, updated_at)
SELECT gen_random_uuid(), e.organization_id, e.user_id, CASE WHEN e.status = 'INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END, e.created_at, e.updated_at
FROM employees e
WHERE e.user_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Backfill 3: Create organization_people and employee_profiles for unlinked employees (user_id IS NULL)
CREATE TEMPORARY TABLE temp_unlinked_emp_backfill ON COMMIT DROP AS
SELECT 
  gen_random_uuid() AS person_id,
  e.id AS employee_id,
  e.organization_id,
  e.name,
  e.external_employee_id,
  e.status,
  e.created_at,
  e.updated_at,
  e.deactivated_at
FROM employees e
WHERE e.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_profiles ep WHERE ep.id = e.id
  );

INSERT INTO organization_people (id, organization_id, user_id, status, created_at, updated_at)
SELECT person_id, organization_id, NULL, CASE WHEN status = 'INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END, created_at, updated_at
FROM temp_unlinked_emp_backfill;

INSERT INTO employee_profiles (id, organization_id, organization_person_id, external_employee_id, employee_name, employment_status, started_on, ended_on, created_at, updated_at)
SELECT employee_id, organization_id, person_id, external_employee_id, name, CASE WHEN status = 'INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END, created_at::date, deactivated_at::date, created_at, updated_at
FROM temp_unlinked_emp_backfill;

-- Backfill 4: Create employee_profiles for linked employees (user_id IS NOT NULL)
INSERT INTO employee_profiles (id, organization_id, organization_person_id, external_employee_id, employee_name, employment_status, started_on, ended_on, created_at, updated_at)
SELECT 
  e.id,
  e.organization_id,
  op.id,
  e.external_employee_id,
  e.name,
  CASE WHEN e.status = 'INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END,
  e.created_at::date,
  e.deactivated_at::date,
  e.created_at,
  e.updated_at
FROM employees e
JOIN organization_people op ON op.organization_id = e.organization_id AND op.user_id = e.user_id
ON CONFLICT (id) DO NOTHING;

-- Backfill 5: Create person_role_periods from memberships
INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to, source, created_at, updated_at)
SELECT 
  m.organization_id,
  op.id,
  m.role,
  COALESCE(m.created_at::date, '2026-01-01'::date),
  NULL,
  'LEGACY_CURRENT_STATE',
  m.created_at,
  m.created_at
FROM memberships m
JOIN organization_people op ON op.organization_id = m.organization_id AND op.user_id = m.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM person_role_periods prp
  WHERE prp.organization_person_id = op.id
    AND prp.valid_to IS NULL
);

-- Backfill 6: Create employee_area_periods from employees.area_id
INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary, source, created_at, updated_at)
SELECT 
  ep.organization_id,
  ep.id,
  e.area_id,
  COALESCE(e.created_at::date, '2026-01-01'::date),
  NULL,
  true,
  'LEGACY_CURRENT_STATE',
  e.created_at,
  e.updated_at
FROM employees e
JOIN employee_profiles ep ON ep.id = e.id
JOIN areas a ON a.id = e.area_id AND a.organization_id = e.organization_id
WHERE e.area_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_area_periods eap
    WHERE eap.employee_profile_id = ep.id
      AND eap.area_id = e.area_id
      AND eap.valid_to IS NULL
  );

-- Backfill 7: Backfill from operational_assignments (EMPLOYEE_AREA)
INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary, source, created_at, updated_at)
SELECT 
  oa.organization_id,
  oa.subject_id,
  oa.target_id,
  oa.valid_from,
  oa.valid_to,
  true,
  'LEGACY_OPERATIONAL_ASSIGNMENT',
  oa.created_at,
  oa.updated_at
FROM operational_assignments oa
JOIN employee_profiles ep ON ep.id = oa.subject_id AND ep.organization_id = oa.organization_id
JOIN areas a ON a.id = oa.target_id AND a.organization_id = oa.organization_id
WHERE oa.assignment_type = 'EMPLOYEE_AREA'
  AND NOT EXISTS (
    SELECT 1 FROM employee_area_periods eap
    WHERE eap.employee_profile_id = oa.subject_id
      AND eap.area_id = oa.target_id
      AND eap.valid_from = oa.valid_from
  );

-- Backfill 8: Access scopes from memberships (OWNER / ADMIN / ORGANIZATION PLANNER)
INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, area_id, target_person_id, valid_from, valid_to, source, created_at, updated_at)
SELECT 
  m.organization_id,
  op.id,
  'ORGANIZATION',
  NULL,
  NULL,
  COALESCE(m.created_at::date, '2026-01-01'::date),
  NULL,
  'LEGACY_CURRENT_STATE',
  m.created_at,
  m.created_at
FROM memberships m
JOIN organization_people op ON op.organization_id = m.organization_id AND op.user_id = m.user_id
WHERE m.role IN ('OWNER', 'ADMIN')
  OR (m.role = 'PLANNER' AND (m.planner_scope_type = 'ORGANIZATION' OR (m.planner_scope_type IS NULL AND m.scoped_area_id IS NULL)))
ON CONFLICT DO NOTHING;

-- Backfill 9: Access scopes for Planners with scoped_area_id
INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, area_id, target_person_id, valid_from, valid_to, source, created_at, updated_at)
SELECT 
  m.organization_id,
  op.id,
  'AREA',
  m.scoped_area_id,
  NULL,
  COALESCE(m.created_at::date, '2026-01-01'::date),
  NULL,
  'LEGACY_CURRENT_STATE',
  m.created_at,
  m.created_at
FROM memberships m
JOIN organization_people op ON op.organization_id = m.organization_id AND op.user_id = m.user_id
JOIN areas a ON a.id = m.scoped_area_id AND a.organization_id = m.organization_id
WHERE m.role = 'PLANNER' AND m.scoped_area_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill 10: Access scopes from operational_assignments (PLANNER_AREA)
INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, area_id, target_person_id, valid_from, valid_to, source, created_at, updated_at)
SELECT 
  oa.organization_id,
  op.id,
  'AREA',
  oa.target_id,
  NULL,
  oa.valid_from,
  oa.valid_to,
  'LEGACY_OPERATIONAL_ASSIGNMENT',
  oa.created_at,
  oa.updated_at
FROM operational_assignments oa
JOIN organization_people op ON op.organization_id = oa.organization_id AND op.user_id = oa.subject_id
JOIN areas a ON a.id = oa.target_id AND a.organization_id = oa.organization_id
WHERE oa.assignment_type = 'PLANNER_AREA'
ON CONFLICT DO NOTHING;

-- Backfill 11: Access scopes from operational_assignments (PLANNER_EMPLOYEE)
INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, area_id, target_person_id, valid_from, valid_to, source, created_at, updated_at)
SELECT 
  oa.organization_id,
  planner_op.id,
  'PERSON',
  NULL,
  emp_op.id,
  oa.valid_from,
  oa.valid_to,
  'LEGACY_OPERATIONAL_ASSIGNMENT',
  oa.created_at,
  oa.updated_at
FROM operational_assignments oa
JOIN organization_people planner_op ON planner_op.organization_id = oa.organization_id AND planner_op.user_id = oa.subject_id
JOIN employee_profiles target_ep ON target_ep.id = oa.target_id AND target_ep.organization_id = oa.organization_id
JOIN organization_people emp_op ON emp_op.id = target_ep.organization_person_id AND emp_op.organization_id = oa.organization_id
WHERE oa.assignment_type = 'PLANNER_EMPLOYEE'
ON CONFLICT DO NOTHING;

-- =========================================================================
-- CANONICAL READ VIEWS
-- =========================================================================

CREATE OR REPLACE VIEW current_person_roles AS
SELECT 
  prp.id AS role_period_id,
  prp.organization_id,
  prp.organization_person_id,
  op.user_id,
  prp.role,
  prp.valid_from,
  prp.valid_to,
  prp.created_by_user_id,
  prp.source,
  prp.created_at,
  prp.updated_at
FROM person_role_periods prp
JOIN organization_people op 
  ON prp.organization_person_id = op.id 
  AND prp.organization_id = op.organization_id
WHERE prp.valid_from <= CURRENT_DATE 
  AND (prp.valid_to IS NULL OR prp.valid_to >= CURRENT_DATE);

CREATE OR REPLACE VIEW current_employee_areas AS
SELECT 
  eap.id AS employee_area_period_id,
  eap.organization_id,
  eap.employee_profile_id,
  ep.organization_person_id,
  ep.external_employee_id,
  ep.employee_name,
  eap.area_id,
  a.name AS area_name,
  a.active AS area_active,
  eap.is_primary,
  eap.valid_from,
  eap.valid_to,
  eap.created_by_user_id,
  eap.source,
  eap.created_at,
  eap.updated_at
FROM employee_area_periods eap
JOIN employee_profiles ep 
  ON eap.employee_profile_id = ep.id 
  AND eap.organization_id = ep.organization_id
JOIN areas a 
  ON eap.area_id = a.id 
  AND eap.organization_id = a.organization_id
WHERE eap.valid_from <= CURRENT_DATE 
  AND (eap.valid_to IS NULL OR eap.valid_to >= CURRENT_DATE);

CREATE OR REPLACE VIEW current_person_access_scopes AS
SELECT 
  pasp.id AS scope_period_id,
  pasp.organization_id,
  pasp.organization_person_id,
  op.user_id,
  pasp.scope_type,
  pasp.area_id,
  a.name AS area_name,
  pasp.target_person_id,
  target_op.user_id AS target_user_id,
  target_ep.employee_name AS target_person_name,
  pasp.valid_from,
  pasp.valid_to,
  pasp.created_by_user_id,
  pasp.source,
  pasp.created_at,
  pasp.updated_at
FROM person_access_scope_periods pasp
JOIN organization_people op 
  ON pasp.organization_person_id = op.id 
  AND pasp.organization_id = op.organization_id
LEFT JOIN areas a 
  ON pasp.area_id = a.id 
  AND pasp.organization_id = a.organization_id
LEFT JOIN organization_people target_op 
  ON pasp.target_person_id = target_op.id 
  AND pasp.organization_id = target_op.organization_id
LEFT JOIN employee_profiles target_ep 
  ON pasp.target_person_id = target_ep.organization_person_id 
  AND pasp.organization_id = target_ep.organization_id
WHERE pasp.valid_from <= CURRENT_DATE 
  AND (pasp.valid_to IS NULL OR pasp.valid_to >= CURRENT_DATE);

CREATE OR REPLACE VIEW current_reporting_relationships AS
SELECT 
  rrp.id AS relationship_period_id,
  rrp.organization_id,
  rrp.supervisor_person_id,
  sup_op.user_id AS supervisor_user_id,
  sup_ep.employee_name AS supervisor_name,
  rrp.subordinate_person_id,
  sub_op.user_id AS subordinate_user_id,
  sub_ep.employee_name AS subordinate_name,
  rrp.relationship_type,
  rrp.is_primary,
  rrp.valid_from,
  rrp.valid_to,
  rrp.created_by_user_id,
  rrp.source,
  rrp.created_at,
  rrp.updated_at
FROM reporting_relationship_periods rrp
JOIN organization_people sup_op 
  ON rrp.supervisor_person_id = sup_op.id 
  AND rrp.organization_id = sup_op.organization_id
LEFT JOIN employee_profiles sup_ep 
  ON rrp.supervisor_person_id = sup_ep.organization_person_id 
  AND rrp.organization_id = sup_ep.organization_id
JOIN organization_people sub_op 
  ON rrp.subordinate_person_id = sub_op.id 
  AND rrp.organization_id = sub_op.organization_id
LEFT JOIN employee_profiles sub_ep 
  ON rrp.subordinate_person_id = sub_ep.organization_person_id 
  AND rrp.organization_id = sub_ep.organization_id
WHERE rrp.valid_from <= CURRENT_DATE 
  AND (rrp.valid_to IS NULL OR rrp.valid_to >= CURRENT_DATE);

COMMIT;

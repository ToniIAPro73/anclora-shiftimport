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

-- Ensure areas has a composite unique constraint on (id, organization_id) without dropping it
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_id_organization_id_key') THEN ALTER TABLE areas ADD CONSTRAINT areas_id_organization_id_key UNIQUE (id, organization_id); END IF; END $$;

-- 1. organization_people
CREATE TABLE IF NOT EXISTS organization_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITATION')),
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

-- Guarantee employee profiles require user_id OR status PENDING_INVITATION
CREATE OR REPLACE FUNCTION check_employee_profile_person_link_validity() RETURNS TRIGGER AS $$ DECLARE v_user_id UUID; v_status TEXT; BEGIN SELECT user_id, status INTO v_user_id, v_status FROM organization_people WHERE id = NEW.organization_person_id AND organization_id = NEW.organization_id; IF NOT FOUND THEN RAISE EXCEPTION 'Referenced organization person % does not exist in organization %', NEW.organization_person_id, NEW.organization_id; END IF; IF v_user_id IS NULL AND v_status <> 'PENDING_INVITATION' THEN RAISE EXCEPTION 'Employee profile cannot be associated with a person without user_id whose status is not PENDING_INVITATION (status is %)', v_status; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_employee_profile_person_link ON employee_profiles;
CREATE CONSTRAINT TRIGGER trg_check_employee_profile_person_link
  AFTER INSERT OR UPDATE ON employee_profiles
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION check_employee_profile_person_link_validity();

CREATE OR REPLACE FUNCTION check_organization_person_employee_link_validity() RETURNS TRIGGER AS $$ BEGIN IF NEW.user_id IS NULL AND NEW.status <> 'PENDING_INVITATION' THEN IF EXISTS (SELECT 1 FROM employee_profiles ep WHERE ep.organization_person_id = NEW.id AND ep.organization_id = NEW.organization_id) THEN RAISE EXCEPTION 'Organization person without user_id having an employee profile must have status PENDING_INVITATION (status changed to %)', NEW.status; END IF; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_organization_person_employee_link ON organization_people;
CREATE CONSTRAINT TRIGGER trg_check_organization_person_employee_link
  AFTER INSERT OR UPDATE ON organization_people
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION check_organization_person_employee_link_validity();

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
    ),
  CONSTRAINT person_role_periods_single_owner_overlap_excl
    EXCLUDE USING gist (
      organization_id WITH =,
      daterange(valid_from, valid_to, '[]') WITH &&
    ) WHERE (role = 'OWNER')
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

-- Trigger for reporting relationship hierarchy, role compatibility, and anti-cycle validation
CREATE OR REPLACE FUNCTION check_reporting_relationship_validity() RETURNS TRIGGER AS $$ BEGIN IF NEW.supervisor_person_id = NEW.subordinate_person_id THEN RAISE EXCEPTION 'Self-supervision forbidden: supervisor and subordinate must be distinct'; END IF; IF NEW.relationship_type IN ('ADMIN_EMPLOYEE', 'PLANNER_EMPLOYEE') THEN IF NOT EXISTS (SELECT 1 FROM employee_profiles ep WHERE ep.organization_person_id = NEW.subordinate_person_id AND ep.organization_id = NEW.organization_id AND daterange(ep.started_on, ep.ended_on, '[]') @> daterange(NEW.valid_from, NEW.valid_to, '[]')) THEN RAISE EXCEPTION 'Subordinate person % must have an employee_profile covering relationship period for relationship type %', NEW.subordinate_person_id, NEW.relationship_type; END IF; END IF; IF NEW.relationship_type = 'ADMIN_PLANNER' THEN IF NOT EXISTS (SELECT 1 FROM person_role_periods prp WHERE prp.organization_person_id = NEW.supervisor_person_id AND prp.organization_id = NEW.organization_id AND prp.role IN ('OWNER', 'ADMIN') AND daterange(prp.valid_from, prp.valid_to, '[]') @> daterange(NEW.valid_from, NEW.valid_to, '[]')) THEN RAISE EXCEPTION 'Supervisor must hold active OWNER or ADMIN role covering full relationship period for ADMIN_PLANNER'; END IF; IF NOT EXISTS (SELECT 1 FROM person_role_periods prp WHERE prp.organization_person_id = NEW.subordinate_person_id AND prp.organization_id = NEW.organization_id AND prp.role = 'PLANNER' AND daterange(prp.valid_from, prp.valid_to, '[]') @> daterange(NEW.valid_from, NEW.valid_to, '[]')) THEN RAISE EXCEPTION 'Subordinate must hold active PLANNER role covering full relationship period for ADMIN_PLANNER'; END IF; ELSIF NEW.relationship_type = 'ADMIN_EMPLOYEE' THEN IF NOT EXISTS (SELECT 1 FROM person_role_periods prp WHERE prp.organization_person_id = NEW.supervisor_person_id AND prp.organization_id = NEW.organization_id AND prp.role IN ('OWNER', 'ADMIN') AND daterange(prp.valid_from, prp.valid_to, '[]') @> daterange(NEW.valid_from, NEW.valid_to, '[]')) THEN RAISE EXCEPTION 'Supervisor must hold active OWNER or ADMIN role covering full relationship period for ADMIN_EMPLOYEE'; END IF; ELSIF NEW.relationship_type = 'PLANNER_EMPLOYEE' THEN IF NOT EXISTS (SELECT 1 FROM person_role_periods prp WHERE prp.organization_person_id = NEW.supervisor_person_id AND prp.organization_id = NEW.organization_id AND prp.role = 'PLANNER' AND daterange(prp.valid_from, prp.valid_to, '[]') @> daterange(NEW.valid_from, NEW.valid_to, '[]')) THEN RAISE EXCEPTION 'Supervisor must hold active PLANNER role covering full relationship period for PLANNER_EMPLOYEE'; END IF; END IF; IF EXISTS (WITH RECURSIVE path AS (SELECT r.subordinate_person_id AS current_node, (daterange(r.valid_from, r.valid_to, '[]') * daterange(NEW.valid_from, NEW.valid_to, '[]')) AS common_range, ARRAY[r.supervisor_person_id, r.subordinate_person_id] AS visited FROM reporting_relationship_periods r WHERE r.organization_id = NEW.organization_id AND r.supervisor_person_id = NEW.subordinate_person_id AND (NEW.id IS NULL OR r.id <> NEW.id) AND daterange(r.valid_from, r.valid_to, '[]') && daterange(NEW.valid_from, NEW.valid_to, '[]') UNION ALL SELECT r.subordinate_person_id, (p.common_range * daterange(r.valid_from, r.valid_to, '[]')), p.visited || r.subordinate_person_id FROM reporting_relationship_periods r JOIN path p ON r.supervisor_person_id = p.current_node WHERE r.organization_id = NEW.organization_id AND (NEW.id IS NULL OR r.id <> NEW.id) AND NOT (r.subordinate_person_id = ANY(p.visited)) AND (p.common_range && daterange(r.valid_from, r.valid_to, '[]'))) SELECT 1 FROM path WHERE current_node = NEW.supervisor_person_id AND NOT isempty(common_range)) THEN RAISE EXCEPTION 'Circular supervision detected: A person cannot report to their subordinate (temporal cycle)'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_reporting_relationship ON reporting_relationship_periods;
CREATE CONSTRAINT TRIGGER trg_check_reporting_relationship
  AFTER INSERT OR UPDATE ON reporting_relationship_periods
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION check_reporting_relationship_validity();

-- Trigger for employee area period labor validity (must be fully contained within employee profile tenure)
CREATE OR REPLACE FUNCTION check_employee_area_period_labor_validity() RETURNS TRIGGER AS $$ DECLARE ep_started date; ep_ended date; BEGIN SELECT started_on, ended_on INTO ep_started, ep_ended FROM employee_profiles WHERE id = NEW.employee_profile_id AND organization_id = NEW.organization_id; IF NOT FOUND THEN RAISE EXCEPTION 'Employee profile % not found in organization %', NEW.employee_profile_id, NEW.organization_id; END IF; IF NOT (daterange(ep_started, ep_ended, '[]') @> daterange(NEW.valid_from, NEW.valid_to, '[]')) THEN RAISE EXCEPTION 'Employee area period [%, %] is not fully contained within employee profile labor tenure [%, %]', NEW.valid_from, NEW.valid_to, ep_started, ep_ended; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_employee_area_period_labor_validity ON employee_area_periods;
CREATE CONSTRAINT TRIGGER trg_check_employee_area_period_labor_validity
  AFTER INSERT OR UPDATE ON employee_area_periods
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION check_employee_area_period_labor_validity();

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
SELECT gen_random_uuid(), e.organization_id, e.user_id, CASE WHEN e.status = 'inactive' THEN 'INACTIVE' ELSE 'ACTIVE' END, e.created_at, e.updated_at
FROM employees e
WHERE e.user_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Backfill 3: Create organization_people and employee_profiles for unlinked employees (user_id IS NULL)
-- As per product invariant, unlinked legacy employees are created in PENDING_INVITATION status
INSERT INTO organization_people (id, organization_id, user_id, status, created_at, updated_at)
SELECT e.id, e.organization_id, NULL, 'PENDING_INVITATION', e.created_at, e.updated_at
FROM employees e
WHERE e.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_people op WHERE op.id = e.id
  );

INSERT INTO employee_profiles (id, organization_id, organization_person_id, external_employee_id, employee_name, employment_status, started_on, ended_on, created_at, updated_at)
SELECT 
  e.id,
  e.organization_id,
  e.id,
  e.external_employee_id,
  e.name,
  CASE WHEN e.status = 'inactive' THEN 'TERMINATED' ELSE 'ACTIVE' END,
  e.created_at::date,
  e.deactivated_at::date,
  e.created_at,
  e.updated_at
FROM employees e
WHERE e.user_id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Backfill 4: Create employee_profiles for linked employees (user_id IS NOT NULL)
INSERT INTO employee_profiles (id, organization_id, organization_person_id, external_employee_id, employee_name, employment_status, started_on, ended_on, created_at, updated_at)
SELECT 
  e.id,
  e.organization_id,
  op.id,
  e.external_employee_id,
  e.name,
  CASE WHEN e.status = 'inactive' THEN 'TERMINATED' ELSE 'ACTIVE' END,
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

-- Backfill 6: Normalized area periods from operational_assignments (Priority 1) and employees.area_id fallback (Priority 2)
-- Slices timeline into deterministic elementary intervals, merges same-area overlaps, selects exactly one primary area at any date,
-- preserves concurrent secondary areas, and fills timeline gaps before/after explicit assignments with fallback area.
WITH 
clamped_oa AS (
  SELECT 
    oa.organization_id,
    oa.subject_id AS employee_profile_id,
    oa.target_id AS area_id,
    lower(daterange(oa.valid_from, oa.valid_to, '[]') * daterange(ep.started_on, ep.ended_on, '[]')) AS valid_from,
    CASE 
      WHEN upper_inf(daterange(oa.valid_from, oa.valid_to, '[]') * daterange(ep.started_on, ep.ended_on, '[]')) THEN NULL 
      ELSE (upper(daterange(oa.valid_from, oa.valid_to, '[]') * daterange(ep.started_on, ep.ended_on, '[]')) - 1)::date 
    END AS valid_to,
    oa.created_at
  FROM operational_assignments oa
  JOIN employees e ON e.id = oa.subject_id AND e.organization_id = oa.organization_id
  JOIN employee_profiles ep ON ep.id = oa.subject_id AND ep.organization_id = oa.organization_id
  JOIN areas a ON a.id = oa.target_id AND a.organization_id = oa.organization_id
  WHERE oa.assignment_type = 'EMPLOYEE_AREA'
    AND NOT isempty(daterange(oa.valid_from, oa.valid_to, '[]') * daterange(ep.started_on, ep.ended_on, '[]'))
),
ordered_oa AS (
  SELECT 
    co.*,
    MAX(COALESCE(co.valid_to, 'infinity'::date)) OVER (
      PARTITION BY co.organization_id, co.employee_profile_id, co.area_id 
      ORDER BY co.valid_from ASC, co.valid_to NULLS LAST
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prev_max_to
  FROM clamped_oa co
),
grouped_same_area AS (
  SELECT 
    ooa.*,
    SUM(CASE 
      WHEN prev_max_to IS NULL THEN 1
      WHEN valid_from > (prev_max_to + 1) THEN 1
      ELSE 0 
    END) OVER (
      PARTITION BY organization_id, employee_profile_id, area_id 
      ORDER BY valid_from ASC, valid_to NULLS LAST
    ) AS island_id
  FROM ordered_oa ooa
),
same_area_merged AS (
  SELECT 
    organization_id,
    employee_profile_id,
    area_id,
    MIN(valid_from) AS valid_from,
    CASE WHEN bool_or(valid_to IS NULL) THEN NULL ELSE MAX(valid_to) END AS valid_to,
    MIN(created_at) AS created_at
  FROM grouped_same_area
  GROUP BY organization_id, employee_profile_id, area_id, island_id
),
emp_points AS (
  SELECT organization_id, employee_profile_id, valid_from AS pt FROM same_area_merged
  UNION
  SELECT organization_id, employee_profile_id, (valid_to + 1)::date AS pt FROM same_area_merged WHERE valid_to IS NOT NULL
  UNION
  SELECT ep.organization_id, ep.id AS employee_profile_id, COALESCE(ep.started_on, e.created_at::date, '2026-01-01'::date) AS pt 
  FROM employee_profiles ep
  JOIN employees e ON e.id = ep.id AND e.organization_id = ep.organization_id
  WHERE e.area_id IS NOT NULL
  UNION
  SELECT ep.organization_id, ep.id AS employee_profile_id, (COALESCE(ep.ended_on, e.deactivated_at::date) + 1)::date AS pt 
  FROM employee_profiles ep
  JOIN employees e ON e.id = ep.id AND e.organization_id = ep.organization_id
  WHERE e.area_id IS NOT NULL AND (ep.ended_on IS NOT NULL OR e.deactivated_at IS NOT NULL)
),
dedup_points AS (
  SELECT DISTINCT organization_id, employee_profile_id, pt FROM emp_points
),
slices AS (
  SELECT 
    dp.organization_id,
    dp.employee_profile_id,
    dp.pt AS slice_from,
    CASE 
      WHEN ep.ended_on IS NOT NULL OR e.deactivated_at IS NOT NULL THEN
        LEAST(
          (LEAD(dp.pt) OVER (PARTITION BY dp.organization_id, dp.employee_profile_id ORDER BY dp.pt ASC) - 1)::date,
          COALESCE(ep.ended_on, e.deactivated_at::date)
        )
      ELSE
        (LEAD(dp.pt) OVER (PARTITION BY dp.organization_id, dp.employee_profile_id ORDER BY dp.pt ASC) - 1)::date
    END AS slice_to
  FROM dedup_points dp
  JOIN employee_profiles ep ON ep.id = dp.employee_profile_id AND ep.organization_id = dp.organization_id
  JOIN employees e ON e.id = dp.employee_profile_id AND e.organization_id = dp.organization_id
  WHERE (ep.started_on IS NULL OR dp.pt >= ep.started_on)
    AND (COALESCE(ep.ended_on, e.deactivated_at::date) IS NULL OR dp.pt <= COALESCE(ep.ended_on, e.deactivated_at::date))
),
slice_eval AS (
  SELECT 
    s.organization_id,
    s.employee_profile_id,
    s.slice_from,
    s.slice_to,
    a.area_id AS explicit_area_id,
    a.valid_from AS explicit_from,
    a.created_at AS explicit_created_at,
    fallback_a.id AS fallback_area_id,
    CASE 
      WHEN a.area_id IS NOT NULL THEN
        ROW_NUMBER() OVER (
          PARTITION BY s.organization_id, s.employee_profile_id, s.slice_from
          ORDER BY 
            CASE WHEN a.area_id = e.area_id THEN 0 ELSE 1 END,
            a.valid_from ASC,
            a.created_at ASC,
            a.area_id ASC
        )
      ELSE NULL 
    END AS rank_num
  FROM slices s
  JOIN employees e ON e.id = s.employee_profile_id AND e.organization_id = s.organization_id
  LEFT JOIN areas fallback_a ON fallback_a.id = e.area_id AND fallback_a.organization_id = e.organization_id
  LEFT JOIN same_area_merged a 
    ON a.organization_id = s.organization_id 
   AND a.employee_profile_id = s.employee_profile_id
   AND a.valid_from <= s.slice_from
   AND (a.valid_to IS NULL OR a.valid_to >= COALESCE(s.slice_to, '9999-12-31'::date))
),
raw_segments AS (
  SELECT 
    organization_id,
    employee_profile_id,
    explicit_area_id AS area_id,
    slice_from,
    slice_to,
    (rank_num = 1) AS is_primary,
    'LEGACY_OPERATIONAL_ASSIGNMENT' AS source
  FROM slice_eval
  WHERE explicit_area_id IS NOT NULL

  UNION ALL

  SELECT 
    organization_id,
    employee_profile_id,
    fallback_area_id AS area_id,
    slice_from,
    slice_to,
    true AS is_primary,
    'LEGACY_EMPLOYEE_AREA_FALLBACK' AS source
  FROM slice_eval
  WHERE explicit_area_id IS NULL AND fallback_area_id IS NOT NULL
),
ordered_segments AS (
  SELECT 
    rs.*,
    MAX(COALESCE(rs.slice_to, 'infinity'::date)) OVER (
      PARTITION BY organization_id, employee_profile_id, area_id, is_primary, source
      ORDER BY slice_from ASC, slice_to NULLS LAST
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prev_slice_to
  FROM raw_segments rs
),
grouped_segments AS (
  SELECT 
    os.*,
    SUM(CASE 
      WHEN prev_slice_to IS NULL THEN 1
      WHEN slice_from > (prev_slice_to + 1) THEN 1
      ELSE 0 
    END) OVER (
      PARTITION BY organization_id, employee_profile_id, area_id, is_primary, source
      ORDER BY slice_from ASC, slice_to NULLS LAST
    ) AS grp_id
  FROM ordered_segments os
),
final_merged AS (
  SELECT 
    organization_id,
    employee_profile_id,
    area_id,
    is_primary,
    source,
    MIN(slice_from) AS valid_from,
    CASE WHEN bool_or(slice_to IS NULL) THEN NULL ELSE MAX(slice_to) END AS valid_to
  FROM grouped_segments
  GROUP BY organization_id, employee_profile_id, area_id, is_primary, source, grp_id
)
INSERT INTO employee_area_periods (
  organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary, source, created_at, updated_at
)
SELECT 
  fm.organization_id,
  fm.employee_profile_id,
  fm.area_id,
  fm.valid_from,
  fm.valid_to,
  fm.is_primary,
  fm.source,
  NOW(),
  NOW()
FROM final_merged fm
ON CONFLICT DO NOTHING;

-- Backfill 7: Access scopes from area_responsibles (Approval Policy AREA_RESPONSIBLE)
-- Maps designated area approval administrators to temporal area access scopes
INSERT INTO person_access_scope_periods (
  organization_id, organization_person_id, scope_type, area_id, target_person_id, valid_from, valid_to, source, created_at, updated_at
)
SELECT 
  ar.organization_id,
  op.id,
  'AREA',
  ar.area_id,
  NULL,
  COALESCE(ar.created_at::date, '2026-01-01'::date),
  NULL,
  'LEGACY_AREA_RESPONSIBLE',
  ar.created_at,
  ar.created_at
FROM area_responsibles ar
JOIN organization_people op ON op.organization_id = ar.organization_id AND op.user_id = ar.user_id
JOIN areas a ON a.id = ar.area_id AND a.organization_id = ar.organization_id
WHERE NOT EXISTS (
  SELECT 1 FROM person_access_scope_periods pasp
  WHERE pasp.organization_person_id = op.id
    AND pasp.area_id = ar.area_id
    AND pasp.scope_type = 'AREA'
    AND (pasp.valid_to IS NULL OR pasp.valid_to >= COALESCE(ar.created_at::date, '2026-01-01'::date))
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
WHERE (m.role IN ('OWNER', 'ADMIN')
  OR (m.role = 'PLANNER' AND (m.planner_scope_type = 'ORGANIZATION' OR (m.planner_scope_type IS NULL AND m.scoped_area_id IS NULL))))
  AND NOT EXISTS (
    SELECT 1 FROM person_access_scope_periods pasp
    WHERE pasp.organization_person_id = op.id
      AND pasp.scope_type = 'ORGANIZATION'
      AND (pasp.valid_to IS NULL OR pasp.valid_to >= COALESCE(m.created_at::date, '2026-01-01'::date))
  );

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
  AND NOT EXISTS (
    SELECT 1 FROM person_access_scope_periods pasp
    WHERE pasp.organization_person_id = op.id
      AND pasp.area_id = m.scoped_area_id
      AND pasp.scope_type = 'AREA'
      AND (pasp.valid_to IS NULL OR pasp.valid_to >= COALESCE(m.created_at::date, '2026-01-01'::date))
  );

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
  AND NOT EXISTS (
    SELECT 1 FROM person_access_scope_periods pasp
    WHERE pasp.organization_person_id = op.id
      AND pasp.area_id = oa.target_id
      AND pasp.scope_type = 'AREA'
      AND (pasp.valid_to IS NULL OR pasp.valid_to >= oa.valid_from)
  );

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
  AND NOT EXISTS (
    SELECT 1 FROM person_access_scope_periods pasp
    WHERE pasp.organization_person_id = planner_op.id
      AND pasp.target_person_id = emp_op.id
      AND pasp.scope_type = 'PERSON'
      AND (pasp.valid_to IS NULL OR pasp.valid_to >= oa.valid_from)
  );

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

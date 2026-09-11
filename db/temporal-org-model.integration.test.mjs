import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@neondatabase/serverless';
import {
  getEmployeeAreasOnDate,
  getPersonAccessScopesOnDate,
  getSupervisorsOnDate,
  getSubordinatesOnDate,
  getPersonHistory,
  resolveShiftAreaHistorical,
} from '../api/_lib/temporal-org-model.js';

describe('PostgreSQL Temporal Organizational Model Integration Tests (Phase 1)', () => {
  let client;
  let isConnected = false;

  beforeAll(async () => {
    try {
      const cs = execFileSync(
        'npx',
        ['neonctl', 'connection-string', 'br-fragrant-art-b11zsi3z', '--project-id', 'holy-cake-85660318', '--database-name', 'neondb'],
        { encoding: 'utf-8' }
      ).trim();

      client = new Client(cs);
      await client.connect();
      isConnected = true;
    } catch (err) {
      console.warn('Neon test branch not available in this environment:', err.message);
    }
  });

  afterAll(async () => {
    if (client && isConnected) {
      await client.end();
    }
  });

  it('verifies btree_gist extension and all 6 tables exist in database', async () => {
    if (!isConnected) return;
    const ext = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'");
    expect(ext.rows.length).toBe(1);

    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'organization_people',
          'employee_profiles',
          'person_role_periods',
          'employee_area_periods',
          'person_access_scope_periods',
          'reporting_relationship_periods'
        )
      ORDER BY table_name;
    `);
    expect(tables.rows.length).toBe(6);
  });

  it('enforces multi-tenant foreign keys: rejects cross-tenant employee-to-person linkage', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const orgA = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org A', 'company') RETURNING id")).rows[0].id;
      const orgB = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org B', 'company') RETURNING id")).rows[0].id;

      const personA = (await client.query(`
        INSERT INTO organization_people (organization_id, status)
        VALUES ($1, 'ACTIVE') RETURNING id
      `, [orgA])).rows[0].id;

      // Attempt to associate an employee in Org B with Person in Org A -> MUST FAIL
      let error = null;
      try {
        await client.query(`
          INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name)
          VALUES ($1, $2, 'Infiltrator')
        `, [orgB, personA]);
      } catch (err) {
        error = err;
      }
      expect(error).not.toBeNull();
      expect(error.message).toContain('employee_profiles_person_org_fkey');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('enforces multi-tenant foreign keys: rejects cross-tenant employee-to-area linkage', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const orgA = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org A', 'company') RETURNING id")).rows[0].id;
      const orgB = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org B', 'company') RETURNING id")).rows[0].id;

      const personA = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [orgA])).rows[0].id;
      const empA = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp A') RETURNING id", [orgA, personA])).rows[0].id;

      const areaB = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area B') RETURNING id", [orgB])).rows[0].id;

      // Attempt cross-tenant area period
      let error = null;
      await client.query('SAVEPOINT sp_cross_area;');
      try {
        await client.query(`
          INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from)
          VALUES ($1, $2, $3, '2026-01-01')
        `, [orgA, empA, areaB]);
        await client.query('SET CONSTRAINTS ALL IMMEDIATE;');
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_cross_area;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('employee_area_periods_area_org_fkey');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('enforces multi-tenant foreign keys: rejects cross-tenant supervision relationship', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const orgA = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org A', 'company') RETURNING id")).rows[0].id;
      const orgB = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org B', 'company') RETURNING id")).rows[0].id;

      const supA = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [orgA])).rows[0].id;
      const subB = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [orgB])).rows[0].id;

      let error = null;
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
          VALUES ($1, $2, $3, 'ADMIN_EMPLOYEE', '2026-01-01')
        `, [orgA, supA, subB]);
      } catch (err) {
        error = err;
      }
      expect(error).not.toBeNull();
      expect(error.message).toContain('reporting_relationship_periods_subordinate_org_fkey');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('enforces exclusion constraint: rejects overlapping role periods for the same person', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Roles', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'PLANNER', '2026-01-01', '2026-06-30')
      `, [org, person]);

      let error = null;
      try {
        await client.query(`
          INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
          VALUES ($1, $2, 'ADMIN', '2026-04-01', '2026-12-31')
        `, [org, person]);
      } catch (err) {
        error = err;
      }
      expect(error).not.toBeNull();
      expect(error.message).toContain('person_role_periods_no_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('enforces exclusion constraint: rejects overlapping assignments to the same area, allows concurrent different areas', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Areas', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp Multi') RETURNING id", [org, person])).rows[0].id;

      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Rampa') RETURNING id", [org])).rows[0].id;
      const area2 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Equipajes') RETURNING id", [org])).rows[0].id;
      const area3 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Pasaje') RETURNING id", [org])).rows[0].id;

      // Area 1 primary Jan-Jun
      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', '2026-06-30', true)
      `, [org, emp, area1]);

      // Concurrent Area 2 secondary Apr-Dec -> SUCCEEDS
      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-04-01', '2026-12-31', false)
      `, [org, emp, area2]);

      // Overlapping Area 1 again -> MUST FAIL
      let errorSameArea = null;
      await client.query('SAVEPOINT sp_same_area;');
      try {
        await client.query(`
          INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
          VALUES ($1, $2, $3, '2026-05-01', '2026-08-31', false)
        `, [org, emp, area1]);
      } catch (err) {
        errorSameArea = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_same_area;');
      expect(errorSameArea).not.toBeNull();
      expect(errorSameArea.message).toContain('employee_area_periods_no_same_area_overlap_excl');

      // Multiple primary areas at the same time (Area 3 primary overlapping Area 1 primary) -> MUST FAIL
      let errorPrimary = null;
      await client.query('SAVEPOINT sp_primary;');
      try {
        await client.query(`
          INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
          VALUES ($1, $2, $3, '2026-05-01', '2026-08-31', true)
        `, [org, emp, area3]);
      } catch (err) {
        errorPrimary = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_primary;');
      expect(errorPrimary).not.toBeNull();
      expect(errorPrimary.message).toContain('employee_area_periods_single_primary_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('enforces exclusion constraint: prevents self-supervision and multiple primary supervisors', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Sup', 'company') RETURNING id")).rows[0].id;
      const sup = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;
      const sub = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;

      // Self supervision -> CHECK constraint failure
      let selfError = null;
      await client.query('SAVEPOINT sp_self;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
          VALUES ($1, $2, $2, 'ADMIN_PLANNER', '2026-01-01')
        `, [org, sup]);
      } catch (err) {
        selfError = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_self;');
      expect(selfError).not.toBeNull();
      expect(selfError.message).toContain('reporting_relationship_periods_self_supervision_check');

      // Valid primary relationship
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, is_primary)
        VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-01-01', true)
      `, [org, sup, sub]);

      // Attempt second primary relationship for same subordinate and type
      const otherSup = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;
      let primaryError = null;
      await client.query('SAVEPOINT sp_primary_sup;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, is_primary)
          VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-03-01', true)
        `, [org, otherSup, sub]);
      } catch (err) {
        primaryError = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_primary_sup;');
      expect(primaryError).not.toBeNull();
      expect(primaryError.message).toContain('reporting_relationship_single_primary_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('verifies ON DELETE RESTRICT on areas: area with history cannot be deleted', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Restrict', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp') RETURNING id", [org, person])).rows[0].id;
      const area = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Protected Area') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from)
        VALUES ($1, $2, $3, '2026-01-01')
      `, [org, emp, area]);

      // Attempt to DELETE area (must be blocked by referenced history)
      let deleteError = null;
      await client.query('SAVEPOINT sp_delete_area;');
      try {
        await client.query("DELETE FROM areas WHERE id = $1", [area]);
        await client.query('SET CONSTRAINTS ALL IMMEDIATE;');
      } catch (err) {
        deleteError = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_delete_area;');
      expect(deleteError).not.toBeNull();
      expect(deleteError.message).toContain('employee_area_periods_area_org_fkey');

      // Deactivation is allowed
      const upd = await client.query("UPDATE areas SET active = false WHERE id = $1 RETURNING active", [area]);
      expect(upd.rows[0].active).toBe(false);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('verifies complete cascade when organization is deleted', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Cascade', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp') RETURNING id", [org, person])).rows[0].id;
      const area = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area') RETURNING id", [org])).rows[0].id;

      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'ADMIN', '2026-01-01')", [org, person]);
      await client.query("INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from) VALUES ($1, $2, $3, '2026-01-01')", [org, emp, area]);
      await client.query("INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, valid_from) VALUES ($1, $2, 'ORGANIZATION', '2026-01-01')", [org, person]);

      // Delete organization
      await client.query("DELETE FROM organizations WHERE id = $1", [org]);

      const [p, ep, prp, eap, pasp] = await Promise.all([
        client.query("SELECT count(*)::int as c FROM organization_people WHERE organization_id = $1", [org]),
        client.query("SELECT count(*)::int as c FROM employee_profiles WHERE organization_id = $1", [org]),
        client.query("SELECT count(*)::int as c FROM person_role_periods WHERE organization_id = $1", [org]),
        client.query("SELECT count(*)::int as c FROM employee_area_periods WHERE organization_id = $1", [org]),
        client.query("SELECT count(*)::int as c FROM person_access_scope_periods WHERE organization_id = $1", [org]),
      ]);

      expect(p.rows[0].c).toBe(0);
      expect(ep.rows[0].c).toBe(0);
      expect(prp.rows[0].c).toBe(0);
      expect(eap.rows[0].c).toBe(0);
      expect(pasp.rows[0].c).toBe(0);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('queries canonical read views: current_person_roles and current_employee_areas', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Views', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp View') RETURNING id", [org, person])).rows[0].id;
      const area = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area View') RETURNING id", [org])).rows[0].id;

      // Active role today
      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'ADMIN', '2026-01-01', NULL)
      `, [org, person]);

      // Active area today
      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', NULL, true)
      `, [org, emp, area]);

      const currentRoles = await client.query(`
        SELECT role FROM current_person_roles 
        WHERE organization_id = $1 AND organization_person_id = $2
      `, [org, person]);
      expect(currentRoles.rows.length).toBe(1);
      expect(currentRoles.rows[0].role).toBe('ADMIN');

      const currentAreas = await client.query(`
        SELECT area_name, is_primary FROM current_employee_areas
        WHERE organization_id = $1 AND employee_profile_id = $2
      `, [org, emp]);
      expect(currentAreas.rows.length).toBe(1);
      expect(currentAreas.rows[0].area_name).toBe('Area View');
      expect(currentAreas.rows[0].is_primary).toBe(true);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('tests historical parameterized query helper: resolveShiftAreaHistorical', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Hist', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id) VALUES ($1) RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp Hist') RETURNING id", [org, person])).rows[0].id;

      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Jan-Jun') RETURNING id", [org])).rows[0].id;
      const area2 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Jul-Dec') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', '2026-06-30', true)
      `, [org, emp, area1]);

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-07-01', '2026-12-31', true)
      `, [org, emp, area2]);

      // Tagged template adapter for neon client query
      const sqlAdapter = async (strings, ...values) => {
        let text = strings[0];
        const params = [];
        for (let i = 0; i < values.length; i++) {
          params.push(values[i]);
          text += '$' + params.length + strings[i + 1];
        }
        const res = await client.query(text, params);
        return res.rows;
      };

      const resolvedFeb = await resolveShiftAreaHistorical(sqlAdapter, {
        organizationId: org,
        employeeProfileId: emp,
        shiftDate: '2026-02-15',
      });
      expect(resolvedFeb).toBe(area1);

      const resolvedAug = await resolveShiftAreaHistorical(sqlAdapter, {
        organizationId: org,
        employeeProfileId: emp,
        shiftDate: '2026-08-15',
      });
      expect(resolvedAug).toBe(area2);

      // Fallback area when no assignment exists for past year
      const resolved2025 = await resolveShiftAreaHistorical(sqlAdapter, {
        organizationId: org,
        employeeProfileId: emp,
        shiftDate: '2025-05-01',
        fallbackAreaId: 'fallback-area-id',
      });
      expect(resolved2025).toBe('fallback-area-id');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('tests deterministic legacy backfill', async () => {
    if (!isConnected) return;
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Legacy Backfill', 'company') RETURNING id")).rows[0].id;
      const area = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Legacy Area') RETURNING id", [org])).rows[0].id;
      const user = (await client.query("INSERT INTO users (email, password_hash, display_name) VALUES ('legacy@user.com', 'hash', 'Legacy User') RETURNING id")).rows[0].id;

      // Legacy membership
      await client.query(`
        INSERT INTO memberships (organization_id, user_id, role, planner_scope_type, scoped_area_id)
        VALUES ($1, $2, 'PLANNER', 'AREAS', $3)
      `, [org, user, area]);

      // Legacy employee linked to user
      const empLinked = (await client.query(`
        INSERT INTO employees (organization_id, name, user_id, area_id)
        VALUES ($1, 'Empleado Vinculado', $2, $3) RETURNING id
      `, [org, user, area])).rows[0].id;

      // Legacy employee unlinked
      const empUnlinked = (await client.query(`
        INSERT INTO employees (organization_id, name, user_id, area_id)
        VALUES ($1, 'Empleado Sin Acceso', NULL, $2) RETURNING id
      `, [org, area])).rows[0].id;

      // Run backfill statements
      // 1. Memberships -> organization_people
      await client.query(`
        INSERT INTO organization_people (id, organization_id, user_id, status, created_at, updated_at)
        SELECT gen_random_uuid(), m.organization_id, m.user_id, 'ACTIVE', m.created_at, m.created_at
        FROM memberships m WHERE m.organization_id = $1
        ON CONFLICT (organization_id, user_id) DO NOTHING;
      `, [org]);

      // 2. Unlinked employees -> organization_people + employee_profiles
      await client.query(`
        CREATE TEMPORARY TABLE temp_test_unlinked ON COMMIT DROP AS
        SELECT gen_random_uuid() AS person_id, e.id AS employee_id, e.organization_id, e.name, e.external_employee_id, e.status, e.created_at, e.updated_at, e.deactivated_at
        FROM employees e WHERE e.organization_id = $1 AND e.user_id IS NULL AND NOT EXISTS (SELECT 1 FROM employee_profiles ep WHERE ep.id = e.id);
      `, [org]);

      await client.query(`
        INSERT INTO organization_people (id, organization_id, user_id, status, created_at, updated_at)
        SELECT person_id, organization_id, NULL, 'ACTIVE', created_at, updated_at FROM temp_test_unlinked;
      `);

      await client.query(`
        INSERT INTO employee_profiles (id, organization_id, organization_person_id, external_employee_id, employee_name, employment_status, started_on, ended_on, created_at, updated_at)
        SELECT employee_id, organization_id, person_id, external_employee_id, name, 'ACTIVE', created_at::date, deactivated_at::date, created_at, updated_at FROM temp_test_unlinked;
      `);

      // 3. Linked employees -> employee_profiles
      await client.query(`
        INSERT INTO employee_profiles (id, organization_id, organization_person_id, external_employee_id, employee_name, employment_status, started_on, ended_on, created_at, updated_at)
        SELECT e.id, e.organization_id, op.id, e.external_employee_id, e.name, 'ACTIVE', e.created_at::date, e.deactivated_at::date, e.created_at, e.updated_at
        FROM employees e
        JOIN organization_people op ON op.organization_id = e.organization_id AND op.user_id = e.user_id
        WHERE e.organization_id = $1
        ON CONFLICT (id) DO NOTHING;
      `, [org]);

      // 4. Memberships -> person_role_periods
      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to, source, created_at, updated_at)
        SELECT m.organization_id, op.id, m.role, COALESCE(m.created_at::date, '2026-01-01'::date), NULL, 'LEGACY_CURRENT_STATE', m.created_at, m.created_at
        FROM memberships m
        JOIN organization_people op ON op.organization_id = m.organization_id AND op.user_id = m.user_id
        WHERE m.organization_id = $1;
      `, [org]);

      // Verify backfilled state
      const people = await client.query("SELECT id, user_id FROM organization_people WHERE organization_id = $1", [org]);
      expect(people.rows.length).toBe(2); // 1 linked person + 1 unlinked person

      const profiles = await client.query("SELECT id, employee_name FROM employee_profiles WHERE organization_id = $1 ORDER BY employee_name", [org]);
      expect(profiles.rows.length).toBe(2);
      expect(profiles.rows.map(r => r.id)).toContain(empLinked);
      expect(profiles.rows.map(r => r.id)).toContain(empUnlinked);

      const roles = await client.query("SELECT role, source FROM person_role_periods WHERE organization_id = $1", [org]);
      expect(roles.rows.length).toBe(1);
      expect(roles.rows[0].role).toBe('PLANNER');
      expect(roles.rows[0].source).toBe('LEGACY_CURRENT_STATE');
    } finally {
      await client.query('ROLLBACK;');
    }
  });
});

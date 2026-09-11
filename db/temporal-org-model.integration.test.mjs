import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@neondatabase/serverless';
import {
  resolveShiftAreaHistorical,
  transferOwnershipTemporal,
} from '../api/_lib/temporal-org-model.js';

describe('PostgreSQL Temporal Organizational Model Integration Tests (Phase 1)', () => {
  let client;

  // Adapter for tagged template queries using pg/neon client
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

  beforeAll(async () => {
    const connectionString = process.env.TEMPORAL_MODEL_DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'Database connection required: Set TEMPORAL_MODEL_DATABASE_URL before running integration tests.'
      );
    }

    client = new Client(connectionString);
    await client.connect();

    sqlAdapter.transaction = async (queriesBuilder) => {
      await client.query('BEGIN;');
      try {
        const queries = typeof queriesBuilder === 'function' ? queriesBuilder(sqlAdapter) : queriesBuilder;
        const results = [];
        for (const q of queries) {
          results.push(await q);
        }
        await client.query('COMMIT;');
        return results;
      } catch (err) {
        await client.query('ROLLBACK;');
        throw err;
      }
    };
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  // Schema baseline verification
  it('verifies btree_gist extension and all 6 temporal tables exist in database', async () => {
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

  // Structural integrity: Foreign keys & tenant boundaries
  it('enforces multi-tenant foreign keys: rejects cross-tenant employee-to-person linkage', async () => {
    await client.query('BEGIN;');
    try {
      const orgA = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org A', 'company') RETURNING id")).rows[0].id;
      const orgB = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org B', 'company') RETURNING id")).rows[0].id;

      const personA = (await client.query(`
        INSERT INTO organization_people (organization_id, status)
        VALUES ($1, 'ACTIVE') RETURNING id
      `, [orgA])).rows[0].id;

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

  // Scenario 1: Multi-área simultánea (una primaria, una secundaria)
  it('Scenario 1: Multi-área simultánea (una primaria, una secundaria)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S1', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S1') RETURNING id", [org, person])).rows[0].id;
      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Rampa') RETURNING id", [org])).rows[0].id;
      const area2 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Equipajes') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', true)
      `, [org, emp, area1]);

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', false)
      `, [org, emp, area2]);

      const areas = await client.query(`
        SELECT area_id, is_primary FROM employee_area_periods
        WHERE organization_id = $1 AND employee_profile_id = $2
        ORDER BY is_primary DESC;
      `, [org, emp]);

      expect(areas.rows.length).toBe(2);
      expect(areas.rows[0].area_id).toBe(area1);
      expect(areas.rows[0].is_primary).toBe(true);
      expect(areas.rows[1].area_id).toBe(area2);
      expect(areas.rows[1].is_primary).toBe(false);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 2: Transición temporal de área primaria
  it('Scenario 2: Transición temporal de área primaria', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S2', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S2') RETURNING id", [org, person])).rows[0].id;
      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area 1') RETURNING id", [org])).rows[0].id;
      const area2 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area 2') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', '2026-06-30', true)
      `, [org, emp, area1]);

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-07-01', NULL, true)
      `, [org, emp, area2]);

      const areaMay = await resolveShiftAreaHistorical(sqlAdapter, {
        organizationId: org,
        employeeProfileId: emp,
        shiftDate: '2026-05-15',
      });
      expect(areaMay).toBe(area1);

      const areaAug = await resolveShiftAreaHistorical(sqlAdapter, {
        organizationId: org,
        employeeProfileId: emp,
        shiftDate: '2026-08-15',
      });
      expect(areaAug).toBe(area2);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 3: Fin de vigencia de área
  it('Scenario 3: Fin de vigencia de área', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S3', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S3') RETURNING id", [org, person])).rows[0].id;
      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Expiring') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', '2026-03-31', true)
      `, [org, emp, area1]);

      const fallbackId = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Default Area') RETURNING id", [org])).rows[0].id;

      const areaApril = await resolveShiftAreaHistorical(sqlAdapter, {
        organizationId: org,
        employeeProfileId: emp,
        shiftDate: '2026-04-01',
        fallbackAreaId: fallbackId,
      });
      expect(areaApril).toBe(fallbackId);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 4: Intento de solapamiento de dos primarias (debe fallar)
  it('Scenario 4: Intento de solapamiento de dos primarias (debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S4', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S4') RETURNING id", [org, person])).rows[0].id;
      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area A') RETURNING id", [org])).rows[0].id;
      const area2 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area B') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', true)
      `, [org, emp, area1]);

      let error = null;
      await client.query('SAVEPOINT sp_s4;');
      try {
        await client.query(`
          INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, is_primary)
          VALUES ($1, $2, $3, '2026-04-01', true)
        `, [org, emp, area2]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s4;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('employee_area_periods_single_primary_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 5: Solapamiento de misma área (debe fallar)
  it('Scenario 5: Solapamiento de misma área (debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S5', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S5') RETURNING id", [org, person])).rows[0].id;
      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Same') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, '2026-01-01', '2026-06-30', true)
      `, [org, emp, area1]);

      let error = null;
      await client.query('SAVEPOINT sp_s5;');
      try {
        await client.query(`
          INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from, valid_to, is_primary)
          VALUES ($1, $2, $3, '2026-05-01', '2026-08-31', false)
        `, [org, emp, area1]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s5;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('employee_area_periods_no_same_area_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 6: Empleado sin área temporal
  it('Scenario 6: Empleado sin área temporal resuelve a fallback', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S6', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S6') RETURNING id", [org, person])).rows[0].id;

      const fallback = await resolveShiftAreaHistorical(sqlAdapter, {
        organizationId: org,
        employeeProfileId: emp,
        shiftDate: '2026-05-01',
        fallbackAreaId: 'fallback-org-area',
      });
      expect(fallback).toBe('fallback-org-area');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 7: Solapamiento de roles para misma persona (debe fallar)
  it('Scenario 7: Solapamiento de roles para misma persona (debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S7', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'PLANNER', '2026-01-01', '2026-06-30')
      `, [org, person]);

      let error = null;
      await client.query('SAVEPOINT sp_s7;');
      try {
        await client.query(`
          INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
          VALUES ($1, $2, 'ADMIN', '2026-05-01', '2026-12-31')
        `, [org, person]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s7;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('person_role_periods_no_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 8: Unicidad temporal de OWNER (segundo OWNER solapado debe fallar)
  it('Scenario 8: Unicidad temporal de OWNER (segundo OWNER solapado debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S8', 'company') RETURNING id")).rows[0].id;
      const personA = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const personB = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from)
        VALUES ($1, $2, 'OWNER', '2026-01-01')
      `, [org, personA]);

      let error = null;
      await client.query('SAVEPOINT sp_s8;');
      try {
        await client.query(`
          INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from)
          VALUES ($1, $2, 'OWNER', '2026-06-01')
        `, [org, personB]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s8;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('person_role_periods_single_owner_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 9: Transferencia temporal de ownership
  it('Scenario 9: Transferencia temporal de ownership vía transferOwnershipTemporal', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S9', 'company') RETURNING id")).rows[0].id;
      const userA = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('userA@test.com', 'User A', 'hash') RETURNING id")).rows[0].id;
      const userB = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('userB@test.com', 'User B', 'hash') RETURNING id")).rows[0].id;

      await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')", [org, userA]);
      await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'ADMIN')", [org, userB]);

      const personA = (await client.query("INSERT INTO organization_people (organization_id, user_id) VALUES ($1, $2) RETURNING id", [org, userA])).rows[0].id;
      const personB = (await client.query("INSERT INTO organization_people (organization_id, user_id) VALUES ($1, $2) RETURNING id", [org, userB])).rows[0].id;

      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'OWNER', '2026-01-01')", [org, personA]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'ADMIN', '2026-01-01')", [org, personB]);

      const res = await transferOwnershipTemporal(sqlAdapter, {
        organizationId: org,
        currentOwnerPersonId: personA,
        newOwnerPersonId: personB,
        effectiveDate: '2026-07-01',
        newPreviousOwnerRole: 'ADMIN',
      });

      expect(res.transferred).toBe(true);

      // Verify role periods in DB
      const rolesA = await client.query("SELECT role, valid_from::text as valid_from, valid_to::text as valid_to FROM person_role_periods WHERE organization_person_id = $1 ORDER BY valid_from", [personA]);
      expect(rolesA.rows.length).toBe(2);
      expect(rolesA.rows[0].role).toBe('OWNER');
      expect(rolesA.rows[0].valid_to).toBe('2026-06-30');
      expect(rolesA.rows[1].role).toBe('ADMIN');
      expect(rolesA.rows[1].valid_from).toBe('2026-07-01');

      const rolesB = await client.query("SELECT role, valid_from::text as valid_from, valid_to::text as valid_to FROM person_role_periods WHERE organization_person_id = $1 ORDER BY valid_from", [personB]);
      expect(rolesB.rows.length).toBe(2);
      expect(rolesB.rows[0].role).toBe('ADMIN');
      expect(rolesB.rows[0].valid_to).toBe('2026-06-30');
      expect(rolesB.rows[1].role).toBe('OWNER');
      expect(rolesB.rows[1].valid_from).toBe('2026-07-01');

      // Verify memberships updated
      const memA = await client.query("SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2", [org, userA]);
      expect(memA.rows[0].role).toBe('ADMIN');
      const memB = await client.query("SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2", [org, userB]);
      expect(memB.rows[0].role).toBe('OWNER');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 10: Alcance ORGANIZATION
  it('Scenario 10: Alcance ORGANIZATION (duplicado solapado debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S10', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, valid_from)
        VALUES ($1, $2, 'ORGANIZATION', '2026-01-01')
      `, [org, person]);

      let error = null;
      await client.query('SAVEPOINT sp_s10;');
      try {
        await client.query(`
          INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, valid_from)
          VALUES ($1, $2, 'ORGANIZATION', '2026-04-01')
        `, [org, person]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s10;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('person_access_scope_org_no_overlap_excl');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 11: Alcance AREA múltiple para un planner
  it('Scenario 11: Alcance AREA múltiple para un planner', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S11', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const area1 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Planner 1') RETURNING id", [org])).rows[0].id;
      const area2 = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area Planner 2') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, area_id, valid_from)
        VALUES ($1, $2, 'AREA', $3, '2026-01-01')
      `, [org, person, area1]);

      await client.query(`
        INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, area_id, valid_from)
        VALUES ($1, $2, 'AREA', $3, '2026-01-01')
      `, [org, person, area2]);

      const scopes = await client.query(`
        SELECT area_id FROM person_access_scope_periods
        WHERE organization_id = $1 AND organization_person_id = $2
        ORDER BY area_id;
      `, [org, person]);
      expect(scopes.rows.length).toBe(2);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 12: Alcance PERSON para un planner
  it('Scenario 12: Alcance PERSON para un planner', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S12', 'company') RETURNING id")).rows[0].id;
      const planner = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const targetEmp = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, target_person_id, valid_from)
        VALUES ($1, $2, 'PERSON', $3, '2026-01-01')
      `, [org, planner, targetEmp]);

      const scopes = await client.query(`
        SELECT target_person_id FROM person_access_scope_periods
        WHERE organization_id = $1 AND organization_person_id = $2;
      `, [org, planner]);
      expect(scopes.rows.length).toBe(1);
      expect(scopes.rows[0].target_person_id).toBe(targetEmp);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 13: Violación de frontera de tenant en alcance
  it('Scenario 13: Violación de frontera de tenant en alcance (debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const orgA = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org A13', 'company') RETURNING id")).rows[0].id;
      const orgB = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org B13', 'company') RETURNING id")).rows[0].id;
      const personA = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [orgA])).rows[0].id;
      const areaB = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area B13') RETURNING id", [orgB])).rows[0].id;

      let error = null;
      await client.query('SAVEPOINT sp_s13;');
      try {
        await client.query(`
          INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, area_id, valid_from)
          VALUES ($1, $2, 'AREA', $3, '2026-01-01')
        `, [orgA, personA, areaB]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s13;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('person_access_scope_periods_area_org_fkey');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 14: Supervisión directa ADMIN -> PLANNER
  it('Scenario 14: Supervisión directa ADMIN -> PLANNER', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S14', 'company') RETURNING id")).rows[0].id;
      const adminPerson = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const plannerPerson = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'ADMIN', '2026-01-01')", [org, adminPerson]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'PLANNER', '2026-01-01')", [org, plannerPerson]);

      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, is_primary)
        VALUES ($1, $2, $3, 'ADMIN_PLANNER', '2026-01-01', true)
      `, [org, adminPerson, plannerPerson]);

      const rels = await client.query("SELECT * FROM reporting_relationship_periods WHERE organization_id = $1", [org]);
      expect(rels.rows.length).toBe(1);
      expect(rels.rows[0].relationship_type).toBe('ADMIN_PLANNER');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 15: Supervisión PLANNER -> EMPLOYEE (requiere perfil)
  it('Scenario 15: Supervisión PLANNER -> EMPLOYEE requiere perfil de empleado', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S15', 'company') RETURNING id")).rows[0].id;
      const plannerPerson = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const empPerson = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'PLANNER', '2026-01-01')", [org, plannerPerson]);

      // Subordinate lacks employee_profile -> Trigger must fail
      let error = null;
      await client.query('SAVEPOINT sp_s15;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, is_primary)
          VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-01-01', true)
        `, [org, plannerPerson, empPerson]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s15;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('must have an employee_profile');

      // Add employee_profile -> Succeeds
      await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S15')", [org, empPerson]);
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, is_primary)
        VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-01-01', true)
      `, [org, plannerPerson, empPerson]);

      const ok = await client.query("SELECT 1 FROM reporting_relationship_periods WHERE organization_id = $1", [org]);
      expect(ok.rows.length).toBe(1);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 16: Sustitución temporal de supervisor
  it('Scenario 16: Sustitución temporal de supervisor', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S16', 'company') RETURNING id")).rows[0].id;
      const sup1 = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const sup2 = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp S16')", [org, emp]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'PLANNER', '2026-01-01')", [org, sup1]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'PLANNER', '2026-01-01')", [org, sup2]);

      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-01-01', '2026-06-30', true)
      `, [org, sup1, emp]);

      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to, is_primary)
        VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-07-01', '2026-08-31', true)
      `, [org, sup2, emp]);

      const rels = await client.query("SELECT supervisor_person_id, valid_from, valid_to FROM reporting_relationship_periods WHERE organization_id = $1 ORDER BY valid_from", [org]);
      expect(rels.rows.length).toBe(2);
      expect(rels.rows[0].supervisor_person_id).toBe(sup1);
      expect(rels.rows[1].supervisor_person_id).toBe(sup2);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 17: Auto-supervisión (debe fallar)
  it('Scenario 17: Auto-supervisión (debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S17', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      let error = null;
      await client.query('SAVEPOINT sp_s17;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
          VALUES ($1, $2, $2, 'ADMIN_PLANNER', '2026-01-01')
        `, [org, person]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s17;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('reporting_relationship_periods_self_supervision_check');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 18: Supervisión circular directa A -> B -> A (debe fallar)
  it('Scenario 18: Supervisión circular directa A -> B -> A (debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S18', 'company') RETURNING id")).rows[0].id;
      const personA = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const personB = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp A')", [org, personA]);
      await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp B')", [org, personB]);

      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'ADMIN', '2026-01-01')", [org, personA]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'PLANNER', '2026-01-01')", [org, personB]);

      // A -> B (ADMIN -> PLANNER)
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
        VALUES ($1, $2, $3, 'ADMIN_PLANNER', '2026-01-01')
      `, [org, personA, personB]);

      // Attempt B -> A (PLANNER -> EMPLOYEE, supervisor B is PLANNER, subordinate A has employee_profile, forms cycle B -> A -> B)
      let error = null;
      await client.query('SAVEPOINT sp_s18;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
          VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-01-01')
        `, [org, personB, personA]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s18;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('Circular supervision detected');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 19: Supervisión circular transitiva A -> B -> C -> A (debe fallar)
  it('Scenario 19: Supervisión circular transitiva A -> B -> C -> A (debe fallar)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S19', 'company') RETURNING id")).rows[0].id;
      const personA = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const personB = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const personC = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp A')", [org, personA]);
      await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp B')", [org, personB]);
      await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp C')", [org, personC]);

      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'ADMIN', '2026-01-01')", [org, personA]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'ADMIN', '2026-01-01')", [org, personB]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'PLANNER', '2026-01-01')", [org, personC]);

      // A -> B (ADMIN -> EMPLOYEE, supervisor A is ADMIN, subordinate B has profile)
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
        VALUES ($1, $2, $3, 'ADMIN_EMPLOYEE', '2026-01-01')
      `, [org, personA, personB]);

      // B -> C (ADMIN -> PLANNER, supervisor B is ADMIN, subordinate C is PLANNER)
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
        VALUES ($1, $2, $3, 'ADMIN_PLANNER', '2026-01-01')
      `, [org, personB, personC]);

      // Attempt C -> A (PLANNER -> EMPLOYEE, supervisor C is PLANNER, subordinate A has profile, forms cycle C -> A -> B -> C)
      let error = null;
      await client.query('SAVEPOINT sp_s19;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from)
          VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-01-01')
        `, [org, personC, personA]);
      } catch (err) {
        error = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_s19;');
      expect(error).not.toBeNull();
      expect(error.message).toContain('Circular supervision detected');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Scenario 20: Reutilización recíproca en periodos disjuntos (debe ser VÁLIDA)
  it('Scenario 20: Reutilización recíproca en periodos disjuntos (debe ser VÁLIDA)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org S20', 'company') RETURNING id")).rows[0].id;
      const personA = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const personB = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      // In 2025: A is ADMIN, B is PLANNER
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to) VALUES ($1, $2, 'ADMIN', '2025-01-01', '2025-12-31')", [org, personA]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to) VALUES ($1, $2, 'PLANNER', '2025-01-01', '2025-12-31')", [org, personB]);

      // In 2026: B is ADMIN, A is PLANNER
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to) VALUES ($1, $2, 'PLANNER', '2026-01-01', '2026-12-31')", [org, personA]);
      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to) VALUES ($1, $2, 'ADMIN', '2026-01-01', '2026-12-31')", [org, personB]);

      // 2025: A supervises B
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to)
        VALUES ($1, $2, $3, 'ADMIN_PLANNER', '2025-01-01', '2025-12-31')
      `, [org, personA, personB]);

      // 2026: B supervises A -> Disjoint interval, MUST SUCCEED
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to)
        VALUES ($1, $2, $3, 'ADMIN_PLANNER', '2026-01-01', '2026-12-31')
      `, [org, personB, personA]);

      const rels = await client.query("SELECT supervisor_person_id, subordinate_person_id, valid_from FROM reporting_relationship_periods WHERE organization_id = $1 ORDER BY valid_from", [org]);
      expect(rels.rows.length).toBe(2);
      expect(rels.rows[0].supervisor_person_id).toBe(personA);
      expect(rels.rows[1].supervisor_person_id).toBe(personB);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Structural operations: ON DELETE RESTRICT and CASCADE
  it('verifies ON DELETE RESTRICT on areas: area with history cannot be deleted', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Restrict', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp') RETURNING id", [org, person])).rows[0].id;
      const area = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Protected Area') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from)
        VALUES ($1, $2, $3, '2026-01-01')
      `, [org, emp, area]);

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

      const upd = await client.query("UPDATE areas SET active = false WHERE id = $1 RETURNING active", [area]);
      expect(upd.rows[0].active).toBe(false);
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  it('verifies complete cascade when organization is deleted', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Cascade', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp') RETURNING id", [org, person])).rows[0].id;
      const area = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area') RETURNING id", [org])).rows[0].id;

      await client.query("INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from) VALUES ($1, $2, 'ADMIN', '2026-01-01')", [org, person]);
      await client.query("INSERT INTO employee_area_periods (organization_id, employee_profile_id, area_id, valid_from) VALUES ($1, $2, $3, '2026-01-01')", [org, emp, area]);
      await client.query("INSERT INTO person_access_scope_periods (organization_id, organization_person_id, scope_type, valid_from) VALUES ($1, $2, 'ORGANIZATION', '2026-01-01')", [org, person]);

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
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Views', 'company') RETURNING id")).rows[0].id;
      const person = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const emp = (await client.query("INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name) VALUES ($1, $2, 'Emp View') RETURNING id", [org, person])).rows[0].id;
      const area = (await client.query("INSERT INTO areas (organization_id, name) VALUES ($1, 'Area View') RETURNING id", [org])).rows[0].id;

      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'ADMIN', '2026-01-01', NULL)
      `, [org, person]);

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

  // Section 3 Requirement: Temporal coverage of roles and employee profiles
  it('enforces full temporal coverage on reporting relationships (roles and employee profiles)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Coverage', 'company') RETURNING id")).rows[0].id;
      const adminPerson = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const plannerPerson = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      const empPerson = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;

      // Case 1: Role ADMIN 1 Jan to 31 Jan, relationship for whole 2026 -> REJECT
      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'ADMIN', '2026-01-01', '2026-01-31')
      `, [org, adminPerson]);
      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'PLANNER', '2026-01-01', NULL)
      `, [org, plannerPerson]);

      let error1 = null;
      await client.query('SAVEPOINT sp_cov1;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to)
          VALUES ($1, $2, $3, 'ADMIN_PLANNER', '2026-01-01', '2026-12-31')
        `, [org, adminPerson, plannerPerson]);
      } catch (err) {
        error1 = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_cov1;');
      expect(error1).not.toBeNull();
      expect(error1.message).toContain('Supervisor must hold active OWNER or ADMIN role covering full relationship period');

      // Case 2: Role ADMIN open from 1 Jan, relation from Feb without end -> ACCEPT
      await client.query(`
        UPDATE person_role_periods SET valid_to = NULL WHERE organization_person_id = $1 AND role = 'ADMIN'
      `, [adminPerson]);
      await client.query(`
        INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to)
        VALUES ($1, $2, $3, 'ADMIN_PLANNER', '2026-02-01', NULL)
      `, [org, adminPerson, plannerPerson]);
      const relOk = await client.query("SELECT 1 FROM reporting_relationship_periods WHERE organization_id = $1", [org]);
      expect(relOk.rows.length).toBe(1);

      // Case 3: Planner role ended, relation later -> REJECT
      const supPlanner = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'PLANNER', '2026-01-01', '2026-05-31')
      `, [org, supPlanner]);
      await client.query(`
        INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name, started_on)
        VALUES ($1, $2, 'Emp S3', '2026-01-01')
      `, [org, empPerson]);

      let error3 = null;
      await client.query('SAVEPOINT sp_cov3;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to)
          VALUES ($1, $2, $3, 'PLANNER_EMPLOYEE', '2026-06-01', '2026-12-31')
        `, [org, supPlanner, empPerson]);
      } catch (err) {
        error3 = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_cov3;');
      expect(error3).not.toBeNull();
      expect(error3.message).toContain('Supervisor must hold active PLANNER role covering full relationship period');

      // Case 4: Subordinate employee profile ended_on before relation ends -> REJECT
      const empEnded = (await client.query("INSERT INTO organization_people (organization_id, status) VALUES ($1, 'PENDING_INVITATION') RETURNING id", [org])).rows[0].id;
      await client.query(`
        INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name, started_on, ended_on)
        VALUES ($1, $2, 'Emp Ended', '2026-01-01', '2026-06-30')
      `, [org, empEnded]);

      let error4 = null;
      await client.query('SAVEPOINT sp_cov4;');
      try {
        await client.query(`
          INSERT INTO reporting_relationship_periods (organization_id, supervisor_person_id, subordinate_person_id, relationship_type, valid_from, valid_to)
          VALUES ($1, $2, $3, 'ADMIN_EMPLOYEE', '2026-01-01', '2026-12-31')
        `, [org, adminPerson, empEnded]);
      } catch (err) {
        error4 = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_cov4;');
      expect(error4).not.toBeNull();
      expect(error4.message).toContain('must have an employee_profile covering relationship period');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Section 6 Requirement: Employee profile link guarantee (user_id IS NULL requires PENDING_INVITATION)
  it('enforces employee profile link guarantee (user_id IS NULL requires PENDING_INVITATION)', async () => {
    await client.query('BEGIN;');
    try {
      const org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Link Guarantee', 'company') RETURNING id")).rows[0].id;
      const user = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('link_test@test.com', 'Link User', 'hash') RETURNING id")).rows[0].id;

      // Valid 1: Active user with employee profile
      const personLinked = (await client.query(`
        INSERT INTO organization_people (organization_id, user_id, status)
        VALUES ($1, $2, 'ACTIVE') RETURNING id
      `, [org, user])).rows[0].id;
      await client.query(`
        INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name)
        VALUES ($1, $2, 'Linked Emp')
      `, [org, personLinked]);

      // Valid 2: Person PENDING_INVITATION without user_id with employee profile
      const personPending = (await client.query(`
        INSERT INTO organization_people (organization_id, user_id, status)
        VALUES ($1, NULL, 'PENDING_INVITATION') RETURNING id
      `, [org])).rows[0].id;
      await client.query(`
        INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name)
        VALUES ($1, $2, 'Pending Emp')
      `, [org, personPending]);

      // Invalid 1: Person ACTIVE without user_id attempting to create an employee profile
      const personActiveNoUser = (await client.query(`
        INSERT INTO organization_people (organization_id, user_id, status)
        VALUES ($1, NULL, 'ACTIVE') RETURNING id
      `, [org])).rows[0].id;

      let error1 = null;
      await client.query('SAVEPOINT sp_link1;');
      try {
        await client.query(`
          INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name)
          VALUES ($1, $2, 'Invalid Active No User Emp')
        `, [org, personActiveNoUser]);
      } catch (err) {
        error1 = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_link1;');
      expect(error1).not.toBeNull();
      expect(error1.message).toContain('Employee profile cannot be associated with a person without user_id whose status is not PENDING_INVITATION');

      // Invalid 2: Person without user_id with an employee profile changing status from PENDING_INVITATION to ACTIVE
      let error2 = null;
      await client.query('SAVEPOINT sp_link2;');
      try {
        await client.query(`
          UPDATE organization_people SET status = 'ACTIVE' WHERE id = $1
        `, [personPending]);
      } catch (err) {
        error2 = err;
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_link2;');
      expect(error2).not.toBeNull();
      expect(error2.message).toContain('Organization person without user_id having an employee profile must have status PENDING_INVITATION');
    } finally {
      await client.query('ROLLBACK;');
    }
  });

  // Section 5 Requirement: Hardened transferOwnershipTemporal with transactional rollback
  it('transferOwnershipTemporal executes atomically and rolls back on failure with zero partial changes', async () => {
    let org = null;
    try {
      org = (await client.query("INSERT INTO organizations (name, type) VALUES ('Org Transfer Rollback', 'company') RETURNING id")).rows[0].id;
      const userA = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('owner_a@test.com', 'Owner A', 'hash') RETURNING id")).rows[0].id;
      const userB = (await client.query("INSERT INTO users (email, display_name, password_hash) VALUES ('admin_b@test.com', 'Admin B', 'hash') RETURNING id")).rows[0].id;

      const personA = (await client.query("INSERT INTO organization_people (organization_id, user_id, status) VALUES ($1, $2, 'ACTIVE') RETURNING id", [org, userA])).rows[0].id;
      const personB = (await client.query("INSERT INTO organization_people (organization_id, user_id, status) VALUES ($1, $2, 'ACTIVE') RETURNING id", [org, userB])).rows[0].id;

      await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')", [org, userA]);
      await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'ADMIN')", [org, userB]);

      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'OWNER', '2026-01-01', NULL)
      `, [org, personA]);
      await client.query(`
        INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, valid_to)
        VALUES ($1, $2, 'ADMIN', '2026-01-01', NULL)
      `, [org, personB]);

      // Create a failing sql adapter that simulates failure in the last operation
      const failingAdapter = async (strings, ...values) => {
        return sqlAdapter(strings, ...values);
      };
      failingAdapter.transaction = async (queriesBuilder) => {
        await client.query('BEGIN;');
        try {
          const queries = typeof queriesBuilder === 'function' ? queriesBuilder(failingAdapter) : queriesBuilder;
          for (let i = 0; i < queries.length; i++) {
            if (i === queries.length - 1) {
              throw new Error('Simulated failure on last transaction statement');
            }
            await queries[i];
          }
          await client.query('COMMIT;');
        } catch (err) {
          await client.query('ROLLBACK;');
          throw err;
        }
      };

      // Attempt transfer using failingAdapter -> MUST FAIL and ROLLBACK
      let transferError = null;
      try {
        await transferOwnershipTemporal(failingAdapter, {
          organizationId: org,
          currentOwnerPersonId: personA,
          newOwnerPersonId: personB,
          effectiveDate: '2026-06-01',
          newPreviousOwnerRole: 'ADMIN',
        });
      } catch (err) {
        transferError = err;
      }
      expect(transferError).not.toBeNull();
      expect(transferError.message).toContain('Simulated failure on last transaction statement');

      // Verify that NO partial changes remain in database (rollback succeeded)
      const rolesA = await client.query("SELECT role, valid_to FROM person_role_periods WHERE organization_person_id = $1", [personA]);
      expect(rolesA.rows.length).toBe(1);
      expect(rolesA.rows[0].role).toBe('OWNER');
      expect(rolesA.rows[0].valid_to).toBeNull(); // Not closed!

      const rolesB = await client.query("SELECT role FROM person_role_periods WHERE organization_person_id = $1", [personB]);
      expect(rolesB.rows.length).toBe(1);
      expect(rolesB.rows[0].role).toBe('ADMIN'); // No OWNER inserted!

      const memA = await client.query("SELECT role FROM memberships WHERE user_id = $1", [userA]);
      expect(memA.rows[0].role).toBe('OWNER');

      const memB = await client.query("SELECT role FROM memberships WHERE user_id = $1", [userB]);
      expect(memB.rows[0].role).toBe('ADMIN');

      // Now run with normal sqlAdapter -> MUST SUCCEED
      const successResult = await transferOwnershipTemporal(sqlAdapter, {
        organizationId: org,
        currentOwnerPersonId: personA,
        newOwnerPersonId: personB,
        effectiveDate: '2026-06-01',
        newPreviousOwnerRole: 'ADMIN',
      });
      expect(successResult.transferred).toBe(true);

      const memAAfter = await client.query("SELECT role FROM memberships WHERE user_id = $1", [userA]);
      expect(memAAfter.rows[0].role).toBe('ADMIN');

      const memBAfter = await client.query("SELECT role FROM memberships WHERE user_id = $1", [userB]);
      expect(memBAfter.rows[0].role).toBe('OWNER');
    } finally {
      if (org) {
        await client.query('DELETE FROM organizations WHERE id = $1', [org]);
      }
    }
  });
});

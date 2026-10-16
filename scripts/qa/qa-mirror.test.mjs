import { describe, expect, it } from 'vitest';
import { QA_IDENTITY, assertQaOrganization, deterministicUuid } from './qa-lib.mjs';
import { buildMirror } from './refresh-qa-mirror.mjs';

const SRC = 'a4cf0768-f08d-49e6-bb81-0d3635d58028';
const TARGET = '3bfba3fb-1f18-4309-8ffa-c151c46e5de9';
const QA_USER = '11111111-1111-4111-8111-111111111111';

const source = {
  areas: [{ id: 'area-1', organization_id: SRC, name: 'Terminal' }],
  employees: [
    { id: 'emp-1', organization_id: SRC, name: 'Persona Real Uno', external_employee_id: '84881', user_id: 'real-user', status: 'active', area_id: 'area-1', created_at: 1 },
    { id: 'emp-2', organization_id: SRC, name: 'Persona Real Dos', external_employee_id: null, user_id: null, status: 'active', area_id: null, created_at: 2 },
  ],
  imports: [{ id: 'imp-1', organization_id: SRC, imported_by_user_id: 'real-user', file_name: 'Cuadrante Juan Pérez.xlsx', area_id: 'area-1', employee_id: 'emp-1', blocking_employee_id: null, deleted_by_user_id: null, context_fingerprint: 'abc', created_at: 1 }],
  schedules: [{ id: 'sch-1', organization_id: SRC, area_id: 'area-1', created_by_user_id: 'real-user', period_start: '2026-01-01', period_end: '2026-01-31' }],
  schedule_versions: [{ id: 'ver-1', schedule_id: 'sch-1', created_by_user_id: 'real-user', published_by_user_id: 'real-user' }],
  shift_assignments: [{ id: 'as-1', schedule_version_id: 'ver-1', employee_id: 'emp-1', import_id: 'imp-1', date: '2026-01-02' }],
  calendar_changes: [{ id: 'chg-1', date: '2026-01-01', organization_id: SRC, employee_id: 'emp-1', actor_user_id: 'real-user', approved_by_user_id: 'real-user', approval_request_id: 'x', change_request_id: 'y', original_shift_id: 'sh-1' }],
  shifts: [{ id: 'sh-1', organization_id: SRC, employee_id: 'emp-1', import_id: 'imp-1', area_id: 'area-1', schedule_version_id: 'ver-1', change_id: 'chg-1', semantic_fingerprint: 'fp', date: '2026-01-01', shift_type: 'Regular' }],
  employee_annual_targets: [{ id: 't-1', organization_id: SRC, employee_id: 'emp-1', year: 2026, minimum_annual_minutes: 1, maximum_annual_minutes: 2, created_by_user_id: 'real-user', updated_by_user_id: 'real-user' }],
  format_profiles: [],
};

describe('buildMirror', () => {
  const mirror = buildMirror(source, { targetId: TARGET, qaUserId: QA_USER });

  it('remaps every id and organization; nothing keeps a source id', () => {
    const json = JSON.stringify(mirror);
    for (const id of ['emp-1', 'imp-1', 'sch-1', 'ver-1', 'sh-1', 'chg-1', 'area-1']) expect(json).not.toContain(`"${id}"`);
    expect(mirror.shifts[0].organization_id).toBe(TARGET);
    expect(mirror.shifts[0].employee_id).toBe(mirror.employees[0].id);
    expect(mirror.shifts[0].import_id).toBe(mirror.imports[0].id);
    expect(mirror.shifts[0].change_id).toBe(mirror.calendar_changes[0].id);
    expect(mirror.calendar_change_original_shift[0].original_shift_id).toBe(mirror.shifts[0].id);
  });

  it('copies no real identity: no user links, pseudonymised people and file names', () => {
    expect(mirror.employees.every((e) => e.user_id === null)).toBe(true);
    expect(mirror.employees.map((e) => e.name)).toEqual(['Sebastián Pozo Mendoza — QA', 'Empleado QA 002']);
    expect(mirror.employees[0].external_employee_id).toBe('84881'); // business key preserved
    expect(mirror.employee_annual_targets).toHaveLength(1);
    expect(mirror.employee_annual_targets[0]).toMatchObject({ year: 2026, minimum_annual_minutes: 91740, maximum_annual_minutes: 92400, employee_id: mirror.employees[0].id });
    expect(mirror.employees[1].external_employee_id).toBeNull();
    expect(mirror.employees.every((e) => e.user_id === null)).toBe(true);
    expect(mirror.imports[0].file_name).toBe('qa-import-001.xlsx');
    expect(JSON.stringify(mirror)).not.toMatch(/real-user|Persona Real Dos|Persona Real Uno|Juan/);
    expect(mirror.imports[0].imported_by_user_id).toBe(QA_USER);
    expect(mirror.calendar_changes[0].actor_user_id).toBeNull();
    expect(mirror.calendar_changes[0].approval_request_id).toBeNull();
  });

  it('is deterministic: a second build yields identical output', () => {
    expect(buildMirror(source, { targetId: TARGET, qaUserId: QA_USER })).toEqual(mirror);
    expect(deterministicUuid(TARGET, 'x:1')).toBe(deterministicUuid(TARGET, 'x:1'));
    expect(deterministicUuid(TARGET, 'x:1')).not.toBe(deterministicUuid(SRC, 'x:1'));
  });
});

function fakeDb({ orgName, members, sourceRows = [{ id: SRC, name: 'ShiftImport' }] }) {
  return {
    async query(sql) {
      if (sql.includes('FROM organizations WHERE name = ANY')) return { rows: sourceRows };
      if (sql.includes('FROM organizations WHERE id')) return { rows: orgName ? [{ id: TARGET, name: orgName }] : [] };
      if (sql.includes('FROM memberships')) return { rows: members.map((email) => ({ email })) };
      throw new Error(`unexpected query ${sql}`);
    },
  };
}

describe('assertQaOrganization (write guard)', () => {
  const okName = 'ShiftImport — QA Mirror';
  it('accepts exactly the QA mirror with only synthetic members', async () => {
    await expect(assertQaOrganization(fakeDb({ orgName: okName, members: [QA_IDENTITY] }), TARGET)).resolves.toMatchObject({ name: okName });
  });
  it('refuses the source organization (target == source)', async () => {
    await expect(assertQaOrganization(fakeDb({ orgName: 'ShiftImport', members: [QA_IDENTITY] }), SRC)).rejects.toThrow(/source organization/);
  });
  it('refuses a wrongly named organization', async () => {
    await expect(assertQaOrganization(fakeDb({ orgName: 'Other Org', members: [QA_IDENTITY] }), TARGET)).rejects.toThrow(/not the QA mirror/);
  });
  it('refuses when a real human is a member', async () => {
    await expect(assertQaOrganization(fakeDb({ orgName: okName, members: [QA_IDENTITY, 'persona@gmail.com'] }), TARGET)).rejects.toThrow(/non-synthetic/);
  });
  it('refuses when the QA identity is not a member', async () => {
    await expect(assertQaOrganization(fakeDb({ orgName: okName, members: ['other@anclora.test'] }), TARGET)).rejects.toThrow(/not a member/);
  });
});

describe('canonical database resolution', () => {
  it('refuses a local Docker connection string unless explicitly allowed', async () => {
    const { databaseUrl } = await import('./qa-lib.mjs');
    const previous = { url: process.env.QA_DATABASE_URL, allow: process.env.QA_ALLOW_LOCAL_DOCKER };
    process.env.QA_DATABASE_URL = 'postgres://u:p@127.0.0.1:5433/anclora_shiftimport';
    delete process.env.QA_ALLOW_LOCAL_DOCKER;
    expect(() => databaseUrl()).toThrow(/local Docker/);
    process.env.QA_DATABASE_URL = 'postgres://u:p@ep-other.c-5.eu-central-1.aws.neon.tech/neondb';
    expect(() => databaseUrl()).toThrow(/not the canonical/);
    process.env.QA_DATABASE_URL = 'postgres://u:p@ep-lingering-dew-b1atfd0w-pooler.c-5.eu-central-1.aws.neon.tech/neondb';
    expect(databaseUrl()).toContain('ep-lingering-dew-b1atfd0w');
    for (const [k, v] of [['QA_DATABASE_URL', previous.url], ['QA_ALLOW_LOCAL_DOCKER', previous.allow]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
});

import { PROTECTED_SOURCE_ORG_ID, assertNotProtectedSource } from './qa-lib.mjs';
import { PILOT_TARGET_MINUTES, scopeToYear } from './refresh-qa-mirror.mjs';

describe('protected source guard', () => {
  it('aborts any write that targets the protected ShiftImport tenant', () => {
    expect(() => assertNotProtectedSource(PROTECTED_SOURCE_ORG_ID)).toThrow(/protected source/);
    expect(() => assertNotProtectedSource(PROTECTED_SOURCE_ORG_ID.toUpperCase())).toThrow(/protected source/);
    expect(() => assertNotProtectedSource(null)).toThrow();
    expect(() => assertNotProtectedSource('3bfba3fb-1f18-4309-8ffa-c151c46e5de9')).not.toThrow();
  });
});

describe('2026-only mirror', () => {
  const base = {
    imports: [
      { id: 'i25', period_year: 2025 }, { id: 'i26', period_year: 2026 }, { id: 'iold', period_year: 2025 },
    ],
    schedules: [{ id: 's25', period_start: '2025-03-01', period_end: '2025-03-31' }, { id: 's26', period_start: '2026-02-01', period_end: '2026-02-28' }],
    schedule_versions: [{ id: 'v25', schedule_id: 's25' }, { id: 'v26', schedule_id: 's26' }],
    shift_assignments: [{ id: 'a25', schedule_version_id: 'v26', date: '2025-12-31', import_id: 'i25' }, { id: 'a26', schedule_version_id: 'v26', date: '2026-02-03', import_id: 'i26' }, { id: 'ax', schedule_version_id: 'v25', date: '2025-03-05', import_id: null }],
    calendar_changes: [{ id: 'c25', date: '2025-06-01', original_shift_id: 'x25' }, { id: 'c26', date: new Date(2026, 0, 1), original_shift_id: 'x26' }],
    shifts: [
      { id: 'x25', date: new Date(2025, 11, 31), import_id: 'i25', schedule_version_id: 'v25', change_id: 'c25' },
      { id: 'x26', date: new Date(2026, 0, 1), import_id: 'i25', schedule_version_id: 'v25', change_id: 'c26' },
    ],
    employee_annual_targets: [{ id: 't25', year: 2025 }, { id: 't26', year: 2026 }],
  };
  const scoped = scopeToYear(base, 2026);

  it('drops every non-2026 operational row and treats boundary dates by calendar day', () => {
    expect(scoped.shifts.map((r) => r.id)).toEqual(['x26']);
    expect(scoped.calendar_changes.map((r) => r.id)).toEqual(['c26']);
    expect(scoped.shift_assignments.map((r) => r.id)).toEqual(['a26']);
    expect(scoped.employee_annual_targets.map((r) => r.id)).toEqual(['t26']);
    expect(scoped.schedules.map((r) => r.id)).toEqual(['s26']);
    expect(scoped.imports.map((r) => r.id)).toEqual(['i25', 'i26']); // i25 stays only because a kept shift references it
  });

  it('nulls references to excluded parents instead of leaving dangling ids', () => {
    expect(scoped.shifts[0].schedule_version_id).toBeNull();
    expect(scoped.calendar_changes[0].original_shift_id).toBe('x26');
    expect(scoped.imports.map((r) => r.id)).not.toContain('iold'); // unreferenced 2025 import is dropped
  });
});

describe('pilot annual target', () => {
  it('is 1529–1540 h (91740–92400 min), margin 11 h', () => {
    expect(PILOT_TARGET_MINUTES).toEqual({ minimum: 1529 * 60, maximum: 1540 * 60 });
    expect(PILOT_TARGET_MINUTES.maximum - PILOT_TARGET_MINUTES.minimum).toBe(11 * 60);
  });
});

describe('synthetic EMPLOYEE QA link', () => {
  const src = {
    areas: [], imports: [], schedules: [], schedule_versions: [], shift_assignments: [], calendar_changes: [], shifts: [], employee_annual_targets: [], format_profiles: [],
    employees: [
      { id: 'a', organization_id: SRC, name: 'Pilot', external_employee_id: '84881', status: 'active', created_at: 1 },
      { id: 'b', organization_id: SRC, name: 'Other', external_employee_id: '11111', status: 'active', created_at: 2 },
    ],
  };
  it('links exactly one non-pilot employee to the synthetic employee user, never the pilot', () => {
    const mirror = buildMirror(src, { targetId: TARGET, qaUserId: QA_USER, qaEmployeeUserId: 'emp-user' });
    expect(mirror.employees.filter((e) => e.user_id).map((e) => e.external_employee_id)).toEqual(['11111']);
    expect(buildMirror(src, { targetId: TARGET, qaUserId: QA_USER }).employees.every((e) => e.user_id === null)).toBe(true);
  });
});

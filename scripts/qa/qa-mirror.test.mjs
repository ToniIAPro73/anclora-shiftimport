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
  schedules: [{ id: 'sch-1', organization_id: SRC, area_id: 'area-1', created_by_user_id: 'real-user' }],
  schedule_versions: [{ id: 'ver-1', schedule_id: 'sch-1', created_by_user_id: 'real-user', published_by_user_id: 'real-user' }],
  shift_assignments: [{ id: 'as-1', schedule_version_id: 'ver-1', employee_id: 'emp-1', import_id: 'imp-1' }],
  calendar_changes: [{ id: 'chg-1', organization_id: SRC, employee_id: 'emp-1', actor_user_id: 'real-user', approved_by_user_id: 'real-user', approval_request_id: 'x', change_request_id: 'y', original_shift_id: 'sh-1' }],
  shifts: [{ id: 'sh-1', organization_id: SRC, employee_id: 'emp-1', import_id: 'imp-1', area_id: 'area-1', schedule_version_id: 'ver-1', change_id: 'chg-1', semantic_fingerprint: 'fp', date: '2026-01-01', shift_type: 'Regular' }],
  employee_annual_targets: [{ id: 't-1', organization_id: SRC, employee_id: 'emp-1', created_by_user_id: 'real-user', updated_by_user_id: 'real-user' }],
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
    expect(mirror.employees.map((e) => e.name)).toEqual(['Empleado QA 001', 'Empleado QA 002']);
    expect(mirror.employees[0].external_employee_id).toBe('QA-0001');
    expect(mirror.employees[1].external_employee_id).toBeNull();
    expect(mirror.imports[0].file_name).toBe('qa-import-001.xlsx');
    expect(JSON.stringify(mirror)).not.toMatch(/real-user|Persona Real|Juan/);
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

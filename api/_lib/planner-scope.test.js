import { describe, expect, it } from 'vitest';
import { employeeRowInScope } from './auth.js';
import { findEmployeeMatch, listEmployees } from './data.js';
import { resolveSourceIdentity } from './employee-identifiers.js';

const ORG = 'org-planner';
const E1 = { id: 'emp-1', organization_id: ORG, area_id: 'area-a', status: 'active', name: 'Empleado Uno', external_employee_id: '111', user_id: null };
const E2 = { id: 'emp-2', organization_id: ORG, area_id: 'area-a', status: 'active', name: 'Empleado Dos', external_employee_id: '222', user_id: null };
const E3 = { id: 'emp-3', organization_id: ORG, area_id: 'area-b', status: 'active', name: 'Empleado Tres', external_employee_id: '333', user_id: null };
const ALL = [E1, E2, E3];

/** Tagged-template stub: org roster, area filter, id filter, identifier mappings, canonical id and name lookups. */
function sqlStub({ mappings = {} } = {}) {
  return (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ');
    if (text.includes('FROM organizations')) return Promise.resolve([{ name: 'ShiftImport — QA Mirror' }]);
    if (text.includes('employee_source_identifiers')) {
      const id = mappings[values.at(-1)] ?? mappings[values[1]];
      return Promise.resolve(id ? ALL.filter((e) => e.id === id).map((e) => ({ ...e, employee_id: e.id })) : []);
    }
    if (text.includes('FROM operational_assignments')) return Promise.resolve([]);
    if (text.includes('external_employee_id = ?')) return Promise.resolve(ALL.filter((e) => e.external_employee_id === values.at(-1)));
    if (text.includes('lower(trim(name))')) return Promise.resolve(ALL.filter((e) => e.name.toLowerCase() === values.at(-1)));
    if (text.includes('FROM employees')) {
      const rows = ALL.filter((e) => e.organization_id === values[0]);
      if (text.includes('AND id = ?')) return Promise.resolve(rows.filter((e) => e.id === values.at(-1)));
      const areaIndex = text.includes('area_id = ?') ? values.length - 1 : -1;
      return Promise.resolve(areaIndex >= 0 ? rows.filter((e) => e.area_id === values[areaIndex]) : rows);
    }
    return Promise.resolve([]);
  };
}

const plannerEmployees = { user: { id: 'p' }, organizationId: ORG, role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: ['emp-2'], scopedAreaIds: [] };
const plannerAreas = { user: { id: 'p' }, organizationId: ORG, role: 'PLANNER', plannerScopeType: 'AREAS', scopedAreaIds: ['area-a'], scopedAreaId: 'area-a' };
const plannerOrg = { user: { id: 'p' }, organizationId: ORG, role: 'PLANNER', plannerScopeType: 'ORGANIZATION' };
const admin = { user: { id: 'a' }, organizationId: ORG, role: 'ADMIN' };
const self = { user: { id: 's' }, organizationId: ORG, role: 'EMPLOYEE', employeeId: 'emp-1' };

describe('employeeRowInScope (single definition of "inside the scope")', () => {
  it('covers every scope type', () => {
    expect(employeeRowInScope({ type: 'ORGANIZATION' }, E3)).toBe(true);
    expect(employeeRowInScope({ type: 'AREA', areaId: 'area-a' }, E3)).toBe(false);
    expect(employeeRowInScope({ type: 'AREAS', areaIds: ['area-a'] }, E1)).toBe(true);
    expect(employeeRowInScope({ type: 'EMPLOYEES', employeeIds: ['emp-2'] }, E1)).toBe(false);
    expect(employeeRowInScope({ type: 'SELF', employeeId: 'emp-1' }, E1)).toBe(true);
  });
});

describe('listEmployees is scope-complete', () => {
  it('C1: PLANNER EMPLOYEES receives only its employees', async () => {
    expect((await listEmployees(sqlStub(), plannerEmployees)).map((e) => e.id)).toEqual(['emp-2']);
  });
  it('C2: PLANNER AREAS receives only its areas', async () => {
    expect((await listEmployees(sqlStub(), plannerAreas)).map((e) => e.id)).toEqual(['emp-1', 'emp-2']);
  });
  it('C3: PLANNER AREAS asking for a foreign area fails closed', async () => {
    await expect(listEmployees(sqlStub(), plannerAreas, { areaId: 'area-b' })).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
  });
  it('C4: ORGANIZATION planner and ADMIN keep the whole roster', async () => {
    expect((await listEmployees(sqlStub(), plannerOrg)).length).toBe(3);
    expect((await listEmployees(sqlStub(), admin)).length).toBe(3);
  });
  it('C5: SELF keeps only the own employee', async () => {
    expect((await listEmployees(sqlStub(), self)).map((e) => e.id)).toEqual(['emp-1']);
  });
});

describe('findEmployeeMatch never leaves the planner scope', () => {
  it('D1: external id inside scope is recognised', async () => {
    expect(await findEmployeeMatch(sqlStub(), plannerEmployees, { externalEmployeeId: '222', name: '' })).toMatchObject({ kind: 'recognized', employees: [{ id: 'emp-2' }] });
  });
  it('D2: external id outside scope is NOT recognised', async () => {
    expect(await findEmployeeMatch(sqlStub(), plannerEmployees, { externalEmployeeId: '333', name: '' })).toEqual({ kind: 'new', employees: [] });
  });
  it('D3: a name outside scope is NOT a candidate', async () => {
    expect(await findEmployeeMatch(sqlStub(), plannerEmployees, { externalEmployeeId: '', name: 'Empleado Tres' })).toEqual({ kind: 'new', employees: [] });
    expect(await findEmployeeMatch(sqlStub(), plannerEmployees, { externalEmployeeId: '', name: 'Empleado Uno' })).toEqual({ kind: 'new', employees: [] });
  });
  it('D4: a source identifier mapped to an out-of-scope employee does not resolve', async () => {
    const sql = sqlStub({ mappings: { 6888: 'emp-3' } });
    const r = await findEmployeeMatch(sql, plannerEmployees, { externalEmployeeId: '6888', name: '', sourceSystem: 'TRYP_EMPLOYEE_CALENDAR' });
    expect(r).toEqual({ kind: 'new', employees: [] });
  });
  it('ADMIN is unchanged', async () => {
    expect(await findEmployeeMatch(sqlStub(), admin, { externalEmployeeId: '333', name: '' })).toMatchObject({ kind: 'recognized', employees: [{ id: 'emp-3' }] });
  });
});

describe('resolveSourceIdentity respects the planner scope', () => {
  const doc = (documentName, externalIdentifier) => ({ sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier, documentName });
  it('canonical id / name of an out-of-scope employee resolves to nothing and leaks no candidate', async () => {
    const byId = await resolveSourceIdentity(sqlStub(), plannerEmployees, doc('Empleado Tres', '333'));
    expect(byId).toEqual({ status: 'NONE', employee: null, candidates: [] });
  });
  it('an alias mapped to an out-of-scope employee is not usable', async () => {
    const r = await resolveSourceIdentity(sqlStub({ mappings: { 6888: 'emp-3' } }), plannerEmployees, doc('Empleado Tres', '6888'));
    expect(r).toEqual({ status: 'NONE', employee: null, candidates: [] });
  });
  it('an in-scope employee still resolves', async () => {
    const r = await resolveSourceIdentity(sqlStub(), plannerEmployees, doc('Empleado Dos', '222'));
    expect(r).toMatchObject({ status: 'CANONICAL', employee: { id: 'emp-2' } });
  });
  it('ADMIN still resolves any employee', async () => {
    const r = await resolveSourceIdentity(sqlStub(), admin, doc('Empleado Tres', '333'));
    expect(r).toMatchObject({ status: 'CANONICAL', employee: { id: 'emp-3' } });
  });
});

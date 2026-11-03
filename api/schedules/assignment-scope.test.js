import { beforeEach, describe, expect, it } from 'vitest';
import { createAssignment, createNewDraftFromVersion, deleteAssignment, updateAssignment } from '../_lib/scheduling.js';
import { getOperationalDate, shiftOperationalDate } from '../_lib/operational-date.js';

/**
 * F4-REM-01 — every write over a draft assignment respects the actor's scope OVER THE EMPLOYEE (not only the schedule's area):
 * create, modify (the current AND the new employee), delete, copy-of-version. The fake evaluates the scope predicate the statements
 * carry, so "denied" means "no row written", not just "an error was thrown".
 */
const ORG = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555';
const E_IN = '66666666-6666-4666-8666-666666666666';
const E_OUT = '77777777-7777-4777-8777-777777777777';
const E_OTHER_TENANT = '88888888-8888-4888-8888-888888888888';
const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const today = getOperationalDate();
const DATE = shiftOperationalDate(today, 3);
const PERIOD_START = shiftOperationalDate(today, 1);
const PERIOD_END = shiftOperationalDate(today, 7);

let db;
const EMPLOYEES = { [E_IN]: { id: E_IN, area_id: AREA_A, status: 'active' }, [E_OUT]: { id: E_OUT, area_id: AREA_B, status: 'active' } };
const inScope = (mode, ids, employee) => mode === 'NONE' || (mode === 'EMPLOYEES' ? ids.includes(employee.id) : ids.includes(employee.area_id));

function makeSql() {
  const text = (strings) => strings.join(' ? ').replace(/\s+/g, ' ').trim();
  const guard = (values) => {
    const mode = values.find((v) => v === 'NONE' || v === 'AREAS' || v === 'EMPLOYEES');
    return { mode, ids: values.find(Array.isArray) ?? [] };
  };
  const sql = (strings, ...values) => {
    const t = text(strings);
    if (t.startsWith('SELECT sv.id AS version_id')) {
      return Promise.resolve([{ version_id: VERSION, schedule_id: SCHEDULE, status: 'DRAFT', organization_id: ORG, area_id: null, period_start: PERIOD_START, period_end: PERIOD_END }]);
    }
    if (t.startsWith('SELECT id, area_id, status')) {
      const e = EMPLOYEES[values[0]];
      return Promise.resolve(e && !db.tenantMismatch.has(values[0]) ? [e] : []);
    }
    if (t.startsWith('SELECT sa.id')) return Promise.resolve(db.assignment ? [db.assignment] : []);
    if (t.startsWith('SELECT 1 FROM shift_assignments WHERE id')) return Promise.resolve(db.assignment ? [{ '?column?': 1 }] : []);
    if (t.startsWith('SELECT COUNT(*)::int AS active_area_count')) return Promise.resolve([{ active_area_count: 0 }]);
    if (t.startsWith('INSERT INTO shift_assignments')) {
      db.statements.push('INSERT');
      const { mode, ids } = guard(values);
      const employee = EMPLOYEES[values[7]];
      if (db.scopeChangedAfterCheck) return Promise.resolve([]);
      if (!employee || !inScope(mode, ids, employee)) return Promise.resolve([]);
      db.written.push({ op: 'insert', employee: employee.id });
      return Promise.resolve([{ id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: employee.id, date: DATE, start_time: '08:00', end_time: '16:00', location: 'Regular', shift_type: 'Regular', counts_as_work: true, created_at: 'x', updated_at: 'x' }]);
    }
    if (t.startsWith('UPDATE shift_assignments')) {
      db.statements.push('UPDATE');
      const { mode, ids } = guard(values);
      const next = values.find((v) => EMPLOYEES[v] && typeof v === 'string');
      const targets = [db.assignment.employee_id, next];
      if (db.scopeChangedAfterCheck || !targets.every((id) => inScope(mode, ids, EMPLOYEES[id]))) return Promise.resolve([]);
      db.written.push({ op: 'update', employee: next });
      return Promise.resolve([{ ...db.assignment, employee_id: next }]);
    }
    if (t.startsWith('DELETE FROM shift_assignments')) {
      db.statements.push('DELETE');
      const { mode, ids } = guard(values);
      if (db.scopeChangedAfterCheck || !inScope(mode, ids, EMPLOYEES[db.assignment.employee_id])) return Promise.resolve([]);
      db.written.push({ op: 'delete', employee: db.assignment.employee_id });
      return Promise.resolve([{ id: ASSIGNMENT }]);
    }
    return Promise.resolve([]); // overlap / rest / absence reads
  };
  return sql;
}

const base = { user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, organizationId: ORG, employeeId: null };
const actors = {
  OWNER: { ...base, role: 'OWNER' },
  ADMIN: { ...base, role: 'ADMIN' },
  'PLANNER ORGANIZATION': { ...base, role: 'PLANNER', plannerScopeType: 'ORGANIZATION' },
  'PLANNER AREAS(A)': { ...base, role: 'PLANNER', plannerScopeType: 'AREAS', scopedAreaIds: [AREA_A] },
  'PLANNER EMPLOYEES(in)': { ...base, role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [E_IN] },
};
const input = (employeeId) => ({ employeeId, date: DATE, startTime: '08:00', endTime: '16:00', location: 'Regular', shiftType: 'Regular', countsAsWork: true });
const reject = (p) => p.then(() => { throw new Error('expected a rejection'); }, (e) => e);

beforeEach(() => { db = { statements: [], written: [], tenantMismatch: new Set(), assignment: null, scopeChangedAfterCheck: false }; });
const withAssignment = (employee) => { db.assignment = { id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: employee, date: DATE, start_time: '09:00', end_time: '12:00', location: 'Regular', shift_type: 'Regular', counts_as_work: true, created_at: 'x', updated_at: 'x' }; };

describe('create: scope over the employee', () => {
  it.each(Object.entries(actors))('%s may plan an employee IN scope', async (_label, ctx) => {
    await createAssignment(makeSql(), ctx, SCHEDULE, VERSION, input(E_IN));
    expect(db.written).toEqual([{ op: 'insert', employee: E_IN }]);
  });
  it.each(['OWNER', 'ADMIN', 'PLANNER ORGANIZATION'])('%s may plan any employee of the tenant', async (label) => {
    await createAssignment(makeSql(), actors[label], SCHEDULE, VERSION, input(E_OUT));
    expect(db.written).toHaveLength(1);
  });
  it.each(['PLANNER AREAS(A)', 'PLANNER EMPLOYEES(in)'])('%s is DENIED (403 SCOPE_FORBIDDEN) for an employee OUT of scope and nothing is written', async (label) => {
    const error = await reject(createAssignment(makeSql(), actors[label], SCHEDULE, VERSION, input(E_OUT)));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(db.written).toEqual([]);
    expect(db.statements).toEqual([]); // refused BEFORE any write
    expect(error.message).not.toContain(E_OUT);
  });
  it('an employee of ANOTHER tenant is not found (no existence leak, nothing written)', async () => {
    db.tenantMismatch.add(E_IN);
    const error = await reject(createAssignment(makeSql(), actors['PLANNER ORGANIZATION'], SCHEDULE, VERSION, input(E_IN)));
    expect(error.status).toBe(404);
    expect(db.written).toEqual([]);
  });
  it('EMPLOYEE has no planning permission at all', async () => {
    const error = await reject(createAssignment(makeSql(), { ...base, role: 'EMPLOYEE', employeeId: E_IN }, SCHEDULE, VERSION, input(E_IN)));
    expect(error.status).toBe(403);
    expect(db.statements).toEqual([]);
  });
  it('the scope is enforced AGAIN by the INSERT: if it changed after the check, nothing is written (403)', async () => {
    db.scopeChangedAfterCheck = true;
    const error = await reject(createAssignment(makeSql(), actors['PLANNER AREAS(A)'], SCHEDULE, VERSION, input(E_IN)));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(db.written).toEqual([]);
  });
});

describe('update: the CURRENT and the NEW employee must both be in scope', () => {
  it('modifying an in-scope assignment works (and ORGANIZATION/ADMIN too)', async () => {
    withAssignment(E_IN);
    await updateAssignment(makeSql(), actors['PLANNER AREAS(A)'], SCHEDULE, VERSION, ASSIGNMENT, { startTime: '09:00', endTime: '13:00' });
    expect(db.written).toEqual([{ op: 'update', employee: E_IN }]);
  });
  it.each(['PLANNER AREAS(A)', 'PLANNER EMPLOYEES(in)'])('%s cannot MODIFY the assignment of an employee out of scope', async (label) => {
    withAssignment(E_OUT);
    const error = await reject(updateAssignment(makeSql(), actors[label], SCHEDULE, VERSION, ASSIGNMENT, { startTime: '09:00', endTime: '13:00' }));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(db.written).toEqual([]);
  });
  it.each(['PLANNER AREAS(A)', 'PLANNER EMPLOYEES(in)'])('%s cannot MOVE an in-scope assignment to an employee out of scope', async (label) => {
    withAssignment(E_IN);
    const error = await reject(updateAssignment(makeSql(), actors[label], SCHEDULE, VERSION, ASSIGNMENT, { employeeId: E_OUT }));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(db.written).toEqual([]);
  });
  it('the UPDATE statement enforces both employees even if the checks were bypassed by a change after them', async () => {
    withAssignment(E_IN);
    db.scopeChangedAfterCheck = true;
    const error = await reject(updateAssignment(makeSql(), actors['PLANNER EMPLOYEES(in)'], SCHEDULE, VERSION, ASSIGNMENT, { startTime: '09:00', endTime: '13:00' }));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(db.written).toEqual([]);
  });
});

describe('delete', () => {
  it('deleting an in-scope assignment works', async () => {
    withAssignment(E_IN);
    await deleteAssignment(makeSql(), actors['PLANNER AREAS(A)'], SCHEDULE, VERSION, ASSIGNMENT);
    expect(db.written).toEqual([{ op: 'delete', employee: E_IN }]);
  });
  it.each(['PLANNER AREAS(A)', 'PLANNER EMPLOYEES(in)'])('%s cannot DELETE the assignment of an employee out of scope (403, row kept)', async (label) => {
    withAssignment(E_OUT);
    const error = await reject(deleteAssignment(makeSql(), actors[label], SCHEDULE, VERSION, ASSIGNMENT));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(db.written).toEqual([]);
  });
  it('an unknown assignment is still a plain 404', async () => {
    expect((await reject(deleteAssignment(makeSql(), actors.ADMIN, SCHEDULE, VERSION, ASSIGNMENT))).status).toBe(404);
  });
});

describe('copy of a whole version (new draft): the version is refused as a unit', () => {
  const makeCopySql = (blocked) => {
    const sql = () => Promise.resolve([]);
    sql.statements = [];
    sql.transaction = async (build) => {
      const txn = (strings, ...values) => ({ text: strings.join(' ? ').replace(/\s+/g, ' '), values });
      const [stmt] = build(txn);
      sql.statements.push(stmt);
      return [[{ found: true, current_status: 'PUBLISHED', area_id: null, scope_blocked: blocked, draft_version_id: null, new_version_id: blocked ? null : 'n1', schedule_id: SCHEDULE, version_number: 2, copied_assignment_count: blocked ? 0 : 3 }]];
    };
    return sql;
  };
  it('a PLANNER whose scope does not cover EVERY employee of the version gets 403 SCOPE_FORBIDDEN (nothing copied, nothing revealed)', async () => {
    const sql = makeCopySql(true);
    const error = await reject(createNewDraftFromVersion(sql, actors['PLANNER EMPLOYEES(in)'], SCHEDULE, VERSION));
    expect(error).toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
    expect(error.message).not.toContain(E_OUT);
  });
  it('the statement itself carries the scope (employee ids) and refuses to create the version when blocked', async () => {
    const sql = makeCopySql(false);
    await createNewDraftFromVersion(sql, actors['PLANNER EMPLOYEES(in)'], SCHEDULE, VERSION);
    expect(sql.statements[0].text).toContain('scope_check');
    expect(sql.statements[0].text).toContain('AND NOT (SELECT blocked FROM scope_check)');
    expect(sql.statements[0].values).toEqual(expect.arrayContaining(['EMPLOYEES', [E_IN]]));
  });
  it('an organisation-wide actor is not restricted', async () => {
    const sql = makeCopySql(false);
    await createNewDraftFromVersion(sql, actors.ADMIN, SCHEDULE, VERSION);
    expect(sql.statements[0].values).toContain('NONE');
  });
});

import { describe, expect, it } from 'vitest';
import {
  addMember,
  bulkAddMembers,
  bulkCreateEmployees,
  createEmployee,
  createImport,
  deleteEmployee,
  deleteImport,
  deleteShiftsByIds,
  findEmployeeMatch,
  listImports,
  listMembers,
  listShifts,
  removeMember,
  resetOrganization,
  updateOrganizationName,
  updateEmployee,
  updateMemberRole,
  upsertShifts,
} from './data.js';

/**
 * Invariant tests for the multi-tenant data layer (Fase 1, PASO 12).
 * The sql executor is a fake tagged-template that records calls and serves
 * canned rows per query shape; assertions check BOTH results and the
 * scoping parameters actually sent to the database.
 */

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const EMP_A1 = 'emp-a1';
const EMP_A2 = 'emp-a2';
const USER_ADMIN = 'user-admin';
const USER_EMP = 'user-emp';

const employeeRow = (id, org, over = {}) => ({
  id,
  organization_id: org,
  external_employee_id: null,
  name: `Name ${id}`,
  user_id: null,
  status: 'active',
  ...over,
});

const shiftRow = (over = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  organization_id: ORG_A,
  employee_id: EMP_A1,
  import_id: null,
  date: '2026-09-04',
  start_time: '17:00',
  end_time: '01:00',
  location: 'Regular',
  origin: 'IMP',
  ...over,
});

function makeFakeSql({ employees = [], memberships = [], imports = [], users = [], shifts = [], areas = [], organizations = [] } = {}) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });

    // createImport area_name_snapshot lookup (values: [areaId, organizationId])
    if (text.startsWith('SELECT name FROM areas')) {
      const found = areas.find((a) => a.id === values[0] && a.organization_id === values[1]);
      return Promise.resolve(found ? [{ name: found.name }] : []);
    }
    // Area lookups (assertAreaInOrg / resolveAreaIdByName / bulk roster index)
    if (text.startsWith('SELECT id, name, code FROM areas')) {
      return Promise.resolve(areas.filter((a) => a.organization_id === values[0] && a.active !== false));
    }
    if (text.startsWith('SELECT id FROM areas') && text.includes('lower(trim(name))')) {
      const normalized = values[1];
      return Promise.resolve(areas.filter(
        (a) => a.organization_id === values[0] && a.active !== false
          && (a.name.trim().toLowerCase() === normalized
            || (a.code && a.code.trim().toLowerCase() === normalized)),
      ).map((a) => ({ id: a.id })));
    }
    if (text.startsWith('SELECT id FROM areas')) {
      return Promise.resolve(areas.filter(
        (a) => a.id === values[0] && a.organization_id === values[1] && a.active !== false,
      ).map((a) => ({ id: a.id })));
    }
    // upsertShifts area snapshot: import/employee area lookups
    if (text.startsWith('SELECT area_id FROM imports')) {
      const found = imports.find((i) => i.id === values[0] && i.organization_id === values[1]);
      return Promise.resolve(found ? [{ area_id: found.area_id ?? null }] : []);
    }
    if (text.startsWith('SELECT area_id FROM employees')) {
      const found = employees.find((e) => e.id === values[0] && e.organization_id === values[1]);
      return Promise.resolve(found ? [{ area_id: found.area_id ?? null }] : []);
    }

    // deleteEmployee history gate (values: [employeeId, organizationId])
    if (text.startsWith('SELECT count(*)::int AS n FROM shifts')) {
      return Promise.resolve([{
        n: shifts.filter((s) => s.employee_id === values[0] && s.organization_id === values[1]).length,
      }]);
    }
    // upsertShifts multi-employee plan-guard (values: [organizationId])
    if (text.startsWith('SELECT DISTINCT employee_id FROM shifts')) {
      const distinct = [...new Set(shifts.filter((s) => s.organization_id === values[0]).map((s) => s.employee_id))];
      return Promise.resolve(distinct.map((employee_id) => ({ employee_id })));
    }
    // createEmployee plan-limit check (values: [organizationId])
    if (text.startsWith('SELECT count(*) AS count FROM employees')) {
      return Promise.resolve([{
        count: String(employees.filter((e) => e.organization_id === values[0] && e.status === 'active').length),
      }]);
    }
    // 1:1 link guard (updateEmployee / addMember): any OTHER employee in the
    // org already linked to this user? values: [organizationId, userId, excludeEmployeeId]
    if (text.startsWith('SELECT id FROM employees') && text.includes('user_id')) {
      return Promise.resolve(employees.filter(
        (e) => e.organization_id === values[0] && e.user_id === values[1] && e.id !== values[2],
      ));
    }
    // assertEmployeeInOrg (values: [id, organizationId])
    if (text.startsWith('SELECT id, status FROM employees')) {
      return Promise.resolve(
        employees
          .filter((e) => e.id === values[0] && e.organization_id === values[1])
          .map((e) => ({ id: e.id, status: e.status })),
      );
    }
    // updateEmployee current-row lookup (values: [id]); deleteEmployee loads
    // org-scoped (values: [id, organizationId]).
    if (text.startsWith('SELECT * FROM employees WHERE id =')) {
      return Promise.resolve(employees.filter(
        (e) => e.id === values[0] && (values.length < 2 || e.organization_id === values[1]),
      ));
    }
    if (text.includes('FROM employees') && text.includes('external_employee_id')) {
      return Promise.resolve(employees.filter((e) => e.organization_id === values[0] && e.external_employee_id === values[1]));
    }
    if (text.includes('FROM employees') && text.includes('lower(trim(name))')) {
      return Promise.resolve(employees.filter(
        (e) => e.organization_id === values[0] && e.name.trim().toLowerCase() === values[1],
      ));
    }
    if (text.startsWith('SELECT') && text.includes('FROM employees')) {
      return Promise.resolve(employees.filter((e) => e.organization_id === values[0]));
    }
    if (text.includes('FROM users') && text.includes('lower(email)')) {
      return Promise.resolve(users.filter((u) => u.email.toLowerCase() === values[0]));
    }
    if (text.startsWith('INSERT INTO users')) {
      const row = { id: `user-new-${users.length}`, email: values[0], display_name: values[2] };
      users.push(row);
      return Promise.resolve([row]);
    }
    if (text.includes('FROM memberships') && text.includes('count(*)')) {
      return Promise.resolve([{ n: memberships.filter((m) => m.organization_id === values[0] && m.role === 'ADMIN').length }]);
    }
    if (text.startsWith('INSERT INTO memberships')) {
      memberships.push({ user_id: values[0], organization_id: values[1], role: values[2] });
      return Promise.resolve([]);
    }
    if (text.startsWith('UPDATE memberships')) {
      const target = memberships.find((m) => m.organization_id === values[1] && m.user_id === values[2]);
      if (target) {
        target.role = values[0];
      }
      return Promise.resolve([]);
    }
    if (text.startsWith('DELETE FROM memberships')) {
      const index = memberships.findIndex((m) => m.organization_id === values[0] && m.user_id === values[1]);
      if (index >= 0) {
        memberships.splice(index, 1);
      }
      return Promise.resolve([]);
    }
    if (text.startsWith('SELECT m.user_id') && text.includes('FROM memberships')) {
      return Promise.resolve(memberships.filter((m) => m.organization_id === values[0]).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        created_at: new Date(),
        email: users.find((u) => u.id === m.user_id)?.email ?? '',
        display_name: '',
      })));
    }
    if (text.includes('FROM memberships')) {
      return Promise.resolve(memberships.filter(
        (m) => m.organization_id === values[0] && m.user_id === values[1],
      ));
    }
    // bulkCreateEmployees INSERT ... ON CONFLICT ... DO NOTHING — models
    // the real unique-index behavior the generic INSERT branch below can't.
    if (text.startsWith('INSERT INTO employees') && text.includes('ON CONFLICT')) {
      const [orgId, externalId, name] = values;
      const conflict = Boolean(externalId) && employees.some(
        (e) => e.organization_id === orgId && e.external_employee_id === externalId,
      );
      if (conflict) {
        return Promise.resolve([]);
      }
      const row = employeeRow(`emp-bulk-${employees.length}`, orgId, {
        external_employee_id: externalId,
        name,
        // Area-aware INSERT carries area_id as the 4th value (status is a
        // SQL literal in the bulk path, not a parameter).
        area_id: text.includes(', area_id') ? values[3] : null,
      });
      employees.push(row);
      return Promise.resolve([row]);
    }
    if (text.startsWith('INSERT INTO employees')) {
      const row = employeeRow('emp-new', values[0], {
        external_employee_id: values[1],
        name: values[2],
        area_id: text.includes('area_id') ? values[4] : null,
      });
      employees.push(row);
      return Promise.resolve([row]);
    }
    if (text.startsWith('INSERT INTO imports')) {
      // Every inserted column is a bound parameter (including the 'completed'
      // status literal), so the parenthesized column list lines up 1:1 with
      // `values` — no positional guessing needed even as columns/branches
      // (area vs no-area) evolve.
      const columns = text.match(/INSERT INTO imports \( ([^)]+) \)/)[1].split(',').map((c) => c.trim());
      const record = {};
      columns.forEach((col, index) => { record[col] = values[index]; });
      const row = {
        id: `import-${calls.length}`,
        organization_id: record.organization_id,
        imported_by_user_id: record.imported_by_user_id,
        file_name: record.file_name,
        source_format: record.source_format,
        period_year: record.period_year,
        period_month: record.period_month,
        status: record.status ?? 'completed',
        area_id: record.area_id ?? null,
        import_mode: record.import_mode ?? 'individual',
        period_kind: record.period_kind ?? 'single',
        period_label: record.period_label ?? '',
        scope_type: record.scope_type ?? 'global',
        area_name_snapshot: record.area_name_snapshot ?? null,
        employee_count: record.employee_count ?? 0,
        shift_count: record.shift_count ?? 0,
        created_shift_count: record.created_shift_count ?? 0,
        existing_shift_count: record.existing_shift_count ?? 0,
        deleted_at: null,
        deleted_by_user_id: null,
        created_at: new Date(),
      };
      imports.push(row);
      return Promise.resolve([row]);
    }
    // deleteImport pre-check (values: [id, organizationId])
    if (text.startsWith('SELECT id, organization_id, deleted_at FROM imports')) {
      return Promise.resolve(
        imports.filter((i) => i.id === values[0] && i.organization_id === values[1])
          .map((i) => ({ id: i.id, organization_id: i.organization_id, deleted_at: i.deleted_at ?? null })),
      );
    }
    // deleteImport soft-delete (values: [deletedByUserId, id, organizationId])
    if (text.startsWith('UPDATE imports')) {
      const [deletedByUserId, id, organizationId] = values;
      const target = imports.find((i) => i.id === id && i.organization_id === organizationId && !i.deleted_at);
      if (!target) {
        return Promise.resolve([]);
      }
      target.deleted_at = new Date();
      target.deleted_by_user_id = deletedByUserId;
      return Promise.resolve([{ id: target.id }]);
    }
    // resetOrganization: org-scoped delete-all (values: [organizationId])
    if (text.startsWith('DELETE FROM imports')) {
      const removed = imports.filter((i) => i.organization_id === values[0]);
      for (const row of removed) {
        imports.splice(imports.indexOf(row), 1);
      }
      return Promise.resolve(removed.map((row) => ({ id: row.id })));
    }
    // listImports (values: [organizationId] or [organizationId, areaId]) —
    // simulates the LEFT JOIN users for imported_by_user_name.
    if (text.startsWith('SELECT i.*, u.display_name')) {
      const orgRows = imports.filter((i) => i.organization_id === values[0]);
      const scoped = text.includes('i.area_id') ? orgRows.filter((i) => i.area_id === values[1]) : orgRows;
      return Promise.resolve(scoped.map((row) => ({
        ...row,
        imported_by_user_name: users.find((u) => u.id === row.imported_by_user_id)?.display_name ?? null,
      })));
    }
    if (text.includes('FROM imports')) {
      return Promise.resolve(imports.filter((i) => i.organization_id === values[0]));
    }
    if (text.startsWith('INSERT INTO shifts')) {
      return Promise.resolve([shiftRow({
        id: values[0],
        organization_id: values[1],
        employee_id: values[2],
        import_id: values[3],
        area_id: values[4],
        date: values[5],
      })]);
    }
    if (text.startsWith('UPDATE employees')) {
      return Promise.resolve([employeeRow(values[6] ?? 'emp-a1', ORG_A, { name: values[0], area_id: values[4] })]);
    }
    if (text.startsWith('DELETE FROM employees')) {
      // resetOrganization: org-scoped delete-all (values: [organizationId])
      if (!text.includes('WHERE id')) {
        const removed = employees.filter((e) => e.organization_id === values[0]);
        for (const row of removed) {
          employees.splice(employees.indexOf(row), 1);
        }
        return Promise.resolve(removed.map((row) => ({ id: row.id })));
      }
      const hasShifts = shifts.some((s) => s.employee_id === values[0]);
      if (hasShifts) {
        return Promise.resolve([]);
      }
      const index = employees.findIndex((e) => e.id === values[0] && e.organization_id === values[1]);
      if (index >= 0) {
        employees.splice(index, 1);
        return Promise.resolve([{ id: values[0] }]);
      }
      return Promise.resolve([]);
    }
    // deleteImport: exact import_id-scoped hard delete (values: [importId, organizationId])
    if (text.startsWith('DELETE FROM shifts') && text.includes('WHERE import_id')) {
      const [importId, organizationId] = values;
      const removed = shifts.filter((s) => s.import_id === importId && s.organization_id === organizationId);
      for (const row of removed) {
        shifts.splice(shifts.indexOf(row), 1);
      }
      return Promise.resolve(removed.map((row) => ({ id: row.id })));
    }
    if (text.startsWith('DELETE FROM shifts')) {
      // resetOrganization: org-scoped delete-all (values: [organizationId])
      if (!text.includes('WHERE id')) {
        const removed = shifts.filter((s) => s.organization_id === values[0]);
        for (const row of removed) {
          shifts.splice(shifts.indexOf(row), 1);
        }
        return Promise.resolve(removed.map((row) => ({ id: row.id })));
      }
      return Promise.resolve([{ id: values[0] }]);
    }
    // updateOrganizationName (values: [name, organizationId])
    if (text.startsWith('UPDATE organizations SET name')) {
      const org = organizations.find((o) => o.id === values[1]);
      if (!org) {
        return Promise.resolve([]);
      }
      org.name = values[0];
      return Promise.resolve([{ id: org.id, name: org.name, plan: org.plan ?? null }]);
    }
    return Promise.resolve([]);
  };
  // resetOrganization runs its DELETEs through the non-interactive Neon HTTP
  // transaction; the fake only needs to flag usage and run the queries.
  const state = { transactionUsed: false };
  sql.transaction = async (fn) => {
    state.transactionUsed = true;
    return Promise.all(fn(sql));
  };
  return { sql, calls, employees, state };
}

// plan: 'team' (unlimited) by default so pre-existing tests are unaffected
// by Fase 1.2G's plan-limit enforcement; dedicated tests below override it.
const adminCtx = { user: { id: USER_ADMIN }, organizationId: ORG_A, role: 'ADMIN', employeeId: null, plan: 'team' };
const employeeCtx = { user: { id: USER_EMP }, organizationId: ORG_A, role: 'EMPLOYEE', employeeId: EMP_A1, plan: 'team' };
const orgBCtx = { user: { id: USER_ADMIN }, organizationId: ORG_B, role: 'ADMIN', employeeId: null, plan: 'team' };

const UUID = '22222222-2222-4222-8222-222222222222';
const shiftInput = (over = {}) => ({
  id: UUID,
  employeeId: EMP_A1,
  date: '2026-09-04',
  startTime: '17:00',
  endTime: '01:00',
  location: 'Regular',
  origin: 'IMP',
  ...over,
});

describe('tenant isolation', () => {
  it('rejects writes referencing an employee of another organization', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await expect(upsertShifts(sql, orgBCtx, [shiftInput()])).rejects.toMatchObject({ status: 403 });
  });

  it('deletes are always scoped to the session organization', async () => {
    const { sql, calls } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await deleteShiftsByIds(sql, adminCtx, [UUID], EMP_A1);
    const deleteCall = calls.find((call) => call.text.startsWith('DELETE FROM shifts'));
    expect(deleteCall.text).toContain('organization_id');
    expect(deleteCall.values).toContain(ORG_A);
  });
});

describe('active-employee gate on import', () => {
  it('rejects an IMP shift for a pending_access employee', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A, { status: 'pending_access' })] });
    await expect(upsertShifts(sql, adminCtx, [shiftInput({ origin: 'IMP' })]))
      .rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_NOT_ACTIVE' });
  });

  it('rejects an IMP shift for an inactive employee', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A, { status: 'inactive' })] });
    await expect(upsertShifts(sql, adminCtx, [shiftInput({ origin: 'IMP' })]))
      .rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_NOT_ACTIVE' });
  });

  it('allows a MAN (manual) shift for a pending_access employee', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A, { status: 'pending_access' })] });
    const saved = await upsertShifts(sql, adminCtx, [shiftInput({ origin: 'MAN' })]);
    expect(saved).toHaveLength(1);
  });

  it('allows an IMP shift for an active employee', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A, { status: 'active' })] });
    const saved = await upsertShifts(sql, adminCtx, [shiftInput({ origin: 'IMP' })]);
    expect(saved).toHaveLength(1);
  });
});

describe('batch atomicity (R1-M08)', () => {
  it('a bad shift anywhere in the batch writes nothing, not just the shifts before it', async () => {
    const { sql, calls } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A, { status: 'active' })] });
    const validFirst = shiftInput({ id: undefined });
    const invalidSecond = shiftInput({ id: undefined, date: '' }); // fails the date/employeeId check
    await expect(upsertShifts(sql, adminCtx, [validFirst, invalidSecond]))
      .rejects.toMatchObject({ status: 400 });
    // The first shift must never have been written on its own — validation
    // for the whole batch happens before any INSERT is issued.
    expect(calls.some((call) => call.text.startsWith('INSERT INTO shifts'))).toBe(false);
  });

  it('a fully valid batch writes every shift through sql.transaction', async () => {
    const { sql, state } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A, { status: 'active' })] });
    const saved = await upsertShifts(sql, adminCtx, [
      shiftInput({ id: undefined, date: '2026-09-04' }),
      shiftInput({ id: undefined, date: '2026-09-05' }),
    ]);
    expect(saved).toHaveLength(2);
    expect(state.transactionUsed).toBe(true);
  });
});

describe('employee isolation', () => {
  it('EMPLOYEE role reads are forced to its own employee id', async () => {
    const { sql, calls } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    // Requests another employee; the context must override it.
    await listShifts(sql, employeeCtx, EMP_A2);
    const select = calls.find((call) => call.text.includes('FROM shifts'));
    expect(select.values).toContain(EMP_A1);
    expect(select.values).not.toContain(EMP_A2);
  });

  it('EMPLOYEE role cannot write shifts for another employee', async () => {
    const { sql, calls } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await upsertShifts(sql, employeeCtx, [shiftInput({ employeeId: EMP_A2 })]);
    const insert = calls.find((call) => call.text.startsWith('INSERT INTO shifts'));
    expect(insert.values[2]).toBe(EMP_A1);
  });

  it('EMPLOYEE without linked employee record is rejected', async () => {
    const ctx = { ...employeeCtx, employeeId: null };
    const { sql } = makeFakeSql();
    await expect(listShifts(sql, ctx, '')).rejects.toMatchObject({ status: 403 });
  });
});

describe('multi-employee coexistence', () => {
  it('two employees can hold shifts on the same date', async () => {
    const { sql, calls } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A), employeeRow(EMP_A2, ORG_A)],
    });
    await upsertShifts(sql, adminCtx, [shiftInput()]);
    await upsertShifts(sql, adminCtx, [shiftInput({ id: '33333333-3333-4333-8333-333333333333', employeeId: EMP_A2, startTime: '14:00', endTime: '22:00' })]);
    const inserts = calls.filter((call) => call.text.startsWith('INSERT INTO shifts'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values[2]).toBe(EMP_A1);
    expect(inserts[1].values[2]).toBe(EMP_A2);
    expect(inserts[0].values[5]).toBe('2026-09-04');
    expect(inserts[1].values[5]).toBe('2026-09-04');
  });

  it('re-import deletes stay inside the target employee', async () => {
    const { sql, calls } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await deleteShiftsByIds(sql, adminCtx, [UUID], EMP_A1);
    const deleteCall = calls.find((call) => call.text.startsWith('DELETE FROM shifts'));
    expect(deleteCall.text).toContain('employee_id');
    expect(deleteCall.values).toEqual([UUID, ORG_A, EMP_A1]);
  });
});

describe('employee management', () => {
  it('ADMIN can create employees; EMPLOYEE cannot', async () => {
    const { sql } = makeFakeSql();
    const created = await createEmployee(sql, adminCtx, { name: 'Nueva Persona' });
    expect(created.name).toBe('Nueva Persona');
    await expect(createEmployee(sql, employeeCtx, { name: 'X' })).rejects.toMatchObject({ status: 403 });
  });

  it('an employee exists without a user account', async () => {
    const { sql } = makeFakeSql();
    const created = await createEmployee(sql, adminCtx, { name: 'Sin Cuenta' });
    expect(created.userId).toBeNull();
  });

  it('Fase 1.2G: a free-plan org can create its first employee', async () => {
    const { sql } = makeFakeSql();
    const created = await createEmployee(sql, { ...adminCtx, plan: 'free' }, { name: 'Primera Persona' });
    expect(created.name).toBe('Primera Persona');
  });

  it('Fase 1.2G: a free-plan org cannot create a second employee (structural team-guard)', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await expect(createEmployee(sql, { ...adminCtx, plan: 'free' }, { name: 'Segunda Persona' }))
      .rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT' });
  });

  it('Fase 1.2G: a personal-plan org is capped at 1 employee too', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await expect(createEmployee(sql, { ...adminCtx, plan: 'personal' }, { name: 'Segunda Persona' }))
      .rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT' });
  });

  it('Fase 1.2G: a team-plan org has no employee cap', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A), employeeRow(EMP_A2, ORG_A)] });
    const created = await createEmployee(sql, { ...adminCtx, plan: 'team' }, { name: 'Tercera Persona' });
    expect(created.name).toBe('Tercera Persona');
  });

  it('only ADMIN can edit/deactivate employees', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await expect(updateEmployee(sql, adminCtx, { id: EMP_A1, status: 'inactive' })).resolves.toBeDefined();
    await expect(updateEmployee(sql, employeeCtx, { id: EMP_A1, status: 'inactive' })).rejects.toMatchObject({ status: 403 });
  });

  it('user link requires membership in the same organization', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)], memberships: [] });
    await expect(updateEmployee(sql, adminCtx, { id: EMP_A1, userId: 'outsider' }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('employee lifecycle (deactivate/reactivate/delete)', () => {
  const lastAdminFixtures = () => ({
    employees: [employeeRow(EMP_A1, ORG_A, { user_id: USER_ADMIN })],
    memberships: [{ user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' }],
  });

  it('ADMIN deactivates: status inactive + deactivated_at stamped in one org-scoped UPDATE', async () => {
    const { sql, calls } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await updateEmployee(sql, adminCtx, { id: EMP_A1, status: 'inactive' });
    const update = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(update.text).toContain('deactivated_at');
    expect(update.values[2]).toBe('inactive');
    expect(update.values[6]).toBe(EMP_A1);
    expect(update.values[7]).toBe(ORG_A);
  });

  it('ADMIN reactivates: status active + deactivated_at reset to NULL', async () => {
    const { sql, calls } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { status: 'inactive', deactivated_at: new Date() })],
    });
    await updateEmployee(sql, adminCtx, { id: EMP_A1, status: 'active' });
    const update = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(update.values[2]).toBe('active');
    expect(update.values[5]).toBeNull();
  });

  it('editing an inactive employee without touching status preserves deactivated_at', async () => {
    const deactivatedAt = new Date('2025-03-01T00:00:00Z');
    const { sql, calls } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { status: 'inactive', deactivated_at: deactivatedAt })],
    });
    await updateEmployee(sql, adminCtx, { id: EMP_A1, name: 'Renamed' });
    const update = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(update.values[2]).toBe('inactive');
    expect(update.values[5]).toBe(deactivatedAt);
  });

  it('EMPLOYEE role cannot deactivate, reactivate or delete', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await expect(updateEmployee(sql, employeeCtx, { id: EMP_A1, status: 'inactive' }))
      .rejects.toMatchObject({ status: 403 });
    await expect(updateEmployee(sql, employeeCtx, { id: EMP_A1, status: 'active' }))
      .rejects.toMatchObject({ status: 403 });
    await expect(deleteEmployee(sql, employeeCtx, { id: EMP_A1 }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('deactivating the employee linked to the last ADMIN user is blocked (LAST_ADMIN)', async () => {
    const { sql, calls } = makeFakeSql(lastAdminFixtures());
    await expect(updateEmployee(sql, adminCtx, { id: EMP_A1, status: 'inactive' }))
      .rejects.toMatchObject({ status: 400, code: 'LAST_ADMIN' });
    expect(calls.some((call) => call.text.startsWith('UPDATE employees'))).toBe(false);
  });

  it('deactivating an ADMIN-linked employee is allowed when another ADMIN remains', async () => {
    const fixtures = lastAdminFixtures();
    fixtures.memberships.push({ user_id: 'user-admin-2', organization_id: ORG_A, role: 'ADMIN' });
    const { sql, calls } = makeFakeSql(fixtures);
    await updateEmployee(sql, adminCtx, { id: EMP_A1, status: 'inactive' });
    expect(calls.some((call) => call.text.startsWith('UPDATE employees'))).toBe(true);
  });

  it('deleting an employee with shift history is blocked (EMPLOYEE_HAS_HISTORY), nothing deleted', async () => {
    const { sql, calls, employees } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A)],
      shifts: [shiftRow()],
    });
    await expect(deleteEmployee(sql, adminCtx, { id: EMP_A1 }))
      .rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_HAS_HISTORY' });
    expect(employees.some((e) => e.id === EMP_A1)).toBe(true);
  });

  it('deleting an employee without shifts issues an org-scoped, history-guarded DELETE', async () => {
    const { sql, calls } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    const result = await deleteEmployee(sql, adminCtx, { id: EMP_A1 });
    expect(result).toEqual({ deleted: true });
    const deleteCall = calls.find((call) => call.text.startsWith('DELETE FROM employees'));
    expect(deleteCall.text).toContain('organization_id');
    expect(deleteCall.text).toContain('NOT EXISTS');
    expect(deleteCall.values[0]).toBe(EMP_A1);
    expect(deleteCall.values[1]).toBe(ORG_A);
  });

  it('deleting the employee linked to the last ADMIN user is blocked (LAST_ADMIN)', async () => {
    const { sql, calls } = makeFakeSql(lastAdminFixtures());
    await expect(deleteEmployee(sql, adminCtx, { id: EMP_A1 }))
      .rejects.toMatchObject({ status: 400, code: 'LAST_ADMIN' });
    expect(calls.some((call) => call.text.startsWith('DELETE FROM employees'))).toBe(false);
  });

  it('delete of an unknown or other-org employee is a 404', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await expect(deleteEmployee(sql, adminCtx, { id: 'emp-missing' }))
      .rejects.toMatchObject({ status: 404 });
    await expect(deleteEmployee(sql, orgBCtx, { id: EMP_A1 }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('employee matching with inactive employees', () => {
  it('single inactive match reports recognized_inactive (by name and by external id)', async () => {
    const inactive = () => makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { name: 'Ana Martinez', external_employee_id: '90001', status: 'inactive' })],
    });
    const byName = await findEmployeeMatch(inactive().sql, adminCtx, { externalEmployeeId: '', name: 'ana martinez' });
    expect(byName.kind).toBe('recognized_inactive');
    expect(byName.employees[0]).toMatchObject({ id: EMP_A1, status: 'inactive' });

    const byExternalId = await findEmployeeMatch(inactive().sql, adminCtx, { externalEmployeeId: '90001', name: '' });
    expect(byExternalId.kind).toBe('recognized_inactive');
  });

  it('single active match stays recognized; multi-match stays ambiguous regardless of status', async () => {
    const single = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { name: 'Ana Martinez', status: 'active' })],
    });
    expect((await findEmployeeMatch(single.sql, adminCtx, { externalEmployeeId: '', name: 'Ana Martinez' })).kind).toBe('recognized');

    const double = makeFakeSql({
      employees: [
        employeeRow(EMP_A1, ORG_A, { name: 'Ana Martinez', status: 'inactive' }),
        employeeRow(EMP_A2, ORG_A, { name: 'Ana Martinez', status: 'active' }),
      ],
    });
    expect((await findEmployeeMatch(double.sql, adminCtx, { externalEmployeeId: '', name: 'Ana Martinez' })).kind).toBe('ambiguous');
  });

  it('bulk create matches an inactive employee as existing_inactive and never duplicates it', async () => {
    const { sql, calls } = makeFakeSql({
      employees: [
        employeeRow(EMP_A1, ORG_A, { name: 'Inactivo', external_employee_id: 'EXT9', status: 'inactive' }),
        employeeRow(EMP_A2, ORG_A, { name: 'Activo', external_employee_id: null, status: 'active' }),
      ],
    });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Inactivo', externalEmployeeId: 'EXT9' },
      { key: 'k2', name: 'Activo', externalEmployeeId: '' },
    ]);
    expect(results.find((r) => r.key === 'k1')).toMatchObject({ status: 'existing_inactive' });
    expect(results.find((r) => r.key === 'k2')).toMatchObject({ status: 'existing' });
    expect(calls.some((c) => c.text.startsWith('INSERT INTO employees'))).toBe(false);
  });

  it('bulk create keeps plan-limit semantics on ACTIVE employees only', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { status: 'inactive' })],
    });
    // Free plan caps at 1 ACTIVE employee: an inactive row must not consume it.
    const { results } = await bulkCreateEmployees(sql, { ...adminCtx, plan: 'free' }, [
      { key: 'k1', name: 'Nueva', externalEmployeeId: 'EXT1' },
    ]);
    expect(results[0]).toMatchObject({ status: 'created' });
  });
});

describe('employee matching', () => {
  it('matches by external id first', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { external_employee_id: '90001' })],
    });
    const result = await findEmployeeMatch(sql, adminCtx, { externalEmployeeId: '90001', name: 'Otro Nombre' });
    expect(result.kind).toBe('recognized');
    expect(result.employees[0].id).toBe(EMP_A1);
  });

  it('name-only single match is recognized; multiple matches are ambiguous', async () => {
    const single = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A, { name: 'Ana Martinez' })] });
    expect((await findEmployeeMatch(single.sql, adminCtx, { externalEmployeeId: '', name: 'ana martinez' })).kind).toBe('recognized');

    const double = makeFakeSql({
      employees: [
        employeeRow(EMP_A1, ORG_A, { name: 'Ana Martinez' }),
        employeeRow(EMP_A2, ORG_A, { name: 'Ana Martinez' }),
      ],
    });
    expect((await findEmployeeMatch(double.sql, adminCtx, { externalEmployeeId: '', name: 'Ana Martinez' })).kind).toBe('ambiguous');
  });

  it('unknown identity reports new', async () => {
    const { sql } = makeFakeSql({ employees: [] });
    expect((await findEmployeeMatch(sql, adminCtx, { externalEmployeeId: '99999', name: 'Nadie' })).kind).toBe('new');
  });

  it('EMPLOYEE role can never resolve another employee by name or external id (no leak)', async () => {
    const { sql } = makeFakeSql({
      employees: [
        employeeRow(EMP_A1, ORG_A, { name: 'Toni Ballesteros' }),
        employeeRow(EMP_A2, ORG_A, { name: 'Otra Persona', external_employee_id: '90002' }),
      ],
    });
    // Querying by a real coworker's exact name/external id must never return
    // that coworker's row to an EMPLOYEE-role caller.
    const byName = await findEmployeeMatch(sql, employeeCtx, { externalEmployeeId: '', name: 'Otra Persona' });
    expect(byName.kind).toBe('new');
    expect(byName.employees).toHaveLength(0);

    const byExternalId = await findEmployeeMatch(sql, employeeCtx, { externalEmployeeId: '90002', name: '' });
    expect(byExternalId.kind).toBe('new');
    expect(byExternalId.employees).toHaveLength(0);
  });

  it('EMPLOYEE role resolves only its own linked employee', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { name: 'Toni Ballesteros' })],
    });
    const result = await findEmployeeMatch(sql, employeeCtx, { externalEmployeeId: '', name: 'Toni Ballesteros' });
    expect(result.kind).toBe('recognized');
    expect(result.employees).toEqual([expect.objectContaining({ id: EMP_A1 })]);
  });
});

describe('role vs plan separation (multi-employee import)', () => {
  it('ADMIN on a free plan cannot write shifts for a second employee once one already exists', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A), employeeRow(EMP_A2, ORG_A)],
      shifts: [{ organization_id: ORG_A, employee_id: EMP_A1 }],
    });
    await expect(upsertShifts(sql, { ...adminCtx, plan: 'free' }, [shiftInput({ employeeId: EMP_A2 })]))
      .rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT' });
  });

  it('ADMIN on a team plan can write shifts for a second employee', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A), employeeRow(EMP_A2, ORG_A)],
      shifts: [{ organization_id: ORG_A, employee_id: EMP_A1 }],
    });
    const saved = await upsertShifts(sql, { ...adminCtx, plan: 'team' }, [shiftInput({ employeeId: EMP_A2 })]);
    expect(saved).toHaveLength(1);
  });

  it('a free-plan org can still import for its single existing employee', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A)],
      shifts: [{ organization_id: ORG_A, employee_id: EMP_A1 }],
    });
    const saved = await upsertShifts(sql, { ...adminCtx, plan: 'free' }, [shiftInput({ employeeId: EMP_A1 })]);
    expect(saved).toHaveLength(1);
  });

  it('spoofed employeeId in an EMPLOYEE-role write is silently overridden, never a cross-employee write', async () => {
    const { sql, calls } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A), employeeRow(EMP_A2, ORG_A)],
      shifts: [{ organization_id: ORG_A, employee_id: EMP_A2 }],
    });
    await upsertShifts(sql, employeeCtx, [shiftInput({ employeeId: EMP_A2 })]);
    const insert = calls.find((call) => call.text.startsWith('INSERT INTO shifts'));
    expect(insert.values[2]).toBe(EMP_A1);
  });
});

describe('bulk employee creation ("Crear todos los nuevos")', () => {
  it('classifies existing (by external id, by name) vs new, creates only new', async () => {
    const { sql } = makeFakeSql({
      employees: [
        employeeRow(EMP_A1, ORG_A, { name: 'Existing By Id', external_employee_id: 'EXT1' }),
        employeeRow(EMP_A2, ORG_A, { name: 'Existing By Name', external_employee_id: null }),
      ],
    });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Existing By Id', externalEmployeeId: 'EXT1' },
      { key: 'k2', name: 'Existing By Name', externalEmployeeId: '' },
      { key: 'k3', name: 'Brand New', externalEmployeeId: 'EXT3' },
    ]);
    expect(results.find((r) => r.key === 'k1')).toMatchObject({ status: 'existing' });
    expect(results.find((r) => r.key === 'k2')).toMatchObject({ status: 'existing' });
    expect(results.find((r) => r.key === 'k3')).toMatchObject({ status: 'created' });
  });

  it('never creates a User or membership — Employee only, user_id stays NULL', async () => {
    const { sql, calls } = makeFakeSql();
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Ana', externalEmployeeId: 'EXT1' },
    ]);
    expect(results[0].employee.userId).toBeNull();
    expect(calls.some((c) => c.text.includes('INSERT INTO users') || c.text.includes('INSERT INTO memberships'))).toBe(false);
  });

  it('a row with no name fails as invalid, never reaches the DB write', async () => {
    const { sql, calls } = makeFakeSql();
    const { results } = await bulkCreateEmployees(sql, adminCtx, [{ key: 'k1', name: '', externalEmployeeId: 'EXT1' }]);
    expect(results[0]).toMatchObject({ key: 'k1', status: 'failed', reason: 'invalid' });
    expect(calls.some((c) => c.text.startsWith('INSERT INTO employees'))).toBe(false);
  });

  it('is idempotent: running the identical batch twice creates nothing the second time', async () => {
    const employeesStore = [];
    const { sql } = makeFakeSql({ employees: employeesStore });
    const items = [
      { key: 'k1', name: 'Ana', externalEmployeeId: 'EXT1' },
      { key: 'k2', name: 'Beto', externalEmployeeId: 'EXT2' },
    ];
    const first = await bulkCreateEmployees(sql, adminCtx, items);
    expect(first.results.filter((r) => r.status === 'created')).toHaveLength(2);

    const second = await bulkCreateEmployees(sql, adminCtx, items);
    expect(second.results.filter((r) => r.status === 'created')).toHaveLength(0);
    expect(second.results.filter((r) => r.status === 'existing')).toHaveLength(2);
    expect(employeesStore.filter((e) => e.organization_id === ORG_A)).toHaveLength(2);
  });

  it('plan limit produces a partial failure — earlier rows within the cap still succeed', async () => {
    const { sql } = makeFakeSql();
    const { results } = await bulkCreateEmployees(sql, { ...adminCtx, plan: 'free' }, [
      { key: 'k1', name: 'One', externalEmployeeId: 'EXT1' },
      { key: 'k2', name: 'Two', externalEmployeeId: 'EXT2' },
    ]);
    expect(results.find((r) => r.key === 'k1')).toMatchObject({ status: 'created' });
    expect(results.find((r) => r.key === 'k2')).toMatchObject({ status: 'failed', reason: 'plan_limit' });
  });

  it('a team-plan org has no cap — every row succeeds', async () => {
    const { sql } = makeFakeSql();
    const items = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, name: `Person ${i}`, externalEmployeeId: `EXT${i}` }));
    const { results } = await bulkCreateEmployees(sql, adminCtx, items);
    expect(results.every((r) => r.status === 'created')).toBe(true);
  });

  it('EMPLOYEE role is rejected', async () => {
    const { sql } = makeFakeSql();
    await expect(bulkCreateEmployees(sql, employeeCtx, [{ key: 'k1', name: 'X' }])).rejects.toMatchObject({ status: 403 });
  });

  it('never matches or leaks an employee from another organization (tenant isolation)', async () => {
    const { sql } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_B, { name: 'Someone', external_employee_id: 'EXT1' })],
    });
    const { results } = await bulkCreateEmployees(sql, adminCtx, [
      { key: 'k1', name: 'Someone', externalEmployeeId: 'EXT1' },
    ]);
    // Org A has no employee EXT1 of its own — org B's row must never match.
    expect(results[0].status).toBe('created');
  });
});

describe('import persistence', () => {
  it('multiple imports coexist inside the same organization', async () => {
    const { sql } = makeFakeSql();
    const first = await createImport(sql, adminCtx, { fileName: 'a.pdf', sourceFormat: 'pdf', periodYear: 2026, periodMonth: 8 });
    const second = await createImport(sql, adminCtx, { fileName: 'b.pdf', sourceFormat: 'pdf', periodYear: 2026, periodMonth: 9 });
    expect(first.id).not.toBe(second.id);
    const { imports: all, total } = await listImports(sql, adminCtx);
    expect(total).toBe(2);
    expect(all).toHaveLength(2);
    expect(all.every((item) => item.organizationId === ORG_A)).toBe(true);
  });

  it('import listings never leak across organizations', async () => {
    const { sql } = makeFakeSql();
    await createImport(sql, adminCtx, { fileName: 'a.pdf' });
    const { imports: leaked, total } = await listImports(sql, orgBCtx);
    expect(leaked).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('captures the full set of history fields (mode, period, scope, counts)', async () => {
    const { sql } = makeFakeSql({ areas: [{ id: 'area-1', organization_id: ORG_A, name: 'Operations', active: true }] });
    const created = await createImport(sql, adminCtx, {
      fileName: 'roster.xlsx',
      sourceFormat: 'xlsx',
      periodYear: 2026,
      periodMonth: 1,
      importMode: 'team',
      periodKind: 'multi',
      periodLabel: 'Enero–Septiembre 2026',
      areaId: 'area-1',
      employeeCount: 12,
      shiftCount: 246,
      createdShiftCount: 200,
      existingShiftCount: 46,
    });
    expect(created.importMode).toBe('team');
    expect(created.periodKind).toBe('multi');
    expect(created.periodLabel).toBe('Enero–Septiembre 2026');
    expect(created.scopeType).toBe('area');
    expect(created.areaId).toBe('area-1');
    expect(created.areaNameSnapshot).toBe('Operations');
    expect(created.employeeCount).toBe(12);
    expect(created.shiftCount).toBe(246);
    expect(created.createdShiftCount).toBe(200);
    expect(created.existingShiftCount).toBe(46);
    expect(created.status).toBe('completed');
  });

  it('defaults to individual/single/global when no area or mode is given', async () => {
    const { sql } = makeFakeSql();
    const created = await createImport(sql, adminCtx, { fileName: 'a.pdf', sourceFormat: 'pdf', periodYear: 2026, periodMonth: 8 });
    expect(created.importMode).toBe('individual');
    expect(created.periodKind).toBe('single');
    expect(created.scopeType).toBe('global');
    expect(created.areaId).toBeNull();
    expect(created.areaNameSnapshot).toBeNull();
  });

  it('rejects an area from another organization for the snapshot', async () => {
    const { sql } = makeFakeSql({ areas: [{ id: 'area-b', organization_id: ORG_B, name: 'Foreign', active: true }] });
    await expect(createImport(sql, adminCtx, { fileName: 'x', areaId: 'area-b' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('paginates and filters the history in-process after the tenant-scoped fetch', async () => {
    const { sql } = makeFakeSql();
    for (let i = 0; i < 7; i += 1) {
      await createImport(sql, adminCtx, {
        fileName: `f${i}.csv`,
        sourceFormat: i % 2 === 0 ? 'csv' : 'xlsx',
        importMode: i < 3 ? 'team' : 'individual',
      });
    }
    const page1 = await listImports(sql, adminCtx, { page: 1, pageSize: 5 });
    expect(page1.imports).toHaveLength(5);
    expect(page1.total).toBe(7);
    const page2 = await listImports(sql, adminCtx, { page: 2, pageSize: 5 });
    expect(page2.imports).toHaveLength(2);

    const teamOnly = await listImports(sql, adminCtx, { importMode: 'team' });
    expect(teamOnly.total).toBe(3);
    expect(teamOnly.imports.every((row) => row.importMode === 'team')).toBe(true);

    const csvOnly = await listImports(sql, adminCtx, { sourceFormat: 'csv' });
    expect(csvOnly.total).toBe(4);
  });
});

describe('import deletion (exact, import_id-scoped)', () => {
  const IMPORT_1 = '33333333-3333-4333-8333-333333333333';
  const IMPORT_2 = '44444444-4444-4444-8444-444444444444';
  const IMPORT_MISSING = '55555555-5555-4555-8555-555555555555';

  it('deletes only the shifts created by the targeted import; manual and other-import shifts survive', async () => {
    const { sql, calls } = makeFakeSql({
      imports: [{ id: IMPORT_1, organization_id: ORG_A, deleted_at: null }],
      shifts: [
        shiftRow({ id: 'shift-imported', import_id: IMPORT_1, origin: 'IMP' }),
        shiftRow({ id: 'shift-other-import', import_id: IMPORT_2, origin: 'IMP' }),
        shiftRow({ id: 'shift-manual', import_id: null, origin: 'MAN' }),
        shiftRow({ id: 'shift-untraceable', import_id: null, origin: 'IMP' }),
      ],
    });
    const result = await deleteImport(sql, adminCtx, IMPORT_1);
    expect(result).toMatchObject({ deleted: true, deletedShiftCount: 1 });

    const deleteCall = calls.find((c) => c.text.startsWith('DELETE FROM shifts') && c.text.includes('import_id'));
    expect(deleteCall.values).toEqual([IMPORT_1, ORG_A]);
  });

  it('marks the import row as deleted (soft delete) rather than removing it', async () => {
    const { sql } = makeFakeSql({
      imports: [{ id: IMPORT_1, organization_id: ORG_A, deleted_at: null }],
      shifts: [shiftRow({ id: 's1', import_id: IMPORT_1 })],
    });
    await deleteImport(sql, adminCtx, IMPORT_1);
    const { imports: after } = await listImports(sql, adminCtx);
    const row = after.find((i) => i.id === IMPORT_1);
    expect(row.status).toBe('deleted');
    expect(row.deletedAt).not.toBeNull();
  });

  it('rejects deleting an import belonging to another organization (404, no leak)', async () => {
    const { sql } = makeFakeSql({
      imports: [{ id: IMPORT_1, organization_id: ORG_B, deleted_at: null }],
      shifts: [shiftRow({ id: 's1', import_id: IMPORT_1, organization_id: ORG_B })],
    });
    await expect(deleteImport(sql, adminCtx, IMPORT_1)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a non-ADMIN caller', async () => {
    const { sql } = makeFakeSql({
      imports: [{ id: IMPORT_1, organization_id: ORG_A, deleted_at: null }],
    });
    await expect(deleteImport(sql, employeeCtx, IMPORT_1)).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a malformed import id', async () => {
    const { sql } = makeFakeSql();
    await expect(deleteImport(sql, adminCtx, 'not-a-uuid')).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a well-formed but unknown import id', async () => {
    const { sql } = makeFakeSql();
    await expect(deleteImport(sql, adminCtx, IMPORT_MISSING)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects deleting an already-deleted import (no double delete)', async () => {
    const { sql } = makeFakeSql({
      imports: [{ id: IMPORT_1, organization_id: ORG_A, deleted_at: new Date('2026-01-01') }],
    });
    await expect(deleteImport(sql, adminCtx, IMPORT_1)).rejects.toMatchObject({ status: 409 });
  });

  it('runs the deletion inside a transaction', async () => {
    const { sql, state } = makeFakeSql({
      imports: [{ id: IMPORT_1, organization_id: ORG_A, deleted_at: null }],
      shifts: [shiftRow({ id: 's1', import_id: IMPORT_1 })],
    });
    await deleteImport(sql, adminCtx, IMPORT_1);
    expect(state.transactionUsed).toBe(true);
  });

  it('reports zero deleted shifts for an import that created none (still marks it deleted)', async () => {
    const { sql } = makeFakeSql({
      imports: [{ id: IMPORT_1, organization_id: ORG_A, deleted_at: null }],
      shifts: [],
    });
    const result = await deleteImport(sql, adminCtx, IMPORT_1);
    expect(result.deletedShiftCount).toBe(0);
    expect(result.deleted).toBe(true);
  });
});

describe('membership management (B2B minimal)', () => {
  const membershipsFixture = () => [
    { user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' },
    { user_id: 'user-emp', organization_id: ORG_A, role: 'EMPLOYEE' },
  ];
  const usersFixture = () => [
    { id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' },
    { id: 'user-emp', email: 'emp@example.com', display_name: 'Emp' },
  ];
  const fakeHash = (password) => `hashed:${password}`;

  it('only ADMIN lists members (EMPLOYEE cannot)', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const members = await listMembers(sql, adminCtx);
    expect(members).toHaveLength(2);
    await expect(listMembers(sql, employeeCtx))
      .rejects.toMatchObject({ status: 403 });
  });

  it('adds an existing user without password; rejects duplicates', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const added = await addMember(sql, adminCtx, { email: 'emp@example.com', role: 'EMPLOYEE' }, fakeHash)
      .catch((error) => error);
    // emp is already a member → 409
    expect(added).toMatchObject({ status: 409 });

    const fresh = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const result = await addMember(fresh.sql, adminCtx, { email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'temporal-123' }, fakeHash);
    expect(result.role).toBe('EMPLOYEE');
  });

  it('Fase 1.2G: free/personal plans cannot invite members (team management is Team-only)', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    await expect(
      addMember(sql, { ...adminCtx, plan: 'free' }, { email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'temporal-123' }, fakeHash),
    ).rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT' });
    await expect(
      addMember(sql, { ...adminCtx, plan: 'personal' }, { email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'temporal-123' }, fakeHash),
    ).rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT' });
  });

  it('a supplied initial password must be at least 8 characters', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    await expect(addMember(sql, adminCtx, { email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'short' }, fakeHash))
      .rejects.toMatchObject({ status: 400 });
  });

  it('an omitted password (bulk-import path) generates one server-side and returns it once', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const created = await addMember(sql, adminCtx, { email: 'nuevo@example.com', role: 'EMPLOYEE' }, fakeHash);
    expect(created.temporaryPassword).toBeTruthy();
    expect(created.temporaryPassword.length).toBeGreaterThanOrEqual(8);
  });

  it('a member created with an explicit password never returns a temporaryPassword', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const created = await addMember(sql, adminCtx, { email: 'otro@example.com', role: 'EMPLOYEE', password: 'temporal-123' }, fakeHash);
    expect(created.temporaryPassword).toBeUndefined();
  });

  it('rejects invalid roles and non-ADMIN callers (no privilege escalation)', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    await expect(addMember(sql, adminCtx, { email: 'x@example.com', role: 'SUPERADMIN', password: 'temporal-123' }, fakeHash))
      .rejects.toMatchObject({ status: 400 });
    await expect(addMember(sql, employeeCtx, { email: 'x@example.com', role: 'ADMIN', password: 'temporal-123' }, fakeHash))
      .rejects.toMatchObject({ status: 403 });
    await expect(updateMemberRole(sql, employeeCtx, { userId: 'user-emp', role: 'ADMIN' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('the last ADMIN cannot be demoted or removed; self-removal blocked', async () => {
    const single = makeFakeSql({
      memberships: [{ user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' }],
      users: usersFixture(),
    });
    await expect(updateMemberRole(single.sql, adminCtx, { userId: USER_ADMIN, role: 'EMPLOYEE' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(removeMember(single.sql, adminCtx, { userId: USER_ADMIN }))
      .rejects.toMatchObject({ status: 400 }); // self-removal

    const two = makeFakeSql({
      memberships: membershipsFixture(),
      users: usersFixture(),
    });
    await expect(removeMember(two.sql, adminCtx, { userId: USER_ADMIN }))
      .rejects.toMatchObject({ status: 400 }); // last ADMIN
    const removed = await removeMember(two.sql, adminCtx, { userId: 'user-emp' });
    expect(removed.userId).toBe('user-emp');
  });
});

describe('1:1 user ↔ employee link guards (updateEmployee)', () => {
  const memberFixtures = () => ({
    employees: [employeeRow(EMP_A1, ORG_A)],
    memberships: [
      { user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' },
      { user_id: USER_EMP, organization_id: ORG_A, role: 'EMPLOYEE' },
    ],
  });

  it('links a free employee to a free member user', async () => {
    const { sql, calls } = makeFakeSql(memberFixtures());
    await updateEmployee(sql, adminCtx, { id: EMP_A1, userId: USER_EMP });
    const update = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(update.values[3]).toBe(USER_EMP);
  });

  // R2-M02: the individual link path has the same pending_access -> active
  // auto-transition as the bulk path (case A2 below) — this was the exact
  // gap commit 3d866e0 closed for bulk-link; this test closes the matching
  // coverage gap for the individual path (its fixtures elsewhere always
  // start 'active', so the transition itself was never actually exercised).
  it('linking a pending_access employee auto-transitions it to active (individual path, parity with bulk case A2)', async () => {
    const { sql, calls } = makeFakeSql({
      ...memberFixtures(),
      employees: [employeeRow(EMP_A1, ORG_A, { status: 'pending_access' })],
    });
    await updateEmployee(sql, adminCtx, { id: EMP_A1, userId: USER_EMP });
    const update = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(update.values[2]).toBe('active');
  });

  it('relinking an already-linked employee to a different user → 409 EMPLOYEE_ALREADY_LINKED', async () => {
    const { sql, calls } = makeFakeSql({
      ...memberFixtures(),
      employees: [employeeRow(EMP_A1, ORG_A, { user_id: 'user-old' })],
    });
    await expect(updateEmployee(sql, adminCtx, { id: EMP_A1, userId: USER_EMP }))
      .rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_ALREADY_LINKED' });
    expect(calls.some((call) => call.text.startsWith('UPDATE employees'))).toBe(false);
  });

  it('linking a user already linked to another employee → 409 USER_ALREADY_LINKED', async () => {
    const { sql, calls } = makeFakeSql({
      ...memberFixtures(),
      employees: [employeeRow(EMP_A1, ORG_A), employeeRow(EMP_A2, ORG_A, { user_id: USER_EMP })],
    });
    await expect(updateEmployee(sql, adminCtx, { id: EMP_A1, userId: USER_EMP }))
      .rejects.toMatchObject({ status: 409, code: 'USER_ALREADY_LINKED' });
    expect(calls.some((call) => call.text.startsWith('UPDATE employees'))).toBe(false);
  });

  it('relinking to the SAME user is idempotent, not a conflict', async () => {
    const { sql, calls } = makeFakeSql({
      ...memberFixtures(),
      employees: [employeeRow(EMP_A1, ORG_A, { user_id: USER_EMP })],
    });
    await updateEmployee(sql, adminCtx, { id: EMP_A1, userId: USER_EMP });
    expect(calls.some((call) => call.text.startsWith('UPDATE employees'))).toBe(true);
  });

  it('unlink (userId null) stays allowed with no link guards', async () => {
    const { sql, calls } = makeFakeSql({
      employees: [employeeRow(EMP_A1, ORG_A, { user_id: USER_EMP })],
      memberships: [],
    });
    await updateEmployee(sql, adminCtx, { id: EMP_A1, userId: null });
    const update = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(update.values[3]).toBeNull();
  });
});

describe('1:1 link guards (addMember employeeId)', () => {
  const fixtures = (employees) => ({
    employees,
    memberships: [{ user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' }],
    users: [{ id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' }],
  });
  const fakeHash = (password) => `hashed:${password}`;

  it('links a free employee to the newly added member user', async () => {
    const { sql, calls } = makeFakeSql(fixtures([employeeRow(EMP_A1, ORG_A)]));
    const added = await addMember(sql, adminCtx, {
      email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'temporal-123', employeeId: EMP_A1,
    }, fakeHash);
    const link = calls.find((call) => call.text.startsWith('UPDATE employees'));
    expect(link.values).toEqual([added.userId, EMP_A1, ORG_A]);
  });

  it('linking to an occupied employee → 409 EMPLOYEE_ALREADY_LINKED, no UPDATE', async () => {
    const { sql, calls } = makeFakeSql(fixtures([employeeRow(EMP_A1, ORG_A, { user_id: 'user-old' })]));
    await expect(addMember(sql, adminCtx, {
      email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'temporal-123', employeeId: EMP_A1,
    }, fakeHash)).rejects.toMatchObject({ status: 409, code: 'EMPLOYEE_ALREADY_LINKED' });
    expect(calls.some((call) => call.text.startsWith('UPDATE employees'))).toBe(false);
  });

  it('linking when the new user is already linked to another employee → 409 USER_ALREADY_LINKED', async () => {
    const users = [{ id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' }];
    // The fake's INSERT INTO users assigns id `user-new-${users.length}`.
    const newUserId = `user-new-${users.length}`;
    const { sql, calls } = makeFakeSql(fixtures([
      employeeRow(EMP_A1, ORG_A),
      employeeRow(EMP_A2, ORG_A, { user_id: newUserId }),
    ]));
    await expect(addMember(sql, adminCtx, {
      email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'temporal-123', employeeId: EMP_A1,
    }, fakeHash)).rejects.toMatchObject({ status: 409, code: 'USER_ALREADY_LINKED' });
    expect(calls.some((call) => call.text.startsWith('UPDATE employees'))).toBe(false);
  });
});

describe('bulk user provisioning + automatic linking (bulkAddMembers)', () => {
  const fakeHash = (password) => `hashed:${password}`;
  const adminOnly = () => ({
    memberships: [{ user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' }],
    users: [{ id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' }],
  });

  it('case A: new email + valid free external id -> creates user, membership and link', async () => {
    const { sql, calls } = makeFakeSql({ ...adminOnly(), employees: [employeeRow(EMP_A1, ORG_A, { external_employee_id: 'X1' })] });
    const { results, summary } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'nueva@example.com', name: 'Nueva', role: 'EMPLOYEE', externalEmployeeId: 'X1' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'created_and_linked', employeeId: EMP_A1 });
    expect(results[0].temporaryPassword).toBeTruthy();
    expect(summary).toEqual({ created: 1, linked: 1, existing: 0, failed: 0 });
    expect(calls.some((c) => c.text.startsWith('INSERT INTO memberships'))).toBe(true);
    const link = calls.find((c) => c.text.startsWith('UPDATE employees'));
    expect(link.values).toEqual([results[0].userId, 'active', null, EMP_A1, ORG_A]);
  });

  it('case A2: linking a pending_access employee auto-transitions it to active', async () => {
    const { sql, calls } = makeFakeSql({
      ...adminOnly(),
      employees: [employeeRow(EMP_A1, ORG_A, { external_employee_id: 'X1', status: 'pending_access' })],
    });
    await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'nueva@example.com', name: 'Nueva', role: 'EMPLOYEE', externalEmployeeId: 'X1' },
    ], fakeHash);
    const link = calls.find((c) => c.text.startsWith('UPDATE employees'));
    expect(link.values[1]).toBe('active');
  });

  it('case B: new email + empty external id -> creates user and membership, no link', async () => {
    const { sql } = makeFakeSql(adminOnly());
    const { results, summary } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'sinempleado@example.com', role: 'EMPLOYEE', externalEmployeeId: '' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'created', employeeId: null });
    expect(summary).toEqual({ created: 1, linked: 0, existing: 0, failed: 0 });
  });

  it('case C: existing member email + free employee -> reuses user/membership, links employee', async () => {
    const { sql, calls } = makeFakeSql({
      memberships: [
        { user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' },
        { user_id: USER_EMP, organization_id: ORG_A, role: 'EMPLOYEE' },
      ],
      users: [
        { id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' },
        { id: USER_EMP, email: 'emp@example.com', display_name: 'Emp' },
      ],
      employees: [employeeRow(EMP_A1, ORG_A, { external_employee_id: 'X1' })],
    });
    const { results, summary } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'emp@example.com', role: 'EMPLOYEE', externalEmployeeId: 'X1' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'linked', userId: USER_EMP, employeeId: EMP_A1 });
    expect(summary).toEqual({ created: 0, linked: 1, existing: 1, failed: 0 });
    expect(calls.some((c) => c.text.startsWith('INSERT INTO users'))).toBe(false);
    expect(calls.some((c) => c.text.startsWith('INSERT INTO memberships'))).toBe(false);
  });

  it('case D: unknown external id -> row fails EMPLOYEE_NOT_FOUND, never creates an employee', async () => {
    const { sql, calls } = makeFakeSql(adminOnly());
    const { results, summary } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'x@example.com', role: 'EMPLOYEE', externalEmployeeId: 'GHOST' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'error', code: 'EMPLOYEE_NOT_FOUND' });
    expect(summary.failed).toBe(1);
    expect(calls.some((c) => c.text.startsWith('INSERT INTO employees'))).toBe(false);
    expect(calls.some((c) => c.text.startsWith('INSERT INTO users'))).toBe(false);
  });

  it('case E: employee already linked to another user -> row fails EMPLOYEE_ALREADY_LINKED', async () => {
    const { sql } = makeFakeSql({
      ...adminOnly(),
      employees: [employeeRow(EMP_A1, ORG_A, { external_employee_id: 'X1', user_id: 'user-old' })],
    });
    const { results } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'x@example.com', role: 'EMPLOYEE', externalEmployeeId: 'X1' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'error', code: 'EMPLOYEE_ALREADY_LINKED' });
  });

  it('case F: user already linked to a different employee -> row fails USER_ALREADY_LINKED', async () => {
    const { sql } = makeFakeSql({
      memberships: [
        { user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' },
        { user_id: USER_EMP, organization_id: ORG_A, role: 'EMPLOYEE' },
      ],
      users: [
        { id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' },
        { id: USER_EMP, email: 'emp@example.com', display_name: 'Emp' },
      ],
      employees: [
        employeeRow(EMP_A1, ORG_A, { external_employee_id: 'X1' }),
        employeeRow(EMP_A2, ORG_A, { external_employee_id: 'X2', user_id: USER_EMP }),
      ],
    });
    const { results } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'emp@example.com', role: 'EMPLOYEE', externalEmployeeId: 'X1' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'error', code: 'USER_ALREADY_LINKED' });
  });

  it('case G: invalid role -> row fails INVALID_ROLE', async () => {
    const { sql } = makeFakeSql(adminOnly());
    const { results } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'x@example.com', role: 'SUPERADMIN' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'error', code: 'INVALID_ROLE' });
  });

  it('case H: invalid email -> row fails INVALID_EMAIL', async () => {
    const { sql } = makeFakeSql(adminOnly());
    const { results } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'not-an-email', role: 'EMPLOYEE' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'error', code: 'INVALID_EMAIL' });
  });

  it('case I: duplicate email within the same file -> second row fails DUPLICATE_IN_FILE, first still processed', async () => {
    const { sql } = makeFakeSql(adminOnly());
    const { results, summary } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'dup@example.com', role: 'EMPLOYEE' },
      { key: '2', email: 'dup@example.com', role: 'EMPLOYEE' },
    ], fakeHash);
    expect(results[0].status).toBe('created');
    expect(results[1]).toMatchObject({ status: 'error', code: 'DUPLICATE_IN_FILE' });
    expect(summary).toEqual({ created: 1, linked: 0, existing: 0, failed: 1 });
  });

  it('one bad row never aborts the rest (partial success)', async () => {
    const { sql } = makeFakeSql(adminOnly());
    const { results } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'bad-email', role: 'EMPLOYEE' },
      { key: '2', email: 'good@example.com', role: 'EMPLOYEE' },
    ], fakeHash);
    expect(results[0].status).toBe('error');
    expect(results[1].status).toBe('created');
  });

  it('rerun of the same row is idempotent: reuses user/membership/link, never duplicates', async () => {
    const base = {
      memberships: [
        { user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' },
        { user_id: USER_EMP, organization_id: ORG_A, role: 'EMPLOYEE' },
      ],
      users: [
        { id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' },
        { id: USER_EMP, email: 'emp@example.com', display_name: 'Emp' },
      ],
      employees: [employeeRow(EMP_A1, ORG_A, { external_employee_id: 'X1', user_id: USER_EMP })],
    };
    const { sql, calls } = makeFakeSql(base);
    const { results, summary } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'emp@example.com', role: 'EMPLOYEE', externalEmployeeId: 'X1' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'already_linked', userId: USER_EMP, employeeId: EMP_A1 });
    expect(summary).toEqual({ created: 0, linked: 0, existing: 1, failed: 0 });
    expect(calls.some((c) => c.text.startsWith('INSERT INTO users'))).toBe(false);
    expect(calls.some((c) => c.text.startsWith('INSERT INTO memberships'))).toBe(false);
    expect(calls.some((c) => c.text.startsWith('UPDATE employees'))).toBe(false);
  });

  it('free/personal plans cannot bulk-provision (Team-only, same gate as addMember)', async () => {
    const { sql } = makeFakeSql(adminOnly());
    await expect(bulkAddMembers(sql, { ...adminCtx, plan: 'free' }, [
      { key: '1', email: 'x@example.com', role: 'EMPLOYEE' },
    ], fakeHash)).rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT' });
  });

  it('non-ADMIN cannot bulk-provision', async () => {
    const { sql } = makeFakeSql(adminOnly());
    await expect(bulkAddMembers(sql, employeeCtx, [
      { key: '1', email: 'x@example.com', role: 'EMPLOYEE' },
    ], fakeHash)).rejects.toMatchObject({ status: 403 });
  });

  it('tenant isolation: an external id belonging to another organization is never resolved', async () => {
    const { sql } = makeFakeSql({
      ...adminOnly(),
      employees: [employeeRow('emp-b1', ORG_B, { external_employee_id: 'X1' })],
    });
    const { results } = await bulkAddMembers(sql, adminCtx, [
      { key: '1', email: 'x@example.com', role: 'EMPLOYEE', externalEmployeeId: 'X1' },
    ], fakeHash);
    expect(results[0]).toMatchObject({ status: 'error', code: 'EMPLOYEE_NOT_FOUND' });
  });
});

describe('organization reset', () => {
  const resetFixtures = () => ({
    employees: [
      employeeRow(EMP_A1, ORG_A),
      employeeRow(EMP_A2, ORG_A),
      employeeRow('emp-b1', ORG_B),
    ],
    imports: [
      { id: 'imp-a1', organization_id: ORG_A },
      { id: 'imp-b1', organization_id: ORG_B },
    ],
    shifts: [
      { id: 's1', organization_id: ORG_A, employee_id: EMP_A1 },
      { id: 's2', organization_id: ORG_A, employee_id: EMP_A2 },
      { id: 's3', organization_id: ORG_B, employee_id: 'emp-b1' },
    ],
  });

  it('deletes shifts/imports/employees of ctx.organizationId only, in FK-safe order, inside a transaction', async () => {
    const fixtures = resetFixtures();
    const { sql, calls, state } = makeFakeSql(fixtures);
    const result = await resetOrganization(sql, adminCtx);

    expect(result).toEqual({ reset: true, deleted: { shifts: 2, imports: 1, employees: 2 } });
    expect(state.transactionUsed).toBe(true);

    const deletes = calls.filter((call) => call.text.startsWith('DELETE FROM'));
    expect(deletes.map((call) => call.text.split(' ')[2])).toEqual(['shifts', 'imports', 'employees']);
    for (const call of deletes) {
      expect(call.text).toContain('organization_id');
      expect(call.values).toEqual([ORG_A]);
    }

    // Tenant isolation: org B's rows survive untouched.
    expect(fixtures.employees.map((e) => e.organization_id)).toEqual([ORG_B]);
    expect(fixtures.imports.map((i) => i.organization_id)).toEqual([ORG_B]);
    expect(fixtures.shifts.map((s) => s.organization_id)).toEqual([ORG_B]);
  });

  it('EMPLOYEE cannot reset (403) and nothing is deleted', async () => {
    const fixtures = resetFixtures();
    const { sql, state } = makeFakeSql(fixtures);
    await expect(resetOrganization(sql, employeeCtx))
      .rejects.toMatchObject({ status: 403 });
    expect(state.transactionUsed).toBe(false);
    expect(fixtures.employees).toHaveLength(3);
    expect(fixtures.imports).toHaveLength(2);
    expect(fixtures.shifts).toHaveLength(3);
  });
});

describe('organization settings (R2-M01)', () => {
  it('ADMIN can rename the active organization', async () => {
    const { sql } = makeFakeSql({ organizations: [{ id: ORG_A, name: 'Old Name', plan: 'team' }] });
    const result = await updateOrganizationName(sql, adminCtx, '  New Name  ');
    expect(result).toEqual({ id: ORG_A, name: 'New Name', plan: 'team' });
  });

  it('EMPLOYEE cannot rename the organization', async () => {
    const { sql } = makeFakeSql({ organizations: [{ id: ORG_A, name: 'Old Name', plan: 'team' }] });
    await expect(updateOrganizationName(sql, employeeCtx, 'New Name'))
      .rejects.toMatchObject({ status: 403 });
  });

  it('rejects an empty name', async () => {
    const { sql } = makeFakeSql({ organizations: [{ id: ORG_A, name: 'Old Name', plan: 'team' }] });
    await expect(updateOrganizationName(sql, adminCtx, '   '))
      .rejects.toMatchObject({ status: 400 });
  });

  it('cannot rename another organization (404, no leak)', async () => {
    const { sql } = makeFakeSql({ organizations: [{ id: ORG_B, name: 'Other Org', plan: 'team' }] });
    await expect(updateOrganizationName(sql, adminCtx, 'New Name'))
      .rejects.toMatchObject({ status: 404 });
  });
});

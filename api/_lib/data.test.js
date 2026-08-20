import { describe, expect, it } from 'vitest';
import {
  addMember,
  createEmployee,
  createImport,
  deleteShiftsByIds,
  findEmployeeMatch,
  listImports,
  listMembers,
  listShifts,
  removeMember,
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

function makeFakeSql({ employees = [], memberships = [], imports = [], users = [] } = {}) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });

    // assertEmployeeInOrg (values: [id, organizationId])
    if (text.startsWith('SELECT id FROM employees')) {
      return Promise.resolve(employees.filter((e) => e.id === values[0] && e.organization_id === values[1]));
    }
    // updateEmployee current-row lookup (values: [id])
    if (text.startsWith('SELECT * FROM employees WHERE id =')) {
      return Promise.resolve(employees.filter((e) => e.id === values[0]));
    }
    if (text.includes('FROM employees') && text.includes('external_employee_id')) {
      return Promise.resolve(employees.filter((e) => e.organization_id === values[0] && e.external_employee_id === values[1]));
    }
    if (text.includes('FROM employees') && text.includes('lower(trim(name))')) {
      return Promise.resolve(employees.filter(
        (e) => e.organization_id === values[0] && e.name.trim().toLowerCase() === values[1],
      ));
    }
    if (text.includes('FROM employees')) {
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
    if (text.startsWith('INSERT INTO employees')) {
      const row = employeeRow('emp-new', values[0], { external_employee_id: values[1], name: values[2] });
      employees.push(row);
      return Promise.resolve([row]);
    }
    if (text.startsWith('INSERT INTO imports')) {
      const row = {
        id: `import-${calls.length}`,
        organization_id: values[0],
        imported_by_user_id: values[1],
        file_name: values[2],
        source_format: values[3],
        period_year: values[4],
        period_month: values[5],
        status: 'completed',
        created_at: new Date(),
      };
      imports.push(row);
      return Promise.resolve([row]);
    }
    if (text.includes('FROM imports')) {
      return Promise.resolve(imports.filter((i) => i.organization_id === values[0]));
    }
    if (text.startsWith('INSERT INTO shifts')) {
      return Promise.resolve([shiftRow({ id: values[0], organization_id: values[1], employee_id: values[2], date: values[4] })]);
    }
    if (text.startsWith('UPDATE employees')) {
      return Promise.resolve([employeeRow(values[5] ?? 'emp-a1', ORG_A, { name: values[0] })]);
    }
    if (text.startsWith('DELETE FROM shifts')) {
      return Promise.resolve([{ id: values[0] }]);
    }
    return Promise.resolve([]);
  };
  return { sql, calls };
}

const adminCtx = { user: { id: USER_ADMIN }, organizationId: ORG_A, role: 'ADMIN', employeeId: null };
const employeeCtx = { user: { id: USER_EMP }, organizationId: ORG_A, role: 'EMPLOYEE', employeeId: EMP_A1 };
const orgBCtx = { user: { id: USER_ADMIN }, organizationId: ORG_B, role: 'ADMIN', employeeId: null };

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
    expect(inserts[0].values[4]).toBe('2026-09-04');
    expect(inserts[1].values[4]).toBe('2026-09-04');
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
  it('ADMIN/MANAGER can create employees; EMPLOYEE cannot', async () => {
    const { sql } = makeFakeSql();
    const created = await createEmployee(sql, { ...adminCtx, role: 'MANAGER' }, { name: 'Nueva Persona' });
    expect(created.name).toBe('Nueva Persona');
    await expect(createEmployee(sql, employeeCtx, { name: 'X' })).rejects.toMatchObject({ status: 403 });
  });

  it('an employee exists without a user account', async () => {
    const { sql } = makeFakeSql();
    const created = await createEmployee(sql, adminCtx, { name: 'Sin Cuenta' });
    expect(created.userId).toBeNull();
  });

  it('only ADMIN can edit/deactivate employees', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)] });
    await expect(updateEmployee(sql, { ...adminCtx, role: 'MANAGER' }, { id: EMP_A1, status: 'inactive' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('user link requires membership in the same organization', async () => {
    const { sql } = makeFakeSql({ employees: [employeeRow(EMP_A1, ORG_A)], memberships: [] });
    await expect(updateEmployee(sql, adminCtx, { id: EMP_A1, userId: 'outsider' }))
      .rejects.toMatchObject({ status: 400 });
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
});

describe('import persistence', () => {
  it('multiple imports coexist inside the same organization', async () => {
    const { sql } = makeFakeSql();
    const first = await createImport(sql, adminCtx, { fileName: 'a.pdf', sourceFormat: 'pdf', periodYear: 2026, periodMonth: 8 });
    const second = await createImport(sql, adminCtx, { fileName: 'b.pdf', sourceFormat: 'pdf', periodYear: 2026, periodMonth: 9 });
    expect(first.id).not.toBe(second.id);
    const all = await listImports(sql, adminCtx);
    expect(all).toHaveLength(2);
    expect(all.every((item) => item.organizationId === ORG_A)).toBe(true);
  });

  it('import listings never leak across organizations', async () => {
    const { sql } = makeFakeSql();
    await createImport(sql, adminCtx, { fileName: 'a.pdf' });
    expect(await listImports(sql, orgBCtx)).toHaveLength(0);
  });
});

describe('membership management (B2B minimal)', () => {
  const membershipsFixture = () => [
    { user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' },
    { user_id: 'user-mgr', organization_id: ORG_A, role: 'MANAGER' },
  ];
  const usersFixture = () => [
    { id: USER_ADMIN, email: 'admin@example.com', display_name: 'Admin' },
    { id: 'user-mgr', email: 'mgr@example.com', display_name: 'Mgr' },
  ];
  const fakeHash = (password) => `hashed:${password}`;

  it('only ADMIN lists members (MANAGER cannot)', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const members = await listMembers(sql, adminCtx);
    expect(members).toHaveLength(2);
    await expect(listMembers(sql, { ...adminCtx, role: 'MANAGER' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('adds an existing user without password; rejects duplicates', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const added = await addMember(sql, adminCtx, { email: 'mgr@example.com', role: 'EMPLOYEE' }, fakeHash)
      .catch((error) => error);
    // mgr is already a member → 409
    expect(added).toMatchObject({ status: 409 });

    const fresh = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    const result = await addMember(fresh.sql, adminCtx, { email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'temporal-123' }, fakeHash);
    expect(result.role).toBe('EMPLOYEE');
  });

  it('new user requires an initial password (min 8)', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    await expect(addMember(sql, adminCtx, { email: 'nuevo@example.com', role: 'EMPLOYEE' }, fakeHash))
      .rejects.toMatchObject({ status: 400 });
    await expect(addMember(sql, adminCtx, { email: 'nuevo@example.com', role: 'EMPLOYEE', password: 'short' }, fakeHash))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects invalid roles and non-ADMIN callers (no privilege escalation)', async () => {
    const { sql } = makeFakeSql({ memberships: membershipsFixture(), users: usersFixture() });
    await expect(addMember(sql, adminCtx, { email: 'x@example.com', role: 'SUPERADMIN', password: 'temporal-123' }, fakeHash))
      .rejects.toMatchObject({ status: 400 });
    await expect(addMember(sql, { ...adminCtx, role: 'MANAGER' }, { email: 'x@example.com', role: 'ADMIN', password: 'temporal-123' }, fakeHash))
      .rejects.toMatchObject({ status: 403 });
    await expect(updateMemberRole(sql, { ...adminCtx, role: 'MANAGER' }, { userId: 'user-mgr', role: 'ADMIN' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('the last ADMIN cannot be demoted or removed; self-removal blocked', async () => {
    const single = makeFakeSql({
      memberships: [{ user_id: USER_ADMIN, organization_id: ORG_A, role: 'ADMIN' }],
      users: usersFixture(),
    });
    await expect(updateMemberRole(single.sql, adminCtx, { userId: USER_ADMIN, role: 'MANAGER' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(removeMember(single.sql, adminCtx, { userId: USER_ADMIN }))
      .rejects.toMatchObject({ status: 400 }); // self-removal

    const two = makeFakeSql({
      memberships: membershipsFixture(),
      users: usersFixture(),
    });
    await expect(removeMember(two.sql, adminCtx, { userId: USER_ADMIN }))
      .rejects.toMatchObject({ status: 400 }); // last ADMIN
    const removed = await removeMember(two.sql, adminCtx, { userId: 'user-mgr' });
    expect(removed.userId).toBe('user-mgr');
  });
});

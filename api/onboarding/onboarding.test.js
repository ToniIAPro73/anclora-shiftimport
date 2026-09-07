import { describe, expect, it, vi } from 'vitest';

const TOKEN = 'onboarding-token';
const USER_ID = 'user-onboarding';

let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./onboarding.js');

function makeSql({ existingMembership = false, existingAdminId = null, failTransaction = false } = {}) {
  const queries = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.includes('FROM sessions')) {
      return Promise.resolve([{
        id: USER_ID,
        email: 'onboarding@example.com',
        display_name: 'Onboarding User',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }]);
    }
    if (text.includes('FROM memberships')) {
      return Promise.resolve(existingMembership
        ? [{ organization_id: 'existing-org', role: 'OWNER' }]
        : []);
    }
    if (text.includes('SELECT id FROM users')) {
      return existingAdminId ? [{ id: existingAdminId }] : [];
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([]);
    }
    queries.push({ text, values });
    return Promise.resolve([]);
  };
  sql.transaction = async (batch) => {
    if (failTransaction) throw new Error('simulated onboarding failure');
    return Promise.all(batch);
  };
  sql.queries = queries;
  return sql;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    send(payload) { this.body = JSON.parse(payload); },
  };
}

async function call(body) {
  const res = response();
  await handler({
    method: 'POST',
    body,
    headers: { cookie: `anclora_session=${TOKEN}` },
  }, res);
  return res;
}

describe('POST /api/onboarding', () => {
  it('creates a company organization with an OWNER membership', async () => {
    state = { sql: makeSql() };
    const res = await call({ organizationName: 'Acme Operations' });

    expect(res.statusCode).toBe(201);
    expect(res.body.organizationId).toEqual(expect.any(String));
    const membershipInsert = state.sql.queries.find((query) => query.text.includes('INSERT INTO memberships'));
    expect(membershipInsert?.text).toContain("'OWNER'");
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO')).map((query) => query.text))
      .toHaveLength(2);
  });

  it('does not create an Employee from a legacy employeeName without explicit opt-in', async () => {
    state = { sql: makeSql() };
    const res = await call({ organizationName: 'Personal Workspace', employeeName: 'Onboarding User' });

    expect(res.statusCode).toBe(201);
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO')).map((query) => query.text))
      .toHaveLength(2);
  });

  it('creates the self employee only when ownerIsEmployee is explicitly true', async () => {
    state = { sql: makeSql() };
    const res = await call({
      organizationName: 'Personal Workspace',
      ownerIsEmployee: true,
      employeeName: 'Onboarding User',
    });

    expect(res.statusCode).toBe(201);
    const membershipInsert = state.sql.queries.find((query) => query.text.includes('INSERT INTO memberships'));
    expect(membershipInsert?.text).toContain("'OWNER'");
    expect(state.sql.queries.find((query) => query.text.includes('INSERT INTO employees'))?.text)
      .toContain("'active'");
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO')).map((query) => query.text))
      .toHaveLength(3);
  });

  it('treats adminName as owner identity and never as an Employee signal', async () => {
    state = { sql: makeSql() };
    const res = await call({ organizationName: 'Company Workspace', adminName: 'Owner Display Name' });

    expect(res.statusCode).toBe(201);
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO')).map((query) => query.text))
      .toHaveLength(2);
    const userUpdate = state.sql.queries.find((query) => query.text.includes('UPDATE users'));
    expect(userUpdate?.text).toContain('display_name');
    expect(userUpdate?.values).toContain('Owner Display Name');
  });

  it('rejects repeat onboarding after the user already has a membership', async () => {
    state = { sql: makeSql({ existingMembership: true }) };
    const res = await call({ organizationName: 'Should Not Be Created' });

    expect(res.statusCode).toBe(409);
    expect(state.sql.queries).toHaveLength(0);
  });

  it('persists the selected plan directly and provisions Team areas, OWNER Employee and ADMIN atomically', async () => {
    state = { sql: makeSql() };
    const res = await call({
      plan: 'team',
      organization: { name: 'Team Workspace' },
      areas: [{ name: 'Operations', ref: 'area-0' }],
      owner: { isEmployee: true, employeeName: 'Owner Employee', areaRef: 'area-0' },
      admin: { name: 'Admin User', email: 'admin@example.com', isEmployee: true, employeeName: 'Admin Employee', areaRef: 'area-0' },
    });

    expect(res.statusCode).toBe(201);
    const organizationInsert = state.sql.queries.find((query) => query.text.includes('INSERT INTO organizations'));
    expect(organizationInsert?.text).toContain('plan');
    expect(organizationInsert?.values).toContain('team');
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO areas'))).toHaveLength(1);
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO employees'))).toHaveLength(2);
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO memberships'))).toHaveLength(2);
    expect(res.body.adminCredentials.email).toBe('admin@example.com');
    expect(res.body.adminCredentials.temporaryPassword).toEqual(expect.any(String));
  });

  it('allows Team with zero areas and no ADMIN as a complete bootstrap', async () => {
    state = { sql: makeSql() };
    const res = await call({
      plan: 'team', organization: { name: 'Owner Only' }, areas: [],
      owner: { isEmployee: false },
    });

    expect(res.statusCode).toBe(201);
    expect(state.sql.queries.some((query) => query.text.includes('INSERT INTO areas'))).toBe(false);
    expect(state.sql.queries.some((query) => query.text.includes('INSERT INTO employees'))).toBe(false);
  });

  it('rejects invalid plans and Team-only data without creating an organization', async () => {
    state = { sql: makeSql() };
    const invalidPlan = await call({ plan: 'enterprise_unlimited_fake', organization: { name: 'Invalid' }, areas: [], owner: { isEmployee: false } });
    expect(invalidPlan.statusCode).toBe(400);
    expect(state.sql.queries.some((query) => query.text.includes('INSERT INTO organizations'))).toBe(false);

    state = { sql: makeSql() };
    const invalidPersonal = await call({ plan: 'personal', organization: { name: 'Personal' }, areas: [{ name: 'Operations' }], owner: { isEmployee: false } });
    expect(invalidPersonal.statusCode).toBe(400);
    expect(state.sql.queries.some((query) => query.text.includes('INSERT INTO organizations'))).toBe(false);
  });

  it('reuses an existing ADMIN User without creating a duplicate or changing credentials', async () => {
    state = { sql: makeSql({ existingAdminId: 'existing-admin' }) };
    const res = await call({
      plan: 'team', organization: { name: 'Reuse User' }, areas: [], owner: { isEmployee: false },
      admin: { name: 'Existing', email: 'existing@example.com', isEmployee: false },
    });

    expect(res.statusCode).toBe(201);
    expect(state.sql.queries.some((query) => query.text.includes('INSERT INTO users'))).toBe(false);
    expect(res.body.adminCredentials).toBeUndefined();
  });

  it('returns an error from a failed transaction without presenting a successful organization', async () => {
    state = { sql: makeSql({ failTransaction: true }) };
    const res = await call({ plan: 'team', organization: { name: 'Rollback' }, areas: [], owner: { isEmployee: false } });

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Unexpected API error');
  });

  describe('P5.7 Canonical Scenarios A-F', () => {
    it('Scenario A: Minimal organization (Owner only, 0 Areas, 0 Planners, 0 Employees)', async () => {
      state = { sql: makeSql() };
      const res = await call({
        plan: 'team',
        organization: { name: 'Minimal Org' },
        owner: { isEmployee: false },
        areas: [],
        admins: [],
        planners: [],
        employees: [],
      });

      expect(res.statusCode).toBe(201);
      expect(state.sql.queries.filter((q) => q.text.includes('INSERT INTO organizations'))).toHaveLength(1);
      expect(state.sql.queries.filter((q) => q.text.includes('INSERT INTO memberships'))).toHaveLength(1);
      expect(state.sql.queries.some((q) => q.text.includes('INSERT INTO employees'))).toBe(false);
      expect(state.sql.queries.some((q) => q.text.includes('INSERT INTO areas'))).toBe(false);
      expect(state.sql.queries.some((q) => q.text.includes('INSERT INTO operational_assignments'))).toBe(false);
    });

    it('Scenario B: Small organization (Owner, Admin, Employees, 0 Areas)', async () => {
      state = { sql: makeSql() };
      const res = await call({
        plan: 'team',
        organization: { name: 'Small Org' },
        owner: { isEmployee: false },
        admins: [{ name: 'Admin Bob', email: 'bob@example.com', isEmployee: false }],
        employees: [{ name: 'Employee Ana' }, { name: 'Employee Carlos' }],
      });

      expect(res.statusCode).toBe(201);
      expect(state.sql.queries.filter((q) => q.text.includes('INSERT INTO users'))).toHaveLength(1);
      expect(state.sql.queries.filter((q) => q.text.includes('INSERT INTO memberships'))).toHaveLength(2); // OWNER + ADMIN
      expect(state.sql.queries.filter((q) => q.text.includes('INSERT INTO employees'))).toHaveLength(2); // 2 standalone employees
      expect(state.sql.queries.some((q) => q.text.includes('INSERT INTO areas'))).toBe(false);
      expect(res.body.adminCredentials.email).toBe('bob@example.com');
    });

    it('Scenario C: Planner without Areas (Owner, Planner with direct employee scope, 0 Areas)', async () => {
      state = { sql: makeSql() };
      const res = await call({
        plan: 'team',
        organization: { name: 'Planner Org' },
        owner: { isEmployee: false },
        planners: [{
          name: 'Planner Patricia',
          email: 'patricia@example.com',
          isEmployee: false,
          plannerScopeType: 'EMPLOYEES',
          scopedEmployeeRefs: ['emp-0'],
        }],
        employees: [{ ref: 'emp-0', name: 'Operational Worker' }],
        assignments: {
          employeeToPlanner: [{ employeeRef: 'emp-0', plannerRef: 'planner-0' }],
        },
      });

      expect(res.statusCode).toBe(201);
      const plannerMembership = state.sql.queries.find((q) => q.text.includes("'PLANNER'"));
      expect(plannerMembership).toBeDefined();
      expect(plannerMembership?.values).toContain('EMPLOYEES');
      const plannerEmpAssign = state.sql.queries.find((q) => q.text.includes("'PLANNER_EMPLOYEE'"));
      expect(plannerEmpAssign).toBeDefined();
    });

    it('Scenario D: Multi-area organization (Owner, Areas, Planner with area scopes, Employees assigned to areas)', async () => {
      state = { sql: makeSql() };
      const res = await call({
        plan: 'team',
        organization: { name: 'Multi Area Corp' },
        owner: { isEmployee: false },
        areas: [{ ref: 'area-ops', name: 'Operaciones' }, { ref: 'area-ramp', name: 'Rampa' }],
        planners: [{
          ref: 'planner-ops',
          name: 'Ops Planner',
          email: 'opsplanner@example.com',
          isEmployee: false,
          plannerScopeType: 'AREAS',
          scopedAreaRefs: ['area-ops'],
        }],
        employees: [{ ref: 'emp-1', name: 'Worker 1', areaRef: 'area-ops' }],
      });

      expect(res.statusCode).toBe(201);
      expect(state.sql.queries.filter((q) => q.text.includes('INSERT INTO areas'))).toHaveLength(2);
      expect(state.sql.queries.some((q) => q.text.includes("'PLANNER_AREA'"))).toBe(true);
      expect(state.sql.queries.some((q) => q.text.includes("'EMPLOYEE_AREA'"))).toBe(true);
    });

    it('Scenario E: Owner is explicitly NOT an Employee (no employee record)', async () => {
      state = { sql: makeSql() };
      const res = await call({
        plan: 'team',
        organization: { name: 'No Employee Owner' },
        owner: { isEmployee: false },
      });

      expect(res.statusCode).toBe(201);
      expect(state.sql.queries.some((q) => q.text.includes('INSERT INTO employees'))).toBe(false);
    });

    it('Scenario F: Admin IS an Employee (creates linked employee record)', async () => {
      state = { sql: makeSql() };
      const res = await call({
        plan: 'team',
        organization: { name: 'Admin Employee Org' },
        owner: { isEmployee: false },
        admins: [{
          name: 'Admin Worker',
          email: 'adminworker@example.com',
          isEmployee: true,
          employeeName: 'Admin Worker Operational',
        }],
      });

      expect(res.statusCode).toBe(201);
      const empInsert = state.sql.queries.find((q) => q.text.includes('INSERT INTO employees'));
      expect(empInsert).toBeDefined();
      expect(empInsert?.values).toContain('Admin Worker Operational');
    });
  });
});

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenAdmin = 'tok-admin';
const tokenEmployee = 'tok-employee';
const hash = (t) => createHash('sha256').update(t).digest('hex');

let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./bulk-move.js');

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
}

function makeFakeSql({ assignments = [], employees = [], areas = [], memberships = [], users = [] } = {}) {
  const auditEvents = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();

    if (text.includes('FROM sessions')) {
      const user = users.find((u) => u.tokenHash === values[0]);
      return Promise.resolve(user ? [{ id: user.id, email: user.email, display_name: user.name }] : []);
    }

    if (text.includes('FROM memberships m') && text.includes('JOIN organizations')) {
      const userMemberships = memberships.filter((x) => x.user_id === values[0]);
      return Promise.resolve(userMemberships.map((m) => ({
        organization_id: m.organization_id,
        role: m.role,
        scoped_area_id: m.scoped_area_id ?? null,
        planner_scope_type: m.planner_scope_type ?? null,
        organization_name: 'Test Org',
        organization_plan: 'team',
      })));
    }

    if (text.includes('FROM employees') && text.includes('organization_id = ?') && text.includes('user_id = ?')) {
      const emp = employees.find((e) => e.organization_id === values[0] && e.user_id === values[1]);
      return Promise.resolve(emp ? [{ id: emp.id }] : []);
    }

    // assertEmployeeInOrg
    if (text.startsWith('SELECT id, status FROM employees') && text.includes('WHERE id = ? AND organization_id = ?')) {
      const found = employees.filter((e) => e.id === values[0] && e.organization_id === values[1]);
      return Promise.resolve(found);
    }

    // assertAreaInOrg
    if (text.startsWith('SELECT id FROM areas') && text.includes('WHERE id = ? AND organization_id = ?')) {
      const found = areas.filter((a) => a.id === values[0] && a.organization_id === values[1]);
      return Promise.resolve(found);
    }

    // UPDATE operational_assignments for bulk move close
    if (text.startsWith('UPDATE operational_assignments SET valid_to = ?')) {
      const effDate = values[0];
      const orgId = values[1];
      for (const a of assignments) {
        if (a.organization_id === orgId && a.assignment_type === 'EMPLOYEE_AREA' && !a.valid_to) {
          a.valid_to = effDate;
        }
      }
      return Promise.resolve([]);
    }

    // INSERT INTO operational_assignments
    if (text.startsWith('INSERT INTO operational_assignments')) {
      const [orgId, type, subId, tgtId, vFrom] = values;
      const newRow = {
        id: `asgn-${assignments.length + 1}`,
        organization_id: orgId,
        assignment_type: type,
        subject_id: subId,
        target_id: tgtId,
        valid_from: vFrom,
        valid_to: null,
        created_at: new Date().toISOString(),
      };
      assignments.push(newRow);
      return Promise.resolve([newRow]);
    }

    // UPDATE employees SET area_id
    if (text.startsWith('UPDATE employees SET area_id = ?')) {
      const targetAreaId = values[0];
      const orgId = values[1];
      for (const e of employees) {
        if (e.organization_id === orgId) {
          e.area_id = targetAreaId;
        }
      }
      return Promise.resolve([]);
    }

    // Audit events
    if (text.startsWith('INSERT INTO organization_audit_events')) {
      auditEvents.push(values);
      return Promise.resolve([{ id: 'audit-1' }]);
    }

    return Promise.resolve([]);
  };

  return { sql, assignments, employees, areas, memberships, auditEvents };
}

describe('POST /api/assignments/bulk-move', () => {
  beforeEach(() => {
    state = makeFakeSql({
      users: [
        { id: 'usr-admin', email: 'admin@example.com', name: 'Admin', tokenHash: hash(tokenAdmin) },
        { id: 'usr-emp', email: 'emp@example.com', name: 'Emp', tokenHash: hash(tokenEmployee) },
      ],
      memberships: [
        { user_id: 'usr-admin', organization_id: 'org-1', role: 'ADMIN' },
        { user_id: 'usr-emp', organization_id: 'org-1', role: 'EMPLOYEE' },
      ],
      areas: [
        { id: 'area-ops', organization_id: 'org-1', name: 'Operaciones' },
        { id: 'area-sec', organization_id: 'org-1', name: 'Seguridad' },
      ],
      employees: [
        { id: 'emp-1', organization_id: 'org-1', name: 'John Doe', status: 'active', area_id: 'area-ops' },
        { id: 'emp-2', organization_id: 'org-1', name: 'Jane Smith', status: 'active', area_id: 'area-ops' },
      ],
      assignments: [
        {
          id: 'asgn-1',
          organization_id: 'org-1',
          assignment_type: 'EMPLOYEE_AREA',
          subject_id: 'emp-1',
          target_id: 'area-ops',
          valid_from: '2026-01-01',
          valid_to: null,
        },
        {
          id: 'asgn-2',
          organization_id: 'org-1',
          assignment_type: 'EMPLOYEE_AREA',
          subject_id: 'emp-2',
          target_id: 'area-ops',
          valid_from: '2026-01-01',
          valid_to: null,
        },
      ],
    });
  });

  it('bulk moves employees to a target area with effective dating', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenAdmin}` },
      body: {
        employeeIds: ['emp-1', 'emp-2'],
        targetAreaId: 'area-sec',
        effectiveDate: '2026-09-01',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      moved: true,
      count: 2,
      targetAreaId: 'area-sec',
      effectiveDate: '2026-09-01',
    });

    // Old assignments closed
    expect(state.assignments.find((a) => a.id === 'asgn-1').valid_to).toBe('2026-09-01');
    expect(state.assignments.find((a) => a.id === 'asgn-2').valid_to).toBe('2026-09-01');

    // Employees updated
    expect(state.employees.find((e) => e.id === 'emp-1').area_id).toBe('area-sec');
    expect(state.employees.find((e) => e.id === 'emp-2').area_id).toBe('area-sec');

    // Audit event recorded
    expect(state.auditEvents.length).toBeGreaterThan(0);
  });

  it('unassigns employees when targetAreaId is null', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenAdmin}` },
      body: {
        employeeIds: ['emp-1'],
        targetAreaId: null,
        effectiveDate: '2026-09-01',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      moved: true,
      count: 1,
      targetAreaId: null,
    });
    expect(state.employees.find((e) => e.id === 'emp-1').area_id).toBeNull();
  });

  it('rejects empty employeeIds (400)', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenAdmin}` },
      body: { employeeIds: [] },
    }, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-admin (403)', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenEmployee}` },
      body: { employeeIds: ['emp-1'], targetAreaId: 'area-sec' },
    }, res);

    expect(res.statusCode).toBe(403);
  });

  it('rejects non-POST (405)', async () => {
    const res = makeRes();
    await handler({
      method: 'GET',
      headers: { cookie: `anclora_session=${tokenAdmin}` },
    }, res);

    expect(res.statusCode).toBe(405);
  });
});

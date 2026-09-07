import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenAdmin = 'tok-admin';
const tokenPlanner = 'tok-planner';
const tokenEmployee = 'tok-employee';
const hash = (t) => createHash('sha256').update(t).digest('hex');

let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./index.js');

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

    // listOperationalAssignments
    if (text.startsWith('SELECT id, organization_id, assignment_type, subject_id, target_id')) {
      return Promise.resolve(assignments.filter((a) => a.organization_id === values[0] && !a.valid_to));
    }

    // UPDATE operational_assignments for EMPLOYEE_AREA transition
    if (text.startsWith('UPDATE operational_assignments SET valid_to = ?') && text.includes("assignment_type = 'EMPLOYEE_AREA'")) {
      const [effDate, orgId, subId] = values;
      for (const a of assignments) {
        if (a.organization_id === orgId && a.assignment_type === 'EMPLOYEE_AREA' && a.subject_id === subId && !a.valid_to) {
          a.valid_to = effDate;
        }
      }
      return Promise.resolve([]);
    }

    // INSERT INTO operational_assignments
    if (text.startsWith('INSERT INTO operational_assignments')) {
      const [orgId, type, subId, tgtId, vFrom, vTo] = values;
      const newRow = {
        id: `asgn-${assignments.length + 1}`,
        organization_id: orgId,
        assignment_type: type,
        subject_id: subId,
        target_id: tgtId,
        valid_from: vFrom,
        valid_to: vTo ?? null,
        created_at: new Date().toISOString(),
      };
      assignments.push(newRow);
      return Promise.resolve([newRow]);
    }

    // UPDATE employees SET area_id
    if (text.startsWith('UPDATE employees SET area_id = ?')) {
      const [areaId, empId, orgId] = values;
      const emp = employees.find((e) => e.id === empId && e.organization_id === orgId);
      if (emp) {
        emp.area_id = areaId;
      }
      return Promise.resolve([]);
    }

    // UPDATE memberships for planner
    if (text.startsWith('UPDATE memberships SET scoped_area_id = ?') || text.startsWith('UPDATE memberships SET planner_scope_type = ?')) {
      return Promise.resolve([]);
    }

    // DELETE / close assignment by id or composite
    if (text.startsWith('UPDATE operational_assignments SET valid_to = ?') && text.includes('WHERE id = ?')) {
      const [effDate, asgnId, orgId] = values;
      const found = assignments.find((a) => a.id === asgnId && a.organization_id === orgId && !a.valid_to);
      if (found) {
        found.valid_to = effDate;
        return Promise.resolve([found]);
      }
      return Promise.resolve([]);
    }

    if (text.startsWith('UPDATE operational_assignments SET valid_to = ?') && text.includes('assignment_type = ?')) {
      const [effDate, orgId, type, subId, tgtId] = values;
      const found = assignments.find((a) => a.organization_id === orgId && a.assignment_type === type && a.subject_id === subId && a.target_id === tgtId && !a.valid_to);
      if (found) {
        found.valid_to = effDate;
        return Promise.resolve([found]);
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

describe('Operational Assignments API (/api/assignments)', () => {
  beforeEach(() => {
    state = makeFakeSql({
      users: [
        { id: 'usr-admin', email: 'admin@example.com', name: 'Admin', tokenHash: hash(tokenAdmin) },
        { id: 'usr-planner', email: 'planner@example.com', name: 'Planner', tokenHash: hash(tokenPlanner) },
        { id: 'usr-emp', email: 'emp@example.com', name: 'Emp', tokenHash: hash(tokenEmployee) },
      ],
      memberships: [
        { user_id: 'usr-admin', organization_id: 'org-1', role: 'ADMIN' },
        { user_id: 'usr-planner', organization_id: 'org-1', role: 'PLANNER' },
        { user_id: 'usr-emp', organization_id: 'org-1', role: 'EMPLOYEE' },
      ],
      areas: [
        { id: 'area-ops', organization_id: 'org-1', name: 'Operaciones' },
        { id: 'area-sec', organization_id: 'org-1', name: 'Seguridad' },
      ],
      employees: [
        { id: 'emp-1', organization_id: 'org-1', name: 'John Doe', status: 'active', area_id: 'area-ops' },
        { id: 'emp-2', organization_id: 'org-1', name: 'Jane Smith', status: 'active', area_id: null },
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
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
  });

  describe('GET /api/assignments', () => {
    it('lists active assignments for the organization', async () => {
      const res = makeRes();
      await handler({
        method: 'GET',
        headers: { cookie: `anclora_session=${tokenAdmin}` },
        query: {},
      }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.assignments).toHaveLength(1);
      expect(res.body.assignments[0]).toMatchObject({
        id: 'asgn-1',
        assignmentType: 'EMPLOYEE_AREA',
        subjectId: 'emp-1',
        targetId: 'area-ops',
      });
    });

    it('filters assignments by assignmentType', async () => {
      const res = makeRes();
      await handler({
        method: 'GET',
        headers: { cookie: `anclora_session=${tokenPlanner}` },
        query: { type: 'PLANNER_AREA' },
      }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.assignments).toHaveLength(0);
    });
  });

  describe('POST /api/assignments', () => {
    it('creates an EMPLOYEE_AREA assignment and transitions the old one', async () => {
      const res = makeRes();
      await handler({
        method: 'POST',
        headers: { cookie: `anclora_session=${tokenAdmin}` },
        body: {
          assignmentType: 'EMPLOYEE_AREA',
          subjectId: 'emp-1',
          targetId: 'area-sec',
          effectiveDate: '2026-09-01',
        },
      }, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.assignment).toMatchObject({
        assignment_type: 'EMPLOYEE_AREA',
        subject_id: 'emp-1',
        target_id: 'area-sec',
        valid_from: '2026-09-01',
      });

      // Verify old assignment closed
      const oldAsgn = state.assignments.find((a) => a.id === 'asgn-1');
      expect(oldAsgn.valid_to).toBe('2026-09-01');

      // Verify employee area updated
      const emp1 = state.employees.find((e) => e.id === 'emp-1');
      expect(emp1.area_id).toBe('area-sec');
    });

    it('creates a PLANNER_AREA assignment', async () => {
      const res = makeRes();
      await handler({
        method: 'POST',
        headers: { cookie: `anclora_session=${tokenAdmin}` },
        body: {
          assignmentType: 'PLANNER_AREA',
          subjectId: 'usr-planner',
          targetId: 'area-ops',
          effectiveDate: '2026-09-01',
        },
      }, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.assignment).toMatchObject({
        assignment_type: 'PLANNER_AREA',
        subject_id: 'usr-planner',
        target_id: 'area-ops',
      });
    });

    it('rejects POST from non-admin (403)', async () => {
      const res = makeRes();
      await handler({
        method: 'POST',
        headers: { cookie: `anclora_session=${tokenPlanner}` },
        body: {
          assignmentType: 'EMPLOYEE_AREA',
          subjectId: 'emp-2',
          targetId: 'area-ops',
        },
      }, res);

      expect(res.statusCode).toBe(403);
    });

    it('validates assignmentType (400)', async () => {
      const res = makeRes();
      await handler({
        method: 'POST',
        headers: { cookie: `anclora_session=${tokenAdmin}` },
        body: {
          assignmentType: 'INVALID_TYPE',
          subjectId: 'emp-2',
          targetId: 'area-ops',
        },
      }, res);

      expect(res.statusCode).toBe(400);
    });

    it('validates subjectId and targetId (400)', async () => {
      const res = makeRes();
      await handler({
        method: 'POST',
        headers: { cookie: `anclora_session=${tokenAdmin}` },
        body: {
          assignmentType: 'EMPLOYEE_AREA',
          subjectId: 'emp-2',
        },
      }, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/assignments', () => {
    it('closes an assignment by id', async () => {
      const res = makeRes();
      await handler({
        method: 'DELETE',
        headers: { cookie: `anclora_session=${tokenAdmin}` },
        body: { id: 'asgn-1', effectiveDate: '2026-09-05' },
      }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ removed: true, count: 1 });
      const asgn1 = state.assignments.find((a) => a.id === 'asgn-1');
      expect(asgn1.valid_to).toBe('2026-09-05');
    });

    it('rejects DELETE from non-admin (403)', async () => {
      const res = makeRes();
      await handler({
        method: 'DELETE',
        headers: { cookie: `anclora_session=${tokenPlanner}` },
        body: { id: 'asgn-1' },
      }, res);

      expect(res.statusCode).toBe(403);
    });
  });
});

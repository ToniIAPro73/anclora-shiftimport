import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-approval';
const OTHER_ORG = 'org-other';
const ADMIN_TOKEN = 'approval-admin';
const AREA_ADMIN_TOKEN = 'approval-area-admin';
const OTHER_ADMIN_TOKEN = 'approval-other-admin';
const EMPLOYEE_TOKEN = 'approval-employee';
const hash = (value) => createHash('sha256').update(value).digest('hex');
let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./index.js');

const request = (overrides = {}) => ({
  id: 'approval-1',
  organization_id: ORG,
  change_request_id: 'change-1',
  status: 'PENDING',
  policy_snapshot: state.policy,
  created_at: '2026-09-05T10:00:00.000Z',
  request_type: 'TIME_CHANGE',
  reason: 'Necesito ajustar la entrada.',
  employee_id: 'employee-1',
  employee_name: 'Ana López',
  area_id: 'area-1',
  area_name: 'Recepción',
  shift_id: 'shift-1',
  shift_date: '2026-09-08',
  shift_start_time: '09:00',
  shift_end_time: '17:00',
  shift_location: 'Hotel Aurora',
  ...overrides,
});

function makeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) {
      const users = {
        [hash(ADMIN_TOKEN)]: { id: 'admin-1', role: 'ADMIN' },
        [hash(AREA_ADMIN_TOKEN)]: { id: 'area-admin-1', role: 'ADMIN' },
        [hash(OTHER_ADMIN_TOKEN)]: { id: 'other-admin-1', role: 'ADMIN' },
        [hash(EMPLOYEE_TOKEN)]: { id: 'employee-user-1', role: 'EMPLOYEE' },
      };
      const user = users[values[0]];
      return Promise.resolve(user ? [{ id: user.id, email: `${user.id}@test`, display_name: user.id }] : []);
    }
    if (text.includes('FROM memberships')) {
      const userId = values[0];
      const org = userId === 'other-admin-1' ? OTHER_ORG : ORG;
      const role = userId === 'employee-user-1' ? 'EMPLOYEE' : 'ADMIN';
      return Promise.resolve([{ organization_id: org, role, scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) return Promise.resolve([]);
    if (text.includes('FROM approval_requests')) {
      if (state.currentUser === 'employee-user-1' || state.currentUser === 'other-admin-1') return Promise.resolve([]);
      if (state.policy === 'AREA_RESPONSIBLE' && state.currentUser !== 'area-admin-1') return Promise.resolve([]);
      return Promise.resolve([request()]);
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
}

async function call({ token = ADMIN_TOKEN, query = {} } = {}) {
  const tokenUser = token === AREA_ADMIN_TOKEN ? 'area-admin-1'
    : token === OTHER_ADMIN_TOKEN ? 'other-admin-1'
      : token === EMPLOYEE_TOKEN ? 'employee-user-1' : 'admin-1';
  state.currentUser = tokenUser;
  const res = response();
  await handler({ method: 'GET', query, headers: { cookie: `anclora_session=${token}` } }, res);
  return res;
}

beforeEach(() => {
  state = { policy: 'ORGANIZATION_ADMIN', currentUser: 'admin-1', sql: makeSql() };
});

describe('GET /api/approval-requests', () => {
  it('returns organization-admin requests without trusting an approverId filter', async () => {
    const res = await call({ query: { status: 'pending', approverId: 'someone-else' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    const query = state.sql.calls.find((entry) => entry.text.includes('FROM approval_requests'));
    expect(query.text).toContain('ar.organization_id');
    expect(query.text).toContain('caller_membership.user_id');
    expect(query.text).not.toContain('approverId');
  });

  it('limits AREA_RESPONSIBLE results to the assigned area responsible', async () => {
    state.policy = 'AREA_RESPONSIBLE';
    expect((await call({ token: AREA_ADMIN_TOKEN })).body.requests).toHaveLength(1);
    expect((await call({ token: ADMIN_TOKEN })).body.requests).toHaveLength(0);
  });

  it('fails closed for employees, other tenants and invalid statuses', async () => {
    expect((await call({ token: EMPLOYEE_TOKEN })).statusCode).toBe(403);
    expect((await call({ token: OTHER_ADMIN_TOKEN })).statusCode).toBe(200);
    expect((await call({ query: { status: 'approved' } })).statusCode).toBe(400);
  });
});

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-requests';
const EMPLOYEE = 'employee-requests';
const USER = 'user-requests';
const TOKEN = 'requests-token';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./index.js');

function makeFakeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) {
      return Promise.resolve(values[0] === tokenHash(TOKEN)
        ? [{ id: USER, email: 'employee@example.com', display_name: 'Employee' }]
        : []);
    }
    if (text.includes('FROM memberships')) {
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, organization_name: 'Org Requests', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('FROM change_requests cr')) {
      const status = values[2];
      return Promise.resolve((status && status !== 'PENDING') ? [] : [{
        id: REQUEST_ID,
        shift_id: '11111111-1111-4111-8111-111111111111',
        employee_id: EMPLOYEE,
        organization_id: ORG,
        request_type: 'TIME_CHANGE',
        reason: 'Necesito cambiar la hora.',
        status: 'PENDING',
        created_at: '2026-09-05T10:00:00.000Z',
        resolved_at: null,
        resolved_by_user_id: null,
        shift_date: '2026-09-08',
        shift_start_time: '09:00',
        shift_end_time: '17:00',
        shift_location: 'Recepción',
      }]);
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

async function call({ token = TOKEN, method = 'GET', status } = {}) {
  const res = response();
  await handler({ method, query: status === undefined ? {} : { status }, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { role: 'EMPLOYEE', sql: makeFakeSql() };
});

describe('GET /api/me/change-requests', () => {
  it('returns only the session employee requests and related shift display data', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0]).toMatchObject({
      id: REQUEST_ID,
      employeeId: EMPLOYEE,
      organizationId: ORG,
      status: 'PENDING',
      shiftDate: '2026-09-08',
      shiftStartTime: '09:00',
    });
    const query = state.sql.calls.find((entry) => entry.text.includes('FROM change_requests cr'));
    expect(query.text).toContain('cr.organization_id');
    expect(query.text).toContain('cr.employee_id');
    expect(query.text).toContain('ORDER BY cr.created_at DESC');
    expect(query.text).not.toContain("TO_CHAR(s.start_time, 'HH24:MI')");
    expect(query.text).not.toContain("TO_CHAR(s.end_time, 'HH24:MI')");
    expect(query.values).toEqual([ORG, EMPLOYEE, null, null]);
  });

  it('passes a validated status filter and rejects invalid values before reading requests', async () => {
    const filtered = await call({ status: 'pending' });
    expect(filtered.statusCode).toBe(200);
    expect(state.sql.calls.find((entry) => entry.text.includes('FROM change_requests cr')).values).toEqual([ORG, EMPLOYEE, 'PENDING', 'PENDING']);

    const invalid = await call({ status: 'waiting' });
    expect(invalid.statusCode).toBe(400);
    expect(state.sql.calls.filter((entry) => entry.text.includes('FROM change_requests cr'))).toHaveLength(1);
  });

  it('fails closed for anonymous requests without reading change requests', async () => {
    expect((await call({ token: null })).statusCode).toBe(401);
    expect(state.sql.calls.some((entry) => entry.text.includes('FROM change_requests cr'))).toBe(false);
    state.role = 'ADMIN';
    expect((await call()).statusCode).toBe(403);
    expect(state.sql.calls.some((entry) => entry.text.includes('FROM change_requests cr'))).toBe(false);
  });

  it('rejects non-GET requests', async () => {
    expect((await call({ method: 'POST' })).statusCode).toBe(405);
    expect(state.sql.calls).toHaveLength(0);
  });
});

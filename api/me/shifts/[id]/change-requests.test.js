import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-change';
const EMPLOYEE = 'employee-change';
const USER = 'user-change';
const TOKEN = 'change-token';
const SHIFT_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_SHIFT_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./change-requests.js');

function makeRequest(status = 'PENDING') {
  return {
    id: REQUEST_ID,
    shift_id: SHIFT_ID,
    employee_id: EMPLOYEE,
    organization_id: ORG,
    request_type: 'TIME_CHANGE',
    reason: 'Necesito cambiar la hora de entrada.',
    status,
    created_at: '2026-09-05T10:00:00.000Z',
    resolved_at: status === 'CANCELLED' ? '2026-09-05T10:05:00.000Z' : null,
    resolved_by_user_id: null,
  };
}

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
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, organization_name: 'Org Change', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('WITH owned_shift')) {
      if (values[0] !== SHIFT_ID || values[1] !== ORG || values[2] !== EMPLOYEE) {
        return Promise.resolve([]);
      }
      state.writes += 1;
      return Promise.resolve([makeRequest()]);
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

async function call({ id = SHIFT_ID, token = TOKEN, method = 'POST', body = {} } = {}) {
  const res = response();
  await handler({ method, query: { id }, body, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { writes: 0, role: 'EMPLOYEE', sql: makeFakeSql() };
});

describe('POST /api/me/shifts/:id/change-requests', () => {
  it('creates an own request as PENDING without changing the shift lifecycle', async () => {
    const res = await call({ body: { requestType: 'TIME_CHANGE', reason: '  Necesito cambiar la hora de entrada.  ' } });
    expect(res.statusCode).toBe(201);
    expect(res.body.request).toMatchObject({
      id: REQUEST_ID,
      shiftId: SHIFT_ID,
      requestType: 'TIME_CHANGE',
      reason: 'Necesito cambiar la hora de entrada.',
      status: 'PENDING',
    });
    expect(state.writes).toBe(1);
    const insert = state.sql.calls.find((entry) => entry.text.includes('WITH owned_shift'));
    expect(insert.text).toContain("'PENDING'");
    expect(insert.text).not.toContain('APPROVED');
    expect(insert.text).not.toContain('REJECTED');
    expect(insert.text).not.toContain('UPDATE shifts');
  });

  it('rejects empty, overlong and invalid requests before any write', async () => {
    expect((await call({ body: { requestType: 'TIME_CHANGE', reason: '   ' } })).statusCode).toBe(400);
    expect((await call({ body: { requestType: 'TIME_CHANGE', reason: 'x'.repeat(2001) } })).statusCode).toBe(400);
    expect((await call({ body: { requestType: 'BREAK_SHIFT', reason: 'Need a change' } })).statusCode).toBe(400);
    expect(state.writes).toBe(0);
  });

  it('fails closed for another employee or tenant and rejects non-EMPLOYEE roles', async () => {
    const validBody = { requestType: 'TIME_CHANGE', reason: 'Need a different time.' };
    expect((await call({ id: FOREIGN_SHIFT_ID, body: validBody })).statusCode).toBe(404);
    state.role = 'ADMIN';
    expect((await call()).statusCode).toBe(403);
    expect(state.writes).toBe(0);
  });

  it('rejects malformed, anonymous and unsupported requests', async () => {
    expect((await call({ id: 'not-a-uuid', token: null })).statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
    expect((await call({ token: null })).statusCode).toBe(401);
    expect((await call({ method: 'GET' })).statusCode).toBe(405);
    expect(state.writes).toBe(0);
  });
});

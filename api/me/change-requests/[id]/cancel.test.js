import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-cancel';
const EMPLOYEE = 'employee-cancel';
const USER = 'user-cancel';
const TOKEN = 'cancel-token';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const FOREIGN_REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./cancel.js');

function requestRow(status = 'CANCELLED') {
  return {
    id: REQUEST_ID,
    shift_id: '11111111-1111-4111-8111-111111111111',
    employee_id: EMPLOYEE,
    organization_id: ORG,
    request_type: 'OTHER',
    reason: 'Necesito otro ajuste.',
    status,
    created_at: '2026-09-05T10:00:00.000Z',
    resolved_at: '2026-09-05T10:05:00.000Z',
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
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, organization_name: 'Org Cancel', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.startsWith('UPDATE change_requests')) {
      if (values[0] !== REQUEST_ID || values[1] !== ORG || values[2] !== EMPLOYEE || state.requestStatus !== 'PENDING') {
        return Promise.resolve([]);
      }
      state.requestStatus = 'CANCELLED';
      return Promise.resolve([requestRow()]);
    }
    if (text.startsWith('SELECT id, status FROM change_requests')) {
      if (values[0] !== REQUEST_ID || values[1] !== ORG || values[2] !== EMPLOYEE) {
        return Promise.resolve([]);
      }
      return Promise.resolve([{ id: REQUEST_ID, status: state.requestStatus }]);
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

async function call({ id = REQUEST_ID, token = TOKEN, method = 'POST' } = {}) {
  const res = response();
  await handler({ method, query: { id }, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { requestStatus: 'PENDING', role: 'EMPLOYEE', sql: makeFakeSql() };
});

describe('POST /api/me/change-requests/:id/cancel', () => {
  it('cancels only an own PENDING request', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.request).toMatchObject({ id: REQUEST_ID, status: 'CANCELLED' });
    const update = state.sql.calls.find((entry) => entry.text.startsWith('UPDATE change_requests'));
    expect(update.text).toContain("status = 'CANCELLED'");
    expect(update.text).toContain("status = 'PENDING'");
    expect(update.text).not.toContain('APPROVED');
    expect(update.text).not.toContain('REJECTED');
  });

  it('rejects a foreign request and a request that is no longer pending', async () => {
    expect((await call({ id: FOREIGN_REQUEST_ID })).statusCode).toBe(404);
    state.requestStatus = 'CANCELLED';
    const res = await call();
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Only pending change requests can be cancelled' });
  });

  it('does not allow ADMIN, anonymous or malformed requests', async () => {
    state.role = 'ADMIN';
    expect((await call()).statusCode).toBe(403);
    expect((await call({ token: null })).statusCode).toBe(401);
    expect((await call({ id: 'not-a-uuid', token: null })).statusCode).toBe(404);
    expect((await call({ method: 'GET' })).statusCode).toBe(405);
  });
});

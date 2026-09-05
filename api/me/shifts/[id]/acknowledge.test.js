import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-ack';
const EMPLOYEE = 'employee-ack';
const USER = 'user-ack';
const TOKEN = 'ack-token';
const SHIFT_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_SHIFT_ID = '22222222-2222-4222-8222-222222222222';
const ACKNOWLEDGED_AT = '2026-09-05T10:00:00.000Z';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./acknowledge.js');

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
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, organization_name: 'Org Ack', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('WITH owned_shift')) {
      if (values[0] !== SHIFT_ID || values[1] !== ORG || values[2] !== EMPLOYEE) {
        return Promise.resolve([]);
      }
      state.acknowledgementWrites += 1;
      return Promise.resolve([{ status: 'ACKNOWLEDGED', acknowledged_at: ACKNOWLEDGED_AT }]);
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

async function call({ id = SHIFT_ID, token = TOKEN, method = 'POST' } = {}) {
  const res = response();
  await handler({ method, query: { id }, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { acknowledgementWrites: 0, role: 'EMPLOYEE', sql: makeFakeSql() };
});

describe('POST /api/me/shifts/:id/acknowledge', () => {
  it('acknowledges the own shift and is idempotent on repeat', async () => {
    const first = await call();
    const second = await call();
    expect(first.statusCode).toBe(200);
    expect(first.body).toEqual({ acknowledgement: { status: 'ACKNOWLEDGED', acknowledgedAt: ACKNOWLEDGED_AT } });
    expect(second.body).toEqual(first.body);
    expect(state.acknowledgementWrites).toBe(2);
    expect(state.sql.calls.filter((entry) => entry.text.includes('WITH owned_shift'))).toHaveLength(2);
    expect(state.sql.calls.filter((entry) => entry.text.includes('WITH owned_shift')).at(-1).text).toContain('ON CONFLICT (shift_id) DO UPDATE');
    expect(state.sql.calls.filter((entry) => entry.text.includes('WITH owned_shift')).at(-1).text).not.toContain('UPDATE shifts');
  });

  it('fails closed for another employee or tenant through the ownership query', async () => {
    const res = await call({ id: FOREIGN_SHIFT_ID });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Shift not found' });
    expect(state.acknowledgementWrites).toBe(0);
  });

  it('rejects malformed ids before authentication and anonymous requests before the write', async () => {
    expect((await call({ id: 'not-a-uuid', token: null })).statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
    const anonymous = await call({ token: null });
    expect(anonymous.statusCode).toBe(401);
    expect(state.acknowledgementWrites).toBe(0);
  });

  it('does not allow an ADMIN to acknowledge on behalf of an employee', async () => {
    state.role = 'ADMIN';
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(state.acknowledgementWrites).toBe(0);
  });

  it('rejects non-POST methods', async () => {
    const res = await call({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });
});

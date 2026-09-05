import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-notification-read';
const EMPLOYEE = 'employee-notification-read';
const USER = 'user-notification-read';
const TOKEN = 'notification-read-token';
const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_ID = '22222222-2222-4222-8222-222222222222';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./read.js');

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
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, organization_name: 'Org Read', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.startsWith('UPDATE notifications')) {
      if (values[0] !== NOTIFICATION_ID || values[1] !== USER || values[2] !== ORG) return Promise.resolve([]);
      state.readAt = state.readAt ?? '2026-09-05T10:05:00.000Z';
      return Promise.resolve([{
        id: NOTIFICATION_ID, user_id: USER, organization_id: ORG,
        type: 'SHIFT_PUBLISHED', resource_type: 'SHIFT',
        resource_id: '33333333-3333-4333-8333-333333333333',
        read_at: state.readAt, created_at: '2026-09-05T10:00:00.000Z',
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

async function call({ id = NOTIFICATION_ID, token = TOKEN, method = 'POST' } = {}) {
  const res = response();
  await handler({ method, query: { id }, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { role: 'EMPLOYEE', readAt: null, sql: makeFakeSql() };
});

describe('POST /api/me/notifications/:id/read', () => {
  it('marks an own notification as read and remains idempotent', async () => {
    const first = await call();
    expect(first.statusCode).toBe(200);
    expect(first.body.notification.readAt).toBeTruthy();
    const second = await call();
    expect(second.statusCode).toBe(200);
    expect(second.body.notification.readAt).toBe(first.body.notification.readAt);
    expect(state.sql.calls.filter((entry) => entry.text.startsWith('UPDATE notifications'))).toHaveLength(2);
  });

  it('does not disclose another notification, tenant, or role', async () => {
    expect((await call({ id: FOREIGN_ID })).statusCode).toBe(404);
    state.role = 'ADMIN';
    expect((await call()).statusCode).toBe(403);
    expect((await call({ token: null })).statusCode).toBe(401);
    expect((await call({ id: 'not-a-uuid', token: null })).statusCode).toBe(404);
  });

  it('rejects non-POST requests', async () => {
    expect((await call({ method: 'GET' })).statusCode).toBe(405);
    expect(state.sql.calls).toHaveLength(0);
  });
});

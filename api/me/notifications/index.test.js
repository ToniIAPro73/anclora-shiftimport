import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-notifications';
const EMPLOYEE = 'employee-notifications';
const USER = 'user-notifications';
const TOKEN = 'notifications-token';
const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';
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
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, organization_name: 'Org Notifications', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([{ id: EMPLOYEE }]);
    }
    if (text.includes('FROM notifications')) {
      return Promise.resolve([
        {
          id: NOTIFICATION_ID, user_id: USER, organization_id: ORG,
          type: 'SHIFT_PUBLISHED', resource_type: 'SHIFT',
          resource_id: '22222222-2222-4222-8222-222222222222', read_at: null,
          created_at: '2026-09-05T10:00:00.000Z',
        },
        {
          id: '33333333-3333-4333-8333-333333333333', user_id: USER, organization_id: ORG,
          type: 'CHANGE_REQUEST_RESOLVED', resource_type: 'CHANGE_REQUEST',
          resource_id: '44444444-4444-4444-8444-444444444444', read_at: '2026-09-05T09:00:00.000Z',
          created_at: '2026-09-05T09:00:00.000Z',
        },
      ]);
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

async function call({ token = TOKEN, method = 'GET' } = {}) {
  const res = response();
  await handler({ method, query: {}, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  state = { role: 'EMPLOYEE', sql: makeFakeSql() };
});

describe('GET /api/me/notifications', () => {
  it('returns own notifications and an unread count', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.notifications[0]).toMatchObject({
      id: NOTIFICATION_ID, userId: USER, organizationId: ORG, type: 'SHIFT_PUBLISHED', readAt: null,
    });
    const query = state.sql.calls.find((entry) => entry.text.includes('FROM notifications'));
    expect(query.text).toContain('user_id');
    expect(query.text).toContain('organization_id');
    expect(query.text).toContain('ORDER BY created_at DESC');
    expect(query.values).toEqual([USER, ORG]);
  });

  it('fails closed for anonymous and non-employee sessions', async () => {
    expect((await call({ token: null })).statusCode).toBe(401);
    expect(state.sql.calls.some((entry) => entry.text.includes('FROM notifications'))).toBe(false);
    state.role = 'ADMIN';
    expect((await call()).statusCode).toBe(403);
    expect(state.sql.calls.some((entry) => entry.text.includes('FROM notifications'))).toBe(false);
  });

  it('rejects non-GET requests', async () => {
    expect((await call({ method: 'POST' })).statusCode).toBe(405);
    expect(state.sql.calls).toHaveLength(0);
  });
});

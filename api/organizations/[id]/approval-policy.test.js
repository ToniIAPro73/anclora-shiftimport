import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-a';
const OTHER_ORG = 'org-b';
const ADMIN_TOKEN = 'policy-admin';
const EMPLOYEE_TOKEN = 'policy-employee';
const hash = (value) => createHash('sha256').update(value).digest('hex');
let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./approval-policy.js');

function makeSql() {
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.includes('FROM sessions')) {
      const user = values[0] === hash(ADMIN_TOKEN) ? { id: 'user-admin', role: 'ADMIN' }
        : values[0] === hash(EMPLOYEE_TOKEN) ? { id: 'user-employee', role: 'EMPLOYEE' } : null;
      return Promise.resolve(user ? [{ id: user.id, email: `${user.id}@test`, display_name: user.id }] : []);
    }
    if (text.includes('FROM memberships')) {
      const role = values[0] === 'user-admin' ? 'ADMIN' : 'EMPLOYEE';
      return Promise.resolve([{ organization_id: ORG, role, scoped_area_id: null, organization_name: 'Org A', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) return Promise.resolve([]);
    if (text.includes('FROM organizations')) return Promise.resolve([{ id: ORG, approval_policy: state.policy }]);
    if (text.startsWith('UPDATE organizations')) {
      state.policy = values[0];
      return Promise.resolve([{ id: ORG, approval_policy: state.policy }]);
    }
    return Promise.resolve([]);
  };
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

async function call({ token = ADMIN_TOKEN, id = ORG, method = 'GET', body } = {}) {
  const res = response();
  await handler({ method, query: { id }, body, headers: { cookie: `anclora_session=${token}` } }, res);
  return res;
}

beforeEach(() => {
  state = { policy: 'NO_APPROVAL', sql: makeSql() };
});

describe('/api/organizations/:id/approval-policy', () => {
  it('reads the default and updates a valid policy', async () => {
    expect((await call()).body).toEqual({ policy: 'NO_APPROVAL' });
    const updated = await call({ method: 'PUT', body: { policy: 'AREA_RESPONSIBLE' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.body).toEqual({ policy: 'AREA_RESPONSIBLE' });
  });

  it('rejects invalid policy and employee/cross-tenant access', async () => {
    expect((await call({ method: 'PUT', body: { policy: 'CUSTOM' } })).statusCode).toBe(400);
    expect((await call({ token: EMPLOYEE_TOKEN })).statusCode).toBe(403);
    expect((await call({ id: OTHER_ORG })).statusCode).toBe(404);
  });
});

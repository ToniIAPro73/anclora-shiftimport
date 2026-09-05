import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-a';
const AREA = 'area-a';
const ADMIN_TOKEN = 'responsibles-admin';
const EMPLOYEE_TOKEN = 'responsibles-employee';
const hash = (value) => createHash('sha256').update(value).digest('hex');
let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./responsibles.js');

function makeSql() {
  const responsibles = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.includes('FROM sessions')) {
      const user = values[0] === hash(ADMIN_TOKEN) ? { id: 'admin-1', role: 'ADMIN' }
        : values[0] === hash(EMPLOYEE_TOKEN) ? { id: 'employee-1', role: 'EMPLOYEE' } : null;
      return Promise.resolve(user ? [{ id: user.id, email: `${user.id}@test`, display_name: user.id }] : []);
    }
    if (text.startsWith('SELECT m.user_id')) {
      const userId = values[1];
      if (userId === 'admin-1') return Promise.resolve([{ user_id: userId, email: 'admin@test', display_name: 'Admin' }]);
      return Promise.resolve([]);
    }
    if (text.includes('FROM memberships')) {
      const role = values[0] === 'employee-1' ? 'EMPLOYEE' : 'ADMIN';
      return Promise.resolve([{ organization_id: ORG, role, scoped_area_id: null, organization_name: 'Org A', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) return Promise.resolve([]);
    if (text.startsWith('SELECT id FROM areas')) return Promise.resolve(values[0] === AREA ? [{ id: AREA }] : []);
    if (text.startsWith('SELECT ar.user_id')) return Promise.resolve(responsibles.map((userId) => ({ user_id: userId, email: 'admin@test', display_name: 'Admin' })));
    if (text.startsWith('INSERT INTO area_responsibles')) { responsibles.push(values[1]); return Promise.resolve([]); }
    if (text.startsWith('DELETE FROM area_responsibles')) {
      const index = responsibles.indexOf(values[1]);
      if (index < 0) return Promise.resolve([]);
      responsibles.splice(index, 1);
      return Promise.resolve([{ user_id: values[1] }]);
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

async function call({ token = ADMIN_TOKEN, method = 'GET', body } = {}) {
  const res = response();
  await handler({ method, query: { id: AREA }, body, headers: { cookie: `anclora_session=${token}` } }, res);
  return res;
}

beforeEach(() => { state = { sql: makeSql() }; });

describe('/api/areas/:id/responsibles', () => {
  it('lists, assigns and removes an organization admin', async () => {
    expect((await call()).body.responsibles).toEqual([]);
    const added = await call({ method: 'POST', body: { userId: 'admin-1' } });
    expect(added.statusCode).toBe(201);
    expect(added.body.responsible.userId).toBe('admin-1');
    const removed = await call({ method: 'DELETE', body: { userId: 'admin-1' } });
    expect(removed.statusCode).toBe(200);
    expect(removed.body.removed).toBe(true);
  });

  it('fails closed for employees, unknown areas and non-admin users', async () => {
    expect((await call({ token: EMPLOYEE_TOKEN })).statusCode).toBe(403);
    expect((await call({ method: 'POST', body: { userId: 'employee-1' } })).statusCode).toBe(404);
    const unknownAreaResponse = response();
    await handler({ method: 'GET', query: { id: 'foreign-area' }, headers: { cookie: `anclora_session=${ADMIN_TOKEN}` } }, unknownAreaResponse);
    expect(unknownAreaResponse.statusCode).toBe(404);
  });
});

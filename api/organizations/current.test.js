import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const token = 'entitlement-token';
const tokenHash = createHash('sha256').update(token).digest('hex');
let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./current.js');

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

function makeSql({ plan = 'personal', activeEmployees = 1, member = true } = {}) {
  return (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.includes('FROM sessions')) {
      return Promise.resolve(values[0] === tokenHash ? [{ id: 'user-1', email: 'owner@example.com', display_name: 'Owner' }] : []);
    }
    if (text.includes('FROM memberships')) {
      return Promise.resolve(member ? [{
        organization_id: 'org-1', role: 'OWNER', scoped_area_id: null,
        organization_name: 'Personal Org', organization_plan: plan,
      }] : []);
    }
    if (text.includes('SELECT id FROM employees')) {
      return Promise.resolve([]);
    }
    if (text.includes('active_employees')) {
      return Promise.resolve([{ active_employees: activeEmployees }]);
    }
    return Promise.resolve([]);
  };
}

describe('GET /api/organizations/current entitlement', () => {
  it('derives the descriptor from the session organization and ignores client plan input', async () => {
    state = { sql: makeSql({ plan: 'personal', activeEmployees: 1 }) };
    const res = makeRes();
    await handler({ method: 'GET', headers: { cookie: `anclora_session=${token}`, 'x-plan': 'team' }, body: { plan: 'team' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.entitlement).toEqual({
      planId: 'personal',
      features: { multiEmployeeImport: false, teamManagement: false, fullHistory: true },
      limits: { maxEmployees: 1, maxMonthlyImports: null },
      usage: { activeEmployees: 1 },
    });
  });

  it('rejects unauthenticated access', async () => {
    state = { sql: makeSql() };
    const res = makeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('does not create an organization context for a user without membership', async () => {
    state = { sql: makeSql({ member: false }) };
    const res = makeRes();
    await handler({ method: 'GET', headers: { cookie: `anclora_session=${token}` } }, res);
    expect(res.statusCode).toBe(400);
  });
});

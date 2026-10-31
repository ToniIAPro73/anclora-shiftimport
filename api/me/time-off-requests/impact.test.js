import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'impact-token';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});
const { default: handler } = await import('./impact.js');

function makeFakeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) return Promise.resolve(values[0] === tokenHash(TOKEN) ? [{ id: USER, email: 'e@example.com', display_name: 'E' }] : []);
    if (text.includes('FROM memberships m JOIN organizations')) return Promise.resolve([{ organization_id: ORG, role: 'EMPLOYEE', scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    if (text.includes('FROM employees') && text.includes('user_id =')) return Promise.resolve(state.linked ? [{ id: EMPLOYEE }] : []);
    if (text.includes('FROM shifts')) return Promise.resolve([{ count: 2 }]);
    if (text.includes('FROM shift_assignments sa')) return Promise.resolve([{ count: 1 }]);
    if (text.includes('FROM time_off_requests')) return Promise.resolve([{ id: 'o1', start_date: '2099-08-10', end_date: '2099-08-13', status: 'PENDING' }]);
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}
function response() {
  return { statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(n, v) { this.headers[n.toLowerCase()] = v; return this; }, send(p) { this.body = JSON.parse(p); return this; } };
}
async function call({ method = 'GET', query = { startDate: '2099-08-12', endDate: '2099-08-18' }, token = TOKEN } = {}) {
  const res = response();
  await handler({ method, query, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}
beforeEach(() => { process.env.TIME_OFF_ENABLED = 'true'; state = { linked: true, sql: makeFakeSql() }; });
afterEach(() => { delete process.env.TIME_OFF_ENABLED; });

describe('GET /api/me/time-off-requests/impact', () => {
  it('is 404 and silent while the flag is off', async () => {
    delete process.env.TIME_OFF_ENABLED;
    expect((await call()).statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
  });

  it('reports what the range touches, SELF-scoped: org + employee bound into every query', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ publishedShifts: 2, draftAssignments: 1, overlapsOwn: [{ id: 'o1', startDate: '2099-08-10', endDate: '2099-08-13', status: 'PENDING' }] });
    const reads = state.sql.calls.filter((c) => /FROM (shifts|shift_assignments sa|time_off_requests)/.test(c.text));
    expect(reads).toHaveLength(3);
    for (const read of reads) {
      expect(read.values).toContain(ORG);
      expect(read.values).toContain(EMPLOYEE);
    }
  });

  it('400 on a bad range, 422 TIME_OFF_PAST_DATE, 422 TIME_OFF_RANGE_TOO_LONG — before reading anything', async () => {
    expect((await call({ query: { startDate: '2099-08-18', endDate: '2099-08-12' } })).statusCode).toBe(400);
    expect((await call({ query: {} })).statusCode).toBe(400);
    expect((await call({ query: { startDate: '2020-01-01', endDate: '2020-01-02' } })).body.code).toBe('TIME_OFF_PAST_DATE');
    expect((await call({ query: { startDate: '2099-01-01', endDate: '2100-06-01' } })).body.code).toBe('TIME_OFF_RANGE_TOO_LONG');
    expect(state.sql.calls.some((c) => /FROM (shifts|shift_assignments sa)/.test(c.text))).toBe(false);
  });

  it('403 EMPLOYEE_LINK_REQUIRED, 401 anonymous, 405 non-GET', async () => {
    state.linked = false;
    expect((await call()).body.code).toBe('EMPLOYEE_LINK_REQUIRED');
    state.linked = true;
    expect((await call({ token: null })).statusCode).toBe(401);
    expect((await call({ method: 'POST' })).statusCode).toBe(405);
  });
});

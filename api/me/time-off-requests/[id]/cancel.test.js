import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'cancel-token';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
let state;

vi.mock('../../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});
const { default: handler } = await import('./cancel.js');

const cancelledRow = () => ({
  id: REQUEST_ID, request_type: 'VACATION', start_date: '2099-08-12', end_date: '2099-08-18', requested_days: 7, comment: '',
  status: 'CANCELLED', created_at: '2026-11-02T10:00:00.000Z', resolved_at: null, rejection_reason: null,
  applied_start_date: null, applied_days: null, cancelled_at: '2026-11-03T09:00:00.000Z',
});

function makeFakeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) return Promise.resolve(values[0] === tokenHash(TOKEN) ? [{ id: USER, email: 'e@example.com', display_name: 'E' }] : []);
    if (text.includes('FROM memberships m JOIN organizations')) return Promise.resolve([{ organization_id: ORG, role: 'EMPLOYEE', scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    if (text.includes('FROM employees') && text.includes('user_id =')) return Promise.resolve(state.linked ? [{ id: EMPLOYEE }] : []);
    if (text.includes('SELECT id FROM time_off_requests')) return Promise.resolve(state.exists ? [{ id: REQUEST_ID }] : []);
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => Promise.all(build((strings, ...values) => {
    calls.push({ text: strings.join(' ? ').replace(/\s+/g, ' ').trim(), values, transaction: true });
    return Promise.resolve(state.cancelled ? [cancelledRow()] : []);
  }));
  sql.calls = calls;
  return sql;
}
function response() {
  return { statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(n, v) { this.headers[n.toLowerCase()] = v; return this; }, send(p) { this.body = JSON.parse(p); return this; } };
}
async function call({ method = 'POST', id = REQUEST_ID, token = TOKEN } = {}) {
  const res = response();
  await handler({ method, query: { id }, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}
beforeEach(() => { process.env.TIME_OFF_ENABLED = 'true'; state = { linked: true, cancelled: true, exists: false, sql: makeFakeSql() }; });
afterEach(() => { delete process.env.TIME_OFF_ENABLED; });

describe('POST /api/me/time-off-requests/:id/cancel', () => {
  it('is 404 and silent while the flag is off', async () => {
    delete process.env.TIME_OFF_ENABLED;
    expect((await call()).statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
  });

  it('cancels an own PENDING request and mirrors the state on the approval envelope, in one statement', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.request).toMatchObject({ id: REQUEST_ID, status: 'CANCELLED' });
    expect(res.body.request.history.map((e) => e.type)).toEqual(['CREATED', 'CANCELLED']);
    const tx = state.sql.calls.find((c) => c.transaction);
    expect(tx.text).toContain("UPDATE time_off_requests SET status = 'CANCELLED'");
    expect(tx.text).toContain("status = 'PENDING'");
    expect(tx.text).toContain('UPDATE approval_requests ar SET status = \'CANCELLED\'');
    expect(tx.values).toEqual([REQUEST_ID, ORG, EMPLOYEE, ORG]);
  });

  it("someone else's (or a non-existent) request is a 404 — the existence check is scoped to the requester too", async () => {
    state.cancelled = false;
    const res = await call();
    expect(res.statusCode).toBe(404);
    const lookup = state.sql.calls.find((c) => c.text.includes('SELECT id FROM time_off_requests'));
    expect(lookup.values).toEqual([REQUEST_ID, ORG, EMPLOYEE]);
  });

  it('409 TIME_OFF_NOT_PENDING when it is already resolved', async () => {
    state.cancelled = false;
    state.exists = true;
    const res = await call();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('TIME_OFF_NOT_PENDING');
  });

  it('a malformed id is a 404 before any database access', async () => {
    const res = await call({ id: 'not-a-uuid' });
    expect(res.statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
  });

  it('403 EMPLOYEE_LINK_REQUIRED, 401 anonymous, 405 non-POST', async () => {
    state.linked = false;
    expect((await call()).body.code).toBe('EMPLOYEE_LINK_REQUIRED');
    state.linked = true;
    expect((await call({ token: null })).statusCode).toBe(401);
    expect((await call({ method: 'GET' })).statusCode).toBe(405);
  });
});

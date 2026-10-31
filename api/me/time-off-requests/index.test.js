import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const APPROVER = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const ENVELOPE_ID = '66666666-6666-4666-8666-666666666666';
const TOKEN = 'time-off-token';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./index.js');

const createdRow = (patch = {}) => ({
  id: REQUEST_ID, organization_id: ORG, employee_id: EMPLOYEE, request_type: 'VACATION', start_date: '2099-08-12', end_date: '2099-08-18',
  requested_days: 7, comment: 'Verano', status: 'PENDING', created_at: '2026-11-02T10:00:00.000Z', resolved_at: null,
  rejection_reason: null, applied_start_date: null, applied_days: null, cancelled_at: null,
  area_id: null, employee_user_id: USER, approval_request_id: ENVELOPE_ID, policy_snapshot: 'ORGANIZATION_ADMIN', ...patch,
});

function makeFakeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) return Promise.resolve(values[0] === tokenHash(TOKEN) ? [{ id: USER, email: 'e@example.com', display_name: 'Empleada' }] : []);
    if (text.includes('FROM memberships m JOIN organizations')) {
      return Promise.resolve([{ organization_id: ORG, role: state.role, scoped_area_id: null, planner_scope_type: state.role === 'PLANNER' ? 'ORGANIZATION' : null, organization_name: 'Org', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees') && text.includes('user_id =')) return Promise.resolve(state.linked ? [{ id: EMPLOYEE }] : []);
    if (text.includes('FROM operational_assignments') && text.includes('PLANNER_AREA')) return Promise.resolve([]);
    if (text.includes('FROM memberships m LEFT JOIN employees')) {
      return Promise.resolve([{ user_id: APPROVER, role: 'ADMIN', scoped_area_id: null, planner_scope_type: null, employee_id: null }]);
    }
    if (text.includes('FROM time_off_requests t')) return Promise.resolve(state.listRows ?? []);
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => {
    const queries = build((strings, ...values) => {
      const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
      calls.push({ text, values, transaction: true });
      if (state.txError) return Promise.reject(state.txError);
      return Promise.resolve(state.txRows ?? []);
    });
    return Promise.all(queries);
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

async function call({ method = 'GET', body, query = {}, token = TOKEN } = {}) {
  const res = response();
  await handler({ method, body, query, headers: { cookie: token ? `anclora_session=${token}` : '' } }, res);
  return res;
}

beforeEach(() => {
  process.env.TIME_OFF_ENABLED = 'true';
  state = { role: 'EMPLOYEE', linked: true, sql: makeFakeSql(), txRows: [createdRow()] };
});
afterEach(() => { delete process.env.TIME_OFF_ENABLED; vi.restoreAllMocks(); });

const body = (patch = {}) => ({ requestType: 'VACATION', startDate: '2099-08-12', endDate: '2099-08-18', comment: 'Verano', ...patch });

describe('flag OFF ⇒ the route does not exist (APP_BEHAVIOUR_IDENTICAL_TO_PRE_F2)', () => {
  it.each(['GET', 'POST', 'PUT'])('%s answers 404 and touches neither the session nor the database', async (method) => {
    delete process.env.TIME_OFF_ENABLED;
    const res = await call({ method, body: body() });
    expect(res.statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
  });

  it('anything but the literal "true" keeps it OFF', async () => {
    process.env.TIME_OFF_ENABLED = '1';
    expect((await call()).statusCode).toBe(404);
  });
});

describe('POST /api/me/time-off-requests', () => {
  it('creates a PENDING request atomically with its approval envelope and returns 201', async () => {
    const res = await call({ method: 'POST', body: body() });
    expect(res.statusCode).toBe(201);
    expect(res.body.request).toMatchObject({ id: REQUEST_ID, requestType: 'VACATION', startDate: '2099-08-12', endDate: '2099-08-18', requestedDays: 7, status: 'PENDING', comment: 'Verano' });
    expect(res.body.request).not.toHaveProperty('appliedDays');
    const tx = state.sql.calls.find((c) => c.transaction);
    expect(tx.text).toContain('INSERT INTO time_off_requests');
    expect(tx.text).toContain('INSERT INTO approval_requests (organization_id, time_off_request_id, status, policy_snapshot)');
  });

  it('SELF by construction: organisation, employee and requester come from the session, never from the body', async () => {
    await call({ method: 'POST', body: body({ employeeId: 'victim-employee', organizationId: 'victim-org', requestedByUserId: 'victim-user' }) });
    const tx = state.sql.calls.find((c) => c.transaction);
    expect(tx.values).toContain(ORG);
    expect(tx.values).toContain(EMPLOYEE);
    expect(tx.values).toContain(USER);
    for (const forbidden of ['victim-employee', 'victim-org', 'victim-user']) expect(tx.values).not.toContain(forbidden);
    expect(tx.text).toContain('e.id = ? AND e.organization_id = ? AND e.status = \'active\'');
  });

  it('notifies only the approvers eligible by scope + policy, after commit', async () => {
    await call({ method: 'POST', body: body() });
    const notification = state.sql.calls.find((c) => c.text.includes('INSERT INTO notifications'));
    expect(notification.values).toContain(ORG);
    expect(notification.values).toContain(ENVELOPE_ID);
    expect(notification.values.some((v) => Array.isArray(v) && v.includes(APPROVER))).toBe(true);
    expect(state.sql.calls.some((c) => c.text.includes("'time_off_request.created'") || c.values.includes('time_off_request.created'))).toBe(true);
  });

  it('a requester who is also the approver is never notified (anti-self-approval)', async () => {
    state.txRows = [createdRow({ employee_user_id: APPROVER })];
    await call({ method: 'POST', body: body() });
    const notification = state.sql.calls.find((c) => c.text.includes('INSERT INTO notifications'));
    expect(notification).toBeUndefined(); // the only manager is the requester ⇒ no recipient
  });

  it('allows an ADMIN/OWNER/PLANNER who is also a linked employee to request their own time off (§3.4: no role check)', async () => {
    for (const role of ['OWNER', 'ADMIN', 'PLANNER']) {
      state.role = role;
      expect((await call({ method: 'POST', body: body() })).statusCode).toBe(201);
    }
  });

  it('403 EMPLOYEE_LINK_REQUIRED without an active linked employee, without writing', async () => {
    state.linked = false;
    const res = await call({ method: 'POST', body: body() });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_LINK_REQUIRED');
    expect(state.sql.calls.some((c) => c.transaction)).toBe(false);
  });

  it('401 anonymous, 405 for other verbs', async () => {
    expect((await call({ method: 'POST', body: body(), token: null })).statusCode).toBe(401);
    expect((await call({ method: 'DELETE' })).statusCode).toBe(405);
  });

  it.each([
    ['SICK_LEAVE', 'TIME_OFF_TYPE_NOT_ENABLED'], ['PERMISSION', 'TIME_OFF_TYPE_NOT_ENABLED'], ['OTHER', 'TIME_OFF_TYPE_NOT_ENABLED'],
  ])('422 %s ⇒ %s (the DB catalogue allows it, the server allow-list does not)', async (requestType, code) => {
    const res = await call({ method: 'POST', body: body({ requestType }) });
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe(code);
    expect(state.sql.calls.some((c) => c.transaction)).toBe(false);
  });

  it('422 TIME_OFF_PAST_DATE, 422 TIME_OFF_RANGE_TOO_LONG, 400 INVALID_INPUT', async () => {
    expect((await call({ method: 'POST', body: body({ startDate: '2020-01-01', endDate: '2020-01-05' }) })).body.code).toBe('TIME_OFF_PAST_DATE');
    expect((await call({ method: 'POST', body: body({ startDate: '2099-01-01', endDate: '2100-06-01' }) })).body.code).toBe('TIME_OFF_RANGE_TOO_LONG');
    const invalid = await call({ method: 'POST', body: body({ endDate: 'mañana' }) });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body.code).toBe('INVALID_INPUT');
  });

  it('409 TIME_OFF_OVERLAP when PostgreSQL raises the exclusion violation (SQLSTATE 23P01)', async () => {
    state.txError = Object.assign(new Error('conflicting key value violates exclusion constraint'), { code: '23P01' });
    const res = await call({ method: 'POST', body: body() });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('TIME_OFF_OVERLAP');
    expect(state.sql.calls.some((c) => c.text.includes('INSERT INTO notifications'))).toBe(false);
  });

  it('other database errors are not disguised as overlaps (500, no internals leaked)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.txError = Object.assign(new Error('boom'), { code: '08006' });
    const res = await call({ method: 'POST', body: body() });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Unexpected API error');
  });
});

describe('GET /api/me/time-off-requests', () => {
  const row = (patch) => ({ ...createdRow(), ...patch });

  it('scopes the read to the session organisation and employee and the requested year', async () => {
    state.listRows = [row({ id: 'a', status: 'APPROVED', applied_days: 5, requested_days: 7, resolved_at: '2099-08-01T00:00:00.000Z' }), row({ id: 'b', status: 'PENDING', start_date: '2099-12-01', end_date: '2099-12-03', requested_days: 3 })];
    const res = await call({ query: { year: '2099' } });
    expect(res.statusCode).toBe(200);
    const query = state.sql.calls.find((c) => c.text.includes('FROM time_off_requests t'));
    expect(query.text).toContain('t.organization_id = ?');
    expect(query.text).toContain('t.employee_id = ?');
    expect(query.values).toEqual([ORG, EMPLOYEE, 2099]);
    expect(res.body.requests.map((r) => r.id)).toEqual(['a', 'b']);
    // approvedDaysInYear counts the really applied days (OD-08), pending counts the requested ones
    expect(res.body.summary).toEqual({ approvedDaysInYear: 5, pendingDays: 3, activeCount: 2 });
    expect(res.body.requests[0]).toMatchObject({ appliedDays: 5, skippedPastDays: 2 });
  });

  it('filters by status after computing the year summary, and validates both filters', async () => {
    state.listRows = [row({ id: 'a', status: 'APPROVED', applied_days: 7 }), row({ id: 'b', status: 'CANCELLED', start_date: '2099-09-01', end_date: '2099-09-02', requested_days: 2 })];
    const filtered = await call({ query: { status: 'cancelled', year: '2099' } });
    expect(filtered.body.requests.map((r) => r.id)).toEqual(['b']);
    expect(filtered.body.summary.activeCount).toBe(1);
    expect((await call({ query: { status: 'DONE' } })).statusCode).toBe(400);
    expect((await call({ query: { year: 'x' } })).statusCode).toBe(400);
  });

  it('403 EMPLOYEE_LINK_REQUIRED for a user without a linked employee', async () => {
    state.linked = false;
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_LINK_REQUIRED');
  });
});

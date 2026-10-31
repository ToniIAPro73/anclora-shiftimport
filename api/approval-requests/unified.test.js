import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = '11111111-1111-4111-8111-111111111111';
const ENVELOPE = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'unified-token';
const hash = (v) => createHash('sha256').update(v).digest('hex');
let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});
const timeOff = vi.hoisted(() => ({
  listTimeOffApprovals: vi.fn(), approveTimeOffRequest: vi.fn(), rejectTimeOffRequest: vi.fn(),
}));
vi.mock('../_lib/time-off-approvals.js', async (importOriginal) => ({ ...(await importOriginal()), ...timeOff }));

const { default: index } = await import('./index.js');
const { default: approve } = await import('./[id]/approve.js');
const { default: reject } = await import('./[id]/reject.js');

function makeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) return Promise.resolve(values[0] === hash(TOKEN) ? [{ id: 'admin-1', email: 'a@test', display_name: 'Admin' }] : []);
    if (text.includes('FROM memberships')) return Promise.resolve([{ organization_id: ORG, role: 'ADMIN', scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    return Promise.resolve([]);
  };
  sql.transaction = async (build) => Promise.all(build((s, ...v) => { calls.push({ text: s.join(' ? '), values: v, transaction: true }); return Promise.resolve([]); }));
  sql.calls = calls;
  return sql;
}
const response = () => ({ statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(n, v) { this.headers[n.toLowerCase()] = v; return this; }, send(p) { this.body = JSON.parse(p); return this; } });
const call = async (handler, req) => { const res = response(); await handler({ headers: { cookie: `anclora_session=${TOKEN}` }, query: {}, ...req }, res); return res; };

beforeEach(() => {
  state = { sql: makeSql() };
  Object.values(timeOff).forEach((fn) => fn.mockReset());
  timeOff.listTimeOffApprovals.mockResolvedValue({ requests: [{ kind: 'TIME_OFF', id: 'e1', createdAt: '2026-11-03T10:00:00.000Z' }], nextCursor: null });
});
afterEach(() => { delete process.env.TIME_OFF_ENABLED; });

describe('GET /api/approval-requests — kind discriminator and compatibility', () => {
  it('without `kind` the legacy response is untouched and the time-off module is never consulted (flag on or off)', async () => {
    for (const flag of [undefined, 'true']) {
      if (flag) process.env.TIME_OFF_ENABLED = flag; else delete process.env.TIME_OFF_ENABLED;
      const res = await call(index, { method: 'GET', query: { status: 'pending' } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ requests: [] });
    }
    expect(timeOff.listTimeOffApprovals).not.toHaveBeenCalled();
  });

  it('kind=TIME_OFF with the flag OFF is 404 and touches nothing', async () => {
    const res = await call(index, { method: 'GET', query: { kind: 'TIME_OFF' } });
    expect(res.statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
    expect(timeOff.listTimeOffApprovals).not.toHaveBeenCalled();
  });

  it('kind=ALL with the flag OFF returns only the (tagged) shift changes', async () => {
    const res = await call(index, { method: 'GET', query: { kind: 'ALL' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.requests).toEqual([]);
    expect(timeOff.listTimeOffApprovals).not.toHaveBeenCalled();
  });

  it('kind=TIME_OFF with the flag ON delegates to the scope-filtered reader and returns only its items', async () => {
    process.env.TIME_OFF_ENABLED = 'true';
    const res = await call(index, { method: 'GET', query: { kind: 'time_off', status: 'history', limit: '10' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.requests.map((r) => r.kind)).toEqual(['TIME_OFF']);
    const [, , query] = timeOff.listTimeOffApprovals.mock.calls[0];
    expect(query).toMatchObject({ kind: 'TIME_OFF', status: 'HISTORY', limit: 10 });
  });

  it.each([[{ kind: 'NOPE' }], [{ kind: 'TIME_OFF', status: 'DONE' }], [{ kind: 'ALL', limit: '1000' }], [{ kind: 'ALL', areaId: 'not-a-uuid' }]])('rejects invalid parameters %j with 400', async (query) => {
    process.env.TIME_OFF_ENABLED = 'true';
    expect((await call(index, { method: 'GET', query })).statusCode).toBe(400);
  });
});

describe('approve / reject dispatch by subject', () => {
  const post = (handler, body) => call(handler, { method: 'POST', query: { id: ENVELOPE }, body });

  it('flag OFF: the time-off branch is never entered (a time-off envelope falls through to the legacy 404)', async () => {
    expect((await post(approve)).statusCode).toBe(404);
    expect((await post(reject, { reason: 'no' })).statusCode).toBe(404);
    expect(timeOff.approveTimeOffRequest).not.toHaveBeenCalled();
    expect(timeOff.rejectTimeOffRequest).not.toHaveBeenCalled();
  });

  it('flag ON + time-off subject: 200 with the materialisation result; the legacy SQL is not run', async () => {
    process.env.TIME_OFF_ENABLED = 'true';
    timeOff.approveTimeOffRequest.mockResolvedValue({ approvalRequest: { id: ENVELOPE, status: 'APPROVED' }, materializedDays: 5 });
    const res = await post(approve);
    expect(res.statusCode).toBe(200);
    expect(res.body.materializedDays).toBe(5);
    expect(state.sql.calls.some((c) => c.transaction)).toBe(false);
  });

  it('flag ON + another subject (module answers null): the legacy path runs unchanged', async () => {
    process.env.TIME_OFF_ENABLED = 'true';
    timeOff.approveTimeOffRequest.mockResolvedValue(null);
    timeOff.rejectTimeOffRequest.mockResolvedValue(null);
    expect((await post(approve)).statusCode).toBe(404);
    expect((await post(reject, { reason: 'no' })).statusCode).toBe(404);
    expect(state.sql.calls.filter((c) => c.transaction)).toHaveLength(2); // the legacy compare-and-set statements
  });

  it('keeps the legacy 409 shape (decision by/at) and the lowercase self_approval_forbidden code', async () => {
    process.env.TIME_OFF_ENABLED = 'true';
    const conflict = Object.assign(new Error('Approval request is no longer pending'), { status: 409, decision: { by: 'Ana', at: '2026-11-03T10:00:00.000Z' } });
    timeOff.approveTimeOffRequest.mockRejectedValue(conflict);
    const res = await post(approve);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Approval request is no longer pending', decision: { by: 'Ana', at: '2026-11-03T10:00:00.000Z' } });
    timeOff.rejectTimeOffRequest.mockRejectedValue(Object.assign(new Error('You cannot approve your own request'), { status: 403, code: 'self_approval_forbidden' }));
    const forbidden = await post(reject, { reason: 'no' });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.body.code).toBe('self_approval_forbidden');
  });

  it('a reject without a reason is still 400 before any database or time-off access', async () => {
    process.env.TIME_OFF_ENABLED = 'true';
    expect((await post(reject, { reason: '   ' })).statusCode).toBe(400);
    expect(timeOff.rejectTimeOffRequest).not.toHaveBeenCalled();
  });
});

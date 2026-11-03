import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'bulk-token';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const hash = (v) => createHash('sha256').update(v).digest('hex');
let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});
const timeOff = vi.hoisted(() => ({ approveTimeOffRequest: vi.fn() }));
vi.mock('../_lib/time-off-approvals.js', async (importOriginal) => ({ ...(await importOriginal()), ...timeOff }));

const { default: handler, BULK_APPROVE_MAX } = await import('./bulk-approve.js');

function makeSql(role) {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) return Promise.resolve(values[0] === hash(TOKEN) ? [{ id: 'user-1', email: 'a@test', display_name: 'Admin' }] : []);
    if (text.includes('FROM memberships')) return Promise.resolve([{ organization_id: ORG, role, scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    if (text.includes('FROM approval_requests') && text.includes('change_request_id IS NOT NULL')) {
      return Promise.resolve(state.shiftChangeIds.includes(values[0]) ? [{ found: 1 }] : []);
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  return sql;
}
const response = () => ({ statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(n, v) { this.headers[n.toLowerCase()] = v; return this; }, send(p) { this.body = JSON.parse(p); return this; } });
const call = async (body, { method = 'POST' } = {}) => {
  const res = response();
  await handler({ method, headers: { cookie: `anclora_session=${TOKEN}` }, query: {}, body }, res);
  return res;
};
const httpError = (status, message, code, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });

beforeEach(() => {
  process.env.TIME_OFF_ENABLED = 'true';
  state = { sql: makeSql('ADMIN'), shiftChangeIds: [] };
  timeOff.approveTimeOffRequest.mockReset();
});
afterEach(() => { delete process.env.TIME_OFF_ENABLED; });

describe('POST /api/approval-requests/bulk-approve', () => {
  it('is a 404 with the flag off and touches nothing', async () => {
    delete process.env.TIME_OFF_ENABLED;
    const res = await call({ ids: [A] });
    expect(res.statusCode).toBe(404);
    expect(state.sql.calls).toHaveLength(0);
  });

  it('rejects anything but POST', async () => {
    expect((await call({ ids: [A] }, { method: 'GET' })).statusCode).toBe(405);
  });

  it('EMPLOYEE (and any non-manager role) is forbidden before any decision', async () => {
    state.sql = makeSql('EMPLOYEE');
    const res = await call({ ids: [A] });
    expect(res.statusCode).toBe(403);
    expect(timeOff.approveTimeOffRequest).not.toHaveBeenCalled();
  });

  it.each([
    [undefined], [{}], [{ ids: 'x' }], [{ ids: [] }], [{ ids: [1] }], [{ ids: Array.from({ length: BULK_APPROVE_MAX + 1 }, () => A) }],
  ])('rejects the invalid input %j with 400 and decides nothing', async (body) => {
    const res = await call(body);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(timeOff.approveTimeOffRequest).not.toHaveBeenCalled();
  });

  it('accepts exactly 50 ids (the upper bound)', async () => {
    timeOff.approveTimeOffRequest.mockResolvedValue({ requestedDays: 1, materializedDays: 1, skippedPastDays: 0 });
    const ids = Array.from({ length: BULK_APPROVE_MAX }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const res = await call({ ids });
    expect(res.statusCode).toBe(200);
    expect(res.body.summary).toEqual({ requested: 50, approved: 50, failed: 0 });
  });

  it('returns a structured PARTIAL result: valid items are approved, ineligible ones fail with their own status and code', async () => {
    state.shiftChangeIds = [D];
    timeOff.approveTimeOffRequest.mockImplementation(async (_sql, _ctx, id) => {
      if (id === A) return { requestedDays: 5, materializedDays: 3, skippedPastDays: 2 };
      if (id === B) throw httpError(403, 'You cannot approve your own request', 'self_approval_forbidden');
      if (id === C) throw httpError(409, 'Approval request is no longer pending', undefined, { decision: { by: 'X', at: 'now' } });
      return null; // D is a shift change (not a time-off subject)
    });
    const res = await call({ ids: [A, B, C, D] });
    expect(res.statusCode).toBe(200);
    expect(res.body.results).toEqual([
      { id: A, ok: true, status: 'APPROVED', requestedDays: 5, materializedDays: 3, skippedPastDays: 2 },
      { id: B, ok: false, status: 403, code: 'self_approval_forbidden' },
      { id: C, ok: false, status: 409, code: 'ALREADY_RESOLVED', decision: { by: 'X', at: 'now' } },
      { id: D, ok: false, status: 422, code: 'BULK_KIND_UNSUPPORTED' },
    ]);
    expect(res.body.summary).toEqual({ requested: 4, approved: 1, failed: 3 });
    // every item went through the SAME single-approval function, one at a time
    expect(timeOff.approveTimeOffRequest.mock.calls.map((c) => c[2])).toEqual([A, B, C, D]);
  });

  it('out-of-scope or unknown ids are a 404 per item (no data about them), and a malformed id never reaches the database', async () => {
    timeOff.approveTimeOffRequest.mockResolvedValue(null);
    const res = await call({ ids: [A, 'not-a-uuid'] });
    expect(res.body.results).toEqual([
      { id: A, ok: false, status: 404, code: 'NOT_FOUND' },
      { id: 'not-a-uuid', ok: false, status: 404, code: 'NOT_FOUND' },
    ]);
    expect(timeOff.approveTimeOffRequest).toHaveBeenCalledTimes(1);
  });

  it('a shift-change lookup is tenant-bound', async () => {
    timeOff.approveTimeOffRequest.mockResolvedValue(null);
    await call({ ids: [A] });
    const lookup = state.sql.calls.find((c) => c.text.includes('change_request_id IS NOT NULL'));
    expect(lookup.text).toContain('organization_id =');
    expect(lookup.values).toContain(ORG);
  });

  it('duplicated ids are decided once; an unexpected failure of one item does not stop the others nor leak its message', async () => {
    timeOff.approveTimeOffRequest
      .mockRejectedValueOnce(new Error('connection reset to db.internal:5432'))
      .mockResolvedValueOnce({ requestedDays: 1, materializedDays: 1, skippedPastDays: 0 });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ ids: [A, A, B] });
    spy.mockRestore();
    expect(res.body.results).toEqual([
      { id: A, ok: false, status: 500, code: 'ERROR' },
      { id: B, ok: true, status: 'APPROVED', requestedDays: 1, materializedDays: 1, skippedPastDays: 0 },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('db.internal');
  });

  it('an ineligible item is never "rolled up": a lone failure approves nothing else by itself', async () => {
    timeOff.approveTimeOffRequest.mockRejectedValue(httpError(403, 'nope', 'POLICY'));
    const res = await call({ ids: [A, B] });
    expect(res.body.summary).toEqual({ requested: 2, approved: 0, failed: 2 });
    expect(res.body.results.every((r) => r.ok === false && r.code === 'POLICY')).toBe(true);
  });
});

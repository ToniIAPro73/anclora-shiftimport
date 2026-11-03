import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'bulk-recon-token';
const hash = (v) => createHash('sha256').update(v).digest('hex');
let role;
const core = vi.hoisted(() => ({ keepCurrentForDays: vi.fn() }));

vi.mock('../../_lib/auth.js', async (importOriginal) => ({ ...(await importOriginal()), getSql: () => fakeSql }));
vi.mock('../../_lib/calendar.js', async (importOriginal) => ({ ...(await importOriginal()), ...core }));
const { default: handler } = await import('./bulk.js');

const fakeSql = (strings, ...values) => {
  const t = strings.join(' ? ').replace(/\s+/g, ' ').trim();
  if (t.includes('FROM sessions')) return Promise.resolve(values[0] === hash(TOKEN) ? [{ id: 'u1', email: 'a@t', display_name: 'A' }] : []);
  if (t.includes('FROM memberships')) return Promise.resolve([{ organization_id: ORG, role, scoped_area_id: null, organization_name: 'O', organization_plan: 'team' }]);
  return Promise.resolve([]);
};
const response = () => ({ statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, setHeader(n, v) { this.headers[n.toLowerCase()] = v; return this; }, send(p) { this.body = JSON.parse(p); return this; } });
const call = async (req) => { const res = response(); await handler({ headers: { cookie: `anclora_session=${TOKEN}` }, query: {}, ...req }, res); return res; };

beforeEach(() => { role = 'ADMIN'; core.keepCurrentForDays.mockReset(); });

describe('POST /api/calendar/reconciliation/bulk', () => {
  it('only accepts POST', async () => {
    const res = await call({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(core.keepCurrentForDays).not.toHaveBeenCalled();
  });
  it('delegates the body to the reconciliation core and returns its partial result untouched', async () => {
    const result = { employeeId: 'e', mode: 'apply', results: [{ date: '2026-11-10', ok: true }, { date: '2026-11-11', ok: false, status: 409, code: 'DAY_CHANGED' }], summary: { requested: 2, applied: 1, failed: 1 } };
    core.keepCurrentForDays.mockResolvedValue(result);
    const body = { employeeId: 'e', dates: ['2026-11-10', '2026-11-11'], action: 'KEEP_CURRENT', mode: 'apply', reason: 'x', dayTokens: { '2026-11-10': 't' } };
    const res = await call({ method: 'POST', body });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(result);
    expect(core.keepCurrentForDays.mock.calls[0][2]).toEqual(body);
    expect(core.keepCurrentForDays.mock.calls[0][1]).toMatchObject({ role: 'ADMIN', organizationId: ORG });
  });
  it('turns the core’s controlled errors into their HTTP status with a machine-readable code', async () => {
    core.keepCurrentForDays.mockRejectedValue(Object.assign(new Error('Only administrators can reconcile days'), { status: 403 }));
    role = 'EMPLOYEE';
    const res = await call({ method: 'POST', body: {} });
    expect(res.statusCode).toBe(403);
  });
});

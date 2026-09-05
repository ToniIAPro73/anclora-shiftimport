import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-approve';
const REQUEST = '11111111-1111-4111-8111-111111111111';
const ADMIN_TOKEN = 'approve-admin';
const AREA_TOKEN = 'approve-area';
const EMPLOYEE_TOKEN = 'approve-employee';
const hash = (value) => createHash('sha256').update(value).digest('hex');
let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./approve.js');

function makeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) {
      const user = values[0] === hash(ADMIN_TOKEN) ? { id: 'admin-1' }
        : values[0] === hash(AREA_TOKEN) ? { id: 'area-admin-1' }
          : values[0] === hash(EMPLOYEE_TOKEN) ? { id: 'employee-1' } : null;
      return Promise.resolve(user ? [{ id: user.id, email: `${user.id}@test`, display_name: user.id }] : []);
    }
    if (text.includes('FROM memberships')) {
      const role = values[0] === 'employee-1' ? 'EMPLOYEE' : 'ADMIN';
      return Promise.resolve([{ organization_id: ORG, role, scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) return Promise.resolve([]);
    if (text.includes('WITH eligible')) {
      const eligible = state.status === 'PENDING'
        && ((state.policy === 'ORGANIZATION_ADMIN' && state.caller === 'admin-1')
          || (state.policy === 'AREA_RESPONSIBLE' && state.caller === 'area-admin-1'));
      return Promise.resolve(eligible ? [{
        id: REQUEST,
        organization_id: ORG,
        change_request_id: 'change-1',
        status: 'APPROVED',
        policy_snapshot: state.policy,
        approved_by_user_id: state.caller,
        approved_at: '2026-09-05T12:00:00.000Z',
      }] : []);
    }
    if (text.startsWith('SELECT status')) {
      return Promise.resolve([{ status: state.status }]);
    }
    return Promise.resolve([]);
  };
  sql.calls = calls;
  sql.transaction = async (build) => Promise.all(build(sql));
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

async function call(token = ADMIN_TOKEN) {
  state.caller = token === AREA_TOKEN ? 'area-admin-1' : token === EMPLOYEE_TOKEN ? 'employee-1' : 'admin-1';
  const res = response();
  await handler({ method: 'POST', query: { id: REQUEST }, headers: { cookie: `anclora_session=${token}` } }, res);
  return res;
}

beforeEach(() => {
  state = { policy: 'ORGANIZATION_ADMIN', status: 'PENDING', caller: 'admin-1', sql: makeSql() };
});

describe('POST /api/approval-requests/:id/approve', () => {
  it('approves only an eligible organization admin', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.approvalRequest).toMatchObject({ id: REQUEST, status: 'APPROVED', approvedByUserId: 'admin-1' });
    expect(state.sql.calls.find((entry) => entry.text.includes('WITH eligible')).text).toContain("target.status = 'PENDING'");
  });

  it('rejects an ineligible caller and an already decided request', async () => {
    expect((await call(EMPLOYEE_TOKEN)).statusCode).toBe(403);
    state.status = 'APPROVED';
    expect((await call()).statusCode).toBe(409);
  });

  it('supports area responsibility and keeps malformed/cross-tenant ids closed', async () => {
    state.policy = 'AREA_RESPONSIBLE';
    expect((await call(AREA_TOKEN)).statusCode).toBe(200);
    const malformed = response();
    await handler({ method: 'POST', query: { id: 'not-a-uuid' }, headers: { cookie: `anclora_session=${ADMIN_TOKEN}` } }, malformed);
    expect(malformed.statusCode).toBe(404);
  });
});

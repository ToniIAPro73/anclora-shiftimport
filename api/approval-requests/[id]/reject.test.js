import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-reject';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const ADMIN_TOKEN = 'reject-admin';
const EMPLOYEE_TOKEN = 'reject-employee';
const hash = (value) => createHash('sha256').update(value).digest('hex');
let state;

vi.mock('../../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./reject.js');

function makeSql() {
  const calls = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    calls.push({ text, values });
    if (text.includes('FROM sessions')) {
      const user = values[0] === hash(ADMIN_TOKEN) ? 'admin-1'
        : values[0] === hash(EMPLOYEE_TOKEN) ? 'employee-1' : null;
      return Promise.resolve(user ? [{ id: user, email: `${user}@test`, display_name: user }] : []);
    }
    if (text.includes('FROM memberships')) {
      const role = values[0] === 'employee-1' ? 'EMPLOYEE' : 'ADMIN';
      return Promise.resolve([{ organization_id: ORG, role, scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) return Promise.resolve([]);
    if (text.includes('WITH eligible')) {
      const eligible = state.status === 'PENDING' && state.caller === 'admin-1';
      return Promise.resolve(eligible ? [{
        id: REQUEST,
        organization_id: ORG,
        change_request_id: 'change-1',
        status: 'REJECTED',
        policy_snapshot: 'ORGANIZATION_ADMIN',
        rejected_by_user_id: state.caller,
        rejected_at: '2026-09-05T12:00:00.000Z',
        rejection_reason: state.reason,
      }] : []);
    }
    if (text.startsWith('SELECT status')) return Promise.resolve([{ status: state.status }]);
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

async function call({ token = ADMIN_TOKEN, reason, method = 'POST' } = {}) {
  state.caller = token === EMPLOYEE_TOKEN ? 'employee-1' : 'admin-1';
  state.reason = reason;
  const res = response();
  await handler({ method, query: { id: REQUEST }, body: { reason }, headers: { cookie: `anclora_session=${token}` } }, res);
  return res;
}

beforeEach(() => {
  state = { status: 'PENDING', caller: 'admin-1', reason: 'Cambio no autorizado.', sql: makeSql() };
});

describe('POST /api/approval-requests/:id/reject', () => {
  it('rejects with an auditable reason for an eligible admin', async () => {
    const res = await call({ reason: 'Cambio no autorizado.' });
    expect(res.statusCode).toBe(200);
    expect(res.body.approvalRequest).toMatchObject({ id: REQUEST, status: 'REJECTED', rejectionReason: 'Cambio no autorizado.' });
    expect(state.sql.calls.find((entry) => entry.text.includes('WITH eligible')).text).toContain("UPDATE change_requests target");
  });

  it('rejects empty reasons before authentication or database writes', async () => {
    const res = await call({ reason: '  ' });
    expect(res.statusCode).toBe(400);
    expect(state.sql.calls).toHaveLength(0);
  });

  it('fails closed for an ineligible employee', async () => {
    const res = await call({ token: EMPLOYEE_TOKEN, reason: 'No procede.' });
    expect(res.statusCode).toBe(403);
  });

  it('returns conflict when the request is no longer pending', async () => {
    state.status = 'APPROVED';
    const res = await call({ reason: 'Ya no procede.' });
    expect(res.statusCode).toBe(409);
  });
});

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG = 'org-approve';
const REQUEST = '11111111-1111-4111-8111-111111111111';
const ADMIN_TOKEN = 'approve-admin';
const AREA_TOKEN = 'approve-area';
const EMPLOYEE_TOKEN = 'approve-employee';
const PLANNER_TOKEN = 'approve-planner';
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
          : values[0] === hash(PLANNER_TOKEN) ? { id: 'planner-1' }
            : values[0] === hash(EMPLOYEE_TOKEN) ? { id: 'employee-1' } : null;
      return Promise.resolve(user ? [{ id: user.id, email: `${user.id}@test`, display_name: user.id }] : []);
    }
    if (text.includes('FROM memberships')) {
      const role = values[0] === 'employee-1' ? 'EMPLOYEE' : values[0] === 'planner-1' ? 'PLANNER' : 'ADMIN';
      return Promise.resolve([{ organization_id: ORG, role, scoped_area_id: null, organization_name: 'Org', organization_plan: 'team' }]);
    }
    if (text.includes('FROM employees')) return Promise.resolve([]);
    if (text.includes('WITH eligible')) {
      const eligible = state.status === 'PENDING'
        && !state.isSelfApproval
        && ((state.policy === 'ORGANIZATION_ADMIN' && (state.caller === 'admin-1' || state.caller === 'planner-1'))
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
    if (text.startsWith('SELECT ar.status')) {
      return Promise.resolve([{
        status: state.status,
        employee_user_id: state.isSelfApproval ? state.caller : 'other-user',
        employee_id: state.isSelfApproval ? 'emp-self' : 'emp-other',
      }]);
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
  state.caller = token === AREA_TOKEN ? 'area-admin-1'
    : token === PLANNER_TOKEN ? 'planner-1'
      : token === EMPLOYEE_TOKEN ? 'employee-1' : 'admin-1';
  const res = response();
  await handler({ method: 'POST', query: { id: REQUEST }, headers: { cookie: `anclora_session=${token}` } }, res);
  return res;
}

beforeEach(() => {
  state = { policy: 'ORGANIZATION_ADMIN', status: 'PENDING', caller: 'admin-1', isSelfApproval: false, sql: makeSql() };
});

describe('POST /api/approval-requests/:id/approve', () => {
  it('approves only an eligible organization admin', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.approvalRequest).toMatchObject({ id: REQUEST, status: 'APPROVED', approvedByUserId: 'admin-1' });
    const approvalQuery = state.sql.calls.find((entry) => entry.text.includes('WITH eligible'));
    expect(approvalQuery.text).toContain("target.status = 'PENDING'");
    expect(approvalQuery.text).toContain('schedule_versions');
    expect(approvalQuery.text).toContain('shift_assignments');
    expect(approvalQuery.text).not.toContain("SET status = 'PUBLISHED'");
    const audit = state.sql.calls.find((entry) => entry.text.startsWith('INSERT INTO organization_audit_events'));
    expect(audit.values[2]).toBe('approval_request.approved');
    expect(JSON.parse(audit.values[5])).toMatchObject({ changeRequestId: 'change-1', policySnapshot: 'ORGANIZATION_ADMIN' });
  });

  it('allows PLANNER to approve in organization scope', async () => {
    const res = await call(PLANNER_TOKEN);
    expect(res.statusCode).toBe(200);
    expect(res.body.approvalRequest).toMatchObject({ id: REQUEST, status: 'APPROVED', approvedByUserId: 'planner-1' });
  });

  it('forbids self-approval with 403 self_approval_forbidden', async () => {
    state.isSelfApproval = true;
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('self_approval_forbidden');
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

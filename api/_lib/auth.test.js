import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseSessionToken, requireOrgContext, requireRole, resolveContext, SESSION_COOKIE } from './auth.js';

/**
 * Security-context tests (Fase 1.1): multi-org resolution must never pick
 * the first membership silently, expired/invalid sessions must fail closed.
 */

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

function makeAuthFakeSql({ session = null, memberships = [], employees = [] } = {}) {
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.includes('FROM sessions')) {
      return Promise.resolve(
        session && session.token_hash === values[0] && new Date(session.expires_at) > new Date()
          ? [{ id: session.user_id, email: 'u@example.com', display_name: 'U', expires_at: session.expires_at }]
          : [],
      );
    }
    if (text.includes('FROM memberships')) {
      return Promise.resolve(memberships.filter((m) => m.user_id === values[0]));
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve(employees.filter(
        (e) => e.organization_id === values[0] && e.user_id === values[1] && e.status === 'active',
      ));
    }
    return Promise.resolve([]);
  };
  return sql;
}

const reqWith = (token, orgHeader) => ({
  headers: {
    cookie: token ? `${SESSION_COOKIE}=${token}` : '',
    ...(orgHeader ? { 'x-organization-id': orgHeader } : {}),
  },
});

const TOKEN = 'tok-abc';
const baseSession = {
  token_hash: tokenHash(TOKEN),
  user_id: 'user-1',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
};
const membership = (org, role = 'EMPLOYEE') => ({
  user_id: 'user-1', organization_id: org, role,
  organization_name: `Org ${org}`,
});

describe('parseSessionToken', () => {
  it('extracts the session cookie', () => {
    expect(parseSessionToken(reqWith('abc123'))).toBe('abc123');
    expect(parseSessionToken({ headers: { cookie: 'other=1; anclora_session=xyz' } })).toBe('xyz');
    expect(parseSessionToken({ headers: {} })).toBeNull();
  });
});

describe('resolveContext — session validity', () => {
  it('no token → null', async () => {
    const sql = makeAuthFakeSql({ session: baseSession });
    expect(await resolveContext(reqWith(null), sql)).toBeNull();
  });

  it('expired session → null (fail closed)', async () => {
    const sql = makeAuthFakeSql({
      session: { ...baseSession, expires_at: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(await resolveContext(reqWith(TOKEN), sql)).toBeNull();
  });

  it('valid session resolves user and memberships', async () => {
    const sql = makeAuthFakeSql({ session: baseSession, memberships: [membership('org-1')] });
    const ctx = await resolveContext(reqWith(TOKEN), sql);
    expect(ctx.user.id).toBe('user-1');
    expect(ctx.memberships).toHaveLength(1);
  });
});

describe('resolveContext — multi-org', () => {
  it('single membership activates automatically', async () => {
    const sql = makeAuthFakeSql({
      session: baseSession,
      memberships: [membership('org-1')],
      employees: [{ id: 'emp-1', organization_id: 'org-1', user_id: 'user-1', status: 'active' }],
    });
    const ctx = await resolveContext(reqWith(TOKEN), sql);
    expect(ctx.organizationId).toBe('org-1');
    expect(ctx.employeeId).toBe('emp-1');
  });

  it('multiple memberships without header → NO active organization', async () => {
    const sql = makeAuthFakeSql({
      session: baseSession,
      memberships: [membership('org-1'), membership('org-2')],
    });
    const ctx = await resolveContext(reqWith(TOKEN), sql);
    expect(ctx.organizationId).toBeNull();
    expect(ctx.role).toBeNull();
    expect(ctx.employeeId).toBeNull();
  });

  it('explicit valid header selects that organization', async () => {
    const sql = makeAuthFakeSql({
      session: baseSession,
      memberships: [membership('org-1', 'ADMIN'), membership('org-2', 'EMPLOYEE')],
    });
    const ctx = await resolveContext(reqWith(TOKEN, 'org-2'), sql);
    expect(ctx.organizationId).toBe('org-2');
    expect(ctx.role).toBe('EMPLOYEE');
  });

  it('header with a foreign organization is NOT honored', async () => {
    const sql = makeAuthFakeSql({
      session: baseSession,
      memberships: [membership('org-1')],
    });
    const ctx = await resolveContext(reqWith(TOKEN, 'org-foreign'), sql);
    expect(ctx.organizationId).toBeNull();
  });
});

describe('requireOrgContext', () => {
  it('401 without session, 400 without active organization', () => {
    expect(() => requireOrgContext(null)).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => requireOrgContext({ organizationId: null })).toThrowError(expect.objectContaining({ status: 400 }));
    expect(requireOrgContext({ organizationId: 'org-1' }).organizationId).toBe('org-1');
  });
});

describe('requireRole — MVP role hierarchy', () => {
  it('orders OWNER > ADMIN > PLANNER > EMPLOYEE', () => {
    expect(() => requireRole({ role: 'OWNER' }, 'ADMIN')).not.toThrow();
    expect(() => requireRole({ role: 'ADMIN' }, 'PLANNER')).not.toThrow();
    expect(() => requireRole({ role: 'PLANNER' }, 'ADMIN')).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requireRole({ role: 'EMPLOYEE' }, 'PLANNER')).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('fails closed for unknown roles and thresholds', () => {
    expect(() => requireRole({ role: 'AUDITOR' }, 'EMPLOYEE')).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requireRole({ role: 'OWNER' }, 'AUDITOR')).toThrowError(expect.objectContaining({ status: 403 }));
  });
});

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenOwner = 'tok-owner';
const tokenAdmin = 'tok-admin';
const hash = (t) => createHash('sha256').update(t).digest('hex');

let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./transfer-ownership.js');

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
}

function makeFakeSql({ memberships = [], users = [] } = {}) {
  const auditEvents = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();

    if (text.includes('FROM sessions')) {
      const user = users.find((u) => u.tokenHash === values[0]);
      return Promise.resolve(user ? [{ id: user.id, email: user.email, display_name: user.name }] : []);
    }

    if (text.includes('FROM memberships m') && text.includes('JOIN organizations')) {
      const userMemberships = memberships.filter((x) => x.user_id === values[0]);
      return Promise.resolve(userMemberships.map((m) => ({
        organization_id: m.organization_id,
        role: m.role,
        scoped_area_id: m.scoped_area_id ?? null,
        planner_scope_type: m.planner_scope_type ?? null,
        organization_name: 'Test Org',
        organization_plan: 'team',
      })));
    }

    if (text.startsWith('SELECT role FROM memberships') && text.includes('user_id = ?')) {
      const m = memberships.find((x) => x.organization_id === values[0] && x.user_id === values[1]);
      return Promise.resolve(m ? [{ role: m.role }] : []);
    }

    if (text.startsWith('UPDATE memberships SET role = ?')) {
      const [newRole, orgId, userId] = values;
      const m = memberships.find((x) => x.organization_id === orgId && x.user_id === userId);
      if (m) {
        m.role = newRole;
      }
      return Promise.resolve(m ? [m] : []);
    }

    if (text.startsWith('INSERT INTO organization_audit_events')) {
      auditEvents.push(values);
      return Promise.resolve([{ id: 'audit-1' }]);
    }

    if (text.includes('FROM employees')) {
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  };

  sql.transaction = async (fn) => {
    const txn = (s, ...v) => sql(s, ...v);
    const queries = fn(txn);
    return Promise.all(queries);
  };

  return { sql, memberships, auditEvents };
}

describe('POST /api/organizations/transfer-ownership', () => {
  beforeEach(() => {
    state = makeFakeSql({
      users: [
        { id: 'usr-owner', email: 'owner@example.com', name: 'Owner', tokenHash: hash(tokenOwner) },
        { id: 'usr-admin', email: 'admin@example.com', name: 'Admin', tokenHash: hash(tokenAdmin) },
      ],
      memberships: [
        { user_id: 'usr-owner', organization_id: 'org-1', role: 'OWNER' },
        { user_id: 'usr-admin', organization_id: 'org-1', role: 'ADMIN' },
      ],
    });
  });

  it('transfers ownership from sole owner to another active member', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenOwner}` },
      body: { targetUserId: 'usr-admin', previousOwnerRole: 'ADMIN' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      transferred: true,
      previousOwnerUserId: 'usr-owner',
      newOwnerUserId: 'usr-admin',
      previousOwnerRole: 'ADMIN',
    });

    // Check updated memberships in state
    expect(state.memberships.find((m) => m.user_id === 'usr-owner').role).toBe('ADMIN');
    expect(state.memberships.find((m) => m.user_id === 'usr-admin').role).toBe('OWNER');
    expect(state.auditEvents.length).toBeGreaterThan(0);
  });

  it('rejects transfer when non-owner attempts it (403)', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenAdmin}` },
      body: { targetUserId: 'usr-admin' },
    }, res);

    expect(res.statusCode).toBe(403);
  });

  it('rejects transferring ownership to oneself (400)', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenOwner}` },
      body: { targetUserId: 'usr-owner' },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Cannot transfer ownership to yourself');
  });

  it('rejects nonexistent target user (404)', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenOwner}` },
      body: { targetUserId: 'usr-nonexistent' },
    }, res);

    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid previousOwnerRole (400)', async () => {
    const res = makeRes();
    await handler({
      method: 'POST',
      headers: { cookie: `anclora_session=${tokenOwner}` },
      body: { targetUserId: 'usr-admin', previousOwnerRole: 'EMPLOYEE' },
    }, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-POST methods (405)', async () => {
    const res = makeRes();
    await handler({
      method: 'GET',
      headers: { cookie: `anclora_session=${tokenOwner}` },
    }, res);

    expect(res.statusCode).toBe(405);
  });
});

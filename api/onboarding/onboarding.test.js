import { describe, expect, it, vi } from 'vitest';

const TOKEN = 'onboarding-token';
const USER_ID = 'user-onboarding';

let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./onboarding.js');

function makeSql({ existingMembership = false } = {}) {
  const queries = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.includes('FROM sessions')) {
      return Promise.resolve([{
        id: USER_ID,
        email: 'onboarding@example.com',
        display_name: 'Onboarding User',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }]);
    }
    if (text.includes('FROM memberships')) {
      return Promise.resolve(existingMembership
        ? [{ organization_id: 'existing-org', role: 'OWNER' }]
        : []);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([]);
    }
    queries.push({ text, values });
    return Promise.resolve([]);
  };
  sql.transaction = async (batch) => Promise.all(batch);
  sql.queries = queries;
  return sql;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    send(payload) { this.body = JSON.parse(payload); },
  };
}

async function call(body) {
  const res = response();
  await handler({
    method: 'POST',
    body,
    headers: { cookie: `anclora_session=${TOKEN}` },
  }, res);
  return res;
}

describe('POST /api/onboarding', () => {
  it('creates a company organization with an OWNER membership', async () => {
    state = { sql: makeSql() };
    const res = await call({ organizationName: 'Acme Operations' });

    expect(res.statusCode).toBe(201);
    expect(res.body.organizationId).toEqual(expect.any(String));
    const membershipInsert = state.sql.queries.find((query) => query.text.includes('INSERT INTO memberships'));
    expect(membershipInsert?.text).toContain("'OWNER'");
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO')).map((query) => query.text))
      .toHaveLength(2);
  });

  it('keeps the OWNER role when creating the optional self employee', async () => {
    state = { sql: makeSql() };
    const res = await call({ organizationName: 'Personal Workspace', employeeName: 'Onboarding User' });

    expect(res.statusCode).toBe(201);
    const membershipInsert = state.sql.queries.find((query) => query.text.includes('INSERT INTO memberships'));
    expect(membershipInsert?.text).toContain("'OWNER'");
    expect(state.sql.queries.filter((query) => query.text.includes('INSERT INTO')).map((query) => query.text))
      .toHaveLength(3);
  });

  it('rejects repeat onboarding after the user already has a membership', async () => {
    state = { sql: makeSql({ existingMembership: true }) };
    const res = await call({ organizationName: 'Should Not Be Created' });

    expect(res.statusCode).toBe(409);
    expect(state.sql.queries).toHaveLength(0);
  });
});

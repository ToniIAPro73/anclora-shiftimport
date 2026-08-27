import { createHash, randomUUID } from 'node:crypto';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

/**
 * api/format-profiles handler tests: org-scoped list/get, teach (any role),
 * lifecycle mutations (ADMIN-only), cross-tenant 404, malicious payload
 * rejection, optimistic concurrency, idempotent create, drift-supersede
 * legacy-demotion. Same fake-sql style as api/areas/index.test.js:
 * resolveContext runs for real against the fake, only the sql tag itself is
 * mocked, matching on distinguishing SQL text substrings.
 */

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const TOKEN_ADMIN = 'tok-admin';
const TOKEN_EMPLOYEE = 'tok-employee';
const TOKEN_ADMIN_B = 'tok-admin-b';

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./index.js');

let state;

const baseSignature = () => ({
  documentType: 'TYPE_A', structureHash: 'abc12345', dayHeaderCount: 31, columnCount: 33, hasLegend: true,
});

const validCandidateBody = (overrides = {}) => ({
  displayName: 'Cuadrante mensual',
  sourceType: 'pdf',
  signature: baseSignature(),
  tokenAliases: { DL: 'libre' },
  codeTimes: {},
  offTokens: ['DL'],
  employeeRowStrategy: 'manual-row',
  employeeRowIndex: 3,
  dayColumnMap: null,
  tabularMemory: null,
  parserConfig: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
  ...overrides,
});

function profileRow(overrides = {}) {
  const now = new Date('2026-08-20T10:00:00Z');
  return {
    id: overrides.id ?? randomUUID(),
    organization_id: ORG_A,
    logical_profile_id: overrides.logical_profile_id ?? randomUUID(),
    version: 1,
    status: 'validated',
    signature: baseSignature(),
    source_type: 'pdf',
    display_name: 'Cuadrante existente',
    parser_config: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
    token_aliases: {},
    code_times: {},
    off_tokens: [],
    employee_row_strategy: 'manual-row',
    employee_row_index: 3,
    day_column_map: null,
    tabular_memory: null,
    use_count: 0,
    successful_use_count: 0,
    last_used_at: null,
    created_by_user_id: 'user-admin',
    supersedes_profile_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const sameInstant = (storedDate, clientValue) => {
  const clientTime = new Date(clientValue).getTime();
  return !Number.isNaN(clientTime) && storedDate.getTime() === clientTime;
};

function makeFakeSql({ profiles = [] } = {}) {
  const sessions = {
    [tokenHash(TOKEN_ADMIN)]: { user_id: 'user-admin', role: 'ADMIN', org: ORG_A },
    [tokenHash(TOKEN_EMPLOYEE)]: { user_id: 'user-emp', role: 'EMPLOYEE', org: ORG_A },
    [tokenHash(TOKEN_ADMIN_B)]: { user_id: 'user-admin-b', role: 'ADMIN', org: ORG_B },
  };

  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();

    if (text.includes('FROM sessions')) {
      const session = sessions[values[0]];
      return Promise.resolve(session ? [{ id: session.user_id, email: `${session.user_id}@example.com`, display_name: session.user_id }] : []);
    }
    if (text.includes('FROM memberships')) {
      const session = Object.values(sessions).find((s) => s.user_id === values[0]);
      return Promise.resolve([{
        organization_id: session.org,
        role: session.role,
        organization_name: `Org ${session.org}`,
        organization_plan: 'team',
      }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([]);
    }

    // list
    if (text.startsWith('SELECT * FROM format_profiles WHERE organization_id = ? AND ( ? ::uuid')) {
      const [organizationId, logicalProfileId] = values;
      const status = values[3];
      return Promise.resolve(
        profiles.filter((p) => p.organization_id === organizationId
          && (!logicalProfileId || p.logical_profile_id === logicalProfileId)
          && (!status || p.status === status))
          .sort((a, b) => a.logical_profile_id.localeCompare(b.logical_profile_id) || b.version - a.version),
      );
    }

    // get one / assertExistsForConflict / deprecate-fallback lookup
    if (text.startsWith('SELECT * FROM format_profiles WHERE id = ? AND organization_id = ?')
      || text.startsWith('SELECT id FROM format_profiles WHERE id = ? AND organization_id = ?')) {
      const [id, organizationId] = values;
      return Promise.resolve(profiles.filter((p) => p.id === id && p.organization_id === organizationId));
    }

    // family lookup for supersedes
    if (text.startsWith('SELECT id, version, status FROM format_profiles')) {
      const [organizationId, logicalProfileId] = values;
      return Promise.resolve(
        profiles.filter((p) => p.organization_id === organizationId && p.logical_profile_id === logicalProfileId)
          .sort((a, b) => b.version - a.version).slice(0, 1),
      );
    }

    // identical-structureHash idempotency check (with logical family)
    if (text.startsWith('SELECT * FROM format_profiles WHERE organization_id = ? AND logical_profile_id = ? AND status !=')) {
      const [organizationId, logicalProfileId, structureHash] = values;
      return Promise.resolve(profiles.filter((p) => p.organization_id === organizationId
        && p.logical_profile_id === logicalProfileId && p.status !== 'deprecated'
        && p.signature.structureHash === structureHash));
    }

    // identical-structureHash idempotency check (no logical family / fresh)
    if (text.startsWith('SELECT * FROM format_profiles WHERE organization_id = ? AND status !=')) {
      const [organizationId, structureHash] = values;
      return Promise.resolve(profiles.filter((p) => p.organization_id === organizationId
        && p.status !== 'deprecated' && p.signature.structureHash === structureHash));
    }

    // insert
    if (text.startsWith('INSERT INTO format_profiles')) {
      const [
        organizationId, logicalProfileId, version, signatureJson, sourceType, displayName,
        parserConfigJson, tokenAliasesJson, codeTimesJson, offTokensJson,
        employeeRowStrategy, employeeRowIndex, dayColumnMapJson, tabularMemoryJson,
        userId, supersedesProfileId,
      ] = values;
      const row = profileRow({
        id: randomUUID(),
        organization_id: organizationId,
        logical_profile_id: logicalProfileId,
        version,
        status: 'candidate',
        signature: JSON.parse(signatureJson),
        source_type: sourceType,
        display_name: displayName,
        parser_config: JSON.parse(parserConfigJson),
        token_aliases: JSON.parse(tokenAliasesJson),
        code_times: JSON.parse(codeTimesJson),
        off_tokens: JSON.parse(offTokensJson),
        employee_row_strategy: employeeRowStrategy,
        employee_row_index: employeeRowIndex,
        day_column_map: dayColumnMapJson ? JSON.parse(dayColumnMapJson) : null,
        tabular_memory: tabularMemoryJson ? JSON.parse(tabularMemoryJson) : null,
        created_by_user_id: userId,
        supersedes_profile_id: supersedesProfileId,
      });
      profiles.push(row);
      return Promise.resolve([row]);
    }

    // rename
    if (text.startsWith('UPDATE format_profiles SET display_name')) {
      const [displayName, id, organizationId, updatedAt] = values;
      const target = profiles.find((p) => p.id === id && p.organization_id === organizationId
        && sameInstant(p.updated_at, updatedAt));
      if (!target) return Promise.resolve([]);
      target.display_name = displayName;
      target.updated_at = new Date();
      return Promise.resolve([target]);
    }

    // record use
    if (text.startsWith('UPDATE format_profiles SET use_count')) {
      const [outcome, id, organizationId] = values;
      const target = profiles.find((p) => p.id === id && p.organization_id === organizationId);
      if (!target) return Promise.resolve([]);
      target.use_count += 1;
      if (outcome === 'success') target.successful_use_count += 1;
      target.last_used_at = new Date();
      return Promise.resolve([target]);
    }

    // legacy-demote on confirm (checked before the more generic status='validated' branches)
    if (text.startsWith("UPDATE format_profiles SET status = 'legacy'")) {
      const [organizationId, logicalProfileId, id] = values;
      profiles
        .filter((p) => p.organization_id === organizationId && p.logical_profile_id === logicalProfileId
          && p.id !== id && ['validated', 'verified', 'candidate'].includes(p.status))
        .forEach((p) => { p.status = 'legacy'; p.updated_at = new Date(); });
      return Promise.resolve([]);
    }

    // reactivate (checked before confirm — both start "SET status = 'validated'...WHERE id = ?...updated_at = ?")
    if (text.includes("status IN (")) {
      const [id, organizationId, updatedAt] = values;
      const target = profiles.find((p) => p.id === id && p.organization_id === organizationId
        && sameInstant(p.updated_at, updatedAt) && ['legacy', 'deprecated'].includes(p.status));
      if (!target) return Promise.resolve([]);
      target.status = 'validated';
      target.updated_at = new Date();
      return Promise.resolve([target]);
    }

    // confirm
    if (text.startsWith("UPDATE format_profiles SET status = 'validated'")) {
      const [id, organizationId, updatedAt] = values;
      const target = profiles.find((p) => p.id === id && p.organization_id === organizationId
        && sameInstant(p.updated_at, updatedAt) && p.status === 'candidate');
      if (!target) return Promise.resolve([]);
      target.status = 'validated';
      target.updated_at = new Date();
      return Promise.resolve([target]);
    }

    // deprecate
    if (text.startsWith("UPDATE format_profiles SET status = 'deprecated'")) {
      const [id, organizationId, updatedAt] = values;
      const target = profiles.find((p) => p.id === id && p.organization_id === organizationId
        && sameInstant(p.updated_at, updatedAt));
      if (!target) return Promise.resolve([]);
      target.status = 'deprecated';
      target.updated_at = new Date();
      return Promise.resolve([target]);
    }

    return Promise.resolve([]);
  };
  return { sql, profiles };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
}

const call = async (method, { token = TOKEN_ADMIN, body, query } = {}) => {
  const req = {
    method,
    body,
    query: query ?? {},
    headers: { cookie: token ? `anclora_session=${token}` : '' },
  };
  const res = mockRes();
  await handler(req, res);
  return res;
};

beforeEach(() => {
  state = makeFakeSql({ profiles: [] });
});

describe('POST /api/format-profiles (create candidate)', () => {
  it('creates a candidate (201) as EMPLOYEE — teaching is not admin-gated', async () => {
    const res = await call('POST', { token: TOKEN_EMPLOYEE, body: validCandidateBody() });
    expect(res.statusCode).toBe(201);
    expect(res.body.profile.status).toBe('candidate');
    expect(res.body.profile.version).toBe(1);
  });

  it('rejects a payload with an unknown field (400 INVALID_PROFILE_PAYLOAD)', async () => {
    const res = await call('POST', { body: { ...validCandidateBody(), employeeName: 'María García' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_PROFILE_PAYLOAD');
  });

  it('rejects a name-shaped displayName', async () => {
    const res = await call('POST', { body: validCandidateBody({ displayName: 'María García López' }) });
    expect(res.statusCode).toBe(400);
  });

  it('is idempotent: identical structureHash for the same org returns the existing row (200, not 201)', async () => {
    const first = await call('POST', { body: validCandidateBody() });
    expect(first.statusCode).toBe(201);
    const second = await call('POST', { body: validCandidateBody({ displayName: 'Otro nombre' }) });
    expect(second.statusCode).toBe(200);
    expect(second.body.profile.id).toBe(first.body.profile.id);
  });
});

describe('GET /api/format-profiles', () => {
  it('lists only the session organization profiles', async () => {
    state.profiles.push(profileRow({ organization_id: ORG_A }), profileRow({ organization_id: ORG_B }));
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
  });

  it('is readable by EMPLOYEE role', async () => {
    state.profiles.push(profileRow({ organization_id: ORG_A }));
    const res = await call('GET', { token: TOKEN_EMPLOYEE });
    expect(res.statusCode).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
  });

  it('rejects anonymous requests (401)', async () => {
    const res = await call('GET', { token: null });
    expect(res.statusCode).toBe(401);
  });

  it('returns full record with ?id=, 404 for a foreign-org id (no leak)', async () => {
    const row = profileRow({ organization_id: ORG_A });
    state.profiles.push(row);
    const ok = await call('GET', { query: { id: row.id } });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.profile.tokenAliases).toBeDefined();

    const foreign = await call('GET', { token: TOKEN_ADMIN_B, query: { id: row.id } });
    expect(foreign.statusCode).toBe(404);
  });
});

describe('PATCH /api/format-profiles — role gating', () => {
  it('EMPLOYEE cannot rename/confirm/deprecate/reactivate (403)', async () => {
    const row = profileRow({ organization_id: ORG_A, status: 'candidate' });
    state.profiles.push(row);
    for (const action of ['rename', 'confirm', 'deprecate', 'reactivate']) {
      const res = await call('PATCH', {
        token: TOKEN_EMPLOYEE,
        body: { id: row.id, action, displayName: 'x', updatedAt: row.updated_at.toISOString() },
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('EMPLOYEE can record use', async () => {
    const row = profileRow({ organization_id: ORG_A });
    state.profiles.push(row);
    const res = await call('PATCH', { token: TOKEN_EMPLOYEE, body: { id: row.id, action: 'use', outcome: 'success' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.profile.useCount).toBe(1);
    expect(res.body.profile.successfulUseCount).toBe(1);
  });

  it('ADMIN can rename', async () => {
    const row = profileRow({ organization_id: ORG_A });
    state.profiles.push(row);
    const res = await call('PATCH', {
      body: { id: row.id, action: 'rename', displayName: 'Nuevo nombre', updatedAt: row.updated_at.toISOString() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.profile.displayName).toBe('Nuevo nombre');
  });
});

describe('PATCH — record use', () => {
  it('failure outcome increments use_count but not successful_use_count', async () => {
    const row = profileRow({ organization_id: ORG_A });
    state.profiles.push(row);
    const res = await call('PATCH', { body: { id: row.id, action: 'use', outcome: 'failure' } });
    expect(res.body.profile.useCount).toBe(1);
    expect(res.body.profile.successfulUseCount).toBe(0);
  });

  it('404 for a foreign-org profile id', async () => {
    const row = profileRow({ organization_id: ORG_B });
    state.profiles.push(row);
    const res = await call('PATCH', { body: { id: row.id, action: 'use', outcome: 'success' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH — optimistic concurrency', () => {
  it('rename with a stale updatedAt returns 409 PROFILE_CONFLICT', async () => {
    const row = profileRow({ organization_id: ORG_A });
    state.profiles.push(row);
    const res = await call('PATCH', {
      body: { id: row.id, action: 'rename', displayName: 'x', updatedAt: '2000-01-01T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PROFILE_CONFLICT');
  });
});

describe('PATCH — confirm / drift-supersede legacy demotion / reactivate', () => {
  it('confirm requires status=candidate (409 otherwise)', async () => {
    const row = profileRow({ organization_id: ORG_A, status: 'validated' });
    state.profiles.push(row);
    const res = await call('PATCH', { body: { id: row.id, action: 'confirm', updatedAt: row.updated_at.toISOString() } });
    expect(res.statusCode).toBe(409);
  });

  it('confirming a drift candidate demotes the superseded version to legacy, preserving history', async () => {
    const original = profileRow({ organization_id: ORG_A, status: 'validated', version: 1 });
    const candidate = profileRow({
      organization_id: ORG_A, status: 'candidate', version: 2,
      logical_profile_id: original.logical_profile_id, supersedes_profile_id: original.id,
    });
    state.profiles.push(original, candidate);

    const res = await call('PATCH', { body: { id: candidate.id, action: 'confirm', updatedAt: candidate.updated_at.toISOString() } });
    expect(res.statusCode).toBe(200);
    expect(res.body.profile.status).toBe('validated');

    const originalNow = state.profiles.find((p) => p.id === original.id);
    expect(originalNow.status).toBe('legacy');
    // original row's data is untouched — no history loss
    expect(originalNow.signature).toEqual(original.signature);
  });

  it('reactivate moves legacy back to validated', async () => {
    const row = profileRow({ organization_id: ORG_A, status: 'legacy' });
    state.profiles.push(row);
    const res = await call('PATCH', { body: { id: row.id, action: 'reactivate', updatedAt: row.updated_at.toISOString() } });
    expect(res.statusCode).toBe(200);
    expect(res.body.profile.status).toBe('validated');
  });

  it('deprecate is idempotent (already-deprecated is a 200 no-op, not an error, even with a stale updatedAt)', async () => {
    const row = profileRow({ organization_id: ORG_A, status: 'deprecated' });
    state.profiles.push(row);
    const res = await call('PATCH', { body: { id: row.id, action: 'deprecate', updatedAt: '2000-01-01T00:00:00.000Z' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.profile.status).toBe('deprecated');
  });

  it('rejects a malformed (non-date) updatedAt with 400, never a raw SQL cast error', async () => {
    const row = profileRow({ organization_id: ORG_A });
    state.profiles.push(row);
    const res = await call('PATCH', { body: { id: row.id, action: 'confirm', updatedAt: 'not-a-date' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('other methods', () => {
  it('DELETE is not supported (405)', async () => {
    const res = await call('DELETE', { body: {} });
    expect(res.statusCode).toBe(405);
  });
});

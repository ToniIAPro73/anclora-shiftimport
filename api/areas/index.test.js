import { createHash } from 'node:crypto';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

/**
 * api/areas handler tests: org-scoped list, ADMIN-only mutations, rename /
 * deactivate, cross-tenant 404 and normalized-duplicate 409. Handlers are
 * invoked with fake req/res; getSql() is mocked to an in-memory fake in the
 * same style as api/_lib/auth.test.js (resolveContext itself runs for real
 * against the fake, so session/membership resolution is also exercised).
 *
 * The duplicate case is simulated by throwing a 23505-shaped error from the
 * fake INSERT/UPDATE: the real enforcement lives in the partial unique
 * indexes areas_org_name_idx / areas_org_code_idx (migration 0008), which a
 * fake sql cannot apply by itself — the handler's job is only to map that
 * violation to a 409, and that mapping is what is asserted here (the real
 * index behavior is covered end-to-end by scripts/smoke-api.mjs).
 */

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const TOKEN_ADMIN = 'tok-admin';
const TOKEN_EMPLOYEE = 'tok-employee';

let state;

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./index.js');

const areaRow = (id, org, over = {}) => ({
  id,
  organization_id: org,
  name: `Area ${id}`,
  code: null,
  active: true,
  created_at: new Date('2026-08-01T00:00:00Z'),
  ...over,
});

const duplicateError = () => Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });

function makeFakeSql({ areas = [] } = {}) {
  const sessions = {
    [tokenHash(TOKEN_ADMIN)]: { user_id: 'user-admin', role: 'ADMIN' },
    [tokenHash(TOKEN_EMPLOYEE)]: { user_id: 'user-emp', role: 'EMPLOYEE' },
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
        organization_id: ORG_A,
        role: session.role,
        organization_name: 'Org A',
        organization_plan: 'team',
      }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve(values[1] === 'user-emp' ? [{ id: 'emp-self' }] : []);
    }

    if (text.startsWith('SELECT id, name, code, active, created_at FROM areas')) {
      return Promise.resolve(
        areas.filter((a) => a.organization_id === values[0])
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
    if (text.startsWith('SELECT id, name, code, active FROM areas')) {
      return Promise.resolve(areas.filter((a) => a.id === values[0] && a.organization_id === values[1]));
    }
    if (text.startsWith('INSERT INTO areas')) {
      const [organizationId, name, code] = values;
      const normalized = name.trim().toLowerCase();
      if (areas.some((a) => a.organization_id === organizationId && a.active && a.name.trim().toLowerCase() === normalized)) {
        return Promise.reject(duplicateError());
      }
      const row = areaRow(`area-${areas.length}`, organizationId, { name, code });
      areas.push(row);
      return Promise.resolve([row]);
    }
    if (text.startsWith('UPDATE areas SET active = FALSE')) {
      const [id, organizationId] = values;
      const target = areas.find((a) => a.id === id && a.organization_id === organizationId);
      if (target) {
        target.active = false;
      }
      return Promise.resolve(target ? [target] : []);
    }
    if (text.startsWith('UPDATE areas SET name')) {
      const [name, code, id, organizationId] = values;
      const normalized = name.trim().toLowerCase();
      if (areas.some((a) => a.organization_id === organizationId && a.active && a.id !== id && a.name.trim().toLowerCase() === normalized)) {
        return Promise.reject(duplicateError());
      }
      const target = areas.find((a) => a.id === id && a.organization_id === organizationId);
      if (target) {
        target.name = name;
        target.code = code;
      }
      return Promise.resolve(target ? [target] : []);
    }
    return Promise.resolve([]);
  };
  return { sql, areas };
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
  state = makeFakeSql({
    areas: [
      areaRow('area-ops', ORG_A, { name: 'Operaciones', code: 'OPS' }),
      areaRow('area-adm', ORG_A, { name: 'Administración' }),
      areaRow('area-foreign', ORG_B, { name: 'Area B1' }),
    ],
  });
});

describe('GET /api/areas', () => {
  it('lists only the session organization areas', async () => {
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body.areas.map((a) => a.id).sort()).toEqual(['area-adm', 'area-ops']);
  });

  it('is readable by EMPLOYEE role (dashboard area context)', async () => {
    const res = await call('GET', { token: TOKEN_EMPLOYEE });
    expect(res.statusCode).toBe(200);
    expect(res.body.areas).toHaveLength(2);
  });

  it('rejects anonymous requests (401)', async () => {
    const res = await call('GET', { token: null });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/areas', () => {
  it('creates an area (201)', async () => {
    const res = await call('POST', { body: { name: 'Logística', code: 'LOG' } });
    expect(res.statusCode).toBe(201);
    expect(res.body.area).toMatchObject({ name: 'Logística', code: 'LOG', active: true });
  });

  it('rejects an empty name (400)', async () => {
    expect((await call('POST', { body: {} })).statusCode).toBe(400);
    expect((await call('POST', { body: { name: '   ' } })).statusCode).toBe(400);
  });

  it('rejects a normalized duplicate name (409 on 23505 from the partial unique index)', async () => {
    const res = await call('POST', { body: { name: '  OPERACIONES ' } });
    expect(res.statusCode).toBe(409);
  });

  it('is forbidden for EMPLOYEE role (403)', async () => {
    const res = await call('POST', { token: TOKEN_EMPLOYEE, body: { name: 'Logística' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /api/areas', () => {
  it('renames an area', async () => {
    const res = await call('PATCH', { body: { id: 'area-adm', name: 'Administración y Finanzas' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.area.name).toBe('Administración y Finanzas');
  });

  it('deactivates an area (no hard delete)', async () => {
    const res = await call('PATCH', { body: { id: 'area-ops', deactivate: true } });
    expect(res.statusCode).toBe(200);
    expect(res.body.area.active).toBe(false);
  });

  it('returns 404 for an area of another organization (no leak)', async () => {
    const res = await call('PATCH', { body: { id: 'area-foreign', name: 'Hackeada' } });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a rename to a normalized duplicate (409)', async () => {
    const res = await call('PATCH', { body: { id: 'area-adm', name: 'operaciones' } });
    expect(res.statusCode).toBe(409);
  });

  it('requires the area id (400)', async () => {
    const res = await call('PATCH', { body: { name: 'Sin id' } });
    expect(res.statusCode).toBe(400);
  });

  it('is forbidden for EMPLOYEE role (403)', async () => {
    const res = await call('PATCH', { token: TOKEN_EMPLOYEE, body: { id: 'area-ops', name: 'X' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('other methods', () => {
  it('DELETE is not supported (405)', async () => {
    const res = await call('DELETE', { body: { id: 'area-ops' } });
    expect(res.statusCode).toBe(405);
  });
});

import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { hashPassword } from '../../../api/_lib/passwords.js';
import { BASE_URL, qaLib } from '../helpers/qa-mirror';

/**
 * F2 time-off foundation, end to end against the real local runtime (development code → Neon `main` with 0050 applied): real
 * authentication, real scope resolution, real database. Everything is written ONLY into run-scoped synthetic tenants
 * `E2E-SHIFT-<runId>` (users `@e2e.test`); teardown removes exactly the ids created here and proves zero residue. The real
 * `ShiftImport` and Groundforce are never touched.
 * Requires the runtime to be started with TIME_OFF_ENABLED=true (the flag-OFF behaviour is asserted by the first describe,
 * which only runs when TIME_OFF_ENABLED is not "true" in the test process, i.e. when the runtime was started with the default).
 */
test.use({ screenshot: 'off', trace: 'off', video: 'off', storageState: { cookies: [], origins: [] } });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'API-level scenario: run once (desktop project)');
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'E2e-pass-1234';
const FLAG_ON = process.env.TIME_OFF_ENABLED === 'true';

interface Tenant {
  orgA: string; orgB: string; areaA1: string; areaA2: string; e1: string; e2: string; e3: string; eB: string;
  users: Record<string, { id: string; email: string }>;
  ids: { users: string[]; orgs: string[] };
}
let T: Tenant;
let runId = '';

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function withDb<T2>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, string | number | null>>>) => Promise<T2>): Promise<T2> {
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}
async function login(role: string, organizationId: string): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-organization-id': organizationId } });
  const response = await api.post('/api/auth/login', { data: { email: T.users[role].email, password: PASSWORD } });
  expect(response.ok(), `login ${role}`).toBeTruthy();
  return api;
}

test.beforeAll(async () => {
  runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const hash = hashPassword(PASSWORD);
  T = await withDb(async (q) => {
    const ids = { users: [] as string[], orgs: [] as string[] };
    const org = async (name: string, policy: string) => { const id = (await q(`INSERT INTO organizations (name, type, plan, approval_policy) VALUES ($1, 'company', 'team', $2) RETURNING id`, [`${name} · E2E-SHIFT-${runId}`, policy]))[0].id as string; ids.orgs.push(id); return id; };
    const orgA = await org('E2E TimeOff A', 'AREA_RESPONSIBLE'); const orgB = await org('E2E TimeOff B', 'ORGANIZATION_ADMIN');
    const areaA1 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'E2E A1', $2) RETURNING id`, [orgA, `AREA-${runId}-1`]))[0].id as string;
    const areaA2 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'E2E A2', $2) RETURNING id`, [orgA, `AREA-${runId}-2`]))[0].id as string;
    const users: Tenant['users'] = {};
    const user = async (key: string) => {
      const email = `${key}-${runId.toLowerCase()}@e2e.test`;
      const id = (await q(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`, [email, hash, `E2E ${key} ${runId}`]))[0].id as string;
      users[key] = { id, email }; ids.users.push(id);
    };
    for (const key of ['owner', 'plannerAreaA', 'plannerAreaB', 'plannerEmps', 'employee', 'employee2', 'planner', 'ownerB', 'employeeB']) await user(key);
    const member = (key: string, organization: string, role: string, scope: string | null = null) =>
      q(`INSERT INTO memberships (user_id, organization_id, role, planner_scope_type) VALUES ($1, $2, $3, $4)`, [users[key].id, organization, role, scope]);
    await member('owner', orgA, 'OWNER'); await member('plannerAreaA', orgA, 'PLANNER', 'AREAS'); await member('plannerAreaB', orgA, 'PLANNER', 'AREAS');
    await member('plannerEmps', orgA, 'PLANNER', 'EMPLOYEES'); await member('planner', orgA, 'PLANNER', 'ORGANIZATION');
    await member('employee', orgA, 'EMPLOYEE'); await member('employee2', orgA, 'EMPLOYEE');
    await member('ownerB', orgB, 'OWNER'); await member('employeeB', orgB, 'EMPLOYEE');
    const emp = async (organization: string, name: string, ext: string, area: string | null, userKey: string | null) =>
      (await q(`INSERT INTO employees (organization_id, name, external_employee_id, status, area_id, user_id) VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`,
        [organization, name, `${ext}-${runId}`, area, userKey ? users[userKey].id : null]))[0].id as string;
    const e1 = await emp(orgA, 'E2E One', 'E1', areaA1, 'employee'); const e2 = await emp(orgA, 'E2E Two', 'E2', areaA1, 'employee2');
    const e3 = await emp(orgA, 'E2E Three', 'E3', areaA2, null); const eB = await emp(orgB, 'E2E Other Tenant', 'EB', null, 'employeeB');
    await q(`INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id) VALUES ($1, 'PLANNER_AREA', $2, $3), ($1, 'PLANNER_AREA', $4, $5), ($1, 'PLANNER_EMPLOYEE', $6, $7)`,
      [orgA, users.plannerAreaA.id, areaA1, users.plannerAreaB.id, areaA2, users.plannerEmps.id, e1]);
    return { orgA, orgB, areaA1, areaA2, e1, e2, e3, eB, users, ids };
  });
});

test.afterAll(async () => {
  if (!T) return;
  await withDb(async (q) => {
    // Exactly the ids created by this run; ON DELETE CASCADE removes the dependent time-off, approval and notification rows.
    for (const id of T.ids.orgs) await q(`DELETE FROM organizations WHERE id = $1`, [id]);
    for (const id of T.ids.users) await q(`DELETE FROM users WHERE id = $1`, [id]);
    const residue = await q(`SELECT (SELECT COUNT(*) FROM organizations WHERE id = ANY($1::uuid[])) + (SELECT COUNT(*) FROM users WHERE id = ANY($2::uuid[])) + (SELECT COUNT(*) FROM time_off_requests WHERE organization_id = ANY($1::uuid[])) AS n`, [T.ids.orgs, T.ids.users]);
    expect(Number(residue[0].n)).toBe(0);
  });
});

test.describe('flag OFF (default): the feature does not exist', () => {
  test.skip(FLAG_ON, 'runtime started with TIME_OFF_ENABLED=true');
  test('every /api/me/time-off-requests* route answers 404, even for a valid employee session; nothing is written', async () => {
    const api = await login('employee', T.orgA);
    const start = addDays(todayIso(), 30);
    const calls: Array<[string, string, Record<string, unknown> | undefined]> = [
      ['get', '/api/me/time-off-requests', undefined],
      ['get', `/api/me/time-off-requests/impact?startDate=${start}&endDate=${start}`, undefined],
      ['post', '/api/me/time-off-requests', { requestType: 'VACATION', startDate: start, endDate: start }],
      ['post', `/api/me/time-off-requests/${randomUUID()}/cancel`, undefined],
    ];
    for (const [method, path, data] of calls) {
      const response = method === 'get' ? await api.get(path) : await api.post(path, data ? { data } : {});
      expect(response.status(), `${method} ${path}`).toBe(404);
    }
    expect((await withDb((q) => q(`SELECT id FROM time_off_requests WHERE organization_id = $1`, [T.orgA])))).toHaveLength(0);
    await api.dispose();
  });
});

test.describe('flag ON', () => {
  test.skip(!FLAG_ON, 'start the runtime with TIME_OFF_ENABLED=true (and run this spec with the same variable)');

  test('EMPLOYEE: create → list → impact → overlap 409 → cancel → re-request; envelope + audit + routed notifications', async () => {
    const api = await login('employee', T.orgA);
    const start = addDays(todayIso(), 40); const end = addDays(start, 4);
    const created = await api.post('/api/me/time-off-requests', { data: { requestType: 'VACATION', startDate: start, endDate: end, comment: 'E2E', employeeId: T.e2, organizationId: T.orgB } });
    expect(created.status()).toBe(201);
    const request = (await created.json()).request;
    expect(request).toMatchObject({ requestType: 'VACATION', startDate: start, endDate: end, requestedDays: 5, status: 'PENDING' });
    // the client-supplied employeeId/organizationId are ignored: the row belongs to the session employee and organisation
    const [row] = await withDb((q) => q(`SELECT employee_id, organization_id FROM time_off_requests WHERE id = $1`, [request.id]));
    expect(row).toMatchObject({ employee_id: T.e1, organization_id: T.orgA });
    const envelope = await withDb((q) => q(`SELECT status, policy_snapshot, change_request_id FROM approval_requests WHERE time_off_request_id = $1`, [request.id]));
    expect(envelope).toEqual([{ status: 'PENDING', policy_snapshot: 'AREA_RESPONSIBLE', change_request_id: null }]);
    // AREA_RESPONSIBLE: planner of area A1 + planner of that very employee; NOT the planner of area A2, NOT the requester
    const notified = await withDb((q) => q(`SELECT user_id FROM notifications WHERE organization_id = $1 AND type = 'APPROVAL_REQUEST_CREATED'`, [T.orgA]));
    expect(new Set(notified.map((n) => n.user_id))).toEqual(new Set([T.users.plannerAreaA.id, T.users.plannerEmps.id]));
    const audit = await withDb((q) => q(`SELECT event_type FROM organization_audit_events WHERE organization_id = $1 AND target_id = $2`, [T.orgA, request.id]));
    expect(audit.map((a) => a.event_type)).toEqual(['time_off_request.created']);

    const list = await (await api.get(`/api/me/time-off-requests?year=${start.slice(0, 4)}`)).json();
    expect(list.requests.map((r: { id: string }) => r.id)).toContain(request.id);
    expect(list.summary.pendingDays).toBeGreaterThanOrEqual(5);

    const impact = await (await api.get(`/api/me/time-off-requests/impact?startDate=${addDays(start, 2)}&endDate=${addDays(start, 8)}`)).json();
    expect(impact.overlapsOwn.map((o: { id: string }) => o.id)).toEqual([request.id]);

    const overlap = await api.post('/api/me/time-off-requests', { data: { requestType: 'VACATION', startDate: addDays(start, 3), endDate: addDays(start, 9) } });
    expect(overlap.status()).toBe(409);
    expect((await overlap.json()).code).toBe('TIME_OFF_OVERLAP');

    const cancelled = await api.post(`/api/me/time-off-requests/${request.id}/cancel`);
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).request.status).toBe('CANCELLED');
    expect((await withDb((q) => q(`SELECT status FROM approval_requests WHERE time_off_request_id = $1`, [request.id])))[0].status).toBe('CANCELLED');
    expect((await api.post(`/api/me/time-off-requests/${request.id}/cancel`)).status()).toBe(409);
    expect((await api.post('/api/me/time-off-requests', { data: { requestType: 'VACATION', startDate: start, endDate: end } })).status()).toBe(201);
    await api.dispose();
  });

  test('type allow-list, past dates and range length are refused with machine-readable codes (nothing written)', async () => {
    const api = await login('employee2', T.orgA);
    const s = addDays(todayIso(), 100);
    const refusals: Array<[Record<string, unknown>, number, string]> = [
      [{ requestType: 'SICK_LEAVE', startDate: s, endDate: s }, 422, 'TIME_OFF_TYPE_NOT_ENABLED'],
      [{ requestType: 'PERMISSION', startDate: s, endDate: s }, 422, 'TIME_OFF_TYPE_NOT_ENABLED'],
      [{ requestType: 'OTHER', startDate: s, endDate: s }, 422, 'TIME_OFF_TYPE_NOT_ENABLED'],
      [{ requestType: 'VACATION', startDate: addDays(todayIso(), -1), endDate: s }, 422, 'TIME_OFF_PAST_DATE'],
      [{ requestType: 'VACATION', startDate: s, endDate: addDays(s, 366) }, 422, 'TIME_OFF_RANGE_TOO_LONG'],
      [{ requestType: 'VACATION', startDate: addDays(s, 3), endDate: s }, 400, 'INVALID_INPUT'],
    ];
    for (const [data, status, code] of refusals) {
      const response = await api.post('/api/me/time-off-requests', { data });
      expect(response.status(), JSON.stringify(data)).toBe(status);
      expect((await response.json()).code).toBe(code);
    }
    expect(await withDb((q) => q(`SELECT id FROM time_off_requests WHERE employee_id = $1`, [T.e2]))).toHaveLength(0);
    await api.dispose();
  });

  test('TENANT ISOLATION + SELF scope: another employee / another organisation can neither list nor cancel (404), and a manager without a linked employee is refused (403)', async () => {
    const owner = await login('employee', T.orgA);
    const start = addDays(todayIso(), 160);
    const request = (await (await owner.post('/api/me/time-off-requests', { data: { requestType: 'VACATION', startDate: start, endDate: start } })).json()).request;

    const colleague = await login('employee2', T.orgA);
    expect((await colleague.post(`/api/me/time-off-requests/${request.id}/cancel`)).status()).toBe(404);
    expect((await (await colleague.get(`/api/me/time-off-requests?year=${start.slice(0, 4)}`)).json()).requests.map((r: { id: string }) => r.id)).not.toContain(request.id);

    const otherTenant = await login('employeeB', T.orgB);
    expect((await otherTenant.post(`/api/me/time-off-requests/${request.id}/cancel`)).status()).toBe(404);
    expect((await (await otherTenant.get(`/api/me/time-off-requests?year=${start.slice(0, 4)}`)).json()).requests).toEqual([]);
    // a session may only act in an organisation it belongs to: the org header cannot pivot into another tenant
    const pivot = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-organization-id': T.orgB } });
    expect((await pivot.post('/api/auth/login', { data: { email: T.users.employee.email, password: PASSWORD } })).ok()).toBeTruthy();
    expect([400, 401, 403, 404]).toContain((await pivot.get('/api/me/time-off-requests')).status());
    await pivot.dispose();

    for (const role of ['owner', 'planner', 'plannerAreaA']) {
      const manager = await login(role, T.orgA);
      const response = await manager.post('/api/me/time-off-requests', { data: { requestType: 'VACATION', startDate: addDays(todayIso(), 200), endDate: addDays(todayIso(), 201) } });
      expect(response.status(), `${role} without a linked employee`).toBe(403);
      expect((await response.json()).code).toBe('EMPLOYEE_LINK_REQUIRED');
      await manager.dispose();
    }
    await Promise.all([owner.dispose(), colleague.dispose(), otherTenant.dispose()]);
  });

  test('COMPATIBILITY: the existing approval inbox does not show time-off envelopes and its decision endpoints answer 404 for them', async () => {
    const employee = await login('employee', T.orgA);
    const start = addDays(todayIso(), 220);
    const request = (await (await employee.post('/api/me/time-off-requests', { data: { requestType: 'VACATION', startDate: start, endDate: start } })).json()).request;
    const envelopeId = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [request.id])))[0].id as string;
    const owner = await login('owner', T.orgA);
    const inbox = await (await owner.get('/api/approval-requests?status=pending')).json();
    expect(JSON.stringify(inbox)).not.toContain(envelopeId);
    expect((await owner.post(`/api/approval-requests/${envelopeId}/approve`)).status()).toBe(404); // approving time off is F3
    expect((await withDb((q) => q(`SELECT status FROM time_off_requests WHERE id = $1`, [request.id])))[0].status).toBe('PENDING');
    await Promise.all([employee.dispose(), owner.dispose()]);
  });
});

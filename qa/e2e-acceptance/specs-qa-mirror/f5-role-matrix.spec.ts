import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { hashPassword } from '../../../api/_lib/passwords.js';
import { BASE_URL, qaLib } from '../helpers/qa-mirror';

/**
 * F5-M01 · E2E-C (role × capability × HTTP) and E2E-D (two homologous tenants), real runtime → Neon `main`.
 * Everything is written ONLY into two run-scoped synthetic tenants `E2E-SHIFT-<runId>` (A and B with identical shape, labels and
 * dates, different ids). Teardown deletes exactly the ids created here and proves zero residue. The operative `ShiftImport` and
 * the QA Mirror organisation are never written (this spec never connects an actor to them).
 * Requires the runtime started with TIME_OFF_ENABLED=true (+ IMPORT_AUTO_PUBLISH_ENABLED=true) and this runner with TIME_OFF_ENABLED=true.
 * Evidence: artifacts/f5/role-matrix-<runId>.json (no PII: synthetic ids shortened, no emails, no tokens).
 */
test.use({ screenshot: 'off', trace: 'off', video: 'off', storageState: { cookies: [], origins: [] } });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'API-level scenario: run once (desktop project)');
test.skip(process.env.TIME_OFF_ENABLED !== 'true', 'start the runtime and this runner with TIME_OFF_ENABLED=true');
test.describe.configure({ mode: 'serial' });
test.setTimeout(420_000); // each test performs dozens of real HTTP+DB round trips against Neon

const PASSWORD = 'E2e-pass-1234';
const PLAN = 'historical-and-plan';
type TenantKey = 'A' | 'B';
type RoleKey = 'owner' | 'admin' | 'adminLinked' | 'plannerOrg' | 'plannerAreas' | 'plannerEmps' | 'employee' | 'employee2';
const ROLES: RoleKey[] = ['owner', 'admin', 'adminLinked', 'plannerOrg', 'plannerAreas', 'plannerEmps', 'employee', 'employee2'];
const SCOPE: Record<RoleKey, string> = {
  owner: 'OWNER', admin: 'ADMIN (no employee)', adminLinked: 'ADMIN (linked employee e3)', plannerOrg: 'PLANNER/ORGANIZATION',
  plannerAreas: 'PLANNER/AREAS(area1)', plannerEmps: 'PLANNER/EMPLOYEES(e1)', employee: 'EMPLOYEE(e1)', employee2: 'EMPLOYEE(e2)',
};

interface ApiBody { request: { id: string }; code?: string; scheduleId: string; scheduleVersionId: string; [key: string]: unknown }
interface Org { id: string; area1: string; area2: string; e1: string; e2: string; e3: string; users: Record<RoleKey, { id: string; email: string }> }
let ORG: Record<TenantKey, Org>;
const created = { users: [] as string[], orgs: [] as string[] };
let runId = '';
let cursor = 0;

interface Row { tenant: string; actor: string; scope: string; capability: string; call: string; expected: string; observed: string; ok: boolean; note?: string }
const rows: Row[] = [];
const short = (id: string) => `${id.slice(0, 8)}…`;

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Same week for A and B (homologous data): the cursor advances only once per (capability, actor) pair. */
function weekFor(slot: number) {
  let date = addDays(todayIso(), 240 + slot * 7);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 1) date = addDays(date, 1);
  return date;
}
const nextSlot = () => (cursor += 1);
const fp = () => randomUUID().replaceAll('-', '').padEnd(64, 'a');

async function withDb<T2>(fn: (q: (sql: string, params?: unknown[]) => Promise<Array<Record<string, string | number | null>>>) => Promise<T2>): Promise<T2> {
  const lib = await qaLib();
  const db = await lib.connect();
  try { return await fn(async (sql, params = []) => (await db.query(sql, params)).rows); } finally { await db.end(); }
}
async function login(tenant: TenantKey, role: RoleKey, asOrg?: string): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-organization-id': asOrg ?? ORG[tenant].id } });
  const response = await api.post('/api/auth/login', { data: { email: ORG[tenant].users[role].email, password: PASSWORD } });
  expect(response.ok(), `login ${tenant}/${role}`).toBeTruthy();
  return api;
}
async function call(api: APIRequestContext, method: 'get' | 'post' | 'patch' | 'delete', path: string, data?: unknown) {
  const response = method === 'get' || method === 'delete' ? await api[method](path) : await api[method](path, data === undefined ? {} : { data });
  return { status: response.status(), json: (await response.json().catch(() => ({}))) as ApiBody };
}
function record(tenant: string, role: RoleKey | string, capability: string, callDesc: string, expected: number | number[], observed: number, note?: string) {
  const exp = Array.isArray(expected) ? expected : [expected];
  rows.push({ tenant, actor: String(role), scope: SCOPE[role as RoleKey] ?? String(role), capability, call: callDesc, expected: exp.join('|'), observed: String(observed), ok: exp.includes(observed), note });
}

/** Owner prepares a DRAFT week with assignments for the given employees; returns ids. */
async function ownerDraft(tenant: TenantKey, week: string, employees: string[]) {
  const owner = await login(tenant, 'owner');
  const s = await call(owner, 'post', '/api/schedules', { periodStart: week });
  expect(s.status, 'owner creates schedule').toBe(201);
  const sid = s.json.scheduleId as string; const vid = s.json.scheduleVersionId as string;
  for (const [i, emp] of employees.entries()) {
    const a = await call(owner, 'post', `/api/schedules/${sid}/versions/${vid}/assignments`, { employeeId: emp, date: addDays(week, i), startTime: '08:00', endTime: '16:00', location: 'Regular', shiftType: 'Regular', countsAsWork: true });
    expect(a.status, 'owner adds assignment').toBe(201);
  }
  await owner.dispose();
  return { sid, vid, week };
}

test.beforeAll(async () => {
  runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const hash = hashPassword(PASSWORD);
  ORG = await withDb(async (q) => {
    const build = async (tenant: TenantKey): Promise<Org> => {
      const id = (await q(`INSERT INTO organizations (name, type, plan, approval_policy) VALUES ($1, 'company', 'team', 'ORGANIZATION_ADMIN') RETURNING id`, [`E2E F5 ${tenant} · E2E-SHIFT-${runId}`]))[0].id as string;
      created.orgs.push(id);
      const area1 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'F5 Area 1', $2) RETURNING id`, [id, `F5-${tenant}-${runId}-1`]))[0].id as string;
      const area2 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'F5 Area 2', $2) RETURNING id`, [id, `F5-${tenant}-${runId}-2`]))[0].id as string;
      const users = {} as Org['users'];
      for (const key of ROLES) {
        const email = `${key}-${tenant.toLowerCase()}-${runId.toLowerCase()}@e2e.test`;
        const uid = (await q(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`, [email, hash, `E2E F5 ${key} ${tenant} ${runId}`]))[0].id as string;
        users[key] = { id: uid, email }; created.users.push(uid);
      }
      const member = (key: RoleKey, role: string, scope: string | null = null) => q(`INSERT INTO memberships (user_id, organization_id, role, planner_scope_type) VALUES ($1, $2, $3, $4)`, [users[key].id, id, role, scope]);
      await member('owner', 'OWNER'); await member('admin', 'ADMIN'); await member('adminLinked', 'ADMIN');
      await member('plannerOrg', 'PLANNER', 'ORGANIZATION'); await member('plannerAreas', 'PLANNER', 'AREAS'); await member('plannerEmps', 'PLANNER', 'EMPLOYEES');
      await member('employee', 'EMPLOYEE'); await member('employee2', 'EMPLOYEE');
      const emp = async (name: string, ext: string, area: string, userKey: RoleKey | null) =>
        (await q(`INSERT INTO employees (organization_id, name, external_employee_id, status, area_id, user_id) VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`, [id, name, `${ext}-${tenant}-${runId}`, area, userKey ? users[userKey].id : null]))[0].id as string;
      const e1 = await emp('F5 One', 'E1', area1, 'employee'); const e2 = await emp('F5 Two', 'E2', area1, 'employee2'); const e3 = await emp('F5 Three', 'E3', area2, 'adminLinked');
      await q(`INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id) VALUES ($1, 'PLANNER_AREA', $2, $3), ($1, 'PLANNER_EMPLOYEE', $4, $5)`, [id, users.plannerAreas.id, area1, users.plannerEmps.id, e1]);
      return { id, area1, area2, e1, e2, e3, users };
    };
    return { A: await build('A'), B: await build('B') };
  });
});

test.afterAll(async () => {
  if (!ORG) return;
  const outDir = join(__dirname, '..', 'artifacts', 'f5');
  mkdirSync(outDir, { recursive: true });
  const summary = {
    task: 'SHIFTIMPORT_F5_END_TO_END_FINAL_GATE · F5-M01 · E2E-C/E2E-D', runId, baseline: 'a19dc47', generatedAt: new Date().toISOString(),
    tenants: { A: short(ORG.A.id), B: short(ORG.B.id) }, total: rows.length, mismatches: rows.filter((r) => !r.ok).length,
    limitations: ['synthetic tenants only; the operative org and the QA Mirror org are not touched by this spec', 'HTTP observed through the real runtime; DB rows verified by query where stated'],
    rows,
  };
  writeFileSync(join(outDir, `role-matrix-${runId}.json`), JSON.stringify(summary, null, 2));
  await withDb(async (q) => {
    for (const org of created.orgs) {
      await q(`DELETE FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1)`, [org]);
      await q(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1)`, [org]);
      await q(`DELETE FROM schedules WHERE organization_id = $1`, [org]);
    }
    for (const id of created.orgs) await q(`DELETE FROM organizations WHERE id = $1`, [id]);
    for (const id of created.users) await q(`DELETE FROM users WHERE id = $1`, [id]);
    const residue = await q(`SELECT (SELECT COUNT(*) FROM organizations WHERE id = ANY($1::uuid[])) + (SELECT COUNT(*) FROM users WHERE id = ANY($2::uuid[])) + (SELECT COUNT(*) FROM time_off_requests WHERE organization_id = ANY($1::uuid[])) + (SELECT COUNT(*) FROM shifts WHERE organization_id = ANY($1::uuid[])) AS n`, [created.orgs, created.users]);
    expect(Number(residue[0].n), 'QA_TEMP_RESIDUE').toBe(0);
  });
});

const failures = () => rows.filter((r) => !r.ok).map((r) => `${r.tenant}/${r.actor} ${r.capability} ${r.call}: expected ${r.expected} observed ${r.observed}`);

for (const tenant of ['A', 'B'] as TenantKey[]) {
  test(`[tenant ${tenant}] READ + PLAN (create schedule, add assignment in/out of scope) by role`, async () => {
    // READ capabilities: lists are server-scoped. Record the visible-employee count and prove no foreign id leaks.
    const foreign = new Set([ORG[tenant === 'A' ? 'B' : 'A'].e1, ORG[tenant === 'A' ? 'B' : 'A'].e2, ORG[tenant === 'A' ? 'B' : 'A'].e3]);
    for (const role of ROLES) {
      const api = await login(tenant, role);
      const isManager = !['employee', 'employee2'].includes(role);
      const emps = await call(api, 'get', '/api/employees');
      record(tenant, role, 'read employees', 'GET /api/employees', [200, 403], emps.status, emps.status === 200 ? `visible=${JSON.stringify(emps.json).match(/"id"/g)?.length ?? 0}` : undefined);
      expect(JSON.stringify(emps.json)).not.toMatch(new RegExp([...foreign].join('|')));
      const sched = await call(api, 'get', '/api/schedules');
      record(tenant, role, 'read schedules', 'GET /api/schedules', isManager ? 200 : [403, 404], sched.status);
      const pending = await call(api, 'get', '/api/approval-requests?status=pending');
      record(tenant, role, 'read approval inbox', 'GET /api/approval-requests', isManager ? 200 : [403, 404], pending.status);
      await api.dispose();
    }
    // PLAN: each actor tries to create its own schedule (distinct week per actor) and add an assignment on an owner-made draft.
    for (const role of ROLES) {
      const base = await ownerDraft(tenant, weekFor(nextSlot()), []); // fresh empty draft per actor: same target for everybody
      const api = await login(tenant, role);
      const own = weekFor(nextSlot());
      const create = await call(api, 'post', '/api/schedules', { periodStart: own });
      const allowedToPlan = ['owner', 'admin', 'adminLinked', 'plannerOrg', 'plannerAreas', 'plannerEmps'].includes(role);
      record(tenant, role, 'create schedule', 'POST /api/schedules', allowedToPlan ? 201 : 403, create.status);
      const inside = await call(api, 'post', `/api/schedules/${base.sid}/versions/${base.vid}/assignments`, { employeeId: ORG[tenant].e1, date: base.week, startTime: '08:00', endTime: '16:00', location: 'Regular', shiftType: 'Regular', countsAsWork: true });
      record(tenant, role, 'add assignment (e1, area1)', 'POST …/assignments', allowedToPlan ? 201 : 403, inside.status);
      const outside = await call(api, 'post', `/api/schedules/${base.sid}/versions/${base.vid}/assignments`, { employeeId: ORG[tenant].e3, date: addDays(base.week, 1), startTime: '08:00', endTime: '16:00', location: 'Regular', shiftType: 'Regular', countsAsWork: true });
      const outsideExpected = ['plannerAreas', 'plannerEmps'].includes(role) ? [403, 404] : allowedToPlan ? 201 : 403;
      record(tenant, role, 'add assignment (e3, area2)', 'POST …/assignments', outsideExpected, outside.status);
      await api.dispose();
    }
    expect(failures().filter((f) => f.startsWith(`${tenant}/`) && /read|create|add/.test(f))).toEqual([]);
  });

  test(`[tenant ${tenant}] PUBLISH + IMPORT by role (scope enforced server-side)`, async () => {
    for (const role of ROLES) {
      const manager = ['owner', 'admin', 'adminLinked', 'plannerOrg', 'plannerAreas', 'plannerEmps'].includes(role);
      const scoped = ['plannerAreas', 'plannerEmps'].includes(role);
      // Publish: inside-scope draft (e1 only) and a mixed draft (e1 + e3).
      const inDraft = await ownerDraft(tenant, weekFor(nextSlot()), [ORG[tenant].e1]);
      const mixed = await ownerDraft(tenant, weekFor(nextSlot()), [ORG[tenant].e1, ORG[tenant].e3]);
      const api = await login(tenant, role);
      const pubIn = await call(api, 'post', `/api/schedules/${inDraft.sid}/versions/${inDraft.vid}/publish`);
      record(tenant, role, 'publish (draft with e1 only)', 'POST …/publish', manager ? 200 : 403, pubIn.status);
      const pubMixed = await call(api, 'post', `/api/schedules/${mixed.sid}/versions/${mixed.vid}/publish`);
      record(tenant, role, 'publish (draft with e1+e3)', 'POST …/publish', scoped ? [403, 404] : manager ? 200 : 403, pubMixed.status);
      // Import (plan only, never publishes): e1 alone, then e1 + e3.
      const wk = weekFor(nextSlot());
      const reg = (employeeId: string, date: string) => ({ employeeId, date, startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true, location: '', origin: 'IMP' });
      const body = (shifts: ReturnType<typeof reg>[]) => ({ fileName: 'f5.csv', sourceFormat: 'CSV', fileFingerprint: fp(), importMode: 'team', futureConsent: PLAN, weekStart: 'monday', employeeId: shifts[0].employeeId, shifts });
      const impIn = await call(api, 'post', '/api/imports/confirm-split', body([reg(ORG[tenant].e1, wk)]));
      record(tenant, role, 'import (e1)', 'POST /api/imports/confirm-split', manager ? [200, 201] : 403, impIn.status);
      const impMixed = await call(api, 'post', '/api/imports/confirm-split', body([reg(ORG[tenant].e1, addDays(wk, 1)), reg(ORG[tenant].e3, addDays(wk, 1))]));
      record(tenant, role, 'import (e1+e3)', 'POST /api/imports/confirm-split', scoped ? 403 : manager ? [200, 201] : 403, impMixed.status);
      await api.dispose();
    }
    expect(failures().filter((f) => f.startsWith(`${tenant}/`) && /publish|import/.test(f))).toEqual([]);
  });

  test(`[tenant ${tenant}] TIME OFF: request (needs linked employee), decide by role/scope, anti-self-approval`, async () => {
    // Request: only actors with a linked employee may use the SELF API; managers without a link get 403 EMPLOYEE_LINK_REQUIRED.
    const requests: Record<string, { id: string; envelope: string }> = {};
    const mk = async (role: RoleKey, slot: number) => {
      const api = await login(tenant, role);
      const start = weekFor(slot);
      const r = await call(api, 'post', '/api/me/time-off-requests', { requestType: 'VACATION', startDate: start, endDate: addDays(start, 1) });
      await api.dispose();
      return r;
    };
    for (const role of ROLES) {
      const linked = ['employee', 'employee2', 'adminLinked'].includes(role);
      const res = await mk(role, nextSlot());
      record(tenant, role, 'time-off create (SELF)', 'POST /api/me/time-off-requests', linked ? 201 : 403, res.status, res.json.code ? String(res.json.code) : undefined);
      if (res.status === 201) {
        const envelope = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [res.json.request.id])))[0].id as string;
        requests[role] = { id: res.json.request.id as string, envelope };
      }
    }
    // Decide: one fresh employee request (e1) per deciding actor, so every actor faces the same target. e1 belongs to area1.
    for (const role of ROLES) {
      const req = await mk('employee', nextSlot());
      expect(req.status).toBe(201);
      const envelope = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [req.json.request.id])))[0].id as string;
      const api = await login(tenant, role);
      const d = await call(api, 'post', `/api/approval-requests/${envelope}/approve`);
      // ORGANIZATION_ADMIN policy: OWNER/ADMIN/org-wide PLANNER decide; AREAS/EMPLOYEES planners and employees do not; EMPLOYEE(e1) never self-approves.
      const allowed = ['owner', 'admin', 'adminLinked', 'plannerOrg'].includes(role);
      record(tenant, role, 'time-off approve (target e1)', 'POST …/approve', allowed ? 200 : [403, 404], d.status, d.json.code ? String(d.json.code) : undefined);
      await api.dispose();
    }
    // Anti-self-approval by employeeId: adminLinked (linked to e3) cannot approve its own request, an org-wide OWNER can.
    if (requests.adminLinked) {
      const self = await login(tenant, 'adminLinked');
      const own = await call(self, 'post', `/api/approval-requests/${requests.adminLinked.envelope}/approve`);
      record(tenant, 'adminLinked', 'time-off approve OWN request (anti-self)', 'POST …/approve', 403, own.status, own.json.code ? String(own.json.code) : undefined);
      await self.dispose();
      const owner = await login(tenant, 'owner');
      const byOwner = await call(owner, 'post', `/api/approval-requests/${requests.adminLinked.envelope}/approve`);
      record(tenant, 'owner', 'time-off approve (target e3, other actor)', 'POST …/approve', 200, byOwner.status);
      await owner.dispose();
    }
    // Reject needs a reason (400/422), and a valid reason works for an authorised actor.
    const rr = await mk('employee', nextSlot());
    const renv = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [rr.json.request.id])))[0].id as string;
    const admin = await login(tenant, 'admin');
    const noReason = await call(admin, 'post', `/api/approval-requests/${renv}/reject`, {});
    record(tenant, 'admin', 'time-off reject without reason', 'POST …/reject', [400, 422], noReason.status);
    const withReason = await call(admin, 'post', `/api/approval-requests/${renv}/reject`, { reason: 'F5 synthetic rejection' });
    record(tenant, 'admin', 'time-off reject with reason', 'POST …/reject', 200, withReason.status);
    await admin.dispose();
    // Non-enabled type and overlap.
    const emp = await login(tenant, 'employee');
    const sick = await call(emp, 'post', '/api/me/time-off-requests', { requestType: 'SICK_LEAVE', startDate: weekFor(nextSlot()), endDate: weekFor(nextSlot()) });
    record(tenant, 'employee', 'time-off non-enabled type', 'POST /api/me/time-off-requests', 422, sick.status, sick.json.code ? String(sick.json.code) : undefined);
    expect(sick.json.code).toBe('TIME_OFF_TYPE_NOT_ENABLED');
    const ov = weekFor(nextSlot());
    const first = await call(emp, 'post', '/api/me/time-off-requests', { requestType: 'VACATION', startDate: ov, endDate: addDays(ov, 2) });
    const second = await call(emp, 'post', '/api/me/time-off-requests', { requestType: 'VACATION', startDate: addDays(ov, 1), endDate: addDays(ov, 3) });
    record(tenant, 'employee', 'time-off overlap (23P01 → 409)', 'POST /api/me/time-off-requests', [201, 201].includes(first.status) ? 409 : 0, second.status, second.json.code ? String(second.json.code) : undefined);
    await emp.dispose();
    expect(failures().filter((f) => f.startsWith(`${tenant}/`) && /time-off/.test(f))).toEqual([]);
  });
}

test('[E2E-D] cross-tenant: every actor of A against B resources and vice-versa; errors do not reveal existence', async () => {
  const wk = weekFor(nextSlot());
  const targets = {} as Record<TenantKey, { sid: string; vid: string; req: string; env: string }>;
  for (const t of ['A', 'B'] as TenantKey[]) {
    const draft = await ownerDraft(t, weekFor(nextSlot()), [ORG[t].e1]);
    const emp = await login(t, 'employee');
    const r = await call(emp, 'post', '/api/me/time-off-requests', { requestType: 'VACATION', startDate: wk, endDate: addDays(wk, 1) });
    await emp.dispose();
    const env = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [r.json.request.id])))[0].id as string;
    targets[t] = { ...draft, req: r.json.request.id as string, env };
  }
  const ghost = randomUUID();
  const before = await withDb((q) => q(`SELECT (SELECT COUNT(*) FROM shifts WHERE organization_id = ANY($1::uuid[])) AS s, (SELECT COUNT(*) FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id=v.schedule_id WHERE s.organization_id = ANY($1::uuid[]))) AS a, (SELECT COUNT(*) FROM time_off_requests WHERE organization_id = ANY($1::uuid[]) AND status <> 'PENDING') AS t`, [created.orgs]));
  for (const [home, other] of [['A', 'B'], ['B', 'A']] as Array<[TenantKey, TenantKey]>) {
    const tgt = targets[other];
    for (const role of ROLES) {
      const api = await login(home, role); // header = home org: the actor's own, valid tenant
      const add = await call(api, 'post', `/api/schedules/${tgt.sid}/versions/${tgt.vid}/assignments`, { employeeId: ORG[other].e1, date: wk, startTime: '08:00', endTime: '16:00', location: 'Regular', shiftType: 'Regular', countsAsWork: true });
      record(`${home}→${other}`, role, 'cross-tenant add assignment', 'POST …/assignments (foreign version)', [403, 404], add.status);
      const pub = await call(api, 'post', `/api/schedules/${tgt.sid}/versions/${tgt.vid}/publish`);
      record(`${home}→${other}`, role, 'cross-tenant publish', 'POST …/publish (foreign version)', [403, 404], pub.status);
      const dec = await call(api, 'post', `/api/approval-requests/${tgt.env}/approve`);
      record(`${home}→${other}`, role, 'cross-tenant approve', 'POST …/approve (foreign envelope)', [403, 404], dec.status);
      const cancel = await call(api, 'post', `/api/me/time-off-requests/${tgt.req}/cancel`);
      record(`${home}→${other}`, role, 'cross-tenant cancel', 'POST …/cancel (foreign request)', [403, 404], cancel.status);
      const imp = await call(api, 'post', '/api/imports/confirm-split', { fileName: 'x.csv', sourceFormat: 'CSV', fileFingerprint: fp(), importMode: 'team', futureConsent: PLAN, weekStart: 'monday', employeeId: ORG[other].e1, shifts: [{ employeeId: ORG[other].e1, date: wk, startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true, location: '', origin: 'IMP' }] });
      record(`${home}→${other}`, role, 'cross-tenant import (foreign employee)', 'POST /api/imports/confirm-split', 403, imp.status, imp.json.code ? String(imp.json.code) : undefined);
      // No existence leak: a foreign id and a non-existent id answer identically.
      const g = await call(api, 'post', `/api/approval-requests/${ghost}/approve`);
      record(`${home}→${other}`, role, 'existence not revealed (foreign vs non-existent envelope)', 'POST …/approve', dec.status, g.status, g.status === dec.status ? 'identical status' : 'DIFFERENT');
      await api.dispose();
    }
  }
  // Client-controlled tenant header: a member of A asking for B (no membership) must be refused with no data.
  for (const role of ['owner', 'plannerOrg', 'employee'] as RoleKey[]) {
    const api = await login('A', role);
    const resp = await api.get('/api/employees', { headers: { 'x-organization-id': ORG.B.id } }); // per-request override: tenant without membership
    const r = { status: resp.status(), json: (await resp.json().catch(() => ({}))) as ApiBody };
    // Contract (auth.js · requireOrgContext): a requested org without membership ⇒ no active organisation ⇒ 400, no fallback, no data.
    record('A→B header', role, 'x-organization-id of a non-member tenant', 'GET /api/employees', [400, 401, 403, 404], r.status);
    const ghostOrg = await api.get('/api/employees', { headers: { 'x-organization-id': randomUUID() } });
    record('A→B header', role, 'existence not revealed (real foreign org vs non-existent org)', 'GET /api/employees', r.status, ghostOrg.status(), ghostOrg.status() === r.status ? 'identical status' : 'DIFFERENT');
    expect(JSON.stringify(r.json)).not.toContain(ORG.B.e1);
    await api.dispose();
  }
  const after = await withDb((q) => q(`SELECT (SELECT COUNT(*) FROM shifts WHERE organization_id = ANY($1::uuid[])) AS s, (SELECT COUNT(*) FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id=v.schedule_id WHERE s.organization_id = ANY($1::uuid[]))) AS a, (SELECT COUNT(*) FROM time_off_requests WHERE organization_id = ANY($1::uuid[]) AND status <> 'PENDING') AS t`, [created.orgs]));
  expect(after, 'no cross-tenant mutation happened (assignments, shifts, decided requests unchanged)').toEqual(before);
  expect(failures().filter((f) => f.includes('→'))).toEqual([]);
});

test('matrix consolidated: zero mismatches across both homologous tenants', async () => {
  expect(rows.length).toBeGreaterThan(150);
  expect(failures()).toEqual([]);
});

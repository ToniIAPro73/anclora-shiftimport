import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { hashPassword } from '../../../api/_lib/passwords.js';
import { BASE_URL, qaLib } from '../helpers/qa-mirror';

/**
 * F1 auto-publication, end to end against the real local runtime (development code → Neon `main`), real authentication, real scope
 * resolution and the real database. Everything is written ONLY into run-scoped synthetic tenants `E2E-SHIFT-<runId>` (users `@e2e.test`);
 * teardown removes exactly the ids created here and proves zero residue. The real `ShiftImport` and Groundforce are never touched.
 * Requires the runtime to be started with IMPORT_AUTO_PUBLISH_ENABLED=true.
 */
test.use({ screenshot: 'off', trace: 'off', video: 'off', storageState: { cookies: [], origins: [] } });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'API-level scenario: run once (desktop project)');
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'E2e-pass-1234';
const AUTO = 'historical-and-auto-publish';
const PLAN = 'historical-and-plan';

interface Tenant {
  orgA: string; orgB: string; areaA1: string; areaA2: string;
  e1: string; e2: string; e3: string; eB: string;
  users: Record<string, { id: string; email: string }>;
  ids: { users: string[]; orgs: string[] };
}
let T: Tenant;
let runId = '';
let weekCursor = 0;

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
function nextMondayAfter(weeks: number) {
  let date = addDays(todayIso(), 7);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 1) date = addDays(date, 1);
  return addDays(date, weeks * 7);
}
const freshWeek = () => nextMondayAfter((weekCursor += 2) - 2); // 2 weeks apart: a test may also use the following week
const fp = () => randomUUID().replaceAll('-', '').padEnd(64, 'a');
const reg = (employeeId: string, date: string, start = '05:00', end = '13:00') => ({ employeeId, date, startTime: start, endTime: end, shiftType: 'Regular', countsAsWork: true, location: '', origin: 'IMP' });

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
const body = (shifts: unknown[], extra: Record<string, unknown> = {}) => ({
  fileName: 'e2e-auto-publish.csv', sourceFormat: 'CSV', fileFingerprint: fp(), importMode: 'team', futureConsent: AUTO, weekStart: 'monday', ...extra,
  employeeId: (shifts[0] as { employeeId: string }).employeeId, shifts,
});
const confirm = async (api: APIRequestContext, shifts: unknown[], extra: Record<string, unknown> = {}) => {
  const response = await api.post('/api/imports/confirm-split', { data: body(shifts, extra) });
  return { status: response.status(), json: await response.json().catch(() => ({})) };
};
const effective = (org: string, from: string, to: string) => withDb((q) => q(
  `SELECT employee_id, TO_CHAR(date,'YYYY-MM-DD') AS date, provenance, import_id, effective_state FROM shifts WHERE organization_id = $1 AND date BETWEEN $2 AND $3 AND effective_state = 'EFFECTIVE' ORDER BY date, employee_id`, [org, from, to]));

test.beforeAll(async () => {
  runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const hash = hashPassword(PASSWORD);
  T = await withDb(async (q) => {
    const ids = { users: [] as string[], orgs: [] as string[] };
    const org = async (name: string) => { const id = (await q(`INSERT INTO organizations (name, type, plan) VALUES ($1, 'company', 'team') RETURNING id`, [`${name} · E2E-SHIFT-${runId}`]))[0].id; ids.orgs.push(id); return id; };
    const orgA = await org('E2E Auto A'); const orgB = await org('E2E Auto B');
    const areaA1 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'E2E A1', $2) RETURNING id`, [orgA, `AREA-${runId}-1`]))[0].id;
    const areaA2 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'E2E A2', $2) RETURNING id`, [orgA, `AREA-${runId}-2`]))[0].id;
    const users: Tenant['users'] = {};
    const user = async (key: string) => {
      const email = `${key}-${runId.toLowerCase()}@e2e.test`;
      const id = (await q(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`, [email, hash, `E2E ${key} ${runId}`]))[0].id;
      users[key] = { id, email }; ids.users.push(id);
    };
    for (const key of ['owner', 'admin', 'plannerOrg', 'plannerAreas', 'plannerEmps', 'employee', 'employee2', 'ownerB']) await user(key);
    const member = (key: string, organization: string, role: string, scope: string | null = null) =>
      q(`INSERT INTO memberships (user_id, organization_id, role, planner_scope_type) VALUES ($1, $2, $3, $4)`, [users[key].id, organization, role, scope]);
    await member('owner', orgA, 'OWNER'); await member('admin', orgA, 'ADMIN');
    await member('plannerOrg', orgA, 'PLANNER', 'ORGANIZATION'); await member('plannerAreas', orgA, 'PLANNER', 'AREAS'); await member('plannerEmps', orgA, 'PLANNER', 'EMPLOYEES');
    await member('employee', orgA, 'EMPLOYEE'); await member('employee2', orgA, 'EMPLOYEE'); await member('ownerB', orgB, 'OWNER');
    const emp = async (organization: string, name: string, ext: string, area: string | null, userKey: string | null) =>
      (await q(`INSERT INTO employees (organization_id, name, external_employee_id, status, area_id, user_id) VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`,
        [organization, name, `${ext}-${runId}`, area, userKey ? users[userKey].id : null]))[0].id;
    const e1 = await emp(orgA, 'E2E One', 'E1', areaA1, 'employee'); const e2 = await emp(orgA, 'E2E Two', 'E2', areaA1, 'employee2');
    const e3 = await emp(orgA, 'E2E Three', 'E3', areaA2, null); const eB = await emp(orgB, 'E2E Other Tenant', 'EB', null, null);
    await q(`INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id) VALUES ($1, 'PLANNER_AREA', $2, $3), ($1, 'PLANNER_EMPLOYEE', $4, $5)`,
      [orgA, users.plannerAreas.id, areaA1, users.plannerEmps.id, e1]);
    return { orgA, orgB, areaA1, areaA2, e1, e2, e3, eB, users, ids };
  });
});

test.afterAll(async () => {
  if (!T) return;
  await withDb(async (q) => {
    // Exactly the ids created by this run; cascades clean every dependent row of the synthetic tenants.
    for (const org of T.ids.orgs) {
      await q(`DELETE FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1)`, [org]);
      await q(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1)`, [org]);
      await q(`DELETE FROM schedules WHERE organization_id = $1`, [org]);
    }
    for (const id of T.ids.orgs) await q(`DELETE FROM organizations WHERE id = $1`, [id]);
    for (const id of T.ids.users) await q(`DELETE FROM users WHERE id = $1`, [id]);
    const residue = await q(`SELECT (SELECT COUNT(*) FROM organizations WHERE id = ANY($1::uuid[])) + (SELECT COUNT(*) FROM users WHERE id = ANY($2::uuid[])) AS n`, [T.ids.orgs, T.ids.users]);
    expect(Number(residue[0].n)).toBe(0);
  });
});

test('OWNER: MIXED clean file → auto-publishes only the future pairs, stamps provenance, one notification per employee per batch', async () => {
  const api = await login('owner', T.orgA);
  const w = freshWeek(); const w2 = addDays(w, 7);
  const past = addDays(todayIso(), -40);
  const preview = await (await api.post('/api/imports/plan-preview', { data: { ...body([reg(T.e1, past), reg(T.e1, w), reg(T.e2, w), reg(T.e1, w2), reg(T.e2, w2)]), futureConsent: undefined } })).json();
  expect(preview.autoPublish.eligible).toBe(true);
  expect(preview.autoPublish.willPublishShiftCount).toBe(4);
  const r = await confirm(api, [reg(T.e1, past), reg(T.e1, w), reg(T.e2, w), reg(T.e1, w2), reg(T.e2, w2)]);
  expect([200, 201]).toContain(r.status);
  expect(r.json.future.publishedWeekCount).toBe(2);
  expect(r.json.future.publishedShiftCount).toBe(4);
  expect(r.json.future.retained).toEqual([]);
  expect(r.json.historical.persistedCount).toBe(1);
  const rows = await effective(T.orgA, w, addDays(w2, 6));
  expect(rows).toHaveLength(4);
  expect(rows.every((x) => x.provenance === 'SCHEDULE_PUBLICATION' && x.import_id === r.json.importId)).toBe(true);
  const pastRow = await effective(T.orgA, past, past);
  expect(pastRow[0].provenance).not.toBe('SCHEDULE_PUBLICATION'); // INV-05: the past never goes through Planning
  const notifications = await withDb((q) => q(`SELECT user_id FROM notifications WHERE organization_id = $1 AND type = 'SHIFT_PUBLISHED'`, [T.orgA]));
  expect(notifications).toHaveLength(2);
  expect(new Set(notifications.map((n) => n.user_id))).toEqual(new Set([T.users.employee.id, T.users.employee2.id]));
  await api.dispose();
});

test('ADMIN: FUTURE-only clean file auto-publishes; replaying it is idempotent', async () => {
  const api = await login('admin', T.orgA);
  const w = freshWeek();
  const data = body([reg(T.e1, w), reg(T.e2, addDays(w, 1))]);
  const first = await (await api.post('/api/imports/confirm-split', { data })).json();
  expect(first.future.publishedWeekCount).toBe(1);
  const again = await (await api.post('/api/imports/confirm-split', { data })).json();
  expect(again.deduplicated).toBe(true);
  expect(await effective(T.orgA, w, addDays(w, 6))).toHaveLength(2);
  await api.dispose();
});

test('SPLIT: a rest violation is retained in a new draft, the rest is published, and the whole thing reverts 1:1', async () => {
  const api = await login('owner', T.orgA);
  const w = freshWeek();
  const before = await effective(T.orgA, w, addDays(w, 6));
  const r = await confirm(api, [reg(T.e1, w, '14:00', '22:00'), reg(T.e1, addDays(w, 1), '05:00', '13:00'), reg(T.e2, addDays(w, 1))]);
  expect(r.json.future.publicationResults[0].status).toBe('SPLIT');
  expect(r.json.future.retained).toEqual([{ employeeId: T.e1, date: addDays(w, 1), reason: 'REST_RULE_VIOLATION' }]);
  expect((await effective(T.orgA, w, addDays(w, 6))).map((x) => `${x.employee_id}|${x.date}`).sort()).toEqual([`${T.e1}|${w}`, `${T.e2}|${addDays(w, 1)}`].sort());
  const preview = await (await api.post('/api/imports/reversions/preview', { data: { importIds: [r.json.importId] } })).json();
  expect(preview.status).toBe('READY');
  const done = await api.post('/api/imports/reversions/confirm', { data: { importIds: [r.json.importId], planHash: preview.planHash } });
  expect(done.ok()).toBeTruthy();
  expect(await effective(T.orgA, w, addDays(w, 6))).toEqual(before);
  const versions = await withDb((q) => q(`SELECT sv.status FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id WHERE s.organization_id = $1 AND s.period_start = $2`, [T.orgA, w]));
  expect(versions).toEqual([]); // the published week and the retained draft both disappeared with the import
  await api.dispose();
});

test('OD-05 / INV-15: manual CURRENT, NULL/unknown provenance and pending modifications are retained, never overwritten', async () => {
  const api = await login('owner', T.orgA);
  const w = freshWeek();
  const d = (n: number) => addDays(w, n);
  await withDb(async (q) => {
    const insert = (employee: string, date: string, provenance: string | null) => q(
      `INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, origin, shift_type, counts_as_work, effective_state, provenance, layer) VALUES ($1,$2,$3,'06:00','14:00','MAN','Regular',TRUE,'EFFECTIVE',$4,'CHANGE')`,
      [T.orgA, employee, date, provenance]);
    await insert(T.e1, d(0), 'MANUAL_ADMIN_CHANGE');
    await insert(T.e1, d(1), null);
    await insert(T.e1, d(2), 'COMPANY_IMPORT');
    const pending = (await q(`SELECT id FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3`, [T.orgA, T.e1, d(2)]))[0].id;
    await q(`INSERT INTO change_requests (shift_id, employee_id, organization_id, request_type, reason, status) VALUES ($1,$2,$3,'OTHER','e2e pending','PENDING')`, [pending, T.e1, T.orgA]);
  });
  const r = await confirm(api, [reg(T.e1, d(0)), reg(T.e1, d(1)), reg(T.e1, d(2)), reg(T.e2, d(0))]);
  expect([200, 201]).toContain(r.status);
  const reasons = Object.fromEntries((r.json.future.retained as Array<{ date: string; reason: string }>).map((x) => [x.date, x.reason]));
  expect(reasons).toEqual({ [d(0)]: 'MANUAL_CURRENT_PROTECTED', [d(1)]: 'UNATTRIBUTABLE_PROVENANCE', [d(2)]: 'PENDING_MODIFICATION' });
  const rows = await effective(T.orgA, d(0), d(2));
  expect(rows.filter((x) => x.provenance === 'SCHEDULE_PUBLICATION').map((x) => `${x.employee_id}|${x.date}`)).toEqual([`${T.e2}|${d(0)}`]);
  expect(rows.find((x) => x.employee_id === T.e1 && x.date === d(0))?.provenance).toBe('MANUAL_ADMIN_CHANGE');
  await api.dispose();
});

test('a published import is blocked from reverting after a manual edit and when a shift has dependents', async () => {
  const api = await login('owner', T.orgA);
  const w = freshWeek();
  const r = await confirm(api, [reg(T.e1, w), reg(T.e2, w)]);
  await withDb((q) => q(`UPDATE shifts SET start_time = '07:00' WHERE import_id = $1 AND employee_id = $2`, [r.json.importId, T.e1]));
  const preview = await (await api.post('/api/imports/reversions/preview', { data: { importIds: [r.json.importId] } })).json();
  expect(preview.status).toBe('BLOCKED');
  const w2 = freshWeek();
  const r2 = await confirm(api, [reg(T.e1, w2)]);
  await withDb(async (q) => {
    const shift = (await q(`SELECT id, employee_id FROM shifts WHERE import_id = $1`, [r2.json.importId]))[0];
    await q(`INSERT INTO shift_acknowledgements (shift_id, employee_id) VALUES ($1, $2)`, [shift.id, shift.employee_id]);
  });
  const blocked = await (await api.post('/api/imports/reversions/preview', { data: { importIds: [r2.json.importId] } })).json();
  expect(blocked.status).toBe('BLOCKED');
  expect(JSON.stringify(blocked.blockers)).toContain('PUBLISHED_SHIFT_HAS_DEPENDENTS');
  await api.dispose();
});

test('RBAC: PLANNER ORGANIZATION publishes; PLANNER AREAS only inside its areas; PLANNER EMPLOYEES only its employees', async () => {
  const org = await login('plannerOrg', T.orgA);
  expect([200, 201]).toContain((await confirm(org, [reg(T.e1, freshWeek()), reg(T.e3, freshWeek())])).status);
  await org.dispose();

  const areas = await login('plannerAreas', T.orgA);
  const inArea = await confirm(areas, [reg(T.e1, freshWeek()), reg(T.e2, freshWeek())]);
  expect([200, 201]).toContain(inArea.status);
  expect(inArea.json.future.publishedWeekCount).toBeGreaterThan(0);
  const outside = await confirm(areas, [reg(T.e1, freshWeek()), reg(T.e3, freshWeek())]);
  expect(outside.status).toBe(403);
  await areas.dispose();

  const emps = await login('plannerEmps', T.orgA);
  const own = await confirm(emps, [reg(T.e1, freshWeek())]);
  expect([200, 201]).toContain(own.status);
  const other = await confirm(emps, [reg(T.e1, freshWeek()), reg(T.e2, freshWeek())]);
  expect(other.status).toBe(403);
  const preview = await (await emps.post('/api/imports/plan-preview', { data: { ...body([reg(T.e1, freshWeek())]), futureConsent: undefined } })).json();
  expect(preview.autoPublish.eligible).toBe(true);
  await emps.dispose();
});

test('RBAC: EMPLOYEE cannot plan or auto-publish; another tenant cannot be reached', async () => {
  const employee = await login('employee', T.orgA);
  expect((await confirm(employee, [reg(T.e1, freshWeek())])).status).toBe(403);
  expect((await employee.post('/api/imports/plan-preview', { data: { ...body([reg(T.e1, freshWeek())]), futureConsent: undefined } })).status()).toBe(403);
  await employee.dispose();

  const owner = await login('owner', T.orgA);
  const cross = await confirm(owner, [reg(T.eB, freshWeek())]);
  expect(cross.status).toBe(403);
  expect(cross.json.code).toBe('TENANT_FORBIDDEN');
  const stray = await withDb((q) => q(`SELECT 1 FROM shifts WHERE organization_id = $1`, [T.orgB]));
  expect(stray).toHaveLength(0);
  await owner.dispose();

  const ownerB = await login('ownerB', T.orgB);
  expect((await confirm(ownerB, [reg(T.e1, freshWeek())])).status).toBe(403); // org A employee from org B
  await ownerB.dispose();
});

test('INV-06: the legacy `publish` value and historical-and-plan never publish', async () => {
  const api = await login('owner', T.orgA);
  for (const futureConsent of ['publish', PLAN]) {
    const w = freshWeek();
    const r = await confirm(api, [reg(T.e1, w)], { futureConsent });
    expect([200, 201]).toContain(r.status);
    expect(r.json.decision).toBe(PLAN);
    expect(r.json.future.publishedWeekCount).toBe(0);
    expect(await effective(T.orgA, w, addDays(w, 6))).toHaveLength(0);
  }
  await api.dispose();
});

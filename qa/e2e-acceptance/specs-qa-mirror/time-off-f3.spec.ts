import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { hashPassword } from '../../../api/_lib/passwords.js';
import { BASE_URL, qaLib } from '../helpers/qa-mirror';

/**
 * F3 end to end against the real local runtime (development code → Neon `main` with 0050 applied): vacation approval and
 * materialisation, planning protection, import conflict and the audited override, with real authentication, real scope resolution and
 * the real database. Everything is written ONLY into run-scoped synthetic tenants `E2E-SHIFT-<runId>` (users `@e2e.test`); teardown
 * removes exactly the ids created here and proves zero residue. The real `ShiftImport` and Groundforce are never touched.
 * Requires the runtime to be started with TIME_OFF_ENABLED=true (and run with the same variable in the test process).
 */
test.use({ screenshot: 'off', trace: 'off', video: 'off', storageState: { cookies: [], origins: [] } });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'API-level scenario: run once (desktop project)');
test.skip(process.env.TIME_OFF_ENABLED !== 'true', 'start the runtime with TIME_OFF_ENABLED=true (and run this spec with the same variable)');
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'E2e-pass-1234';
const PLAN = 'historical-and-plan';

interface Tenant {
  orgA: string; orgB: string; areaA1: string; areaA2: string; e1: string; e2: string; eB: string;
  users: Record<string, { id: string; email: string }>;
  ids: { users: string[]; orgs: string[] };
}
let T: Tenant;
let runId = '';
let cursor = 0;

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** A Monday ≥ 20 weeks ahead, unique per call (several weeks apart so tests never collide on dates). */
function freshMonday() {
  let date = addDays(todayIso(), 140 + (cursor += 21));
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 1) date = addDays(date, 1);
  return date;
}
const fp = () => randomUUID().replaceAll('-', '').padEnd(64, 'a');

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
const post = async (api: APIRequestContext, path: string, data?: unknown) => {
  const response = await api.post(path, data === undefined ? {} : { data });
  return { status: response.status(), json: await response.json().catch(() => ({})) };
};
const shiftsOf = (employee: string, from: string, to: string) => withDb((q) => q(
  `SELECT id, TO_CHAR(date,'YYYY-MM-DD') AS date, shift_type, effective_state, provenance, time_off_request_id, start_time FROM shifts
   WHERE organization_id = $1 AND employee_id = $2 AND date BETWEEN $3 AND $4 ORDER BY date, effective_state, id`, [T.orgA, employee, from, to]));

/** Employee asks, OWNER approves: returns the request id and the approval envelope id. */
async function approvedVacation(start: string, end: string) {
  const employee = await login('employee', T.orgA);
  const created = await post(employee, '/api/me/time-off-requests', { requestType: 'VACATION', startDate: start, endDate: end });
  expect(created.status).toBe(201);
  const requestId = created.json.request.id as string;
  const envelope = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [requestId])))[0].id as string;
  const owner = await login('owner', T.orgA);
  const approved = await post(owner, `/api/approval-requests/${envelope}/approve`);
  expect(approved.status).toBe(200);
  await Promise.all([employee.dispose(), owner.dispose()]);
  return { requestId, envelope };
}

test.beforeAll(async () => {
  runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const hash = hashPassword(PASSWORD);
  T = await withDb(async (q) => {
    const ids = { users: [] as string[], orgs: [] as string[] };
    const org = async (name: string, policy: string) => { const id = (await q(`INSERT INTO organizations (name, type, plan, approval_policy) VALUES ($1, 'company', 'team', $2) RETURNING id`, [`${name} · E2E-SHIFT-${runId}`, policy]))[0].id as string; ids.orgs.push(id); return id; };
    const orgA = await org('E2E F3 A', 'AREA_RESPONSIBLE'); const orgB = await org('E2E F3 B', 'ORGANIZATION_ADMIN');
    const areaA1 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'E2E A1', $2) RETURNING id`, [orgA, `AREA-${runId}-1`]))[0].id as string;
    const areaA2 = (await q(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'E2E A2', $2) RETURNING id`, [orgA, `AREA-${runId}-2`]))[0].id as string;
    const users: Tenant['users'] = {};
    const user = async (key: string) => {
      const email = `${key}-${runId.toLowerCase()}@e2e.test`;
      const id = (await q(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`, [email, hash, `E2E ${key} ${runId}`]))[0].id as string;
      users[key] = { id, email }; ids.users.push(id);
    };
    for (const key of ['owner', 'admin', 'plannerOrg', 'plannerEmps', 'plannerA2', 'employee', 'employee2', 'ownerB', 'employeeB']) await user(key);
    const member = (key: string, organization: string, role: string, scope: string | null = null) =>
      q(`INSERT INTO memberships (user_id, organization_id, role, planner_scope_type) VALUES ($1, $2, $3, $4)`, [users[key].id, organization, role, scope]);
    await member('owner', orgA, 'OWNER'); await member('admin', orgA, 'ADMIN'); await member('plannerOrg', orgA, 'PLANNER', 'ORGANIZATION');
    await member('plannerEmps', orgA, 'PLANNER', 'EMPLOYEES'); await member('plannerA2', orgA, 'PLANNER', 'AREAS');
    await member('employee', orgA, 'EMPLOYEE'); await member('employee2', orgA, 'EMPLOYEE'); await member('ownerB', orgB, 'OWNER'); await member('employeeB', orgB, 'EMPLOYEE');
    const emp = async (organization: string, name: string, ext: string, area: string | null, userKey: string | null) =>
      (await q(`INSERT INTO employees (organization_id, name, external_employee_id, status, area_id, user_id) VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`,
        [organization, name, `${ext}-${runId}`, area, userKey ? users[userKey].id : null]))[0].id as string;
    const e1 = await emp(orgA, 'E2E One', 'E1', areaA1, 'employee'); const e2 = await emp(orgA, 'E2E Two', 'E2', areaA1, 'employee2');
    const eB = await emp(orgB, 'E2E Other Tenant', 'EB', null, 'employeeB');
    await q(`INSERT INTO operational_assignments (organization_id, assignment_type, subject_id, target_id) VALUES ($1, 'PLANNER_AREA', $2, $3), ($1, 'PLANNER_EMPLOYEE', $4, $5)`,
      [orgA, users.plannerA2.id, areaA2, users.plannerEmps.id, e1]);
    return { orgA, orgB, areaA1, areaA2, e1, e2, eB, users, ids };
  });
});

test.afterAll(async () => {
  if (!T) return;
  await withDb(async (q) => {
    // Exactly the ids created by this run; ON DELETE CASCADE removes the dependent time-off, approval, calendar and notification rows.
    for (const org of T.ids.orgs) {
      await q(`DELETE FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1)`, [org]);
      await q(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1)`, [org]);
      await q(`DELETE FROM schedules WHERE organization_id = $1`, [org]);
    }
    for (const id of T.ids.orgs) await q(`DELETE FROM organizations WHERE id = $1`, [id]);
    for (const id of T.ids.users) await q(`DELETE FROM users WHERE id = $1`, [id]);
    const residue = await q(`SELECT (SELECT COUNT(*) FROM organizations WHERE id = ANY($1::uuid[])) + (SELECT COUNT(*) FROM users WHERE id = ANY($2::uuid[])) + (SELECT COUNT(*) FROM time_off_requests WHERE organization_id = ANY($1::uuid[])) AS n`, [T.ids.orgs, T.ids.users]);
    expect(Number(residue[0].n)).toBe(0);
  });
});

test('approval workflow: scope-filtered list, policy-aware canDecide, materialisation, idempotent replay, employee sees the applied range', async () => {
  const start = addDays(freshMonday(), 0); const end = addDays(start, 4);
  await withDb((q) => q(`INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin, shift_type, counts_as_work, layer, provenance, effective_state)
                         VALUES ($1, $2, $3, $4, '05:00', '13:00', '', 'MAN', 'Regular', TRUE, 'CHANGE', 'MANUAL_ADMIN_CHANGE', 'EFFECTIVE')`, [T.orgA, T.e1, T.areaA1, addDays(start, 1)]));
  const employee = await login('employee', T.orgA);
  const created = await post(employee, '/api/me/time-off-requests', { requestType: 'VACATION', startDate: start, endDate: end, comment: 'F3' });
  expect(created.status).toBe(201);
  const requestId = created.json.request.id as string;
  const envelope = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [requestId])))[0].id as string;

  const listFor = async (role: string, org = T.orgA) => {
    const api = await login(role, org);
    const response = await api.get('/api/approval-requests?kind=TIME_OFF&status=PENDING');
    const body = await response.json().catch(() => ({}));
    await api.dispose();
    return { status: response.status(), items: (body.requests ?? []) as Array<Record<string, unknown>> };
  };
  const seen = (items: Array<Record<string, unknown>>) => items.find((item) => item.timeOffRequestId === requestId);
  // AREA_RESPONSIBLE policy: OWNER always; the planner of THAT employee; the ADMIN (not responsible) and the org-wide planner see it but cannot decide
  expect(seen((await listFor('owner')).items)).toMatchObject({ canDecide: true, kind: 'TIME_OFF', employeeName: 'E2E One', requestedDays: 5 });
  expect(seen((await listFor('plannerEmps')).items)).toMatchObject({ canDecide: true });
  expect(seen((await listFor('admin')).items)).toMatchObject({ canDecide: false, cannotDecideReason: 'POLICY' });
  expect(seen((await listFor('plannerOrg')).items)).toMatchObject({ canDecide: false, cannotDecideReason: 'POLICY' });
  // out of scope: the planner of another area, another tenant, and a plain employee
  expect(seen((await listFor('plannerA2')).items)).toBeUndefined();
  expect(seen((await listFor('ownerB', T.orgB)).items)).toBeUndefined();
  expect((await listFor('employee2')).status).toBe(403);
  // without `kind` the legacy response is exactly the legacy one (a time-off envelope never shows up in it)
  const legacy = await login('owner', T.orgA);
  expect(JSON.stringify(await (await legacy.get('/api/approval-requests?status=pending')).json())).not.toContain(envelope);
  await legacy.dispose();

  // decisions that must fail first
  const admin = await login('admin', T.orgA);
  expect((await post(admin, `/api/approval-requests/${envelope}/approve`)).status).toBe(403);
  const otherTenant = await login('ownerB', T.orgB);
  expect((await post(otherTenant, `/api/approval-requests/${envelope}/approve`)).status).toBe(404);
  expect((await post(employee, `/api/approval-requests/${envelope}/approve`)).status).toBe(403);
  expect((await withDb((q) => q(`SELECT status FROM time_off_requests WHERE id = $1`, [requestId])))[0].status).toBe('PENDING');

  const owner = await login('owner', T.orgA);
  const approved = await post(owner, `/api/approval-requests/${envelope}/approve`);
  expect(approved.status).toBe(200);
  expect(approved.json).toMatchObject({ requestedDays: 5, materializedDays: 5, skippedPastDays: 0, effectiveStartDate: start });
  expect(approved.json.materialized).toMatchObject({ shiftsCreated: 5, shiftsSuperseded: 1 });
  const rows = await shiftsOf(T.e1, start, end);
  const effective = rows.filter((x) => x.effective_state === 'EFFECTIVE');
  expect(effective.map((x) => `${x.date}|${x.shift_type}|${x.provenance}|${x.time_off_request_id === requestId}`)).toEqual(
    [0, 1, 2, 3, 4].map((n) => `${addDays(start, n)}|Vacaciones|EMPLOYEE_REQUEST|true`));
  expect(rows.filter((x) => x.effective_state === 'SUPERSEDED').map((x) => x.shift_type)).toEqual(['Regular']);
  expect(rows.some((x) => /baja/i.test(String(x.shift_type)))).toBe(false);
  expect((await withDb((q) => q(`SELECT COUNT(*)::int AS n FROM calendar_changes WHERE organization_id = $1 AND source = 'EMPLOYEE_REQUEST' AND change_type = 'REPLACE_DAY'`, [T.orgA])))[0].n).toBe(5);
  // idempotent: a replay is 409 with who decided, and nothing is duplicated
  const replay = await post(owner, `/api/approval-requests/${envelope}/approve`);
  expect(replay.status).toBe(409);
  expect(replay.json.decision.by).toBeTruthy();
  expect((await shiftsOf(T.e1, start, end)).length).toBe(rows.length);
  // the employee sees the range really applied
  const mine = await (await employee.get(`/api/me/time-off-requests?year=${start.slice(0, 4)}`)).json();
  expect(mine.requests.find((r: { id: string }) => r.id === requestId)).toMatchObject({ status: 'APPROVED', appliedStartDate: start, appliedDays: 5, skippedPastDays: 0 });
  const notice = await withDb((q) => q(`SELECT type FROM notifications WHERE user_id = $1 AND resource_id = $2`, [T.users.employee.id, requestId]));
  expect(notice.map((n) => n.type)).toContain('TIME_OFF_REQUEST_RESOLVED');
  await Promise.all([employee.dispose(), admin.dispose(), otherTenant.dispose(), owner.dispose()]);
});

test('reject needs a reason, writes no calendar row; a scoped planner of that employee may decide', async () => {
  const start = freshMonday();
  const employee = await login('employee', T.orgA);
  const created = await post(employee, '/api/me/time-off-requests', { requestType: 'VACATION', startDate: start, endDate: addDays(start, 1) });
  const requestId = created.json.request.id as string;
  const envelope = (await withDb((q) => q(`SELECT id FROM approval_requests WHERE time_off_request_id = $1`, [requestId])))[0].id as string;
  const planner = await login('plannerEmps', T.orgA);
  expect((await post(planner, `/api/approval-requests/${envelope}/reject`, { reason: '  ' })).status).toBe(400);
  const rejected = await post(planner, `/api/approval-requests/${envelope}/reject`, { reason: 'Cobertura mínima' });
  expect(rejected.status).toBe(200);
  expect(rejected.json.timeOffRequest).toMatchObject({ status: 'REJECTED', rejectionReason: 'Cobertura mínima' });
  expect(await shiftsOf(T.e1, start, addDays(start, 1))).toEqual([]);
  expect((await post(planner, `/api/approval-requests/${envelope}/approve`)).status).toBe(409);
  const mine = await (await employee.get(`/api/me/time-off-requests?year=${start.slice(0, 4)}&status=REJECTED`)).json();
  expect(mine.requests.find((r: { id: string }) => r.id === requestId)).toMatchObject({ status: 'REJECTED', rejectionReason: 'Cobertura mínima' });
  await Promise.all([employee.dispose(), planner.dispose()]);
});

test('planning protection: assignments on an approved vacation are refused (422 PROTECTED_ABSENCE_DAY), the planner shows the day as blocked, publication leaves the vacation alone', async () => {
  const monday = freshMonday();
  const vac = await approvedVacation(addDays(monday, 1), addDays(monday, 2));
  const owner = await login('owner', T.orgA);
  const draft = await post(owner, '/api/schedules', { periodStart: monday });
  expect([200, 201]).toContain(draft.status);
  const scheduleId = (draft.json.scheduleId ?? draft.json.schedule?.id) as string;
  const versionId = (draft.json.scheduleVersionId ?? draft.json.versionId ?? draft.json.version?.id) as string;
  const base = `/api/schedules/${scheduleId}/versions/${versionId}`;
  const assignment = (date: string, employeeId = T.e1) => ({ employeeId, date, startTime: '05:00', endTime: '13:00' });
  const blocked = await post(owner, `${base}/assignments`, assignment(addDays(monday, 1)));
  expect(blocked.status).toBe(422);
  expect(blocked.json.code).toBe('PROTECTED_ABSENCE_DAY');
  expect((await post(owner, `${base}/assignments`, assignment(addDays(monday, 1), T.e2))).status).toBe(201); // somebody else, same day
  const free = await post(owner, `${base}/assignments`, assignment(addDays(monday, 4)));
  expect(free.status).toBe(201);
  const snapshot = await (await owner.get(base)).json();
  const calendarShifts = (snapshot.snapshot?.calendarShifts ?? snapshot.calendarShifts) as Array<{ date: string; employeeId: string; timeOffRequestId: string | null; shiftType: string }>;
  expect(calendarShifts.filter((x) => x.employeeId === T.e1 && x.timeOffRequestId === vac.requestId).map((x) => x.date)).toEqual([addDays(monday, 1), addDays(monday, 2)]);
  const moved = await owner.patch(`${base}/assignments/${free.json.assignment?.id ?? free.json.id}`, { data: { date: addDays(monday, 2), startTime: '05:00', endTime: '13:00' } });
  expect(moved.status()).toBe(422);
  expect((await moved.json()).code).toBe('PROTECTED_ABSENCE_DAY');
  // the planner guard is bypassed on purpose (legacy row): the publish gate holds on its own
  await withDb((q) => q(`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, shift_type, counts_as_work) VALUES ($1, $2, $3, '05:00', '13:00', 'Regular', TRUE)`, [versionId, T.e1, addDays(monday, 2)]));
  const published = await post(owner, `${base}/publish`);
  expect(published.status).toBe(200);
  const excluded = (published.json.excludedAssignments ?? published.json.excluded_assignments ?? []) as Array<{ employeeId: string; reason: string }>;
  expect(excluded.map((x) => `${x.employeeId}|${x.reason}`)).toEqual([`${T.e1}|PROTECTED_ABSENCE`]);
  const day = (await shiftsOf(T.e1, addDays(monday, 2), addDays(monday, 2))).filter((x) => x.effective_state === 'EFFECTIVE');
  expect(day.map((x) => x.shift_type)).toEqual(['Vacaciones']);
  await owner.dispose();
});

test('import over an approved vacation: APPROVED_VACATION_CONFLICT, the absence stays EFFECTIVE, the proposal waits for review; PLANNER cannot override (403), OWNER can (audited)', async () => {
  const monday = freshMonday();
  const day = addDays(monday, 2);
  const vac = await approvedVacation(addDays(monday, 1), addDays(monday, 3));
  const owner = await login('owner', T.orgA);
  const proposal = { employeeId: T.e1, date: day, startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true, location: '', origin: 'IMP' };
  const importBody = { fileName: 'e2e-f3.csv', sourceFormat: 'CSV', fileFingerprint: fp(), importMode: 'team', futureConsent: PLAN, weekStart: 'monday', employeeId: T.e1, shifts: [proposal] };
  const preview = await (await owner.post('/api/imports/plan-preview', { data: { ...importBody, futureConsent: undefined } })).json();
  expect(preview.plan.changes.protectedConflicts).toBe(1);
  const confirmed = await post(owner, '/api/imports/confirm-split', importBody);
  expect([200, 201]).toContain(confirmed.status);
  const rows = await shiftsOf(T.e1, day, day);
  expect(rows.find((x) => x.effective_state === 'EFFECTIVE')).toMatchObject({ shift_type: 'Vacaciones', time_off_request_id: vac.requestId });
  const waiting = rows.find((x) => x.effective_state === 'REQUIRES_REVIEW');
  expect(waiting).toMatchObject({ shift_type: 'Regular' });
  expect(rows.filter((x) => x.provenance === 'SCHEDULE_PUBLICATION')).toEqual([]);
  const worklist = await (await owner.get(`/api/calendar/reconciliation?employeeId=${T.e1}&year=${day.slice(0, 4)}`)).json();
  const item = worklist.items.find((x: { date: string }) => x.date === day);
  expect(item).toMatchObject({ status: 'PENDING', reasonCode: 'APPROVED_VACATION_CONFLICT' });
  expect(item.protectedAbsence).toMatchObject({ timeOffRequestId: vac.requestId, startDate: addDays(monday, 1), endDate: addDays(monday, 3) });
  const history = await (await owner.get(`/api/calendar/changes?employeeId=${T.e1}&date=${day}`)).json();
  expect(history).toMatchObject({ conflictsWithApprovedVacation: true, protectedAbsence: { timeOffRequestId: vac.requestId } });

  // PLANNER (organisation-wide, in scope) choosing the proposal ⇒ 403 and nothing changes
  const planner = await login('plannerOrg', T.orgA);
  const forbidden = await post(planner, '/api/calendar/changes', { action: 'RECONCILE', employeeId: T.e1, date: day, keepShiftIds: [waiting!.id], reason: 'Quiero el turno' });
  expect(forbidden.status).toBe(403);
  expect(forbidden.json.code).toBe('PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN');
  expect((await shiftsOf(T.e1, day, day)).filter((x) => x.effective_state === 'EFFECTIVE').map((x) => x.shift_type)).toEqual(['Vacaciones']);
  // OWNER choosing the proposal ⇒ audited override; the request stays APPROVED
  const override = await post(owner, '/api/calendar/changes', { action: 'RECONCILE', employeeId: T.e1, date: day, keepShiftIds: [waiting!.id], reason: 'Acordado con el empleado' });
  expect(override.status).toBe(201);
  const after = await shiftsOf(T.e1, day, day);
  expect(after.find((x) => x.effective_state === 'EFFECTIVE')).toMatchObject({ shift_type: 'Regular' });
  expect(after.find((x) => x.time_off_request_id === vac.requestId)).toMatchObject({ effective_state: 'SUPERSEDED' });
  const audit = await withDb((q) => q(`SELECT actor_user_id, event_type FROM organization_audit_events WHERE organization_id = $1 AND target_id = $2 AND event_type = 'time_off_request.manual_override'`, [T.orgA, vac.requestId]));
  expect(audit).toEqual([{ actor_user_id: T.users.owner.id, event_type: 'time_off_request.manual_override' }]);
  expect((await withDb((q) => q(`SELECT status FROM time_off_requests WHERE id = $1`, [vac.requestId])))[0].status).toBe('APPROVED');
  // the other two days of the vacation are untouched
  expect((await shiftsOf(T.e1, addDays(monday, 1), addDays(monday, 3))).filter((x) => x.effective_state === 'EFFECTIVE').map((x) => `${x.date}|${x.shift_type}`))
    .toEqual([`${addDays(monday, 1)}|Vacaciones`, `${day}|Regular`, `${addDays(monday, 3)}|Vacaciones`]);
  await Promise.all([owner.dispose(), planner.dispose()]);
});

test('REGRESSION: a shift-change request is still listed and approved exactly as before (with and without `kind`)', async () => {
  const day = addDays(freshMonday(), 4);
  const shiftId = (await withDb((q) => q(`INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin, shift_type, counts_as_work, layer, provenance, effective_state)
                                          VALUES ($1, $2, $3, $4, '05:00', '13:00', '', 'MAN', 'Regular', TRUE, 'CHANGE', 'MANUAL_ADMIN_CHANGE', 'EFFECTIVE') RETURNING id`, [T.orgA, T.e2, T.areaA1, day])))[0].id as string;
  const employee2 = await login('employee2', T.orgA);
  const created = await post(employee2, `/api/me/shifts/${shiftId}/change-requests`, { requestType: 'OTHER', reason: 'Necesito cambiar el turno' });
  expect(created.status).toBe(201);
  const owner = await login('owner', T.orgA);
  const legacy = await (await owner.get('/api/approval-requests?status=pending')).json();
  const legacyItem = legacy.requests.find((r: { changeRequestId: string }) => r.changeRequestId === created.json.request.id);
  expect(legacyItem).toBeTruthy();
  expect(legacyItem).not.toHaveProperty('kind'); // the legacy shape is untouched
  const unified = await (await owner.get('/api/approval-requests?kind=ALL&status=PENDING')).json();
  expect(unified.requests.find((r: { id: string }) => r.id === legacyItem.id)).toMatchObject({ kind: 'SHIFT_CHANGE' });
  const approved = await post(owner, `/api/approval-requests/${legacyItem.id}/approve`);
  expect(approved.status).toBe(200);
  expect(approved.json.approvalRequest).toMatchObject({ status: 'APPROVED' });
  await Promise.all([employee2.dispose(), owner.dispose()]);
});

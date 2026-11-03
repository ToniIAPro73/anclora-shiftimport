/* F4 mobile E2E: reuses the canonical local fixture (tenants, users, employees, area, runId) and adds only the F4 data. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { hashPassword } from '../../api/_lib/passwords.js';
import { qaLib } from './helpers/qa-mirror';

const here = __dirname;
export const F4_FIXTURE_PATH = join(here, 'artifacts', 'f4-mobile-fixture.json');
const BASE_URL = process.env.F4_BASE_URL ?? 'http://localhost:5173';

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function login(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return cookie;
}

function client(cookie: string, organizationId: string) {
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie, 'x-organization-id': organizationId },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json: json as Record<string, any> };
  };
}

/** Creates the run-scoped synthetic tenant (E2E-SHIFT-<runId>) on the canonical QA database. Returns the fixture. */
async function createTenant(db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }) {
  const runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const password = 'E2e-pass-1234';
  const hash = hashPassword(password);
  const email = (local: string) => `${local}-${runId.toLowerCase()}@e2e.test`;
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  const orgA = await one(`INSERT INTO organizations (name, type, plan) VALUES ($1, 'company', 'team') RETURNING id`, [`E2E F4 Mobile · E2E-SHIFT-${runId}`]);
  const areaA = await one(`INSERT INTO areas (organization_id, name, code) VALUES ($1, 'E2E Area A', $2) RETURNING id`, [orgA, `AREA-${runId}-A`]);
  const user = (local: string, name: string) => one(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`, [email(local), hash, `${name} ${runId}`]);
  const ownerId = await user('owner', 'E2E Owner');
  const empId = await user('emp', 'E2E Uno');
  const multiId = await user('multi', 'E2E Dos');
  await db.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'OWNER'), ($3, $2, 'EMPLOYEE'), ($4, $2, 'EMPLOYEE')`, [ownerId, orgA, empId, multiId]);
  const emp = (name: string, userId: string, n: number) => one(
    `INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [orgA, name, userId, `E${runId}-00${n}`, areaA]);
  const empA1 = await emp('E2E Uno', empId, 1);
  const empA2 = await emp('E2E Dos', multiId, 2);
  return { runId, password, orgA, areaA, ownerId, empId, multiId, empA1, empA2, emails: { owner: email('owner'), emp: email('emp'), multi: email('multi') } };
}

export default async function globalSetup() {
  const lib = await qaLib();
  const db = await lib.connect();
  let fx: Awaited<ReturnType<typeof createTenant>>;
  try { fx = await createTenant(db); } finally { /* keep the connection for the F4 rows below */ }
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, values)).rows;
  };
  const org: string = fx.orgA;

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const N = 80; // far-future weeks: no clash with the other batteries' fixtures
  const week = (n: number) => addDays(monday, 7 * n);

  const owner = client(await login(fx.emails.owner, fx.password), org);
  const uno = client(await login(fx.emails.emp, fx.password), org);
  const dos = client(await login(fx.emails.multi, fx.password), org);

  // Requests center + bulk approval: four pending vacations by two employees and one already-decided one (history).
  const vac = (offset: number, length: number) => ({
    requestType: 'VACATION', startDate: addDays(today, offset), endDate: addDays(today, offset + length), comment: `f4 mobile ${fx.runId}`,
  });
  for (const [c, offset, length] of [[uno, 200, 2], [uno, 215, 1], [dos, 203, 3], [dos, 222, 1]] as const) {
    const r = await c('POST', '/api/me/time-off-requests', vac(offset, length));
    if (r.status !== 201) throw new Error(`time-off seed failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  const done = await uno('POST', '/api/me/time-off-requests', vac(240, 1));
  const envelope = (await sql`SELECT id FROM approval_requests WHERE time_off_request_id = ${done.json.request?.id}`)[0]?.id;
  const approved = await owner('POST', `/api/approval-requests/${envelope}/approve`, {});
  if (approved.status !== 200) throw new Error(`history seed failed: ${approved.status}`);

  // Planner: published source week, an empty draft target (copy week) and two more draft weeks (publish pending).
  const mk = async (n: number) => {
    const r = await owner('POST', '/api/schedules', { periodStart: week(n), areaId: fx.areaA });
    if (r.status !== 201) throw new Error(`schedule seed failed: ${r.status} ${JSON.stringify(r.json)}`);
    return { sid: r.json.scheduleId as string, vid: r.json.scheduleVersionId as string };
  };
  const assign = async (w: { sid: string; vid: string }, employeeId: string, n: number, offset: number, start: string, end: string) => {
    const r = await owner('POST', `/api/schedules/${w.sid}/versions/${w.vid}/assignments`, {
      employeeId, date: addDays(week(n), offset), startTime: start, endTime: end, location: 'Regular', shiftType: 'Regular', countsAsWork: true,
    });
    if (r.status !== 201) throw new Error(`assignment seed failed: ${r.status} ${JSON.stringify(r.json)}`);
  };
  const source = await mk(N);
  await assign(source, fx.empA1, N, 1, '08:00', '16:00');
  await assign(source, fx.empA2, N, 2, '09:00', '17:00');
  await assign(source, fx.empA1, N, 3, '08:00', '16:00');
  const published = await owner('POST', `/api/schedules/${source.sid}/versions/${source.vid}/publish`);
  if (published.status !== 200) throw new Error(`publish seed failed: ${published.status} ${JSON.stringify(published.json)}`);
  await mk(N + 1);
  for (const n of [N + 2, N + 3]) {
    const w = await mk(n);
    await assign(w, fx.empA1, n, 1, '08:00', '16:00');
    await assign(w, fx.empA2, n, 2, '09:00', '17:00');
  }

  // Reconciliation: days with an effective shift AND a pending proposal for one employee (direct rows, as an import would leave them).
  const reconDates = [14, 15, 16, 17].map((n) => addDays(today, n));
  for (const date of reconDates) {
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, shift_type, location, origin, counts_as_work, layer, provenance, effective_state)
      VALUES (${org}, ${fx.empA1}, ${date}, '08:00', '16:00', 'Regular', 'Regular', 'IMP', true, 'COMPANY_PLAN', 'COMPANY_IMPORT', 'EFFECTIVE')`;
    await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, shift_type, location, origin, counts_as_work, layer, provenance, effective_state)
      VALUES (${org}, ${fx.empA1}, ${date}, '10:00', '18:00', 'Regular', 'Regular', 'IMP', true, 'COMPANY_PLAN', 'COMPANY_IMPORT', 'REQUIRES_REVIEW')`;
  }

  mkdirSync(join(here, 'artifacts'), { recursive: true });
  writeFileSync(F4_FIXTURE_PATH, JSON.stringify({
    runId: fx.runId, orgA: org, ownerId: fx.ownerId, userIds: [fx.ownerId, fx.empId, fx.multiId], ownerEmail: fx.emails.owner, emails: fx.emails, password: fx.password, empA1: fx.empA1,
    copyTargetWeek: week(N + 1), sourceWeek: week(N), pendingWeeks: [week(N + 2), week(N + 3)], reconDates,
  }, null, 2), { mode: 0o600 });
  await db.end();
  console.log(`[f4-mobile] fixtures seeded; runId=${fx.runId}`);
}

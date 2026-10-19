#!/usr/bin/env node
/**
 * Targeted proof (fast, synthetic, QA mirror only) that a MIXED document confirmed with "historical-and-plan" is reconciled by the
 * SERVER (three-way engine) and never needs the legacy "replace = deleteIds" of the row-by-row prompt.
 * Canonical case of the reported failure: existing 11:00-19:00 on a past day vs EMPLOYEE_CALENDAR_EXPORT 10:00-18:00,
 * plus a future row; operational date derived from Europe/Madrid.
 *
 *   node scripts/qa/mixed-import-e2e.mjs --base http://localhost:5173
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  PROTECTED_SOURCE_ORG_ID, QA_IDENTITY, assertNotProtectedSource, assertQaOrganization, connect, loadEnv, resolveSourceOrganization, targetNameFor,
} from './qa-lib.mjs';
import { sourceFingerprint } from './refresh-qa-mirror.mjs';

const args = process.argv.slice(2);
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5173';
const env = loadEnv(['.env.development.local']);
const results = {};
const check = (name, ok, detail = {}) => { results[name] = { ok: Boolean(ok), ...detail }; if (!ok) console.error(`[mixed] FAIL ${name}`, JSON.stringify(detail)); };
const fp = () => createHash('sha256').update(randomBytes(16)).digest('hex');
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const login = async (email, password) => {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
};
const api = (cookie, org) => async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', cookie, 'x-organization-id': org }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const db = await connect();
try {
  const source = await resolveSourceOrganization(db);
  if (source.id !== PROTECTED_SOURCE_ORG_ID) throw new Error('unexpected source organization');
  const srcBefore = await sourceFingerprint(db, source.id);
  const mirror = (await db.query('SELECT id FROM organizations WHERE name = $1', [targetNameFor(source)])).rows[0];
  assertNotProtectedSource(mirror.id);
  await assertQaOrganization(db, mirror.id);
  const ORG = mirror.id;
  const admin = api(await login(QA_IDENTITY, env.MANUAL_QA_PASSWORD), ORG);

  const emp = (await admin('GET', '/api/employees')).body.employees.find((e) => e.status === 'active' && e.externalEmployeeId && e.externalEmployeeId !== '84881');
  const cutoff = new Date().toLocaleDateString('sv', { timeZone: 'Europe/Madrid' });
  const past = addDays(cutoff, -2); const past2 = addDays(cutoff, -4); const future = addDays(cutoff, 3);
  const cleanRun = async () => {
    // mirror-only (guarded above): remove what a previous run of this scenario left for the synthetic employee
    await db.query(`DELETE FROM shift_assignments WHERE employee_id = $1 AND date BETWEEN $2 AND $3 AND schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $4 AND v.status = 'DRAFT')`, [emp.id, addDays(cutoff, -10), addDays(cutoff, 10), ORG]);
    await db.query(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date BETWEEN $3 AND $4`, [ORG, emp.id, addDays(cutoff, -10), addDays(cutoff, 10)]);
    await db.query(`DELETE FROM imports WHERE organization_id = $1 AND file_name LIKE 'mixed-%'`, [ORG]);
  };
  await cleanRun();
  const seed = async (date, s, e) => (await admin('PATCH', '/api/shifts', { employeeId: emp.id, upserts: [{ id: crypto.randomUUID(), employeeId: emp.id, date, startTime: s, endTime: e, shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin: 'IMP' }], deleteIds: [] })).body.saved?.[0]?.id;
  const existingId = await seed(past, '11:00', '19:00');
  const existing2 = await seed(past2, '11:00', '19:00');
  check('existing_effective_shifts_seeded', Boolean(existingId && existing2));

  const row = (date, s, e) => ({ date, shiftType: 'Regular', startTime: s, endTime: e, employeeId: emp.id, origin: 'IMP', sourceFormat: 'excel', location: 'Regular' });
  const input = (shifts, extra = {}) => ({
    fileName: `mixed-${Date.now()}.xlsx`, sourceFormat: 'excel', fileFingerprint: fp(), employeeId: emp.id, shifts, importMode: 'individual', periodKind: 'multi',
    periodYear: Number(cutoff.slice(0, 4)), periodMonth: null, periodLabel: 'QA', weekStart: 'monday', futureConsent: 'historical-and-plan', sourceKind: 'EMPLOYEE_CALENDAR_EXPORT', deleteIds: [], ...extra,
  });
  const counts = async () => ({
    assignments: (await db.query(`SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 AND a.employee_id = $2`, [ORG, emp.id])).rows[0].n,
    revisions: (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n,
  });
  const pendingSet = async () => new Set((await db.query(`SELECT DISTINCT employee_id::text || ':' || date::text AS k FROM shifts WHERE organization_id = $1 AND effective_state = 'REQUIRES_REVIEW'`, [ORG])).rows.map((r) => r.k));
  const before = await counts(); const pendingBefore = await pendingSet();

  // ---- canonical scenario: no deleteIds, historical difference goes to the server engine -------------------------------
  const doc = input([row(past, '10:00', '18:00'), row(future, '13:00', '21:00')]);
  const res = await admin('POST', '/api/imports/confirm-split', doc);
  check('http_success_not_409', res.status === 200 || res.status === 201, { status: res.status, code: res.body.code });
  check('no_future_delete_forbidden', res.body.code !== 'FUTURE_DELETE_FORBIDDEN');
  const stillThere = (await db.query('SELECT 1 FROM shifts WHERE id = $1', [existingId])).rows.length === 1;
  check('existing_historical_shift_not_destructively_deleted', stillThere);
  const ch = res.body.plan?.changes ?? {};
  check('historical_difference_remains_proposed', (ch.requiresReview ?? 0) >= 1, { changes: ch });
  const after = await counts();
  // the draft week is cloned from the published one (copies of existing assignments + the new future row)
  check('future_draft_created', after.assignments >= before.assignments + 1 && res.body.future?.createdAssignmentCount >= 1, { delta: after.assignments - before.assignments });
  check('new_import_writes_no_legacy_revision', after.revisions === before.revisions && res.body.plan?.autoPublished === false);
  const pendingAfter = await pendingSet();
  check('existing_pending_not_resolved_by_import', [...pendingBefore].every((k) => pendingAfter.has(k)), { before: pendingBefore.size, after: pendingAfter.size });

  // ---- the date guard: a PAST id in deleteIds is no longer mistaken for future ---------------------------------------
  const legacy = await admin('POST', '/api/imports/confirm-split', input([row(past2, '10:00', '18:00'), row(addDays(cutoff, 4), '13:00', '21:00')], { deleteIds: [existing2] }));
  check('past_deleteIds_not_rejected_as_future', legacy.body.code !== 'FUTURE_DELETE_FORBIDDEN', { status: legacy.status, code: legacy.body.code });
  const futureId = await seed(addDays(cutoff, 5), '09:00', '17:00');
  const futureDelete = await admin('POST', '/api/imports/confirm-split', input([row(addDays(cutoff, 6), '13:00', '21:00')], { deleteIds: [futureId] }));
  check('future_deleteIds_still_forbidden', futureDelete.status === 409 && futureDelete.body.code === 'FUTURE_DELETE_FORBIDDEN', { status: futureDelete.status });

  // ---- idempotency -----------------------------------------------------------------------------------------------------
  const mid = await counts();
  const replay = await admin('POST', '/api/imports/confirm-split', doc);
  const copy = await admin('POST', '/api/imports/confirm-split', input([row(past, '10:00', '18:00'), row(future, '13:00', '21:00')]));
  const end = await counts();
  const pendingEnd = await pendingSet();
  check('replay_is_duplicate_file', replay.body.duplicate === 'DUPLICATE_FILE', { duplicate: replay.body.duplicate });
  check('same_content_other_bytes_is_duplicate', ['DUPLICATE_DOCUMENT', 'DUPLICATE_PLAN'].includes(copy.body.duplicate), { duplicate: copy.body.duplicate });
  check('no_new_revision_assignment_or_review_on_duplicates', end.revisions === mid.revisions && end.assignments === mid.assignments && pendingEnd.size === (await pendingSet()).size);

  const srcAfter = await sourceFingerprint(db, source.id);
  check('SOURCE_HASH_BEFORE_equals_AFTER', srcBefore.overall === srcAfter.overall);
  await cleanRun();
} finally {
  await db.end();
}
const failed = Object.entries(results).filter(([, v]) => v.ok === false);
console.log(JSON.stringify({ total: Object.keys(results).length, failed: failed.map(([k]) => k), results }, null, 1));
process.exit(failed.length ? 1 : 0);

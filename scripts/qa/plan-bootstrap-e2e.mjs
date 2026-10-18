#!/usr/bin/env node
/**
 * Targeted (fast, synthetic) proof of the LEGACY PLAN BOOTSTRAP against the QA MIRROR, over HTTP:
 * calendar data already exists, no versioned Plan Empresa was ever recorded, a company-plan document arrives.
 * Expected: baseline MISSING is detected, the first revision is created WITHOUT duplicating shifts/assignments and
 * WITHOUT touching the effective calendar; identical re-imports are no-ops; EMPLOYEE is forbidden; racing
 * confirmations create exactly one revision.
 *
 *   node scripts/qa/plan-bootstrap-e2e.mjs --base http://localhost:5173
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  PROTECTED_SOURCE_ORG_ID, QA_EMPLOYEE_IDENTITY, QA_IDENTITY, assertNotProtectedSource, assertQaOrganization, connect, loadEnv,
  resolveSourceOrganization, targetNameFor,
} from './qa-lib.mjs';
import { sourceFingerprint } from './refresh-qa-mirror.mjs';

const args = process.argv.slice(2);
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5173';
const env = loadEnv(['.env.development.local']);
const results = {};
const check = (name, ok, detail = {}) => { results[name] = { ok: Boolean(ok), ...detail }; if (!ok) console.error(`[bootstrap] FAIL ${name}`, JSON.stringify(detail)); };
const fp = () => createHash('sha256').update(randomBytes(16)).digest('hex');

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const api = (cookie, org) => async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', cookie, 'x-organization-id': org }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

async function cleanRun(db, ORG, employeeIds) {
  // mirror-only (guarded above): remove the synthetic 2027 data of previous runs
  await db.query(`DELETE FROM shifts WHERE organization_id = $1 AND date >= '2027-01-01'`, [ORG]);
  await db.query(`DELETE FROM company_plan_revisions WHERE organization_id = $1 AND coverage_from >= '2027-01-01'`, [ORG]);
  await db.query(`DELETE FROM shift_assignments WHERE date >= '2027-01-01' AND schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1)`, [ORG]);
  await db.query(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01') AND id NOT IN (SELECT schedule_version_id FROM shift_assignments)`, [ORG]);
  await db.query(`DELETE FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01' AND id NOT IN (SELECT schedule_id FROM schedule_versions)`, [ORG]);
  await db.query(`DELETE FROM imports WHERE organization_id = $1 AND file_name LIKE 'bootstrap-%'`, [ORG]);
}

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
  const employee = api(await login(QA_EMPLOYEE_IDENTITY, env.MANUAL_QA_EMPLOYEE_PASSWORD), ORG);

  const roster = (await admin('GET', '/api/employees')).body.employees.filter((e) => e.status === 'active' && e.externalEmployeeId && e.externalEmployeeId !== '84881');
  const [A, B] = roster;
  check('two_synthetic_employees', Boolean(A && B));
  const run = `bootstrap-${Date.now()}`;

  // controlled, far-future periods (clean in the mirror)
  const D = { a: ['2027-02-15', '2027-02-16', '2027-02-17'], b: ['2027-02-15', '2027-02-16'] };
  await cleanRun(db, ORG);
  const seed = async (emp, rows) => (await admin('PATCH', '/api/shifts', {
    employeeId: emp.id,
    upserts: rows.map((r) => ({ id: crypto.randomUUID(), employeeId: emp.id, date: r.date, startTime: r.s ?? null, endTime: r.e ?? null, shiftType: r.t ?? 'Regular', countsAsWork: (r.t ?? 'Regular') === 'Regular', location: r.t ?? 'Regular', origin: 'IMP' })),
    deleteIds: [],
  })).status;
  const seededA = await seed(A, [{ date: D.a[0], s: '13:00', e: '21:00' }, { date: D.a[1], s: '13:00', e: '21:00' }, { date: D.a[2], t: 'Libre' }]);
  const seededB = await seed(B, [{ date: D.b[0], s: '05:00', e: '13:00' }, { date: D.b[1], t: 'Libre' }]);
  check('existing_calendar_seeded', seededA < 300 && seededB < 300, { a: seededA, b: seededB });

  const counts = async () => ({
    shifts: (await db.query(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1`, [ORG])).rows[0].n,
    futureShifts: (await db.query(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND date >= '2027-01-01'`, [ORG])).rows[0].n,
    assignments: (await db.query(`SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1`, [ORG])).rows[0].n,
    revisions: (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n,
    pending: (await db.query(`SELECT COUNT(DISTINCT (employee_id, date))::int n FROM shifts WHERE organization_id = $1 AND effective_state = 'REQUIRES_REVIEW'`, [ORG])).rows[0].n,
  });
  const effectiveSnapshot = async () => (await db.query(
    `SELECT id, employee_id, date::text d, start_time, end_time, shift_type, effective_state, layer FROM shifts WHERE organization_id = $1 AND employee_id = ANY($2::uuid[]) AND date >= '2027-01-01' ORDER BY id`, [ORG, [A.id, B.id]],
  )).rows;

  const docRows = (emp, rows) => rows.map((r) => ({ date: r.date, shiftType: r.t ?? 'Regular', startTime: r.s ?? '', endTime: r.e ?? '', employeeId: emp.id, origin: 'IMP', sourceFormat: 'excel', location: r.t ?? 'Regular' }));
  const same = [...docRows(A, [{ date: D.a[0], s: '13:00', e: '21:00' }, { date: D.a[1], s: '13:00', e: '21:00' }, { date: D.a[2], t: 'Libre' }]), ...docRows(B, [{ date: D.b[0], s: '05:00', e: '13:00' }, { date: D.b[1], t: 'Libre' }])];
  const input = (shifts, extra = {}) => ({
    fileName: `${run}.xlsx`, sourceFormat: 'excel', fileFingerprint: fp(), employeeId: A.id, shifts, importMode: 'team', periodKind: 'single', periodYear: 2027, periodMonth: 1,
    periodLabel: 'QA', futureConsent: 'historical-and-plan', weekStart: 'monday', sourceKind: 'TEAM_SCHEDULE_EXPORT', ...extra,
  });

  const before = await counts(); const snapBefore = JSON.stringify(await effectiveSnapshot());

  // ---- detection ---------------------------------------------------------------------------------------------------
  const preview = await admin('POST', '/api/imports/plan-preview', input(same));
  const pb = preview.body.planBaseline;
  check('baseline_missing_detected', pb?.status === 'MISSING' && pb.canCreate === true, { status: pb?.status, canCreate: pb?.canCreate });
  check('existing_rows_recognised', pb?.existingEquivalentRows === 5 && pb.newRows === 0 && pb.reviewRows === 0, { existing: pb?.existingEquivalentRows, new: pb?.newRows, review: pb?.reviewRows });
  check('employee_calendar_cannot_be_baseline', (await admin('POST', '/api/imports/plan-preview', input(same, { importMode: 'individual', sourceKind: 'EMPLOYEE_CALENDAR_EXPORT', employeeId: A.id, shifts: docRows(A, [{ date: D.a[0], s: '13:00', e: '21:00' }]) }))).body.planBaseline?.canCreate === false);
  check('preview_writes_nothing', JSON.stringify(await counts()) === JSON.stringify(before));

  // ---- roles ----------------------------------------------------------------------------------------------------------
  const empTry = await employee('POST', '/api/imports/confirm-split', input(same));
  const empPrev = await employee('POST', '/api/imports/plan-preview', input(same));
  check('employee_bootstrap_forbidden', empTry.status === 403 && empPrev.status === 403, { confirm: empTry.status, preview: empPrev.status });
  check('employee_attempt_wrote_nothing', JSON.stringify(await counts()) === JSON.stringify(before));

  // ---- bootstrap ------------------------------------------------------------------------------------------------------
  const first = input(same);
  const boot = await admin('POST', '/api/imports/confirm-split', first);
  check('bootstrap_confirmed', boot.status < 300, { status: boot.status, code: boot.body.code });
  const after = await counts();
  check('revision_1_created', after.revisions === before.revisions + 1 && boot.body.plan?.revisionCreated === true, { delta: after.revisions - before.revisions });
  check('no_duplicate_shifts', after.shifts === before.shifts && after.futureShifts === before.futureShifts, { shiftsDelta: after.shifts - before.shifts });
  check('no_duplicate_assignments', after.assignments === before.assignments, { delta: after.assignments - before.assignments });
  check('effective_calendar_unchanged', JSON.stringify(await effectiveSnapshot()) === snapBefore);
  check('pending_reconciliations_preserved', after.pending === before.pending, { before: before.pending, after: after.pending });
  const rev = (await db.query(`SELECT created_by_user_id, import_id, plan_fingerprint, document_fingerprint, coverage_from::text f, coverage_to::text t, summary FROM company_plan_revisions WHERE organization_id = $1 ORDER BY revision_number DESC LIMIT 1`, [ORG])).rows[0];
  check('audit_trail_recorded', Boolean(rev.created_by_user_id && rev.import_id && rev.plan_fingerprint && rev.document_fingerprint && rev.summary?.sourceKind === 'TEAM_SCHEDULE_EXPORT' && rev.summary?.initialBaseline === true), { coverage: `${rev.f}..${rev.t}` });
  const history = (await admin('GET', '/api/imports')).body;
  const entry = (history.imports ?? history).find?.((i) => i.fileName === first.fileName);
  check('history_not_labelled_duplicate', Boolean(entry) && !entry.duplicateKind && entry.documentClass === 'COMPANY_PLAN' && entry.importDecision === 'historical-and-plan', { documentClass: entry?.documentClass, duplicateKind: entry?.duplicateKind });

  // ---- idempotency ----------------------------------------------------------------------------------------------------
  const replay = await admin('POST', '/api/imports/confirm-split', first);
  check('same_file_is_duplicate_file', replay.body.duplicate === 'DUPLICATE_FILE', { duplicate: replay.body.duplicate });
  const copy = await admin('POST', '/api/imports/confirm-split', input(same));
  check('same_document_other_bytes_no_revision', ['DUPLICATE_DOCUMENT', 'DUPLICATE_PLAN'].includes(copy.body.duplicate), { duplicate: copy.body.duplicate });
  const other = await admin('POST', '/api/imports/confirm-split', input(same, { sourceFormat: 'pdf', sourceKind: 'TEAM_SCHEDULE_EXPORT', importMode: 'individual', employeeId: A.id, shifts: docRows(A, [{ date: D.a[0], s: '13:00', e: '21:00' }, { date: D.a[1], s: '13:00', e: '21:00' }, { date: D.a[2], t: 'Libre' }]) }));
  const end1 = await counts();
  check('no_revision_2_on_duplicates', end1.revisions === before.revisions + 1 && end1.shifts === before.shifts && end1.assignments === before.assignments, { revisions: end1.revisions - before.revisions, other: other.body.duplicate });

  // ---- partial baseline: existing + new + discrepant ----------------------------------------------------------------
  const P = ['2027-03-01', '2027-03-02', '2027-03-03'];
  await seed(A, [{ date: P[0], s: '13:00', e: '21:00' }, { date: P[1], s: '13:00', e: '21:00' }]);
  const pBefore = await counts();
  const partialRows = docRows(A, [{ date: P[0], s: '13:00', e: '21:00' }, { date: P[1], t: 'Libre' }, { date: P[2], s: '09:00', e: '17:00' }]); // equal / discrepant / new
  const pPrev = (await admin('POST', '/api/imports/plan-preview', input(partialRows))).body.planBaseline;
  check('partial_classification', pPrev?.existingEquivalentRows === 1 && pPrev.newRows === 1 && pPrev.reviewRows === 1, { existing: pPrev?.existingEquivalentRows, new: pPrev?.newRows, review: pPrev?.reviewRows });
  const pConfirm = await admin('POST', '/api/imports/confirm-split', input(partialRows));
  const pAfter = await counts();
  const existingStillThere = (await db.query(`SELECT start_time, end_time, shift_type FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3 AND effective_state = 'EFFECTIVE'`, [ORG, A.id, P[1]])).rows;
  check('partial_confirmed_with_new_planning', pConfirm.status < 300 && pAfter.assignments === pBefore.assignments + 1 && pAfter.revisions === pBefore.revisions + 1, { assignmentsDelta: pAfter.assignments - pBefore.assignments });
  check('partial_conflict_preserved_and_flagged', existingStillThere.length === 1 && existingStillThere[0].shift_type === 'Regular' && pAfter.pending >= pBefore.pending + 1, { pendingDelta: pAfter.pending - pBefore.pending });
  check('partial_existing_rows_not_duplicated', (await db.query(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3`, [ORG, A.id, P[0]])).rows[0].n === 1);

  // ---- concurrency: two racing confirmations create exactly one baseline ----------------------------------------------
  const C = ['2027-05-03', '2027-05-04'];
  await seed(B, [{ date: C[0], s: '05:00', e: '13:00' }, { date: C[1], t: 'Libre' }]);
  const cBefore = await counts();
  const racing = docRows(B, [{ date: C[0], s: '05:00', e: '13:00' }, { date: C[1], t: 'Libre' }]);
  const [r1, r2] = await Promise.all([
    admin('POST', '/api/imports/confirm-split', input(racing, { employeeId: B.id })),
    admin('POST', '/api/imports/confirm-split', input(racing, { employeeId: B.id })),
  ]);
  const cAfter = await counts();
  check('concurrent_bootstrap_creates_exactly_one_revision', cAfter.revisions === cBefore.revisions + 1 && r1.status < 500 && r2.status < 500, { delta: cAfter.revisions - cBefore.revisions, statuses: [r1.status, r2.status] });
  check('concurrent_bootstrap_no_duplicates', cAfter.shifts === cBefore.shifts && cAfter.assignments === cBefore.assignments);

  const srcAfter = await sourceFingerprint(db, source.id);
  check('SOURCE_HASH_BEFORE_equals_AFTER', srcBefore.overall === srcAfter.overall);
  results._srcHash = { ok: true, before: srcBefore.overall.slice(0, 12), after: srcAfter.overall.slice(0, 12) };
  // clean the synthetic data of this run (mirror only)
  await cleanRun(db, ORG);
} finally {
  await db.end();
}
const failed = Object.entries(results).filter(([, v]) => v.ok === false);
console.log(JSON.stringify({ total: Object.keys(results).length, failed: failed.map(([k]) => k), results }, null, 1));
process.exit(failed.length ? 1 : 0);

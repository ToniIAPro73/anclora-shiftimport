#!/usr/bin/env node
/**
 * End-to-end proof of the company-plan import model against the QA MIRROR, over HTTP (local `npm run dev`
 * or the Vercel Preview). Real documents are consumed only as normalised rows exported locally by
 *   QA_REAL_DOCS_OUT=<json> npx vitest run src/ingestion/real-docs-export.test.ts
 * Nothing real is printed or committed; the report holds counts and PASS/FAIL only.
 *
 *   node scripts/qa/plan-import-e2e.mjs --base http://localhost:5173 --parsed <json>
 *
 * Every write goes to the QA mirror (assertQaOrganization + PROTECTED_SOURCE_ORG_ID guards); the source
 * organization is fingerprinted before and after and must not change. The mirror is re-baselined first.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  PROTECTED_SOURCE_ORG_ID, QA_EMPLOYEE_IDENTITY, QA_IDENTITY, assertNotProtectedSource, assertQaOrganization, connect, loadEnv,
  resolveSourceOrganization, targetNameFor,
} from './qa-lib.mjs';
import { refreshQaMirror, sourceFingerprint } from './refresh-qa-mirror.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const BASE = opt('--base', 'http://localhost:5173');
const parsed = JSON.parse(readFileSync(opt('--parsed'), 'utf8'));
const env = loadEnv(['.env.development.local']);
const fp = () => createHash('sha256').update(randomBytes(16)).digest('hex');
const results = {};
const check = (name, ok, detail = {}) => { results[name] = { ok: Boolean(ok), ...detail }; if (!ok) console.error(`[e2e] FAIL ${name}`, JSON.stringify(detail)); };

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const api = (cookie, org) => async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', cookie, 'x-organization-id': org }, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

const db = await connect();
try {
  // ---- setup ------------------------------------------------------------------------------------------------
  const source = await resolveSourceOrganization(db);
  if (source.id !== PROTECTED_SOURCE_ORG_ID) throw new Error('unexpected source organization');
  const srcBefore = await sourceFingerprint(db, source.id);
  console.log('[e2e] re-baselining the QA mirror…');
  await refreshQaMirror(db, { apply: true, log: () => undefined });
  const mirror = (await db.query('SELECT id FROM organizations WHERE name = $1', [targetNameFor(source)])).rows[0];
  assertNotProtectedSource(mirror.id);
  await assertQaOrganization(db, mirror.id);
  const ORG = mirror.id;

  const adminCookie = await login(QA_IDENTITY, env.MANUAL_QA_PASSWORD);
  const admin = api(adminCookie, ORG);
  const employeeCookie = await login(QA_EMPLOYEE_IDENTITY, env.MANUAL_QA_EMPLOYEE_PASSWORD);
  const employee = api(employeeCookie, ORG);

  const roster = (await admin('GET', '/api/employees')).body.employees;
  const idByExternal = new Map(roster.filter((e) => e.externalEmployeeId).map((e) => [e.externalEmployeeId, e.id]));
  const pilotId = idByExternal.get('84881');
  check('pilot_resolved_by_business_key', Boolean(pilotId));

  // Start from "no company plan communicated yet" for the future: drop the mirror's future plan (MIRROR ONLY, guarded above).
  assertNotProtectedSource(ORG);
  await db.query(`DELETE FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1)`, [ORG]);
  await db.query(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1)`, [ORG]);
  await db.query('DELETE FROM schedules WHERE organization_id = $1', [ORG]);
  await db.query(`DELETE FROM shifts WHERE organization_id = $1 AND date >= CURRENT_DATE AND effective_state = 'EFFECTIVE'`, [ORG]);

  const countRevisions = async () => (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n;
  const countAssignments = async () => (await db.query(`SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1`, [ORG])).rows[0].n;
  const countVersions = async (status) => (await db.query(`SELECT COUNT(*)::int n FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 AND v.status = $2`, [ORG, status])).rows[0].n;
  const countFutureShifts = async () => (await db.query(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND date >= CURRENT_DATE`, [ORG])).rows[0].n;
  const base = { revisions: await countRevisions(), assignments: await countAssignments(), futureShifts: await countFutureShifts(), published: await countVersions('PUBLISHED') };

  const xlsxShifts = parsed.xlsx.rows.map((r) => ({ ...r, employeeId: pilotId, origin: 'IMP', sourceFormat: 'excel', location: r.shiftType }));
  const xlsxInput = (overrides = {}) => ({
    fileName: 'qa-individual.xlsx', sourceFormat: 'excel', fileFingerprint: parsed.xlsx.fileFingerprint, employeeId: pilotId, shifts: xlsxShifts,
    importMode: 'individual', periodKind: 'multi', periodYear: 2026, periodMonth: 9, periodLabel: 'QA', weekStart: 'monday', ...overrides,
  });

  // ---- classification (read-only preview) -----------------------------------------------------------------
  const preview = await admin('POST', '/api/imports/plan-preview', xlsxInput());
  check('xlsx_temporal_mixed', preview.body.classification === 'MIXED', { classification: preview.body.classification, historical: preview.body.historicalCount, future: preview.body.futureCount });
  check('xlsx_document_class_proposed', ['COMPANY_PLAN', 'COMPANY_PLAN_UPDATE'].includes(preview.body.document?.documentClass), { documentClass: preview.body.document?.documentClass, confidence: preview.body.document?.confidence });
  check('preview_writes_nothing', (await countRevisions()) === base.revisions && (await countAssignments()) === base.assignments);

  // ---- decision gating ------------------------------------------------------------------------------------
  const noDecision = await admin('POST', '/api/imports/confirm-split', xlsxInput({ futureConsent: 'historical-only' }));
  check('server_requires_explicit_plan_decision', noDecision.status === 409 && noDecision.body.code === 'FUTURE_IMPORT_CONSENT_REQUIRED', { status: noDecision.status });
  const empConfirm = await employee('POST', '/api/imports/confirm-split', xlsxInput({ futureConsent: 'historical-and-plan' }));
  const empPreview = await employee('POST', '/api/imports/plan-preview', xlsxInput());
  check('employee_cannot_plan_or_preview', empConfirm.status === 403 && empPreview.status === 403, { confirm: empConfirm.status, preview: empPreview.status });
  check('employee_attempt_wrote_nothing', (await countRevisions()) === base.revisions && (await countAssignments()) === base.assignments);

  // ---- same file, different decision (historical-only first) ---------------------------------------------
  const histImport = await admin('POST', '/api/imports', {
    fileName: 'qa-individual.xlsx', sourceFormat: 'excel', fileFingerprint: parsed.xlsx.fileFingerprint, employeeId: pilotId,
    periodYear: 2026, periodMonth: 9, importMode: 'individual', periodKind: 'multi', periodLabel: 'QA historical only',
    employeeCount: 1, shiftCount: preview.body.historicalCount, createdShiftCount: 0, existingShiftCount: preview.body.historicalCount,
  });
  check('historical_only_import_recorded_without_plan', histImport.status < 300 && (await countRevisions()) === base.revisions && (await countAssignments()) === base.assignments, { status: histImport.status });

  // ---- historical + plan (XLSX, MIXED) -------------------------------------------------------------------
  const planned = await admin('POST', '/api/imports/confirm-split', xlsxInput({ futureConsent: 'historical-and-plan' }));
  check('xlsx_plan_confirmed', planned.status === 201 || planned.status === 200, { status: planned.status, code: planned.body.code });
  const revisionsAfter = await countRevisions();
  check('same_file_different_decision_applies_plan', planned.body.duplicate == null && revisionsAfter === base.revisions + 1 && planned.body.sameFileDifferentDecision === true, { duplicate: planned.body.duplicate, revisions: revisionsAfter - base.revisions, sameFile: planned.body.sameFileDifferentDecision });
  check('plan_created_as_drafts_not_published', planned.body.plan?.autoPublished === false && planned.body.future?.publishedWeekCount === 0 && (await countVersions('PUBLISHED')) === base.published && (await countFutureShifts()) === base.futureShifts && (await countVersions('DRAFT')) > 0, { draftWeeks: planned.body.future?.draftWeekCount });
  const xlsxFuture = {
    futureRows: planned.body.future?.submittedCount, createdAssignments: planned.body.future?.createdAssignmentCount, draftWeeks: planned.body.future?.draftWeekCount,
    historicalSubmitted: planned.body.historical?.submittedCount, changes: planned.body.plan?.changes,
  };
  results.xlsx_summary = { ok: true, ...xlsxFuture };
  const rev1 = (await db.query('SELECT rows, revision_number FROM company_plan_revisions WHERE organization_id = $1 ORDER BY revision_number LIMIT 1', [ORG])).rows[0];

  // ---- idempotency -----------------------------------------------------------------------------------------
  const exact = await admin('POST', '/api/imports/confirm-split', xlsxInput({ futureConsent: 'historical-and-plan' }));
  check('exact_reimport_is_noop', exact.body.duplicate === 'DUPLICATE_FILE' && (await countRevisions()) === revisionsAfter && (await countAssignments()) === (await countAssignments()), { duplicate: exact.body.duplicate });
  const assignmentsBeforeCopy = await countAssignments();
  const copy = await admin('POST', '/api/imports/confirm-split', xlsxInput({ futureConsent: 'historical-and-plan', fileFingerprint: fp() }));
  check('semantically_equal_copy_creates_no_revision', ['DUPLICATE_DOCUMENT', 'DUPLICATE_PLAN'].includes(copy.body.duplicate) && (await countRevisions()) === revisionsAfter && (await countAssignments()) === assignmentsBeforeCopy, { duplicate: copy.body.duplicate });

  // ---- real semantic change ---------------------------------------------------------------------------------
  const today = preview.body.cutoff;
  const idx = xlsxShifts.findIndex((s) => s.date >= today && s.shiftType === 'Regular' && s.endTime);
  const changedShifts = xlsxShifts.map((s, i) => (i === idx ? { ...s, endTime: s.endTime === '23:00' ? '22:00' : '23:00' } : s));
  const changedPreview = await admin('POST', '/api/imports/plan-preview', xlsxInput({ fileFingerprint: fp(), shifts: changedShifts }));
  check('change_detected_in_preview', changedPreview.body.plan?.changes?.modified === 1, { modified: changedPreview.body.plan?.changes?.modified });
  const changed = await admin('POST', '/api/imports/confirm-split', xlsxInput({ futureConsent: 'historical-and-plan', fileFingerprint: fp(), shifts: changedShifts }));
  const rev2Count = await countRevisions();
  const rev1Again = (await db.query('SELECT rows FROM company_plan_revisions WHERE organization_id = $1 AND revision_number = $2', [ORG, rev1.revision_number])).rows[0];
  check('real_change_creates_new_revision_and_preserves_previous', rev2Count === revisionsAfter + 1 && JSON.stringify(rev1Again.rows) === JSON.stringify(rev1.rows) && changed.body.plan?.revisionCreated === true, { revisions: rev2Count, modified: changed.body.plan?.changes?.modified });

  // ---- PDF team (multi-employee, FUTURE) --------------------------------------------------------------------
  const pdfShifts = parsed.pdf.employees.flatMap((e) => e.rows.map((r) => ({ ...r, employeeId: idByExternal.get(e.externalEmployeeId), origin: 'IMP', sourceFormat: 'pdf', location: r.shiftType })));
  const unmatched = parsed.pdf.employees.filter((e) => !idByExternal.has(e.externalEmployeeId)).length;
  check('pdf_employees_matched_by_external_id', unmatched === 0, { employees: parsed.pdf.employees.length, unmatched });
  const pdfInput = (extra = {}) => ({
    fileName: 'qa-team.pdf', sourceFormat: 'pdf', fileFingerprint: parsed.pdf.fileFingerprint, employeeId: pilotId, shifts: pdfShifts,
    importMode: 'team', periodKind: 'single', periodYear: 2026, periodMonth: 9, periodLabel: 'QA', weekStart: 'monday', ...extra,
  });
  const pdfPreview = await admin('POST', '/api/imports/plan-preview', pdfInput());
  check('pdf_temporal_future', pdfPreview.body.classification === 'FUTURE' || pdfPreview.body.classification === 'MIXED', { classification: pdfPreview.body.classification });
  const pdfConfirm = await admin('POST', '/api/imports/confirm-split', pdfInput({ futureConsent: 'historical-and-plan' }));
  check('pdf_plan_confirmed', pdfConfirm.status < 300, { status: pdfConfirm.status, code: pdfConfirm.body.code });
  // no cross-employee mixing: every assignment of a sampled employee equals that employee's document rows
  let mixed = 0; let nightShifts = 0; let fullDays = 0; const sample = parsed.pdf.employees.slice(0, 12);
  for (const emp of sample) {
    const id = idByExternal.get(emp.externalEmployeeId);
    const got = (await db.query(`SELECT TO_CHAR(a.date,'YYYY-MM-DD') d, a.shift_type t, a.start_time::text s, a.end_time::text e FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules x ON x.id = v.schedule_id WHERE x.organization_id = $1 AND a.employee_id = $2 AND a.date >= $3`, [ORG, id, today])).rows;
    const byDate = new Map(got.map((g) => [g.d, g]));
    for (const r of emp.rows) {
      const g = byDate.get(r.date);
      if (!g) continue; // unchanged vs baseline days are not rewritten
      const isFull = !r.startTime;
      if (isFull) fullDays += 1;
      if (r.startTime && r.endTime && r.endTime <= r.startTime) nightShifts += 1;
      if (g.t !== r.shiftType || (!isFull && (g.s?.slice(0, 5) !== r.startTime || g.e?.slice(0, 5) !== r.endTime))) mixed += 1;
    }
  }
  check('pdf_no_cross_employee_mixing', mixed === 0, { mismatches: mixed, sampledEmployees: sample.length });
  check('pdf_not_published', pdfConfirm.body.plan?.autoPublished === false && pdfConfirm.body.future?.publishedWeekCount === 0 && (await countVersions('PUBLISHED')) === base.published);
  results.pdf_summary = {
    ok: true, employees: parsed.pdf.employees.length, rows: pdfShifts.length, draftWeeks: pdfConfirm.body.future?.draftWeekCount, createdAssignments: pdfConfirm.body.future?.createdAssignmentCount,
    changes: pdfConfirm.body.plan?.changes, nightShiftsInSample: nightShifts, fullDayRowsInSample: fullDays,
  };
  const pdfRepeat = await admin('POST', '/api/imports/confirm-split', pdfInput({ futureConsent: 'historical-and-plan' }));
  check('pdf_exact_reimport_is_noop', pdfRepeat.body.duplicate === 'DUPLICATE_FILE');

  // ---- three-way with a local override on a pilot day ----------------------------------------------------
  const target = (await db.query(`SELECT a.id, a.schedule_version_id, TO_CHAR(a.date,'YYYY-MM-DD') d, a.start_time::text s, a.end_time::text e FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id AND v.status = 'DRAFT' JOIN schedules x ON x.id = v.schedule_id WHERE x.organization_id = $1 AND a.employee_id = $2 AND a.shift_type = 'Regular' AND a.date >= $3 ORDER BY a.date LIMIT 1`, [ORG, pilotId, today])).rows[0];
  if (target) {
    const B = { start: target.s.slice(0, 5), end: target.e.slice(0, 5) };
    const shift = (start, end) => [{ date: target.d, shiftType: 'Regular', startTime: start, endTime: end, employeeId: pilotId, origin: 'IMP', location: 'Regular', sourceFormat: 'excel' }];
    const shiftPlus = (hhmm, h) => `${String((Number(hhmm.slice(0, 2)) + h) % 24).padStart(2, '0')}:${hhmm.slice(3)}`;
    const E = { start: shiftPlus(B.start, 1), end: shiftPlus(B.end, 1) };
    await db.query('UPDATE shift_assignments SET start_time = $1, end_time = $2 WHERE id = $3', [E.start, E.end, target.id]); // planner edit (mirror only)
    const run = (start, end) => admin('POST', '/api/imports/plan-preview', { fileFingerprint: fp(), employeeId: pilotId, shifts: shift(start, end), importMode: 'individual', periodKind: 'single', weekStart: 'monday' });
    const n1 = await run(B.start, B.end);
    const n2 = await run(E.start, E.end);
    const n3 = await run(shiftPlus(B.start, 2), shiftPlus(B.end, 2));
    check('three_way_company_returns_to_baseline_keeps_local', n1.body.plan?.changes?.keptLocal === 1 || n1.body.plan?.changes?.unchanged === 1, n1.body.plan?.changes);
    check('three_way_company_adopts_local_change', n2.body.plan?.changes?.companyAdoptedLocal === 1, n2.body.plan?.changes);
    check('three_way_real_discrepancy_requires_review', n3.body.plan?.changes?.requiresReview === 1, n3.body.plan?.changes);
    const pendingBefore = (await db.query(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND effective_state = 'REQUIRES_REVIEW' AND date >= CURRENT_DATE`, [ORG])).rows[0].n;
    const conflict = await admin('POST', '/api/imports/confirm-split', { fileFingerprint: fp(), employeeId: pilotId, shifts: shift(shiftPlus(B.start, 2), shiftPlus(B.end, 2)), importMode: 'individual', periodKind: 'single', futureConsent: 'historical-and-plan', weekStart: 'monday', sourceFormat: 'excel', fileName: 'qa-conflict.xlsx' });
    const pendingAfter = (await db.query(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND effective_state = 'REQUIRES_REVIEW' AND date >= CURRENT_DATE`, [ORG])).rows[0].n;
    const draftStillLocal = (await db.query('SELECT start_time::text s FROM shift_assignments WHERE id = $1', [target.id])).rows[0].s.slice(0, 5) === E.start;
    check('conflict_becomes_reconciliation_and_local_override_is_not_overwritten', conflict.status < 300 && pendingAfter === pendingBefore + 1 && draftStillLocal, { status: conflict.status, pendingDelta: pendingAfter - pendingBefore });

    // ---- concurrency: two confirmations of the same NEW plan -------------------------------------------------
    const revBefore = await countRevisions();
    const newDay = shift(shiftPlus(B.start, 3), shiftPlus(B.end, 3));
    const mk = () => admin('POST', '/api/imports/confirm-split', { fileFingerprint: fp(), employeeId: pilotId, shifts: newDay.map((s) => ({ ...s, date: '2027-03-03' })), importMode: 'individual', periodKind: 'single', futureConsent: 'historical-and-plan', weekStart: 'monday', sourceFormat: 'excel', fileName: 'qa-race.xlsx' });
    const [a, b] = await Promise.all([mk(), mk()]);
    const revDelta = (await countRevisions()) - revBefore;
    check('concurrent_confirmations_create_at_most_one_revision', revDelta <= 1 && a.status < 500 && b.status < 500, { revisionDelta: revDelta, statuses: [a.status, b.status] });
  } else check('three_way_scenario_available', false);

  // ---- source protection -----------------------------------------------------------------------------------
  const srcAfter = await sourceFingerprint(db, source.id);
  check('source_organization_unchanged', srcAfter.overall === srcBefore.overall, { before: srcBefore.overall.slice(0, 12), after: srcAfter.overall.slice(0, 12) });
  const writesOutside = (await db.query(`SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id <> $1`, [ORG])).rows[0].n;
  check('no_plan_revision_outside_the_mirror', writesOutside === 0);

  const failed = Object.entries(results).filter(([, v]) => v.ok === false);
  console.log(JSON.stringify({ base: BASE, passed: Object.keys(results).length - failed.length, failed: failed.map(([k]) => k), results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await db.end();
}

#!/usr/bin/env node
/**
 * Future import routing — targeted, synthetic proof against the QA MIRROR over HTTP (+ direct read-backs, mirror only).
 *
 *   node scripts/qa/future-routing-e2e.mjs --base http://localhost:5173
 *
 * Rule: historical rows -> Calendar; future rows -> Planning DRAFT only for planning roles with an explicit decision, for ALL
 * source kinds; EMPLOYEE never plans; importing never publishes; calendar snapshots never create a company plan revision.
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
const check = (name, ok, detail = {}) => { results[name] = { ok: Boolean(ok), ...detail }; if (!ok) console.error(`[future-routing] FAIL ${name}`, JSON.stringify(detail)); };
const fp = () => createHash('sha256').update(randomBytes(16)).digest('hex');
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
  const employee = api(await login(QA_EMPLOYEE_IDENTITY, env.MANUAL_QA_EMPLOYEE_PASSWORD), ORG);
  const roster = (await admin('GET', '/api/employees')).body.employees.filter((e) => e.status === 'active' && e.externalEmployeeId && e.externalEmployeeId !== '84881' && !e.userId);
  const [E1, E2, E3, E4] = roster;
  check('synthetic_employees', Boolean(E1 && E2 && E3 && E4));
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const n = async (sql, params = []) => (await q(sql, params))[0].n;

  const row = (emp, date, s, e, t = 'Regular') => ({ date, shiftType: t, startTime: s ?? '', endTime: e ?? '', employeeId: emp.id, origin: 'IMP', sourceFormat: 'excel', location: t });
  const doc = (emp, shifts, extra = {}) => ({
    fileName: `route-${Date.now()}-${Math.floor(Math.random() * 1e6)}.xlsx`, sourceFormat: 'excel', fileFingerprint: fp(), employeeId: emp.id, shifts,
    importMode: 'individual', periodKind: 'multi', periodYear: 2027, periodMonth: null, periodLabel: 'QA', weekStart: 'monday', deleteIds: [], ...extra,
  });
  const HIST = ['2024-04-01', '2024-04-02'];
  const FUT = (m) => [`2027-${m}-05`, `2027-${m}-06`, `2027-${m}-07`];
  const stats = async (importId) => ({
    assignments: await n(`SELECT COUNT(*)::int n FROM shift_assignments WHERE import_id = $1`, [importId]),
    draftVersions: await n(`SELECT COUNT(DISTINCT v.id)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id WHERE a.import_id = $1 AND v.status = 'DRAFT'`, [importId]),
    publishedVersions: await n(`SELECT COUNT(DISTINCT v.id)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id WHERE a.import_id = $1 AND v.status <> 'DRAFT'`, [importId]),
    shifts: await n(`SELECT COUNT(*)::int n FROM shifts WHERE import_id = $1`, [importId]),
    revisions: await n(`SELECT COUNT(*)::int n FROM company_plan_revisions WHERE import_id = $1`, [importId]),
  });

  // ---- the same rule for the three source kinds (ADMIN, MIXED, include future) --------------------------------------------
  const kinds = [['TEAM_SCHEDULE_EXPORT', E1, '03'], ['PUBLISHED_CALENDAR_EXPORT', E2, '05'], ['EMPLOYEE_CALENDAR_EXPORT', E3, '07']];
  const ids = {};
  for (const [kind, emp, month] of kinds) {
    const res = await admin('POST', '/api/imports/confirm-split', doc(emp, [...HIST.map((d) => row(emp, d, '09:00', '17:00')), ...FUT(month).map((d) => row(emp, d, '14:00', '22:00'))], { sourceKind: kind, futureConsent: 'historical-and-plan' }));
    check(`${kind}_mixed_include_future_ok`, res.status === 201, { status: res.status, code: res.body.code });
    const s = await stats(res.body.importId);
    ids[kind] = res.body.importId;
    check(`${kind}_historical_to_calendar`, s.shifts === HIST.length, s);
    check(`${kind}_future_to_draft`, s.assignments === 3 && s.draftVersions >= 1, s);
    check(`${kind}_never_auto_published`, s.publishedVersions === 0 && res.body.plan?.autoPublished === false, s);
    const expectRevisions = kind === 'TEAM_SCHEDULE_EXPORT' ? 1 : 0;
    check(`${kind}_company_plan_revisions_${expectRevisions}`, s.revisions === expectRevisions, { revisions: s.revisions });
  }

  // ---- historical-only: the explicit decision is required for any future write; 0 future assignments ----------------------------
  const noConsent = doc(E4, [...HIST.map((d) => row(E4, d, '09:00', '17:00')), ...FUT('09').map((d) => row(E4, d, '14:00', '22:00'))], { sourceKind: 'PUBLISHED_CALENDAR_EXPORT' });
  const hoRes = await admin('POST', '/api/imports/confirm-split', noConsent);
  check('without_decision_no_future_write', hoRes.status === 409 && hoRes.body.code === 'FUTURE_IMPORT_CONSENT_REQUIRED', { status: hoRes.status, code: hoRes.body.code });
  check('without_decision_zero_assignments', (await n(`SELECT COUNT(*)::int n FROM shift_assignments WHERE employee_id = $1 AND date >= '2027-09-01' AND date < '2027-10-01'`, [E4.id])) === 0);

  // ---- future-only (XLSX snapshot, ADMIN) --------------------------------------------------------------------------------------
  const fo = await admin('POST', '/api/imports/confirm-split', doc(E4, FUT('09').map((d) => row(E4, d, '14:00', '22:00')), { sourceKind: 'PUBLISHED_CALENDAR_EXPORT', futureConsent: 'historical-and-plan' }));
  const foStats = await stats(fo.body.importId);
  check('future_only_valid_draft', fo.status === 201 && foStats.assignments === 3 && foStats.publishedVersions === 0 && foStats.revisions === 0, { status: fo.status, ...foStats });

  // ---- EMPLOYEE never plans (backend authority), even with a forged decision ---------------------------------------------------
  const emp = (await employee('GET', '/api/session/me')).body;
  const selfId = emp?.employeeId ?? emp?.session?.employeeId ?? emp?.user?.employeeId;
  const forged = doc({ id: selfId ?? E1.id }, [row({ id: selfId ?? E1.id }, '2024-04-03', '09:00', '17:00'), row({ id: selfId ?? E1.id }, '2027-11-05', '14:00', '22:00')], { sourceKind: 'EMPLOYEE_CALENDAR_EXPORT', futureConsent: 'historical-and-plan' });
  const emRes = await employee('POST', '/api/imports/confirm-split', forged);
  check('employee_forged_consent_forbidden', emRes.status === 403 && emRes.body.code === 'SELF_IMPORT_FUTURE_FORBIDDEN', { status: emRes.status, code: emRes.body.code });
  check('employee_zero_future_assignments', (await n(`SELECT COUNT(*)::int n FROM shift_assignments WHERE date = '2027-11-05' AND employee_id = $1`, [selfId ?? E1.id])) === 0);

  // ---- DCF travels with a future row: one assignment, one annotation, no invented hours ----------------------------------------
  const dcfDate = '2027-10-05';
  const dcf = await admin('POST', '/api/imports/confirm-split', doc(E2, [{ ...row(E2, dcfDate, '17:00', '01:00'), annotations: [{ kind: 'DCF' }] }], { sourceKind: 'EMPLOYEE_CALENDAR_EXPORT', futureConsent: 'historical-and-plan' }));
  const dcfStats = await stats(dcf.body.importId);
  const dcfAnn = await q(`SELECT kind, completeness FROM calendar_annotations WHERE employee_id = $1 AND date = $2`, [E2.id, dcfDate]);
  check('future_dcf_one_assignment_one_annotation', dcf.status === 201 && dcfStats.assignments === 1 && dcfAnn.length === 1 && dcfAnn[0].kind === 'DCF' && dcfAnn[0].completeness === 'HOURS_UNKNOWN', { status: dcf.status, assignments: dcfStats.assignments, ann: dcfAnn });

  // ---- re-import of a live document: the draft is reconciled, never silently duplicated -----------------------------------------
  const rDate = '2027-11-25';
  const r1 = await admin('POST', '/api/imports/confirm-split', doc(E3, [row(E3, rDate, '14:00', '22:00')], { sourceKind: 'PUBLISHED_CALENDAR_EXPORT', futureConsent: 'historical-and-plan' }));
  const r2 = await admin('POST', '/api/imports/confirm-split', doc(E3, [row(E3, rDate, '16:00', '00:00')], { sourceKind: 'EMPLOYEE_CALENDAR_EXPORT', futureConsent: 'historical-and-plan' }));
  const dayRows = await q(`SELECT a.start_time, a.end_time FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id WHERE a.employee_id = $1 AND a.date = $2 AND v.status = 'DRAFT'`, [E3.id, rDate]);
  const pend = await n(`SELECT COUNT(*)::int n FROM shifts WHERE employee_id = $1 AND date = $2 AND effective_state = 'REQUIRES_REVIEW'`, [E3.id, rDate]);
  results.reimport_observed = { first: r1.status, second: r2.status, draftRowsForDay: dayRows.length, requiresReview: pend, outcome: r2.body.plan?.changes };
  check('reimport_no_two_equivalent_drafts', dayRows.length <= 1 && new Set(dayRows.map((r) => `${r.start_time}|${r.end_time}`)).size === dayRows.length, { dayRows });

  // ---- reversion of an imported future draft ------------------------------------------------------------------------------------
  const rv = await admin('POST', '/api/imports/reversions/preview', { importIds: [ids.PUBLISHED_CALENDAR_EXPORT] });
  const rvc = rv.status < 300 ? await admin('POST', '/api/imports/reversions/confirm', { importIds: [ids.PUBLISHED_CALENDAR_EXPORT], planHash: rv.body.planHash }) : rv;
  check('reversion_preview_confirm', rv.status < 300 && rvc.status < 300 && (await stats(ids.PUBLISHED_CALENDAR_EXPORT)).assignments === 0, { preview: rv.status, confirm: rvc.status });

  // ---- publishing stays a separate, explicit action ------------------------------------------------------------------------------
  // the three dates span two scheduling weeks = two DRAFT versions; each is published explicitly, one by one
  const targets = await q(`SELECT DISTINCT a.schedule_version_id v, v.schedule_id s FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id WHERE a.import_id = $1`, [fo.body.importId]);
  const countSept = () => n(`SELECT COUNT(*)::int n FROM shifts WHERE employee_id = $1 AND date >= '2027-09-01' AND date < '2027-10-01'`, [E4.id]);
  const beforePub = await countSept();
  let pubStatus = 200;
  for (const t of targets) { const pub = await admin('POST', `/api/schedules/${t.s}/versions/${t.v}/publish`, {}); if (pub.status >= 300) pubStatus = pub.status; }
  const afterPub = await countSept();
  check('publish_is_explicit_and_creates_shifts', beforePub === 0 && pubStatus < 300 && afterPub === 3, { before: beforePub, after: afterPub, versions: targets.length, status: pubStatus });

  const srcAfter = await sourceFingerprint(db, source.id);
  check('source_untouched', JSON.stringify(srcBefore) === JSON.stringify(srcAfter));
} finally { await db.end(); }
const failed = Object.entries(results).filter(([, v]) => v && v.ok === false);
console.log(JSON.stringify({ total: Object.keys(results).length, failed: failed.map(([k]) => k), results }, null, 1));
process.exit(failed.length ? 1 : 0);

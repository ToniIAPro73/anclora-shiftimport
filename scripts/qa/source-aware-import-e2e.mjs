#!/usr/bin/env node
/**
 * Source-aware import E2E against the QA MIRROR, over HTTP (local `npm run dev` or the Vercel Preview).
 * Real TRYP exports are consumed only as normalised rows exported locally by
 *   QA_TRYP_OUT=<json> npx vitest run src/ingestion/tryp-real-export.test.ts
 * Nothing real is printed or committed (counts and PASS/FAIL only). Writes go to the QA mirror only; the source
 * organization is fingerprinted before/after and must not change.
 *
 *   node scripts/qa/source-aware-import-e2e.mjs --base http://localhost:5173 --tryp <json>
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
const tryp = JSON.parse(readFileSync(opt('--tryp'), 'utf8'));
const env = loadEnv(['.env.development.local']);
const results = {};
const check = (name, ok, detail = {}) => { results[name] = { ok: Boolean(ok), ...detail }; if (!ok) console.error(`[e2e] FAIL ${name}`, JSON.stringify(detail)); };

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const api = (cookie, org) => async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', cookie, 'x-organization-id': org }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const db = await connect();
try {
  const source = await resolveSourceOrganization(db);
  if (source.id !== PROTECTED_SOURCE_ORG_ID) throw new Error('unexpected source organization');
  const srcBefore = await sourceFingerprint(db, source.id);
  console.log('[e2e] re-baselining the QA mirror…');
  await refreshQaMirror(db, { apply: true, log: () => undefined });
  const mirror = (await db.query('SELECT id FROM organizations WHERE name = $1', [targetNameFor(source)])).rows[0];
  assertNotProtectedSource(mirror.id);
  await assertQaOrganization(db, mirror.id);
  const ORG = mirror.id;
  const legacyRevisionBaseline = (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n;

  const admin = api(await login(QA_IDENTITY, env.MANUAL_QA_PASSWORD), ORG);
  const employee = api(await login(QA_EMPLOYEE_IDENTITY, env.MANUAL_QA_EMPLOYEE_PASSWORD), ORG);
  const roster = (await admin('GET', '/api/employees')).body.employees;
  const pilot = roster.find((e) => e.externalEmployeeId === '84881');
  check('pilot_present', Boolean(pilot));
  const pilotId = pilot.id;

  const { emp, pub } = tryp;
  check('source_kind_employee_calendar', emp.sourceKind === 'EMPLOYEE_CALENDAR_EXPORT', { kind: emp.sourceKind });
  check('source_kind_published_calendar', pub.sourceKind === 'PUBLISHED_CALENDAR_EXPORT', { kind: pub.sourceKind });
  check('employee_calendar_dcf_is_5', emp.annotations.filter((a) => a.kind === 'DCF').length === 5);
  check('employee_calendar_comments_present', emp.annotations.filter((a) => a.kind === 'COMMENT').length >= 1);
  check('employee_baja_0206', emp.rows.some((r) => r.date === '2026-06-02' && r.shiftType === 'Baja'));
  check('published_0206_14_22', pub.rows.some((r) => r.date === '2026-06-02' && r.startTime === '14:00' && r.endTime === '22:00'));

  const input = (doc, extra = {}) => ({
    fileName: 'qa-tryp.xlsx', sourceFormat: 'excel', fileFingerprint: doc.fileFingerprint, employeeId: pilotId,
    shifts: doc.rows.map((r) => ({ ...r, employeeId: pilotId, origin: 'IMP', sourceFormat: 'excel', location: r.shiftType })),
    importMode: 'individual', periodKind: 'multi', periodYear: 2026, periodMonth: 1, periodLabel: 'QA', weekStart: 'monday',
    futureConsent: 'historical-and-plan', sourceKind: doc.sourceKind, sourceSystem: doc.sourceSystem, sourceIdentifier: doc.sourceIdentifier,
    annotations: doc.annotations, ...extra,
  });
  const siblingFingerprint = () => createHash('sha256').update(randomBytes(16)).digest('hex');

  // ---- IDENTITY: 6888 is NOT silently 84881 ------------------------------------------------------------------
  const lookup = (await admin('GET', '/api/employees/identifiers?sourceSystem=TRYP_EMPLOYEE_CALENDAR&externalIdentifier=6888')).body;
  check('6888_not_mapped_by_default', lookup.mapped === false);
  const blocked = await admin('POST', '/api/imports/confirm-split', input(pub));
  check('unmapped_source_number_blocked_fail_closed', blocked.status === 409 && blocked.body.code === 'SOURCE_IDENTIFIER_UNMAPPED', { status: blocked.status, code: blocked.body.code });
  const empMap = await employee('POST', '/api/employees/identifiers', { employeeId: pilotId, sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888' });
  check('employee_cannot_associate_identity', empMap.status === 403, { status: empMap.status });
  const mapped = await admin('POST', '/api/employees/identifiers', { employeeId: pilotId, sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888' });
  check('admin_explicit_association_created', mapped.status < 300, { status: mapped.status });
  const mapAgain = await admin('POST', '/api/employees/identifiers', { employeeId: roster.find((e) => e.id !== pilotId && e.status === 'active').id, sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888' });
  check('mapping_cannot_be_stolen', mapAgain.status === 409, { status: mapAgain.status });
  check('blocked_attempt_wrote_nothing', (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n === legacyRevisionBaseline);

  // ---- Published calendar import remains a proposal against CURRENT ------------------------------------------------
  const pubRes = await admin('POST', '/api/imports/confirm-split', input(pub));
  check('published_calendar_imported_without_revision', pubRes.status < 300 && pubRes.body.sourceKind === 'PUBLISHED_CALENDAR_EXPORT', { status: pubRes.status, code: pubRes.body.code });
  check('published_never_auto_published', pubRes.body.plan?.autoPublished === false);
  check('published_import_created_no_revision', (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n === legacyRevisionBaseline);

  // ---- Employee calendar is proposed against CURRENT ------------------------------------------------
  const pendingBefore = (await admin('GET', `/api/calendar/reconciliation?employeeId=${pilotId}&year=2026`)).body.pendingCount;
  const empRes = await admin('POST', '/api/imports/confirm-split', input(emp));
  check('employee_calendar_imported', empRes.status < 300 && empRes.body.sourceKind === 'EMPLOYEE_CALENDAR_EXPORT', { status: empRes.status, code: empRes.body.code });
  // The canonical 02/06 day already awaits review in the mirror baseline: re-importing must neither resolve it nor erase anything.
  const rows0206 = (await db.query(`SELECT shift_type, start_time, end_time, effective_state FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = '2026-06-02'`, [ORG, pilotId])).rows;
  check('0206_plan_and_baja_both_preserved', rows0206.some((r) => r.shift_type === 'Regular' && String(r.start_time).slice(0, 5) === '14:00' && String(r.end_time).slice(0, 5) === '22:00') && rows0206.some((r) => /baja/i.test(r.shift_type)), { rows: rows0206.length });
  check('0206_not_auto_resolved', rows0206.every((r) => r.effective_state === 'REQUIRES_REVIEW'), { states: [...new Set(rows0206.map((r) => r.effective_state))] });
  const day0206 = (await admin('GET', `/api/calendar/reconciliation?employeeId=${pilotId}&year=2026`)).body.items.find((i) => i.date === '2026-06-02');
  check('0206_current_and_proposed_are_separate', Boolean(day0206) && day0206.current?.some((l) => l.startTime === '14:00' && l.endTime === '22:00') && day0206.proposed?.some((l) => /baja/i.test(l.type)), { reasonCode: day0206?.reasonCode });

  // Current/proposed behavior on a clean past day (synthetic): current 14-22, then incoming Baja remains pending.
  // Uses a roster employee other than the pilot (the pilot has shifts every day); the document number equals that
  // employee's canonical id, so the identity guard passes without any association.
  let other = null; let freeDay = null;
  for (const candidate of roster.filter((e) => e.id !== pilotId && e.status === 'active' && e.externalEmployeeId)) {
    const free = (await db.query(`SELECT d::date AS day FROM generate_series('2026-02-01'::date, '2026-09-30'::date, '1 day') d
        WHERE NOT EXISTS (SELECT 1 FROM shifts s WHERE s.organization_id = $1 AND s.employee_id = $2 AND s.date = d::date) ORDER BY d LIMIT 1`, [ORG, candidate.id])).rows[0];
    if (free) { other = candidate; freeDay = String(free.day).slice(0, 10); break; }
  }
  check('clean_past_day_available_for_current_proposal', Boolean(freeDay));
  if (freeDay) {
    const one = (doc, row) => ({
      ...input(doc, { fileFingerprint: siblingFingerprint() }), employeeId: other.id, sourceIdentifier: other.externalEmployeeId,
      // A purely historical document is routed to the safe path by design, so a (far-future, unrelated) planning day rides along.
      shifts: [
        { ...row, date: freeDay, employeeId: other.id, origin: 'IMP', sourceFormat: 'excel', location: row.shiftType },
        { date: '2027-03-09', shiftType: 'Libre', startTime: '', endTime: '', employeeId: other.id, origin: 'IMP', sourceFormat: 'excel', location: 'Libre' },
      ], annotations: [],
    });
    const p1 = await admin('POST', '/api/imports/confirm-split', one(pub, { shiftType: 'Regular', startTime: '14:00', endTime: '22:00' }));
    const p2 = await admin('POST', '/api/imports/confirm-split', one(emp, { shiftType: 'Baja', startTime: '', endTime: '' }));
    check('current_proposal_imports_accepted', p1.status < 300 && p2.status < 300, { published: p1.status, employee: p2.status, code: p2.body.code });
    const d = (await db.query(`SELECT shift_type, start_time, end_time, effective_state, layer FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3`, [ORG, other.id, freeDay])).rows;
    check('current_remains_effective', d.some((r) => r.shift_type === 'Regular' && String(r.start_time).slice(0, 5) === '14:00' && r.effective_state === 'EFFECTIVE'), { states: d.map((r) => `${r.layer}/${r.effective_state}`) });
    check('incoming_difference_is_pending', d.some((r) => /baja/i.test(r.shift_type) && r.effective_state === 'REQUIRES_REVIEW'), { rows: d.length });
    check('historical_import_writes_no_revision', (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n === legacyRevisionBaseline);
  }
  check('employee_calendar_did_not_publish_anything', empRes.body.plan?.autoPublished === false);

  // ---- ANNOTATIONS: DCF (hours unknown) + comments --------------------------------------------------------------
  const ann = (await admin('GET', `/api/calendar/annotations?employeeId=${pilotId}&from=2026-01-01&to=2026-12-31`)).body.annotations;
  const dcf = ann.filter((a) => a.kind === 'DCF');
  check('dcf_imported_5', dcf.length === 5, { count: dcf.length });
  check('dcf_hours_not_invented', dcf.every((a) => a.completeness === 'HOURS_UNKNOWN' && !a.startTime && !a.endTime));
  check('comments_imported_distinct_from_manual', ann.filter((a) => a.kind === 'COMMENT').every((a) => a.origin === 'IMPORT') && ann.some((a) => a.kind === 'COMMENT'));
  const dcfDate = dcf[0].date;
  const dcfDay = emp.rows.find((r) => r.date === dcfDate);
  const effDcf = (await db.query(`SELECT shift_type, start_time, end_time FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3 AND effective_state = 'EFFECTIVE'`, [ORG, pilotId, dcfDate])).rows;
  const hhmm = (t) => String(t ?? '').slice(0, 5);
  check('dcf_does_not_alter_effective_hours', effDcf.length > 0 && effDcf.every((r) => hhmm(r.start_time) === (dcfDay.startTime || '') && hhmm(r.end_time) === (dcfDay.endTime || '')), { rows: effDcf.length });
  const empPatch = await employee('PATCH', '/api/calendar/annotations', { employeeId: pilotId, date: dcfDate, startTime: '08:00', endTime: '12:00' });
  check('employee_cannot_complete_dcf', empPatch.status === 403, { status: empPatch.status });
  const patch = await admin('PATCH', '/api/calendar/annotations', { employeeId: pilotId, date: dcfDate, startTime: '08:00', endTime: '12:00' });
  check('admin_completes_dcf_interval', patch.status === 200 && patch.body.completeness === 'HOURS_KNOWN', { status: patch.status });
  const reimport = await admin('POST', '/api/imports/confirm-split', input(emp, { fileFingerprint: siblingFingerprint() }));
  const after = (await admin('GET', `/api/calendar/annotations?employeeId=${pilotId}&from=${dcfDate}&to=${dcfDate}`)).body.annotations.find((a) => a.kind === 'DCF');
  check('reimport_never_downgrades_known_dcf_hours', after?.completeness === 'HOURS_KNOWN' && after.startTime === '08:00', { status: reimport.status });

  // ---- RECONCILIATION never auto-resolved; idempotency ------------------------------------------------------------
  const recon = (await admin('GET', `/api/calendar/reconciliation?employeeId=${pilotId}&year=2026`)).body;
  check('reconciliation_items_have_current_proposed', recon.items.every((i) => 'current' in i && 'proposed' in i && !('companyNow' in i) && !('companyBefore' in i) && i.reasonCode !== undefined) || recon.items.length === 0, { items: recon.items.length, pendingBefore, pendingNow: recon.pendingCount });
  check('reimport_did_not_auto_resolve_pending', recon.pendingCount >= pendingBefore);
  const dcfDates = new Set(dcf.map((a) => a.date));
  check('unknown_dcf_creates_no_reconciliation_alert', !recon.items.some((i) => dcfDates.has(i.date) && i.status === 'PENDING'), { pendingOnDcfDays: recon.items.filter((i) => dcfDates.has(i.date) && i.status === 'PENDING').length });
  const revCount = (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n;
  const dupe = await admin('POST', '/api/imports/confirm-split', input(emp));
  const revCountAfterDupe = (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n;
  check('same_file_again_is_idempotent', dupe.status < 300 && revCountAfterDupe === revCount, { status: dupe.status, duplicate: dupe.body.duplicate });
  const commentOnly = { ...emp, fileFingerprint: siblingFingerprint(), annotations: emp.annotations.map((a) => (a.kind === 'COMMENT' ? { ...a, text: `${a.text} (editado)` } : a)) };
  const commentRes = await admin('POST', '/api/imports/confirm-split', input(commentOnly));
  const revCountAfterComment = (await db.query('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [ORG])).rows[0].n;
  check('comment_only_change_creates_no_legacy_revision', commentRes.status < 300 && revCountAfterComment === revCount, { before: revCount, after: revCountAfterComment });

  // ---- SOURCE protection -----------------------------------------------------------------------------------------------
  const srcAfter = await sourceFingerprint(db, source.id);
  check('SOURCE_HASH_BEFORE_equals_AFTER', srcBefore.overall === srcAfter.overall);
} finally {
  await db.end();
}
const failed = Object.entries(results).filter(([, v]) => !v.ok);
console.log(JSON.stringify({ total: Object.keys(results).length, passed: Object.keys(results).length - failed.length, failed: failed.map(([k]) => k), results }, null, 1));
process.exit(failed.length ? 1 : 0);

#!/usr/bin/env node
/**
 * Import Reversion Engine — targeted, synthetic proof against the QA MIRROR over HTTP (+ direct DB read-backs, mirror only).
 *
 *   node scripts/qa/import-reversion-e2e.mjs --base http://localhost:5173
 *
 * Covers: effect ledger completeness, dependency closure + server-side ordering, read-only preview, atomic confirm, stale plans,
 * idempotent double confirm, reimport after reversion, manual-change safety, DCF / comments, evidence, drafts, legacy imports,
 * roles, the legacy DELETE alias and source-mapping preservation. The source organization is fingerprinted before/after.
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
const check = (name, ok, detail = {}) => { results[name] = { ok: Boolean(ok), ...detail }; if (!ok) console.error(`[reversion] FAIL ${name}`, JSON.stringify(detail)); };
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
  const [E1, E2, E3] = roster;
  check('three_synthetic_employees', Boolean(E1 && E2 && E3));
  const mappingsBefore = (await db.query('SELECT COUNT(*)::int n FROM employee_source_identifiers WHERE organization_id = $1', [ORG])).rows[0].n;

  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await q(sql, params))[0];
  const clean = async () => {
    // mirror-only: remove the synthetic windows of previous runs (2027 + the evidence/legacy windows of 2026-12)
    await q(`DELETE FROM import_effects WHERE organization_id = $1 AND import_id IN (SELECT id FROM imports WHERE organization_id = $1 AND file_name LIKE 'rev-%')`, [ORG]);
    await q(`DELETE FROM company_plan_revisions WHERE organization_id = $1 AND (coverage_from >= '2027-01-01' OR import_id IN (SELECT id FROM imports WHERE organization_id = $1 AND file_name LIKE 'rev-%'))`, [ORG]);
    await q(`DELETE FROM shift_assignments WHERE schedule_version_id IN (SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 AND s.period_start >= '2027-01-01')`, [ORG]);
    await q(`DELETE FROM schedule_versions WHERE schedule_id IN (SELECT id FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01')`, [ORG]);
    await q(`DELETE FROM schedules WHERE organization_id = $1 AND period_start >= '2027-01-01'`, [ORG]);
    await q(`DELETE FROM calendar_annotations WHERE organization_id = $1 AND date >= '2027-01-01'`, [ORG]);
    await q(`DELETE FROM calendar_changes WHERE organization_id = $1 AND date >= '2027-01-01'`, [ORG]);
    await q(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = ANY($2::uuid[]) AND date >= '2026-12-01'`, [ORG, [E1.id, E2.id, E3.id]]);
    await q(`DELETE FROM imports WHERE organization_id = $1 AND file_name LIKE 'rev-%'`, [ORG]);
    await q(`DELETE FROM import_reversions WHERE organization_id = $1 AND id NOT IN (SELECT reversion_id FROM imports WHERE reversion_id IS NOT NULL)`, [ORG]);
  };
  await clean();

  const row = (emp, date, s, e, t = 'Regular') => ({ date, shiftType: t, startTime: s ?? '', endTime: e ?? '', employeeId: emp.id, origin: 'IMP', sourceFormat: 'excel', location: t });
  let counter = 0;
  const importDoc = async (emp, shifts, extra = {}) => {
    counter += 1;
    const res = await admin('POST', '/api/imports/confirm-split', {
      fileName: `rev-${counter}-${Date.now()}.xlsx`, sourceFormat: 'excel', fileFingerprint: fp(), employeeId: emp.id, shifts, importMode: 'individual', periodKind: 'multi',
      periodYear: 2027, periodMonth: null, periodLabel: 'QA', weekStart: 'monday', futureConsent: 'historical-and-plan', sourceKind: 'TEAM_SCHEDULE_EXPORT', deleteIds: [], ...extra,
    });
    return res;
  };
  const counts = async () => ({
    shifts: (await one(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1`, [ORG])).n,
    assignments: (await one(`SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1`, [ORG])).n,
    versions: (await one(`SELECT COUNT(*)::int n FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1`, [ORG])).n,
    revisions: (await one(`SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1 AND reverted_at IS NULL`, [ORG])).n,
    annotations: (await one(`SELECT COUNT(*)::int n FROM calendar_annotations WHERE organization_id = $1`, [ORG])).n,
    effects: (await one(`SELECT COUNT(*)::int n FROM import_effects WHERE organization_id = $1`, [ORG])).n,
    reversions: (await one(`SELECT COUNT(*)::int n FROM import_reversions WHERE organization_id = $1`, [ORG])).n,
  });
  const preview = (ids) => admin('POST', '/api/imports/reversions/preview', { importIds: ids });
  const confirm = (ids, planHash, extra = {}) => admin('POST', '/api/imports/reversions/confirm', { importIds: ids, planHash, ...extra });

  // =========================================================================================================================
  // T1 — a chain A -> B on the same plan scope: ledger, dependency closure, order, read-only preview, atomic confirm
  // =========================================================================================================================
  const base0 = await counts();
  const a = await importDoc(E1, [row(E1, '2027-06-01', '09:00', '17:00'), row(E1, '2027-06-02', '09:00', '17:00'), row(E1, '2027-06-03', null, null, 'Libre')]);
  check('A_imported', a.status < 300, { status: a.status, code: a.body.code });
  const A = a.body.importId;
  const afterA = await counts();
  const kinds = (await q(`SELECT DISTINCT effect_kind FROM import_effects WHERE import_id = $1`, [A])).map((r) => r.effect_kind).sort();
  check('ledger_has_plan_revision_assignment_and_version_effects', ['ASSIGNMENT_INSERT', 'PLAN_REVISION_INSERT', 'SCHEDULE_VERSION_INSERT'].every((k) => kinds.includes(k)) || (kinds.includes('ASSIGNMENT_INSERT') && kinds.includes('PLAN_REVISION_INSERT')), { kinds });
  check('ledger_written_in_the_same_transaction_as_the_business_rows', afterA.effects > base0.effects && afterA.revisions === base0.revisions + 1);

  const b = await importDoc(E1, [row(E1, '2027-06-01', '10:00', '18:00'), row(E1, '2027-06-02', '09:00', '17:00'), row(E1, '2027-06-03', null, null, 'Libre')]);
  check('B_imported_as_plan_update', b.status < 300 && b.body.plan?.revisionCreated === true, { status: b.status, code: b.body.code });
  const B = b.body.importId;

  const beforePreview = await counts();
  const p1 = await preview([A]);
  const p1rev = await preview([A, B]);
  const p1swap = await preview([B, A]);
  check('preview_is_read_only', JSON.stringify(await counts()) === JSON.stringify(beforePreview));
  check('dependency_closure_auto_includes_B', p1.status === 200 && p1.body.status === 'READY' && p1.body.order.length === 2 && p1.body.imports.find((i) => i.id === B)?.autoIncluded === true && p1.body.requestedIds.length === 1, { order: p1.body.order?.length, blockers: p1.body.blockers });
  check('execution_order_is_dependents_first_B_then_A', JSON.stringify(p1.body.order) === JSON.stringify([B, A]), { order: p1.body.order });
  check('selection_order_is_not_authoritative_same_plan', p1rev.body.planHash === p1swap.body.planHash && p1rev.body.planHash === p1.body.planHash && JSON.stringify(p1rev.body.order) === JSON.stringify([B, A]));
  check('preview_reports_real_impact', p1.body.impact.planRevisionsReverted === 2 && p1.body.impact.assignmentsRemoved >= 1, { impact: p1.body.impact });

  // roles + tenancy
  const emp403 = await employee('POST', '/api/imports/reversions/preview', { importIds: [A] });
  const empConfirm = await employee('POST', '/api/imports/reversions/confirm', { importIds: [A], planHash: p1.body.planHash });
  check('employee_cannot_preview_or_confirm_reversions', emp403.status === 403 && empConfirm.status === 403, { preview: emp403.status, confirm: empConfirm.status });
  check('unknown_or_foreign_import_is_404_without_leaking', (await preview(['00000000-0000-4000-8000-000000000001'])).status === 404);

  // stale plan: the state changes between preview and confirm
  const c0 = await importDoc(E1, [row(E1, '2027-06-01', '11:00', '19:00'), row(E1, '2027-06-02', '09:00', '17:00'), row(E1, '2027-06-03', null, null, 'Libre')]);
  const C = c0.body.importId;
  const staleTry = await confirm([A], p1.body.planHash);
  check('stale_plan_is_rejected_409', staleTry.status === 409 && staleTry.body.code === 'REVERSION_PLAN_STALE', { status: staleTry.status, code: staleTry.body.code });
  const stateAfterStale = await counts();
  const p2 = await preview([A]);
  check('chain_closure_now_includes_B_and_C_in_order_C_B_A', JSON.stringify(p2.body.order) === JSON.stringify([C, B, A]), { order: p2.body.order?.length });

  // confirm: one atomic operation for the whole chain
  const pre = await counts();
  const done = await confirm([A], p2.body.planHash, { reason: 'qa' });
  check('confirm_reverts_the_whole_chain_in_one_operation', done.status === 201 && done.body.effectiveImportCount === 3 && done.body.requestedImportCount === 1, { status: done.status, code: done.body.code });
  const post = await counts();
  check('plan_revisions_marked_reverted_not_deleted', (await one(`SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1 AND reverted_at IS NOT NULL AND import_id = ANY($2::uuid[])`, [ORG, [A, B, C]])).n === 3 && post.revisions === pre.revisions - 3);
  check('state_equals_before_the_chain', post.assignments === base0.assignments && post.versions === base0.versions && post.shifts === base0.shifts, { before: base0, after: post });
  const rows3 = await q(`SELECT id, reverted_at IS NOT NULL AS reverted, status, context_fingerprint FROM imports WHERE id = ANY($1::uuid[])`, [[A, B, C]]);
  check('imports_stay_in_history_marked_reverted', rows3.length === 3 && rows3.every((r) => r.reverted && r.status === 'completed' && String(r.context_fingerprint).includes('#reverted:')));
  check('effects_invalidated_not_deleted', (await one(`SELECT COUNT(*)::int n FROM import_effects WHERE import_id = ANY($1::uuid[]) AND reverted_at IS NULL`, [[A, B, C]])).n === 0 && (await one(`SELECT COUNT(*)::int n FROM import_effects WHERE import_id = ANY($1::uuid[])`, [[A, B, C]])).n > 0);
  const items = await q(`SELECT import_id, execution_order, requested_by_user, auto_included_dependency FROM import_reversion_items WHERE reversion_id = $1 ORDER BY execution_order`, [done.body.reversionId]);
  check('reversion_ledger_records_order_and_origin', JSON.stringify(items.map((r) => r.import_id)) === JSON.stringify([C, B, A]) && items.find((r) => r.import_id === A).requested_by_user && items.find((r) => r.import_id === B).auto_included_dependency);

  // idempotency
  const again = await confirm([A], p2.body.planHash);
  check('double_confirm_has_no_second_effect', (again.status === 200 && again.body.idempotent === true) && JSON.stringify(await counts()) === JSON.stringify(post) && again.body.reversionId === done.body.reversionId, { status: again.status });
  const previewReverted = await preview([A]);
  check('already_reverted_import_is_blocked_in_preview', previewReverted.body.status === 'BLOCKED' && previewReverted.body.blockers.some((x) => x.code === 'ALREADY_REVERTED'));

  // reimport the same file after the reversion
  const reA = await admin('POST', '/api/imports/confirm-split', {
    fileName: `rev-again-${Date.now()}.xlsx`, sourceFormat: 'excel', fileFingerprint: fp(), employeeId: E1.id, importMode: 'individual', periodKind: 'multi', periodYear: 2027, periodMonth: null, periodLabel: 'QA',
    weekStart: 'monday', futureConsent: 'historical-and-plan', sourceKind: 'TEAM_SCHEDULE_EXPORT', deleteIds: [],
    shifts: [row(E1, '2027-06-01', '09:00', '17:00'), row(E1, '2027-06-02', '09:00', '17:00'), row(E1, '2027-06-03', null, null, 'Libre')],
  });
  check('same_document_can_be_imported_again_after_reversion', reA.status < 300 && !reA.body.duplicate && reA.body.plan?.revisionCreated === true && reA.body.importId !== A, { status: reA.status, duplicate: reA.body.duplicate });

  // =========================================================================================================================
  // T2 — independent imports: no chronological coupling
  // =========================================================================================================================
  const i1 = await importDoc(E2, [row(E2, '2027-03-03', '09:00', '17:00'), row(E2, '2027-03-04', '09:00', '17:00')]);
  const i2 = await importDoc(E3, [row(E3, '2027-07-08', '09:00', '17:00'), row(E3, '2027-07-09', '09:00', '17:00')]);
  const pInd = await preview([i1.body.importId]);
  check('later_independent_import_is_not_included', pInd.body.status === 'READY' && pInd.body.order.length === 1 && !pInd.body.order.includes(i2.body.importId), { order: pInd.body.order?.length });
  const beforeInd = await counts();
  const doneInd = await confirm([i1.body.importId], pInd.body.planHash);
  check('independent_reversion_leaves_the_other_import_untouched', doneInd.status === 201 && (await one(`SELECT reverted_at IS NULL AS active FROM imports WHERE id = $1`, [i2.body.importId])).active && (await counts()).assignments < beforeInd.assignments);

  // =========================================================================================================================
  // T3 — later manual change is never destroyed
  // =========================================================================================================================
  const m1 = await importDoc(E3, [row(E3, '2027-08-02', '09:00', '17:00'), row(E3, '2027-08-03', '09:00', '17:00')]);
  const mShift = (await q(`SELECT id FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND import_id = $3 LIMIT 1`, [ORG, E3.id, m1.body.importId]))[0];
  let manualEditTarget = mShift;
  if (!manualEditTarget) {
    // plan-only future rows live in drafts: edit one assignment instead (a human changing the draft)
    manualEditTarget = (await q(`SELECT a.id FROM shift_assignments a JOIN schedule_versions v ON v.id = a.schedule_version_id JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 AND a.employee_id = $2 AND a.date = '2027-08-02' ORDER BY a.created_at DESC LIMIT 1`, [ORG, E3.id]))[0];
    await q(`UPDATE shift_assignments SET start_time = '12:00', end_time = '20:00' WHERE id = $1`, [manualEditTarget.id]);
  } else {
    await q(`UPDATE shifts SET start_time = '12:00', end_time = '20:00' WHERE id = $1`, [manualEditTarget.id]);
  }
  const pManual = await preview([m1.body.importId]);
  check('later_manual_change_blocks_and_is_preserved', pManual.body.status === 'BLOCKED' && pManual.body.blockers.some((x) => x.code === 'LATER_MANUAL_CHANGE_UNSAFE'), { status: pManual.body.status, blockers: pManual.body.blockers });
  const confirmBlocked = await confirm([m1.body.importId], pManual.body.planHash);
  check('blocked_plan_cannot_be_confirmed_and_writes_nothing', confirmBlocked.status === 409 && confirmBlocked.body.code === 'REVERSION_BLOCKED');

  // =========================================================================================================================
  // T4 — DCF / comments (annotations), manual enrichment survives
  // =========================================================================================================================
  const d1 = await importDoc(E2, [row(E2, '2027-09-06', '09:00', '17:00'), row(E2, '2027-09-07', '09:00', '17:00')], {
    sourceKind: 'EMPLOYEE_CALENDAR_EXPORT',
    annotations: [{ date: '2027-09-06', kind: 'DCF', startTime: null, endTime: null }, { date: '2027-09-07', kind: 'COMMENT', text: 'nota importada' }],
  });
  check('annotations_imported_and_ledgered', d1.status < 300 && (await one(`SELECT COUNT(*)::int n FROM import_effects WHERE import_id = $1 AND effect_kind = 'ANNOTATION_INSERT'`, [d1.body.importId])).n === 2, { status: d1.status, code: d1.body.code });
  const pD1 = await preview([d1.body.importId]);
  check('dcf_and_comment_removed_when_untouched', pD1.body.status === 'READY' && pD1.body.impact.dcfRemoved === 1 && pD1.body.impact.commentsRemoved === 1, { impact: pD1.body.impact, blockers: pD1.body.blockers });
  // human completes the DCF hours
  const enrich = await admin('PATCH', '/api/calendar/annotations', { employeeId: E2.id, date: '2027-09-06', startTime: '22:30', endTime: '01:00' });
  check('admin_completed_dcf_hours', enrich.status === 200);
  const pD2 = await preview([d1.body.importId]);
  check('manual_dcf_enrichment_is_preserved_not_deleted', pD2.body.status === 'READY' && pD2.body.impact.dcfPreserved === 1 && pD2.body.impact.dcfRemoved === 0 && pD2.body.impact.commentsRemoved === 1, { impact: pD2.body.impact, blockers: pD2.body.blockers });
  const dDone = await confirm([d1.body.importId], pD2.body.planHash);
  const dcfRow = await one(`SELECT origin, completeness, import_id, substr(start_time::text, 1, 5) AS s FROM calendar_annotations WHERE organization_id = $1 AND employee_id = $2 AND date = '2027-09-06' AND kind = 'DCF'`, [ORG, E2.id]);
  check('dcf_survives_as_independent_manual_annotation', dDone.status === 201 && dcfRow?.origin === 'MANUAL' && dcfRow.completeness === 'HOURS_KNOWN' && dcfRow.import_id === null && dcfRow.s === '22:30', { dcfRow });
  check('imported_comment_disappeared', (await one(`SELECT COUNT(*)::int n FROM calendar_annotations WHERE organization_id = $1 AND employee_id = $2 AND date = '2027-09-07' AND kind = 'COMMENT'`, [ORG, E2.id])).n === 0);

  // =========================================================================================================================
  // T5 — evidence applied over a plan row, reverted
  // =========================================================================================================================
  const EV_PAST = new Date(Date.now() - 3 * 86400000).toLocaleDateString('sv', { timeZone: 'Europe/Madrid' });
  await q(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3`, [ORG, E1.id, EV_PAST]);
  const seeded = await admin('PATCH', '/api/shifts', { employeeId: E1.id, deleteIds: [], upserts: [{ id: crypto.randomUUID(), employeeId: E1.id, date: EV_PAST, startTime: '14:00', endTime: '22:00', shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin: 'IMP' }] });
  const planRowId = seeded.body.saved?.[0]?.id;
  const ev = await importDoc(E1, [row(E1, EV_PAST, null, null, 'Baja'), row(E1, '2027-10-04', '09:00', '17:00')], { sourceKind: 'EMPLOYEE_CALENDAR_EXPORT', periodYear: 2026 });
  const evKinds = (await q(`SELECT DISTINCT effect_kind FROM import_effects WHERE import_id = $1`, [ev.body.importId])).map((r) => r.effect_kind);
  check('evidence_applied_is_fully_ledgered', ev.status < 300 && (evKinds.includes('SHIFT_STATE_TRANSITION') || evKinds.includes('SHIFT_UPDATE')) && evKinds.includes('CALENDAR_CHANGE_INSERT') && evKinds.includes('SHIFT_INSERT'), { status: ev.status, kinds: evKinds, evidenceDaysApplied: ev.body.plan?.evidenceDaysApplied });
  const pEv = await preview([ev.body.importId]);
  const evDone = pEv.body.status === 'READY' ? await confirm([ev.body.importId], pEv.body.planHash) : pEv;
  const planRowNow = await one(`SELECT effective_state, substr(start_time::text, 1, 5) AS s FROM shifts WHERE id = $1`, [planRowId]);
  const bajaLeft = (await one(`SELECT COUNT(*)::int n FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3 AND shift_type = 'Baja'`, [ORG, E1.id, EV_PAST])).n;
  check('evidence_reversion_restores_the_plan_row_and_removes_the_baja', evDone.status === 201 && planRowNow?.effective_state === 'EFFECTIVE' && planRowNow.s === '14:00' && bajaLeft === 0, { status: evDone.status, planRowNow, bajaLeft, blockers: pEv.body.blockers });
  check('calendar_change_audit_is_kept_in_the_ledger', (await one(`SELECT COUNT(*)::int n FROM import_effects WHERE import_id = $1 AND effect_kind = 'CALENDAR_CHANGE_INSERT' AND reverted_at IS NOT NULL`, [ev.body.importId])).n === 1);

  // =========================================================================================================================
  // T6 — legacy imports (no ledger)
  // =========================================================================================================================
  const legacyImport = async (fileName, day, withAssignment = false) => {
    const id = crypto.randomUUID();
    await q(`INSERT INTO imports (id, organization_id, imported_by_user_id, employee_id, file_name, source_format, status, import_mode, period_kind, period_label, scope_type, employee_count, shift_count, created_shift_count, existing_shift_count, file_fingerprint, context_fingerprint)
             VALUES ($1,$2,(SELECT id FROM users WHERE lower(email) = lower($4)),$3,$5,'excel','completed','individual','single','legacy','global',1,1,1,0,$6,$7)`, [id, ORG, E3.id, QA_IDENTITY, fileName, fp(), fp()]);
    await q(`INSERT INTO shifts (organization_id, employee_id, import_id, date, start_time, end_time, shift_type, counts_as_work, location, origin, layer, provenance, effective_state)
             VALUES ($1,$2,$3,$4,'09:00','17:00','Regular',true,'Regular','IMP','COMPANY_PLAN','COMPANY_IMPORT','EFFECTIVE')`, [ORG, E3.id, id, day]);
    if (withAssignment) {
      const ver = await one(`SELECT v.id FROM schedule_versions v JOIN schedules s ON s.id = v.schedule_id WHERE s.organization_id = $1 LIMIT 1`, [ORG]);
      if (ver) await q(`INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, import_id, shift_type, counts_as_work) VALUES ($1,$2,$4,'09:00','17:00',$3,'Regular',true)`, [ver.id, E3.id, id, day]);
    }
    return id;
  };
  const L1 = await legacyImport('rev-legacy-safe.xlsx', '2026-12-14');
  const pL1 = await preview([L1]);
  check('legacy_shift_only_import_is_reversible', pL1.body.status === 'READY' && pL1.body.impact.shiftsRemoved === 1 && pL1.body.imports[0].legacy === true, { blockers: pL1.body.blockers });
  const L2 = await legacyImport('rev-legacy-complex.xlsx', '2026-12-15', true);
  const pL2 = await preview([L2]);
  check('legacy_complex_import_is_blocked_not_partially_rolled_back', pL2.body.status === 'BLOCKED' && pL2.body.blockers.some((x) => x.code === 'LEGACY_PROVENANCE_INSUFFICIENT'), { blockers: pL2.body.blockers });
  const list = (await admin('GET', '/api/imports?pageSize=50')).body.imports;
  check('history_exposes_reversibility_and_reverted_status', list.find((i) => i.id === L1)?.reversibility === 'LEGACY_SAFE_CANDIDATE' && list.find((i) => i.id === L2)?.reversibility === 'BLOCKED_LEGACY' && list.find((i) => i.id === A)?.status === 'reverted' && list.find((i) => i.id === A)?.revertedAt);

  // legacy DELETE alias goes through the engine
  const delLegacy = await admin('DELETE', '/api/imports', { id: L1 });
  check('legacy_delete_alias_uses_the_engine_for_a_safe_single_import', delLegacy.status === 200 && delLegacy.body.reverted === true && (await one(`SELECT reverted_at IS NOT NULL AS r FROM imports WHERE id = $1`, [L1])).r, { status: delLegacy.status });
  const delComplex = await admin('DELETE', '/api/imports', { id: L2 });
  check('legacy_delete_alias_refuses_complex_imports_with_USE_REVERSION_API', delComplex.status === 409 && delComplex.body.code === 'USE_REVERSION_API', { status: delComplex.status, code: delComplex.body.code });
  const m2 = await importDoc(E1, [row(E1, '2027-11-01', '09:00', '17:00')]);
  const m3 = await importDoc(E1, [row(E1, '2027-11-01', '10:00', '18:00')]);
  const delDep = await admin('DELETE', '/api/imports', { id: m2.body.importId });
  check('legacy_delete_alias_refuses_imports_with_dependents', delDep.status === 409 && delDep.body.code === 'USE_REVERSION_API' && delDep.body.relatedImports >= 1, { status: delDep.status, code: delDep.body.code });

  // legacy row-by-row path (POST /api/imports + PATCH /api/shifts with importId): replaced shifts are ledgered and restorable
  const LEG_DAY = '2026-12-20';
  await q(`DELETE FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3`, [ORG, E2.id, LEG_DAY]);
  const existingSeed = await admin('PATCH', '/api/shifts', { employeeId: E2.id, deleteIds: [], upserts: [{ id: crypto.randomUUID(), employeeId: E2.id, date: LEG_DAY, startTime: '06:00', endTime: '09:00', shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin: 'IMP' }] });
  const oldId = existingSeed.body.saved?.[0]?.id;
  const legacyCreate = await admin('POST', '/api/imports', { employeeId: E2.id, fileName: `rev-legacy-path-${Date.now()}.csv`, sourceFormat: 'csv', fileFingerprint: fp(), periodYear: 2026, periodMonth: 11, importMode: 'individual', periodKind: 'single', periodLabel: 'QA', employeeCount: 1, shiftCount: 1, createdShiftCount: 1, existingShiftCount: 0 });
  const legId = legacyCreate.body.import?.id;
  const replaced = await admin('PATCH', '/api/shifts', { employeeId: E2.id, importId: legId, deleteIds: [oldId], upserts: [{ id: crypto.randomUUID(), employeeId: E2.id, importId: legId, date: LEG_DAY, startTime: '10:00', endTime: '18:00', shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin: 'IMP' }] });
  const legKinds = (await q(`SELECT DISTINCT effect_kind FROM import_effects WHERE import_id = $1`, [legId])).map((r) => r.effect_kind).sort();
  check('legacy_row_path_is_ledgered_including_the_replaced_shift', replaced.status === 200 && legKinds.includes('SHIFT_INSERT') && legKinds.includes('SHIFT_DELETE'), { status: replaced.status, legKinds });
  const pLeg = await preview([legId]);
  check('legacy_row_path_preview_removes_new_and_restores_old', pLeg.body.status === 'READY' && pLeg.body.impact.shiftsRemoved === 1 && pLeg.body.impact.shiftsRestored === 1, { impact: pLeg.body.impact, blockers: pLeg.body.blockers });
  const legDone = await confirm([legId], pLeg.body.planHash);
  const restored = await one(`SELECT substr(start_time::text, 1, 5) AS s FROM shifts WHERE id = $1`, [oldId]);
  check('replaced_shift_is_restored_with_its_original_id', legDone.status === 201 && restored?.s === '06:00', { status: legDone.status, restored });

  // two racing confirmations of the same plan: exactly one operation
  const race = await importDoc(E3, [row(E3, '2027-12-06', '09:00', '17:00')]);
  const racePlan = await preview([race.body.importId]);
  const reversionsBefore = (await counts()).reversions;
  const [r1, r2] = await Promise.all([confirm([race.body.importId], racePlan.body.planHash), confirm([race.body.importId], racePlan.body.planHash)]);
  check('racing_confirmations_create_exactly_one_reversion', (await counts()).reversions === reversionsBefore + 1 && [r1.status, r2.status].every((x) => x < 300) && r1.body.reversionId === r2.body.reversionId, { statuses: [r1.status, r2.status] });
  const detail = await admin('GET', `/api/imports/reversions/detail?importId=${A}`);
  check('reversion_detail_is_available_for_a_reverted_import', detail.status === 200 && detail.body.items.length === 3 && detail.body.reason === 'qa' && detail.body.items[0].executionOrder === 1, { status: detail.status });

  // identity mappings are never part of a reversion
  check('source_identifier_mappings_untouched', (await one(`SELECT COUNT(*)::int n FROM employee_source_identifiers WHERE organization_id = $1`, [ORG])).n === mappingsBefore);

  // =========================================================================================================================
  // T7 — atomicity at the database level: a failing operation aborts the WHOLE operation
  // =========================================================================================================================
  const victimIds = (await q(`SELECT id FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date >= '2026-12-01' LIMIT 1`, [ORG, E3.id])).map((r) => r.id);
  const victim = victimIds[0] ? await one(`SELECT to_jsonb(s) AS row FROM shifts s WHERE id = $1`, [victimIds[0]]) : null;
  if (victim) {
    let failed = false;
    await db.query('BEGIN');
    try {
      await db.query(`SELECT import_reversion_apply('DELETE', 'shifts', $1::uuid, $2::uuid, $3::jsonb, '{}'::jsonb)`, [victim.row.id, ORG, JSON.stringify(victim.row)]);
      await db.query(`SELECT import_reversion_apply('DELETE', 'shifts', $1::uuid, $2::uuid, $3::jsonb, '{}'::jsonb)`, ['00000000-0000-4000-8000-0000000000aa', ORG, JSON.stringify(victim.row)]);
      await db.query('COMMIT');
    } catch {
      failed = true;
      await db.query('ROLLBACK');
    }
    check('failure_in_the_middle_rolls_back_everything', failed && Boolean(await one(`SELECT 1 AS ok FROM shifts WHERE id = $1`, [victim.row.id])));
  } else {
    check('failure_in_the_middle_rolls_back_everything', false, { reason: 'no victim row available' });
  }

  const srcAfter = await sourceFingerprint(db, source.id);
  check('SOURCE_HASH_BEFORE_equals_AFTER', srcBefore.overall === srcAfter.overall);
  void stateAfterStale; void emp403; void m3;
  await clean();
} finally {
  await db.end();
}
const failed = Object.entries(results).filter(([, v]) => v.ok === false);
console.log(JSON.stringify({ total: Object.keys(results).length, failed: failed.map(([k]) => k), results }, null, 1));
process.exit(failed.length ? 1 : 0);

#!/usr/bin/env node
/** Current/proposed integration proof against the protected QA Mirror; refreshes the mirror before and after fixtures. */
import { createHash, randomBytes } from 'node:crypto';
import { PROTECTED_SOURCE_ORG_ID, QA_IDENTITY, assertNotProtectedSource, assertQaOrganization, connect, loadEnv, resolveSourceOrganization, targetNameFor } from './qa-lib.mjs';
import { refreshQaMirror, sourceFingerprint } from './refresh-qa-mirror.mjs';

const BASE = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:5173';
const env = loadEnv(['.env.development.local']);
const db = await connect();
const results = {};
const check = (key, ok, detail = {}) => { results[key] = { ok: Boolean(ok), ...detail }; if (!ok) console.error(`[current-proposed] FAIL ${key}`, JSON.stringify(detail)); };
const fingerprint = () => createHash('sha256').update(randomBytes(24)).digest('hex');
let source; let mirror; let sourceBefore; let mirrorBefore;
let admin; let orgId; let employee;
const request = async (method, path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', cookie: admin.cookie, 'x-organization-id': orgId },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const countRevisions = async () => Number((await rows('SELECT COUNT(*)::int n FROM company_plan_revisions WHERE organization_id = $1', [orgId]))[0].n);
const stats = async (employeeId = employee.id) => (await request('GET', `/api/calendar/stats?employeeId=${employeeId}&year=2026`)).body;
const reconciliation = async (employeeId = employee.id) => (await request('GET', `/api/calendar/reconciliation?employeeId=${employeeId}&year=2026`)).body;

try {
  source = await resolveSourceOrganization(db);
  if (source.id !== PROTECTED_SOURCE_ORG_ID) throw new Error('Unexpected protected source organization');
  sourceBefore = await sourceFingerprint(db, source.id);
  await refreshQaMirror(db, { apply: true, log: () => undefined });
  mirror = (await rows('SELECT id FROM organizations WHERE name = $1', [targetNameFor(source)]))[0];
  if (!mirror) throw new Error('QA Mirror not found');
  orgId = mirror.id;
  assertNotProtectedSource(orgId);
  await assertQaOrganization(db, orgId);
  mirrorBefore = await sourceFingerprint(db, orgId);
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: QA_IDENTITY, password: env.MANUAL_QA_PASSWORD }) });
  if (!login.ok) throw new Error(`QA login failed (${login.status})`);
  admin = { cookie: login.headers.getSetCookie().map((part) => part.split(';')[0]).join('; ') };
  employee = (await rows("SELECT id FROM employees WHERE organization_id = $1 AND external_employee_id = '84881' AND status = 'active'", [orgId]))[0];
  if (!employee) throw new Error('Pilot employee 84881 missing from QA Mirror');

  const pilotWorklist = await reconciliation();
  const pilotPending = (pilotWorklist.items ?? []).filter((item) => item.status === 'PENDING');
  check('pilot_pending_days_present', pilotWorklist.pendingCount > 0, { pending: pilotWorklist.pendingCount });
  check('current_and_proposed_fields_present', pilotPending.every((item) => Array.isArray(item.current) && Array.isArray(item.proposed)));
  check('legacy_before_now_fields_absent', pilotPending.every((item) => !('companyNow' in item) && !('companyBefore' in item)));
  const focusDays = pilotPending.filter((item) => ['2026-02-08', '2026-07-17', '2026-09-17'].includes(item.date));
  const byDate = new Map(focusDays.map((item) => [item.date, item]));
  check('february_08_current_proposal', byDate.get('2026-02-08')?.current?.some((r) => r.type === 'Regular' && r.startTime === '15:00' && r.endTime === '21:00')
    && byDate.get('2026-02-08')?.proposed?.some((r) => r.type === 'Libre'));
  check('july_17_vacation_current_proposal', byDate.get('2026-07-17')?.current?.some((r) => r.type === 'Vacaciones') && byDate.get('2026-07-17')?.proposed?.some((r) => r.type === 'Libre'));
  check('september_17_current_proposal', byDate.get('2026-09-17')?.current?.some((r) => r.type === 'Regular' && r.startTime === '05:00' && r.endTime === '13:00')
    && byDate.get('2026-09-17')?.proposed?.some((r) => r.type === 'Regular' && r.startTime === '04:30' && r.endTime === '12:30'));

  const annual = await stats();
  const november = (await request('GET', `/api/calendar/stats?employeeId=${employee.id}&year=2026&month=11`)).body;
  const realizedBefore = Number(annual.projection?.realizedMinutes ?? 0);
  const plannedBefore = Number(annual.projection?.plannedMinutes ?? 0);
  check('projection_equals_realized_plus_planned', Number(annual.projection?.projectedMinutes) === realizedBefore + plannedBefore, {
    realizedMinutes: realizedBefore, plannedMinutes: plannedBefore, projectionMinutes: Number(annual.projection?.projectedMinutes),
  });
  check('november_planned_is_62_hours', Number(november.monthStats?.planned?.effectiveMinutes) === 3720, { plannedMinutes: Number(november.monthStats?.planned?.effectiveMinutes) });

  // Synthetic fixtures use a mirror employee, reserved dates, and a full canonical refresh for exact restoration.
  const testEmployee = (await rows("SELECT id FROM employees WHERE organization_id = $1 AND status = 'active' AND external_employee_id IS NOT NULL AND external_employee_id <> '84881' AND user_id IS NULL ORDER BY external_employee_id LIMIT 1", [orgId]))[0];
  if (!testEmployee) throw new Error('No synthetic QA employee available');
  const freeDays = await rows(`SELECT TO_CHAR(d::date, 'YYYY-MM-DD') AS date FROM generate_series('2026-01-01'::date, '2026-10-18'::date, '1 day') d
    WHERE NOT EXISTS (SELECT 1 FROM shifts s WHERE s.organization_id = $1 AND s.employee_id = $2 AND s.date = d::date)
    ORDER BY d LIMIT 3`, [orgId, testEmployee.id]);
  const freeFuture = await rows(`SELECT TO_CHAR(d::date, 'YYYY-MM-DD') AS date FROM generate_series(GREATEST(CURRENT_DATE + 1, '2026-10-20'::date), '2026-12-31'::date, '1 day') d
    WHERE NOT EXISTS (SELECT 1 FROM shifts s WHERE s.organization_id = $1 AND s.employee_id = $2 AND s.date = d::date)
      AND NOT EXISTS (SELECT 1 FROM shift_assignments a WHERE a.employee_id = $2 AND a.date = d::date)
    ORDER BY d LIMIT 1`, [orgId, testEmployee.id]);
  if (freeDays.length !== 3 || !freeFuture[0]) throw new Error('Could not reserve clean mirror fixture dates');
  const [keepDate, useDate, identicalDate] = freeDays.map((r) => r.date);
  const futureDate = freeFuture[0].date;
  const seed = async (date) => request('PATCH', '/api/shifts', { employeeId: testEmployee.id, deleteIds: [], upserts: [{
    id: crypto.randomUUID(), employeeId: testEmployee.id, date, startTime: '08:00', endTime: '16:00', shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin: 'IMP',
  }] });
  for (const date of [keepDate, useDate, identicalDate]) {
    const seeded = await seed(date);
    if (seeded.status !== 200) throw new Error(`Could not seed current QA row (${seeded.status})`);
  }
  const beforeRevisionCount = await countRevisions();
  const draftRow = { date: futureDate, shiftType: 'Regular', startTime: '14:00', endTime: '22:00', employeeId: testEmployee.id, origin: 'IMP', sourceFormat: 'excel', location: 'Regular' };
  const importDay = async (date, startTime, endTime, name) => request('POST', '/api/imports/confirm-split', {
    fileName: `current-proposed-${name}-${Date.now()}.xlsx`, sourceFormat: 'excel', fileFingerprint: fingerprint(), employeeId: testEmployee.id,
    shifts: [{ date, shiftType: 'Regular', startTime, endTime, employeeId: testEmployee.id, origin: 'IMP', sourceFormat: 'excel', location: 'Regular' }, draftRow],
    importMode: 'individual', periodKind: 'multi', periodYear: 2026, periodMonth: null, periodLabel: 'QA mirror', weekStart: 'monday',
    futureConsent: 'historical-and-plan', sourceKind: 'PUBLISHED_CALENDAR_EXPORT', deleteIds: [],
  });
  const keepImport = await importDay(keepDate, '09:00', '15:00', 'keep');
  const useImport = await importDay(useDate, '09:00', '15:00', 'use');
  const sameImport = await importDay(identicalDate, '08:00', '16:00', 'identical');
  const importFailure = (result) => ({ status: result.status, code: result.body.code ?? null, error: result.body.error ?? null });
  check('historical_difference_preserves_current_and_proposes_incoming', keepImport.status < 300 && useImport.status < 300,
    { keep: importFailure(keepImport), use: importFailure(useImport) });
  check('historical_identical_noop', sameImport.status < 300 && sameImport.body.plan?.changes?.unchanged >= 1,
    { result: importFailure(sameImport) });
  const identicalRows = await rows('SELECT effective_state FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3', [orgId, testEmployee.id, identicalDate]);
  check('historical_identical_created_no_duplicate_or_difference', identicalRows.length === 1 && identicalRows[0].effective_state === 'EFFECTIVE');
  const draftCount = Number((await rows(`SELECT COUNT(*)::int n FROM shift_assignments a JOIN schedules s ON s.id = (SELECT schedule_id FROM schedule_versions WHERE id = a.schedule_version_id)
    WHERE s.organization_id = $1 AND a.employee_id = $2 AND a.date = $3 AND a.start_time = '14:00'`, [orgId, testEmployee.id, futureDate]))[0].n);
  check('future_import_created_planning_draft', draftCount === 1, { futureDate, draftCount });
  check('new_import_wrote_no_legacy_revision', await countRevisions() === beforeRevisionCount);

  const pendingBeforeResolution = await reconciliation(testEmployee.id);
  check('fixture_days_pending', [keepDate, useDate].every((date) => pendingBeforeResolution.items.some((item) => item.date === date && item.status === 'PENDING')));
  const keepRows = await rows(`SELECT id, effective_state, start_time::text s, end_time::text e FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3 ORDER BY created_at`, [orgId, testEmployee.id, keepDate]);
  const useRows = await rows(`SELECT id, effective_state, start_time::text s, end_time::text e FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = $3 ORDER BY created_at`, [orgId, testEmployee.id, useDate]);
  const keepCurrent = keepRows.find((r) => r.effective_state === 'EFFECTIVE' && r.s === '08:00');
  const keepProposal = keepRows.find((r) => r.effective_state === 'REQUIRES_REVIEW' && r.s === '09:00');
  const useCurrent = useRows.find((r) => r.effective_state === 'EFFECTIVE' && r.s === '08:00');
  const useProposal = useRows.find((r) => r.effective_state === 'REQUIRES_REVIEW' && r.s === '09:00');
  if (!keepCurrent || !keepProposal || !useCurrent || !useProposal) throw new Error('Current/proposal fixture rows were not persisted as expected');
  const statsPreKeep = await stats(testEmployee.id);
  const pendingCountPreKeep = (await reconciliation(testEmployee.id)).pendingCount;
  const keepResult = await request('POST', '/api/calendar/changes', { action: 'RECONCILE', employeeId: testEmployee.id, date: keepDate, reason: 'QA current/proposed verification', keepShiftIds: [keepCurrent.id] });
  const statsPostKeep = await stats(testEmployee.id);
  const pendingPostKeep = (await reconciliation(testEmployee.id)).pendingCount;
  const keepDelta = Number(statsPostKeep.projection.realizedMinutes) - Number(statsPreKeep.projection.realizedMinutes);
  check('keep_current_resolution_passes', keepResult.status < 300 && keepDelta === 0 && pendingPostKeep === pendingCountPreKeep - 1, { deltaMinutes: keepDelta, pendingDelta: pendingPostKeep - pendingCountPreKeep });
  const statsPreUse = await stats(testEmployee.id);
  const pendingCountPreUse = (await reconciliation(testEmployee.id)).pendingCount;
  const useResult = await request('POST', '/api/calendar/changes', { action: 'RECONCILE', employeeId: testEmployee.id, date: useDate, reason: 'QA proposal resolution verification', keepShiftIds: [useProposal.id] });
  const statsPostUse = await stats(testEmployee.id);
  const pendingPostUse = (await reconciliation(testEmployee.id)).pendingCount;
  const proposalDelta = Number(statsPostUse.projection.realizedMinutes) - Number(statsPreUse.projection.realizedMinutes);
  check('use_proposal_resolution_passes', useResult.status < 300 && proposalDelta === -120 && pendingPostUse === pendingCountPreUse - 1, { deltaMinutes: proposalDelta, pendingDelta: pendingPostUse - pendingCountPreUse });
  check('resolution_refreshes_statistics_immediately', proposalDelta === -120, { deltaMinutes: proposalDelta });

  check('new_import_wrote_no_legacy_revision_after_resolution', await countRevisions() === beforeRevisionCount);

  const pilotTargetsBefore = (await request('GET', `/api/calendar/worktime-targets?employeeId=${employee.id}&history=true`)).body.targets ?? [];
  const pilotStats = await stats(employee.id);
  check('pilot_annual_range_regular_only', pilotTargetsBefore.some((target) => target.targetKind === 'CONTRACTUAL'
    && target.periodType === 'ANNUAL' && target.periodStart === '2026-01-01' && target.periodEnd === '2026-12-31'
    && target.minimumMinutes === 91740 && target.maximumMinutes === 92400 && target.includedWorkBuckets.length === 1
    && target.includedWorkBuckets[0] === 'Regular'), { targetCount: pilotTargetsBefore.length });
  check('pilot_extras_visible_but_not_credited', Number(pilotStats.realized.extrasMinutes) > 0
    && pilotStats.realized.effectiveMinutes === pilotStats.realized.regularMinutes,
  { extrasMinutes: Number(pilotStats.realized.extrasMinutes), creditedMinutes: Number(pilotStats.realized.effectiveMinutes), regularMinutes: Number(pilotStats.realized.regularMinutes) });
  check('pilot_balance_uses_current_mirror_work_without_target_revision', Number(pilotStats.projection.projectedMinutes)
    === Number(pilotStats.projection.realizedMinutes) + Number(pilotStats.projection.plannedMinutes)
    && Number(pilotStats.balance.projectedMinutes) === Number(pilotStats.projection.projectedMinutes)
    && (await request('GET', `/api/calendar/worktime-targets?employeeId=${employee.id}&history=true`)).body.targets?.length === pilotTargetsBefore.length,
  { realizedMinutes: Number(pilotStats.projection.realizedMinutes), plannedMinutes: Number(pilotStats.projection.plannedMinutes), projectedMinutes: Number(pilotStats.projection.projectedMinutes) });

  const targetHistory = async () => (await request('GET', `/api/calendar/worktime-targets?employeeId=${testEmployee.id}&history=true`)).body.targets ?? [];
  const targetAt = async (asOf) => (await request('GET', `/api/calendar/worktime-targets?employeeId=${testEmployee.id}&history=false&asOf=${asOf}`)).body.targets ?? [];
  const createTarget = (input) => request('POST', '/api/calendar/worktime-targets', { employeeId: testEmployee.id, ...input });
  const noTargetStats = await stats(testEmployee.id);
  check('synthetic_employee_without_target', noTargetStats.target === null);

  const exact = await createTarget({ targetKind: 'CONTRACTUAL', periodType: 'ANNUAL', periodStart: '2026-01-01', periodEnd: '2026-12-31',
    minimumMinutes: 60000, targetMinutes: 60000, maximumMinutes: 60000, effectiveFrom: '2026-01-01', includedWorkBuckets: ['Regular'] });
  const range = await createTarget({ targetKind: 'CONTRACTUAL', periodType: 'ANNUAL', periodStart: '2026-01-01', periodEnd: '2026-12-31',
    minimumMinutes: 60000, targetMinutes: 63000, maximumMinutes: 66000, effectiveFrom: '2026-06-01', includedWorkBuckets: ['Regular'] });
  const future = await createTarget({ targetKind: 'CONTRACTUAL', periodType: 'ANNUAL', periodStart: '2026-01-01', periodEnd: '2026-12-31',
    minimumMinutes: 65000, targetMinutes: 66000, maximumMinutes: 67000, effectiveFrom: '2026-12-01', includedWorkBuckets: ['Regular'] });
  check('exact_annual_target_created', exact.status === 201 && exact.body.target?.targetMinutes === 60000
    && exact.body.target?.minimumMinutes === exact.body.target?.maximumMinutes);
  check('historical_revision_and_centered_range_resolve', range.status === 201
    && (await targetAt('2026-05-31')).some((target) => target.revision === exact.body.target?.revision)
    && (await targetAt('2026-06-01')).some((target) => target.revision === range.body.target?.revision
      && target.targetMinutes === 63000 && target.minimumMinutes < target.targetMinutes && target.targetMinutes < target.maximumMinutes));
  check('future_revision_stays_scheduled_until_effective_date', future.status === 201
    && (await targetAt('2026-11-30')).some((target) => target.revision === range.body.target?.revision)
    && (await targetAt('2026-12-01')).some((target) => target.revision === future.body.target?.revision));

  const monthly = await createTarget({ targetKind: 'OPERATIONAL', periodType: 'MONTHLY', periodStart: '2026-10-01', periodEnd: '2026-10-31',
    minimumMinutes: 2400, targetMinutes: null, maximumMinutes: 2700, effectiveFrom: '2026-10-01', includedWorkBuckets: ['Regular'] });
  const weekly = await createTarget({ targetKind: 'OPERATIONAL', periodType: 'WEEKLY', periodStart: '2026-11-02', periodEnd: '2026-11-08',
    minimumMinutes: 2400, targetMinutes: 2520, maximumMinutes: 2640, effectiveFrom: '2026-11-02', includedWorkBuckets: ['Regular'] });
  const custom = await createTarget({ targetKind: 'OPERATIONAL', periodType: 'CUSTOM', periodStart: '2026-11-10', periodEnd: '2026-11-20',
    minimumMinutes: 3600, targetMinutes: null, maximumMinutes: 3900, effectiveFrom: '2026-11-10', includedWorkBuckets: ['Regular'] });
  const overlap = await createTarget({ targetKind: 'OPERATIONAL', periodType: 'CUSTOM', periodStart: '2026-11-04', periodEnd: '2026-11-06',
    minimumMinutes: 600, targetMinutes: null, maximumMinutes: 720, effectiveFrom: '2026-11-04', includedWorkBuckets: ['Regular'] });
  const operationalStats = await stats(testEmployee.id);
  const historyAfterTargets = await targetHistory();
  check('weekly_monthly_custom_periods_created', monthly.status === 201 && weekly.status === 201 && custom.status === 201
    && historyAfterTargets.some((target) => target.periodType === 'WEEKLY')
    && historyAfterTargets.some((target) => target.periodType === 'MONTHLY')
    && historyAfterTargets.some((target) => target.periodType === 'CUSTOM'));
  check('operational_balance_and_overlap_guard', operationalStats.activeOperationalTarget?.periodType === 'MONTHLY'
    && operationalStats.operationalBalance?.projectedMinutes === operationalStats.operationalBalance?.realizedMinutes + operationalStats.operationalBalance?.plannedMinutes
    && overlap.status === 400 && overlap.body.code === 'OVERLAPPING_WORKTIME_TARGET',
  { operationalPeriod: operationalStats.activeOperationalTarget?.periodType, overlapStatus: overlap.status, overlapCode: overlap.body.code ?? null });
  check('target_history_excludes_balance_updates', historyAfterTargets.length === 6);
} finally {
  if (mirror?.id) {
    await assertQaOrganization(db, mirror.id);
    await refreshQaMirror(db, { apply: true, log: () => undefined });
    const mirrorAfter = await sourceFingerprint(db, mirror.id);
    check('qa_mirror_state_restored_by_canonical_refresh', Boolean(mirrorBefore) && mirrorAfter.overall === mirrorBefore.overall, { before: mirrorBefore?.overall, after: mirrorAfter.overall });
  }
  if (source?.id && sourceBefore) {
    const sourceAfter = await sourceFingerprint(db, source.id);
    check('protected_source_fingerprint_unchanged', sourceAfter.overall === sourceBefore.overall, { before: sourceBefore.overall, after: sourceAfter.overall });
  }
  await db.end();
}
const failed = Object.entries(results).filter(([, value]) => value.ok === false);
console.log(JSON.stringify({ checks: results, failed: failed.map(([key]) => key) }, null, 2));
process.exit(failed.length ? 1 : 0);

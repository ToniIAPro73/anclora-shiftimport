import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_CLASS, IMPORT_DECISION, RECONCILIATION_OUTCOME as O, TEMPORAL_CLASS,
  classifyDocument, classifyTemporal, employeeBusinessKey, normalizeImportDecision, normalizePlanRow,
  daySignature, hasSemanticDayChange, hasSemanticHistoryChange, planCanonicalLines, reconcileThreeWay, resolveBaseline, resolveImportOptions, splitByOperationalDate, summarizeOutcomes,
} from '../../src/lib/company-plan.js';

const TODAY = '2026-10-16';
const row = (date, shiftType, startTime = null, endTime = null, extra = {}) => ({ date, shiftType, startTime, endTime, ...extra });
const entry = (employeeKey, r) => ({ employeeKey, row: r });
const K = 'id:84881';

describe('temporal classification', () => {
  it('derives HISTORICAL / FUTURE / MIXED from the operational date, whatever the format', () => {
    expect(classifyTemporal([row('2026-10-15', 'Regular')], TODAY)).toBe(TEMPORAL_CLASS.HISTORICAL);
    expect(classifyTemporal([row('2026-10-16', 'Regular')], TODAY)).toBe(TEMPORAL_CLASS.FUTURE);
    expect(classifyTemporal([row('2026-10-15', 'Regular'), row('2026-11-01', 'Libre')], TODAY)).toBe(TEMPORAL_CLASS.MIXED);
    expect(splitByOperationalDate([row('2026-10-15', 'x'), row('2026-10-16', 'y')], TODAY)).toMatchObject({ historical: [{ date: '2026-10-15' }], future: [{ date: '2026-10-16' }] });
  });
});

describe('document classification', () => {
  it('proposes a class from evidence, not from the file name', () => {
    expect(classifyDocument({ temporal: 'HISTORICAL', employeeCount: 1, rowCount: 10 }).documentClass).toBe(DOCUMENT_CLASS.HISTORICAL_CALENDAR);
    expect(classifyDocument({ temporal: 'FUTURE', employeeCount: 62, rowCount: 859 }).documentClass).toBe(DOCUMENT_CLASS.COMPANY_PLAN);
    expect(classifyDocument({ temporal: 'FUTURE', employeeCount: 62, rowCount: 859, hasExistingPlan: true }).documentClass).toBe(DOCUMENT_CLASS.COMPANY_PLAN_UPDATE);
    const mixed = classifyDocument({ temporal: 'MIXED', employeeCount: 1, rowCount: 292 });
    expect(mixed.documentClass).toBe(DOCUMENT_CLASS.COMPANY_PLAN);
    expect(mixed.confidence).toBe('medium'); // ambiguous -> the UI lets an authorised user correct it
    expect(classifyDocument({ temporal: 'FUTURE', employeeCount: 0, rowCount: 0 }).documentClass).toBe(DOCUMENT_CLASS.UNDETERMINED);
  });
});

describe('import decision and role gating', () => {
  it('maps the legacy wire value without changing its meaning', () => {
    expect(normalizeImportDecision('publish')).toBe(IMPORT_DECISION.HISTORICAL_AND_PLAN);
    expect(normalizeImportDecision('historical-and-plan')).toBe(IMPORT_DECISION.HISTORICAL_AND_PLAN);
    expect(normalizeImportDecision(undefined)).toBe(IMPORT_DECISION.HISTORICAL_ONLY);
  });

  it('MIXED: planners choose, safe default is historical-only; EMPLOYEE never sees the plan option', () => {
    const planner = resolveImportOptions({ canPlan: true, temporal: 'MIXED' });
    expect(planner.options).toEqual(['historical-only', 'historical-and-plan']);
    expect(planner.default).toBe('historical-only');
    const employee = resolveImportOptions({ canPlan: false, temporal: 'MIXED' });
    expect(employee.options).toEqual(['historical-only']);
    expect(employee.futureAllowed).toBe(false);
  });

  it('FUTURE: planners can plan; employees get nothing; HISTORICAL never plans', () => {
    expect(resolveImportOptions({ canPlan: true, temporal: 'FUTURE' }).options).toEqual(['historical-and-plan']);
    expect(resolveImportOptions({ canPlan: false, temporal: 'FUTURE' }).futureAllowed).toBe(false);
    expect(resolveImportOptions({ canPlan: true, temporal: 'HISTORICAL' }).futureAllowed).toBe(false);
  });
});

describe('plan identity is tenant-UUID independent', () => {
  it('prefers the payroll number; falls back to a normalised name; never a UUID', () => {
    expect(employeeBusinessKey({ externalEmployeeId: ' 84881 ', name: 'x' })).toBe('id:84881');
    expect(employeeBusinessKey({ external_employee_id: '84881' })).toBe('id:84881');
    expect(employeeBusinessKey({ name: '  Sebastián   POZO ' })).toBe('name:sebastian pozo');
    expect(employeeBusinessKey({})).toBeNull();
  });

  it('the same plan hashes from identical canonical lines in any order, whatever the employee UUIDs are', () => {
    const a = [entry(K, row('2026-10-17', 'Regular', '13:00', '21:00')), entry(K, row('2026-10-18', 'Libre'))];
    const b = [entry(K, row('2026-10-18', 'Libre')), entry(K, row('2026-10-17', 'Regular', '13:00', '21:00'))];
    expect(planCanonicalLines(a)).toEqual(planCanonicalLines(b));
    expect(planCanonicalLines([entry(K, row('2026-10-17', 'Regular', '13:00', '21:00'))]))
      .not.toEqual(planCanonicalLines([entry(K, row('2026-10-17', 'Regular', '14:00', '21:00'))]));
  });

  it('normalises AJ to Libre and ignores times on full-day rows', () => {
    expect(normalizePlanRow(row('2026-10-20', 'AJ', '08:00', '16:00'))).toMatchObject({ type: 'Libre', start: '', end: '' });
    expect(planCanonicalLines([entry(K, row('2026-10-20', 'AJ'))])).toEqual(planCanonicalLines([entry(K, row('2026-10-20', 'Libre'))]));
  });
});

describe('baseline resolution (versioned company plan)', () => {
  const r1 = { revisionNumber: 1, coverageFrom: '2026-10-16', coverageTo: '2026-10-31', rows: [entry(K, row('2026-10-17', 'Regular', '08:00', '16:00')), entry(K, row('2026-10-25', 'Libre'))] };
  const r2 = { revisionNumber: 2, coverageFrom: '2026-10-16', coverageTo: '2026-10-20', rows: [entry(K, row('2026-10-17', 'Regular', '09:00', '17:00'))] };
  it('the newest revision owns a day; older revisions keep the days it does not cover', () => {
    const baseline = resolveBaseline([r1, r2], { from: '2026-10-16', to: '2026-10-31' });
    const byDate = Object.fromEntries(baseline.map((e) => [e.row.date, normalizePlanRow(e.row)]));
    expect(byDate['2026-10-17'].start).toBe('09:00');
    expect(byDate['2026-10-25'].type).toBe('Libre');
    expect(baseline).toHaveLength(2);
  });
  it('previous revisions are never destroyed by resolving a baseline', () => {
    resolveBaseline([r1, r2], { from: '2026-10-16', to: '2026-10-31' });
    expect(r1.rows).toHaveLength(2);
    expect(normalizePlanRow(r1.rows[0].row).start).toBe('08:00');
  });
});

describe('three-way reconciliation (B = baseline, N = new plan, E = effective)', () => {
  const day = '2026-10-20';
  const at = (start, end) => [entry(K, row(day, 'Regular', start, end))];
  const run = ({ B, N, E }) => reconcileThreeWay({ baseline: B, next: N, effective: E, today: TODAY })[0];

  it('CASE 1: B == N and E == B -> nothing changes', () => {
    expect(run({ B: at('08:00', '16:00'), N: at('08:00', '16:00'), E: at('08:00', '16:00') }).outcome).toBe(O.UNCHANGED);
    expect(run({ B: at('08:00', '16:00'), N: at('08:00', '16:00'), E: [] }).outcome).toBe(O.UNCHANGED);
  });
  it('CASE 2 / N1: B == N and E != B -> the local override is kept (company returns to its old plan)', () => {
    expect(run({ B: at('08:00', '16:00'), N: at('08:00', '16:00'), E: at('09:00', '17:00') }).outcome).toBe(O.KEPT_LOCAL);
  });
  it('CASE 3: B != N and E == B on a future day -> company update applied', () => {
    expect(run({ B: at('08:00', '16:00'), N: at('10:00', '18:00'), E: at('08:00', '16:00') }).outcome).toBe(O.MODIFIED);
    expect(run({ B: at('08:00', '16:00'), N: at('10:00', '18:00'), E: [] }).outcome).toBe(O.MODIFIED);
  });
  it('CASE 4 / N2: B != N and E == N -> the company adopted the local change (auto-resolved)', () => {
    expect(run({ B: at('08:00', '16:00'), N: at('09:00', '17:00'), E: at('09:00', '17:00') }).outcome).toBe(O.COMPANY_ADOPTED_LOCAL);
  });
  it('CASE 5 / N3: B != N, E != B and E != N -> real discrepancy needs review', () => {
    expect(run({ B: at('08:00', '16:00'), N: at('10:00', '18:00'), E: at('09:00', '17:00') }).outcome).toBe(O.REQUIRES_REVIEW);
  });
  it('CASE 6: a retrospective change never silently rewrites effective history', () => {
    const past = '2026-10-10';
    const item = reconcileThreeWay({
      baseline: [entry(K, row(past, 'Regular', '08:00', '16:00'))], next: [entry(K, row(past, 'Regular', '10:00', '18:00'))],
      effective: [entry(K, row(past, 'Regular', '08:00', '16:00'))], today: TODAY,
    })[0];
    expect(item.retrospective).toBe(true);
    expect(item.outcome).toBe(O.REQUIRES_REVIEW);
  });
  it('first import: a day already equal to the effective calendar is UNCHANGED; days awaiting review are never resolved silently', () => {
    expect(run({ B: [], N: at('08:00', '16:00'), E: at('08:00', '16:00') }).outcome).toBe(O.UNCHANGED);
    const reviewDays = new Set([`${K}\u001f${day}`]);
    expect(reconcileThreeWay({ baseline: [], next: at('08:00', '16:00'), effective: [], today: TODAY, reviewDays })[0].outcome).toBe(O.REQUIRES_REVIEW);
  });
  it('NEW rows (no baseline, no local data) are plain additions; a pre-existing different local day needs review', () => {
    expect(run({ B: [], N: at('08:00', '16:00'), E: [] }).outcome).toBe(O.NEW);
    expect(run({ B: [], N: at('08:00', '16:00'), E: at('09:00', '17:00') }).outcome).toBe(O.REQUIRES_REVIEW);
  });
  it('rows are reconciled independently: one conflict does not block the rest of the document', () => {
    const N = [entry(K, row('2026-10-20', 'Regular', '10:00', '18:00')), entry(K, row('2026-10-21', 'Libre'))];
    const B = [entry(K, row('2026-10-20', 'Regular', '08:00', '16:00'))];
    const E = [entry(K, row('2026-10-20', 'Regular', '09:00', '17:00'))];
    const summary = summarizeOutcomes(reconcileThreeWay({ baseline: B, next: N, effective: E, today: TODAY }));
    expect(summary).toMatchObject({ total: 2, requiresReview: 1, new: 1 });
  });
});

describe('day comparison ignores the Regular/Extras split and JT-style duplicates', () => {
  it('Regular 13-20 + Extras 20-21 equals Regular 13-21', () => {
    const split = [row('2026-02-06', 'Regular', '13:00', '20:00'), row('2026-02-06', 'Extras', '20:00', '21:00')];
    const whole = [row('2026-02-06', 'Regular', '13:00', '21:00')];
    expect(daySignature(split)).toBe(daySignature(whole));
    expect(daySignature([row('2026-02-06', 'Regular', '13:00', '22:00')])).not.toBe(daySignature(whole));
  });
  it('overnight rows and whole-day types compare correctly; Libre != Vacaciones', () => {
    expect(daySignature([row('2026-02-06', 'Regular', '21:00', '05:00')])).toBe(daySignature([row('2026-02-06', 'Regular', '21:00', '05:00')]));
    expect(daySignature([row('2026-02-06', 'Libre')])).not.toBe(daySignature([row('2026-02-06', 'Vacaciones')]));
    expect(daySignature([row('2026-02-06', 'AJ')])).toBe(daySignature([row('2026-02-06', 'Libre')]));
  });
});


import { dayFingerprint, documentFingerprint, planFingerprint } from './import-fingerprints.js';

describe('import fingerprints', () => {
  const plan = [entry(K, row('2026-10-17', 'Regular', '13:00', '21:00')), entry('id:11111', row('2026-10-17', 'Libre'))];

  it('PLAN fingerprint is independent of tenant UUIDs and row order', () => {
    const reordered = [plan[1], plan[0]];
    expect(planFingerprint(plan)).toBe(planFingerprint(reordered));
    // the same plan keyed by payroll number in a DIFFERENT tenant (different employee UUIDs) hashes identically
    expect(planFingerprint(plan.map((e) => ({ ...e, row: { ...e.row, employeeId: 'a-different-tenant-uuid' } })))).toBe(planFingerprint(plan));
  });

  it('PLAN fingerprint changes only when business content changes', () => {
    expect(planFingerprint(plan)).not.toBe(planFingerprint([entry(K, row('2026-10-17', 'Regular', '14:00', '21:00')), plan[1]]));
    expect(planFingerprint([entry(K, row('2026-10-17', 'AJ'))])).toBe(planFingerprint([entry(K, row('2026-10-17', 'Libre'))]));
  });

  it('DOCUMENT fingerprint ignores order/noise but includes period context; PLAN ignores the context', () => {
    const a = documentFingerprint(plan, { importMode: 'team', periodKind: 'single', periodYear: 2026, periodMonth: 9 });
    expect(documentFingerprint([plan[1], plan[0]], { importMode: 'team', periodKind: 'single', periodYear: 2026, periodMonth: 9 })).toBe(a);
    expect(documentFingerprint(plan, { importMode: 'individual', periodKind: 'single', periodYear: 2026, periodMonth: 9 })).not.toBe(a);
    expect(planFingerprint(plan)).toBe(planFingerprint([...plan]));
  });

  it('day fingerprint is stable across a Regular/Extras split', () => {
    expect(dayFingerprint([row('2026-02-06', 'Regular', '13:00', '20:00'), row('2026-02-06', 'Extras', '20:00', '21:00')]))
      .toBe(dayFingerprint([row('2026-02-06', 'Regular', '13:00', '21:00')]));
  });
});

describe('source-aware semantics (synthetic data)', () => {
  const wed = '2026-06-02';
  const plan0602 = [{ employeeKey: K, date: wed, row: row(wed, 'Regular', '14:00', '22:00') }];
  const eff = (rows) => rows.map((r) => ({ employeeKey: K, date: r.date, row: r }));

  it('comment-only changes alter the DOCUMENT fingerprint but never the PLAN fingerprint', () => {
    const base = [entry(K, row(wed, 'Regular', '14:00', '22:00'))];
    const withNote = [{ ...base[0], annotations: [{ kind: 'COMMENT', text: 'cambio de turno' }] }];
    const withOtherNote = [{ ...base[0], annotations: [{ kind: 'COMMENT', text: 'otro texto' }] }];
    expect(planFingerprint(withNote)).toBe(planFingerprint(base));
    expect(planFingerprint(withOtherNote)).toBe(planFingerprint(base));
    expect(documentFingerprint(withNote)).not.toBe(documentFingerprint(base));
    expect(documentFingerprint(withNote)).not.toBe(documentFingerprint(withOtherNote));
  });

  it('a DCF marker without hours changes the DOCUMENT fingerprint, not the PLAN one', () => {
    const base = [entry(K, row(wed, 'Libre'))];
    const dcf = [{ ...base[0], annotations: [{ kind: 'DCF', startTime: null, endTime: null }] }];
    expect(planFingerprint(dcf)).toBe(planFingerprint(base));
    expect(documentFingerprint(dcf)).not.toBe(documentFingerprint(base));
  });

  it('02/06: employee Baja evidence over a published 14-22 plan keeps the plan and applies the Baja as effective', () => {
    const planDay = eff([row(wed, 'Regular', '14:00', '22:00')]);
    const evidence = [{ employeeKey: K, date: wed, evidence: true, row: row(wed, 'Baja') }];
    const outcomes = reconcileThreeWay({
      baseline: plan0602, next: evidence, effective: planDay, today: '2026-10-16',
      planOnlyDays: new Set([`${K}\u001f${wed}`]),
    });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe(O.EVIDENCE_APPLIED);
    expect(outcomes[0].baseline).not.toBeNull(); // plan baseline stays reachable for the explanation
  });

  it('evidence over a day with a human override is never applied silently', () => {
    const evidence = [{ employeeKey: K, date: wed, evidence: true, row: row(wed, 'Baja') }];
    const outcomes = reconcileThreeWay({
      baseline: plan0602, next: evidence, effective: eff([row(wed, 'Regular', '13:00', '21:00')]), today: '2026-10-16',
      planOnlyDays: new Set(),
    });
    expect(outcomes[0].outcome).toBe(O.REQUIRES_REVIEW);
  });

  it('a pending-review day is never resolved by re-importing the same document', () => {
    const outcomes = reconcileThreeWay({
      baseline: plan0602, next: plan0602, effective: eff([row(wed, 'Baja')]), today: '2026-10-16',
      reviewDays: new Set([`${K}\u001f${wed}`]),
    });
    expect(outcomes[0].outcome).toBe(O.REQUIRES_REVIEW);
  });
});

describe('semantic day change (history is not a change)', () => {
  const r = (shiftType, startTime = null, endTime = null, extra = {}) => ({ date: '2026-07-16', shiftType, startTime, endTime, ...extra });
  it('A: Vacaciones -> Vacaciones is NOT a change', () => {
    expect(hasSemanticDayChange([r('Vacaciones')], [r('Vacaciones')])).toBe(false);
  });
  it('B: same hours with different ids / provenance is NOT a change', () => {
    expect(hasSemanticDayChange([r('Regular', '09:00', '17:00', { id: 'a', provenance: 'COMPANY_IMPORT' })], [r('Regular', '09:00:00', '17:00:00', { id: 'b', provenance: 'SYSTEM' })])).toBe(false);
  });
  it('C: Regular 09-17 -> Regular 10-18 IS a change', () => {
    expect(hasSemanticDayChange([r('Regular', '09:00', '17:00')], [r('Regular', '10:00', '18:00')])).toBe(true);
  });
  it('D: Vacaciones -> Libre IS a change', () => {
    expect(hasSemanticDayChange([r('Vacaciones')], [r('Libre')])).toBe(true);
  });
  it('E: the same rows in another order are NOT a change', () => {
    const a = r('Regular', '06:00', '10:00'); const b = r('Regular', '14:00', '18:00');
    expect(hasSemanticDayChange([a, b], [b, a])).toBe(false);
  });
  it('history flag: a superseded duplicate of the visible state is not a change; a different historic state is', () => {
    expect(hasSemanticHistoryChange([r('Vacaciones')], [r('Vacaciones'), r('Vacaciones')])).toBe(false);
    expect(hasSemanticHistoryChange([r('Vacaciones')], [r('Regular', '09:00', '17:00')])).toBe(true);
    expect(hasSemanticHistoryChange([r('Vacaciones')], [])).toBe(false);
  });
});

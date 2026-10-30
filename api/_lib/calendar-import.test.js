import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_CLASS, IMPORT_DECISION, RECONCILIATION_OUTCOME as O, TEMPORAL_CLASS,
  classifyDocument, classifyTemporal, employeeBusinessKey, normalizeImportDecision, normalizeImportedCalendarRow,
  daySignature, hasSemanticDayChange, hasSemanticHistoryChange, reconcileCurrentProposal, resolveImportOptions, splitByOperationalDate, summarizeOutcomes,
} from '../../src/lib/calendar-import.js';

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
    expect(classifyDocument({ temporal: 'FUTURE', employeeCount: 62, rowCount: 859 }).documentClass).toBe(DOCUMENT_CLASS.PLANNING_DRAFT);
    expect(classifyDocument({ temporal: 'FUTURE', employeeCount: 62, rowCount: 859, hasExistingSchedule: true }).documentClass).toBe(DOCUMENT_CLASS.PLANNING_UPDATE);
    const mixed = classifyDocument({ temporal: 'MIXED', employeeCount: 1, rowCount: 292 });
    expect(mixed.documentClass).toBe(DOCUMENT_CLASS.PLANNING_DRAFT);
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

describe('calendar import identity', () => {
  it('prefers the payroll number; falls back to a normalised name; never a UUID', () => {
    expect(employeeBusinessKey({ externalEmployeeId: ' 84881 ', name: 'x' })).toBe('id:84881');
    expect(employeeBusinessKey({ external_employee_id: '84881' })).toBe('id:84881');
    expect(employeeBusinessKey({ name: '  Sebastián   POZO ' })).toBe('name:sebastian pozo');
    expect(employeeBusinessKey({})).toBeNull();
  });

  it('normalises AJ to Libre and ignores times on full-day rows', () => {
    expect(normalizeImportedCalendarRow(row('2026-10-20', 'AJ', '08:00', '16:00'))).toMatchObject({ type: 'Libre', start: '', end: '' });
    expect(daySignature([row('2026-10-20', 'AJ')])).toBe(daySignature([row('2026-10-20', 'Libre')]));
  });
});

describe('current/proposed comparison', () => {
  const date = '2026-10-15';
  const current = [{ employeeKey: K, row: row(date, 'Regular', '08:00', '16:00') }];
  const compare = (proposed, currentRows = current, today = TODAY) => reconcileCurrentProposal({ proposed, current: currentRows, today })[0];

  it('identical incoming rows are unchanged and do not create a difference', () => {
    expect(compare(current).outcome).toBe(O.UNCHANGED);
  });
  it('a changed historical row remains a proposal while current stays the accounting baseline', () => {
    const incoming = [{ employeeKey: K, row: row(date, 'Regular', '09:00', '17:00') }];
    expect(compare(incoming).outcome).toBe(O.REQUIRES_REVIEW);
  });
  it('a future incoming row without current creates Planning work', () => {
    const incoming = [{ employeeKey: K, row: row('2026-11-20', 'Regular', '09:00', '17:00') }];
    expect(compare(incoming, [], TODAY).outcome).toBe(O.NEW);
  });
  it('a pending difference stays pending on reimport', () => {
    const incoming = [{ employeeKey: K, row: row(date, 'Regular', '09:00', '17:00') }];
    expect(reconcileCurrentProposal({ proposed: incoming, current, today: TODAY, reviewDays: new Set([`${K}\u001f${date}`]) })[0].outcome).toBe(O.REQUIRES_REVIEW);
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


import { dayFingerprint, documentFingerprint } from './import-fingerprints.js';

describe('import fingerprints', () => {
  const plan = [entry(K, row('2026-10-17', 'Regular', '13:00', '21:00')), entry('id:11111', row('2026-10-17', 'Libre'))];

  it('DOCUMENT fingerprint ignores order/noise but includes period context', () => {
    const a = documentFingerprint(plan, { importMode: 'team', periodKind: 'single', periodYear: 2026, periodMonth: 9 });
    expect(documentFingerprint([plan[1], plan[0]], { importMode: 'team', periodKind: 'single', periodYear: 2026, periodMonth: 9 })).toBe(a);
    expect(documentFingerprint(plan, { importMode: 'individual', periodKind: 'single', periodYear: 2026, periodMonth: 9 })).not.toBe(a);
  });

  it('day fingerprint is stable across a Regular/Extras split', () => {
    expect(dayFingerprint([row('2026-02-06', 'Regular', '13:00', '20:00'), row('2026-02-06', 'Extras', '20:00', '21:00')]))
      .toBe(dayFingerprint([row('2026-02-06', 'Regular', '13:00', '21:00')]));
  });
});

describe('current/proposed semantics (synthetic data)', () => {
  it('historical employee calendar evidence cannot replace a different current day silently', () => {
    const date = '2026-06-02';
    const proposed = [{ employeeKey: K, row: row(date, 'Baja') }];
    const current = [{ employeeKey: K, row: row(date, 'Regular', '14:00', '22:00') }];
    const [item] = reconcileCurrentProposal({ proposed, current, today: TODAY });
    expect(item.outcome).toBe(O.REQUIRES_REVIEW);
  });

  it('a pending proposal is not resolved by an identical reimport', () => {
    const date = '2026-06-02';
    const proposed = [{ employeeKey: K, row: row(date, 'Baja') }];
    const current = [{ employeeKey: K, row: row(date, 'Regular', '14:00', '22:00') }];
    const [item] = reconcileCurrentProposal({ proposed, current, today: TODAY, reviewDays: new Set([`${K}\u001f${date}`]) });
    expect(item.outcome).toBe(O.REQUIRES_REVIEW);
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

describe('auto-publish decision (F1-M04, INV-06)', () => {
  it('only the explicit value reaches auto-publication; the legacy `publish` stays a plan decision', () => {
    expect(normalizeImportDecision('historical-and-auto-publish')).toBe('historical-and-auto-publish');
    expect(normalizeImportDecision('publish')).toBe(IMPORT_DECISION.HISTORICAL_AND_PLAN);
    expect(normalizeImportDecision('auto-publish')).toBe(IMPORT_DECISION.HISTORICAL_ONLY);
    expect(normalizeImportDecision('PUBLISH ')).toBe(IMPORT_DECISION.HISTORICAL_ONLY);
  });

  it('options without the deployment switch are exactly today\'s', () => {
    expect(resolveImportOptions({ canPlan: true, temporal: 'FUTURE' })).toEqual({ options: ['historical-and-plan'], default: 'historical-and-plan', futureAllowed: true });
    expect(resolveImportOptions({ canPlan: true, temporal: 'MIXED' }).default).toBe('historical-only');
  });

  it('with auto-publication enabled: FUTURE offers [auto, plan], MIXED [auto, plan, historical-only], default auto; no capability or history => historical-only', () => {
    expect(resolveImportOptions({ canPlan: true, temporal: 'FUTURE', autoPublish: true })).toEqual({
      options: ['historical-and-auto-publish', 'historical-and-plan'], default: 'historical-and-auto-publish', futureAllowed: true,
    });
    expect(resolveImportOptions({ canPlan: true, temporal: 'MIXED', autoPublish: true })).toEqual({
      options: ['historical-and-auto-publish', 'historical-and-plan', 'historical-only'], default: 'historical-and-auto-publish', futureAllowed: true,
    });
    expect(resolveImportOptions({ canPlan: false, temporal: 'MIXED', autoPublish: true }).options).toEqual(['historical-only']);
    expect(resolveImportOptions({ canPlan: true, temporal: 'HISTORICAL', autoPublish: true }).options).toEqual(['historical-only']);
  });
});

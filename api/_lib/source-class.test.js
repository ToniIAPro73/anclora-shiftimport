import { describe, expect, it } from 'vitest';
import { RECONCILIATION_OUTCOME as O, reconcileThreeWay } from '../../src/lib/company-plan.js';
import { SOURCE_BUSINESS_CLASS, getSourceBusinessClass, isCalendarSnapshotSource } from './source-class.js';

const TODAY = '2026-10-18';
const K = 'id:1';
const day = (date, shiftType, startTime = null, endTime = null) => ({ date, shiftType, startTime, endTime });
const next = (r) => ({ employeeKey: K, row: r, evidence: true });
const eff = (r) => ({ employeeKey: K, row: r });

describe('source business class (single place that decides what a document is)', () => {
  it('S1: the team schedule is planning', () => {
    expect(getSourceBusinessClass('TEAM_SCHEDULE_EXPORT')).toBe(SOURCE_BUSINESS_CLASS.TEAM_PLANNING);
  });
  it('S2: the published monthly is a calendar snapshot, not a plan source', () => {
    expect(getSourceBusinessClass('PUBLISHED_CALENDAR_EXPORT')).toBe(SOURCE_BUSINESS_CLASS.EMPLOYEE_CALENDAR_SNAPSHOT);
    expect(isCalendarSnapshotSource('PUBLISHED_CALENDAR_EXPORT')).toBe(true);
  });
  it('S3: the employee calendar is a (richer) calendar snapshot', () => {
    expect(getSourceBusinessClass('EMPLOYEE_CALENDAR_EXPORT')).toBe(SOURCE_BUSINESS_CLASS.EMPLOYEE_CALENDAR_SNAPSHOT);
  });
  it('unclassified documents keep the legacy planning behaviour', () => {
    expect(getSourceBusinessClass('UNKNOWN')).toBe(SOURCE_BUSINESS_CLASS.TEAM_PLANNING);
  });
});

describe('employee calendar enrichment', () => {
  it('S8/A: the same shift plus DCF/observation annotations stays ONE shift and no difference', () => {
    const enriched = { employeeKey: K, row: day('2026-03-23', 'Regular', '17:00', '01:00'), evidence: true, annotations: [{ kind: 'DCF', body: 'DCF' }] };
    const outcomes = reconcileThreeWay({ baseline: [], next: [enriched], effective: [eff(day('2026-03-23', 'Regular', '17:00', '01:00'))], today: TODAY });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe(O.UNCHANGED);
  });
  it('C: a day present in one snapshot and absent from the other is never read as an order to delete', () => {
    // the absent snapshot contributes no row for that day, so nothing is proposed for it at all
    expect(reconcileThreeWay({ baseline: [], next: [], effective: [eff(day('2026-11-25', 'Vacaciones'))], today: TODAY })).toEqual([]);
  });
});

describe('calendar snapshots are compared with the current calendar only', () => {
  it('S7: a compatible row does not duplicate the shift (future date, no plan baseline involved)', () => {
    const [o] = reconcileThreeWay({ baseline: [], next: [next(day('2026-11-02', 'Regular', '17:00', '01:00'))], effective: [eff(day('2026-11-02', 'Regular', '17:00', '01:00'))], today: TODAY });
    expect(o.outcome).toBe(O.UNCHANGED);
  });
  it('a snapshot day absent from the calendar is new, never a plan revision', () => {
    const [o] = reconcileThreeWay({ baseline: [], next: [next(day('2026-11-02', 'Regular', '14:00', '22:00'))], effective: [], today: TODAY });
    expect(o.outcome).toBe(O.NEW);
    expect(o.evidence).toBe(true);
  });
  it('B: a real contradiction with a manual day goes to Differences, nobody wins silently', () => {
    const [o] = reconcileThreeWay({ baseline: [], next: [next(day('2026-06-02', 'Baja'))], effective: [eff(day('2026-06-02', 'Regular', '14:00', '22:00'))], today: TODAY });
    expect(o.outcome).toBe(O.REQUIRES_REVIEW);
  });
});

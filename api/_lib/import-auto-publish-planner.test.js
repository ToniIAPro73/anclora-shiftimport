import { describe, expect, it } from 'vitest';
import { RETENTION, WEEK_MODE, isAttributableToImport, planAutoPublication } from './import-auto-publish-planner.js';

const day = (employeeId, date, outcome, rows, extra = {}) => ({
  employeeId, date, outcome, rows: rows ?? [{ startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true }], ...extra,
});
const plan = (over = {}) => planAutoPublication({ periodStart: '2026-11-02', areaId: null, fileDays: [], ...over });
const reasons = (result) => Object.fromEntries(result.retainPairs.map((r) => [`${r.employeeId}|${r.date}`, r.reason]));

describe('planAutoPublication — decision table (spec §2.2)', () => {
  it('row 1: UNCHANGED is a noop and never published nor retained', () => {
    const r = plan({ fileDays: [day('e1', '2026-11-02', 'UNCHANGED')] });
    expect(r.mode).toBe(WEEK_MODE.NONE);
    expect(r.unchangedCount).toBe(1);
    expect(r.publishPairs).toEqual([]);
  });

  it('row 2: REQUIRES_REVIEW (incl. APPROVED_VACATION_CONFLICT) goes to review with its reason', () => {
    const r = plan({ fileDays: [day('e1', '2026-11-02', 'REQUIRES_REVIEW', null, { reasonCode: 'APPROVED_VACATION_CONFLICT' }), day('e1', '2026-11-03', 'NEW')] });
    expect(r.reviewPairs).toEqual([{ employeeId: 'e1', date: '2026-11-02', reason: 'APPROVED_VACATION_CONFLICT' }]);
    expect(r.publishPairs).toEqual([{ employeeId: 'e1', date: '2026-11-03' }]);
    expect(r.mode).toBe(WEEK_MODE.PUBLISH);
  });

  it('row 7: clean NEW and MODIFIED pairs are published as a whole (PUBLISH)', () => {
    const r = plan({ fileDays: [day('e1', '2026-11-02', 'NEW'), day('e2', '2026-11-02', 'MODIFIED')], currentByDay: new Map([['e2|2026-11-02', [{ provenance: 'COMPANY_IMPORT' }]]]) });
    expect(r.mode).toBe(WEEK_MODE.PUBLISH);
    expect(r.publishPairs).toHaveLength(2);
    expect(r.retainPairs).toEqual([]);
  });

  it('row 3: manual provenance in CURRENT is protected (OD-05) and the rest is split off', () => {
    for (const provenance of ['MANUAL_ADMIN_CHANGE', 'MANUAL_CONFIRMED_WHOLE_DAY_OVERRIDE', 'EMPLOYEE_REQUEST', 'MIGRATION']) {
      const r = plan({ fileDays: [day('e1', '2026-11-02', 'MODIFIED'), day('e2', '2026-11-02', 'NEW')], currentByDay: new Map([['e1|2026-11-02', [{ provenance }]]]) });
      expect(reasons(r)['e1|2026-11-02']).toBe(RETENTION.MANUAL_CURRENT_PROTECTED);
      expect(r.mode).toBe(WEEK_MODE.SPLIT);
      expect(r.publishPairs).toEqual([{ employeeId: 'e2', date: '2026-11-02' }]);
    }
  });

  it('row 3b: unknown / null provenance fails closed through the white list', () => {
    for (const provenance of [null, 'SOMETHING_NEW', 'SCHEDULE_PUBLICATION']) {
      const r = plan({ fileDays: [day('e1', '2026-11-02', 'MODIFIED')], currentByDay: new Map([['e1|2026-11-02', [{ provenance }]]]) });
      expect(reasons(r)['e1|2026-11-02']).toBe(RETENTION.UNATTRIBUTABLE_PROVENANCE);
      expect(r.publishPairs).toEqual([]);
      expect(r.mode).toBe(WEEK_MODE.RETAIN_DRAFT);
    }
  });

  it('white list: import-stamped rows are attributable; a published plan is only when it carries an import id', () => {
    expect(isAttributableToImport({ provenance: 'COMPANY_IMPORT' })).toBe(true);
    expect(isAttributableToImport({ provenance: 'SYSTEM' })).toBe(true);
    expect(isAttributableToImport({ provenance: 'SCHEDULE_PUBLICATION', importId: 'i1' })).toBe(true);
    expect(isAttributableToImport({ provenance: 'SCHEDULE_PUBLICATION' })).toBe(false);
    expect(isAttributableToImport({ provenance: 'MANUAL_ADMIN_CHANGE' })).toBe(false);
    expect(isAttributableToImport({ provenance: null })).toBe(false);
    expect(isAttributableToImport(undefined)).toBe(false);
  });

  it('row 3b: a pending modification on the pair is retained', () => {
    const r = plan({ fileDays: [day('e1', '2026-11-02', 'NEW'), day('e2', '2026-11-02', 'NEW')], pendingModificationDays: new Set(['e1|2026-11-02']) });
    expect(reasons(r)['e1|2026-11-02']).toBe(RETENTION.PENDING_MODIFICATION);
    expect(r.publishPairs).toEqual([{ employeeId: 'e2', date: '2026-11-02' }]);
  });

  it('row 4: a manually edited draft assignment on a file pair keeps the whole week as a draft', () => {
    const r = plan({
      fileDays: [day('e1', '2026-11-02', 'NEW'), day('e2', '2026-11-02', 'NEW')],
      draftAssignments: [{ employeeId: 'e1', date: '2026-11-02', importId: null }],
    });
    expect(r.mode).toBe(WEEK_MODE.RETAIN_DRAFT);
    expect(r.publishPairs).toEqual([]);
    expect(Object.values(reasons(r))).toEqual([RETENTION.MANUAL_DRAFT_PROTECTED, RETENTION.MANUAL_DRAFT_PROTECTED]);
  });

  it('row 5: overlap inside the day and whole-day vs timed are retained', () => {
    const overlap = plan({ fileDays: [day('e1', '2026-11-02', 'NEW', [
      { startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true },
      { startTime: '12:00', endTime: '14:00', shiftType: 'Extras', countsAsWork: true },
    ])] });
    expect(reasons(overlap)['e1|2026-11-02']).toBe(RETENTION.OVERLAP);
    const fullDay = plan({ fileDays: [day('e1', '2026-11-02', 'NEW', [
      { startTime: null, endTime: null, shiftType: 'Libre', countsAsWork: false },
      { startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true },
    ])] });
    expect(reasons(fullDay)['e1|2026-11-02']).toBe(RETENTION.FULL_DAY_CONFLICT);
  });

  it('row 6: less than 11 h of rest against an accepted neighbour is retained; 11 h exactly is allowed', () => {
    const late = { startTime: '14:00', endTime: '22:00', shiftType: 'Regular', countsAsWork: true };
    const early = { startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true };
    const bad = plan({ fileDays: [day('e1', '2026-11-02', 'NEW', [late]), day('e1', '2026-11-03', 'NEW', [early])] });
    expect(reasons(bad)['e1|2026-11-03']).toBe(RETENTION.REST_RULE_VIOLATION);
    expect(bad.mode).toBe(WEEK_MODE.SPLIT);
    const ok = plan({ fileDays: [day('e1', '2026-11-02', 'NEW', [{ ...late, endTime: '18:00' }]), day('e1', '2026-11-03', 'NEW', [early])] });
    expect(ok.mode).toBe(WEEK_MODE.PUBLISH);
  });

  it('row 6: rest is also checked against carried-over base assignments of OTHER pairs', () => {
    const r = plan({
      fileDays: [day('e1', '2026-11-03', 'NEW', [{ startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true }])],
      baseAssignments: [{ employeeId: 'e1', date: '2026-11-02', start_time: '14:00', end_time: '22:00', shift_type: 'Regular', counts_as_work: true }],
    });
    expect(reasons(r)['e1|2026-11-03']).toBe(RETENTION.REST_RULE_VIOLATION);
  });

  it('a candidate pair is not constrained by its own base rows (they are replaced by the file)', () => {
    const r = plan({
      fileDays: [day('e1', '2026-11-02', 'MODIFIED')],
      baseAssignments: [{ employeeId: 'e1', date: '2026-11-02', start_time: '05:00', end_time: '13:00', shift_type: 'Regular', counts_as_work: true }],
      currentByDay: new Map([['e1|2026-11-02', [{ provenance: 'SYSTEM' }]]]),
    });
    expect(r.mode).toBe(WEEK_MODE.PUBLISH);
  });

  it('week rule: a draft assignment whose pair is not in the file retains the whole week (INV-03)', () => {
    const r = plan({
      fileDays: [day('e1', '2026-11-02', 'NEW'), day('e1', '2026-11-03', 'NEW')],
      draftAssignments: [{ employeeId: 'e9', date: '2026-11-04', importId: 'other-import' }],
    });
    expect(r.mode).toBe(WEEK_MODE.RETAIN_DRAFT);
    expect(r.publishPairs).toEqual([]);
    expect(Object.values(reasons(r))).toEqual([RETENTION.FOREIGN_DRAFT_PRESENT, RETENTION.FOREIGN_DRAFT_PRESENT]);
  });

  it('an import-owned draft with only file pairs does not block publication', () => {
    const r = plan({ fileDays: [day('e1', '2026-11-02', 'NEW')], draftAssignments: [{ employeeId: 'e1', date: '2026-11-02', importId: 'prev' }] });
    expect(r.mode).toBe(WEEK_MODE.PUBLISH);
  });

  it('is deterministic: input order does not change the outcome (accept order is date, start time, employee)', () => {
    const days = [
      day('e2', '2026-11-03', 'NEW', [{ startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true }]),
      day('e2', '2026-11-02', 'NEW', [{ startTime: '14:00', endTime: '22:00', shiftType: 'Regular', countsAsWork: true }]),
      day('e1', '2026-11-02', 'NEW'),
    ];
    const a = plan({ fileDays: days });
    const b = plan({ fileDays: [...days].reverse() });
    expect(a).toEqual(b);
    expect(reasons(a)).toEqual({ 'e2|2026-11-03': RETENTION.REST_RULE_VIOLATION });
  });

  it('never publishes anything when every candidate is retained', () => {
    const r = plan({ fileDays: [day('e1', '2026-11-02', 'NEW')], currentByDay: new Map([['e1|2026-11-02', [{ provenance: 'MANUAL_ADMIN_CHANGE' }]]]) });
    expect(r.publishPairs).toEqual([]);
    expect(r.mode).toBe(WEEK_MODE.RETAIN_DRAFT);
  });

  it('an unknown outcome fails closed', () => {
    const r = plan({ fileDays: [day('e1', '2026-11-02', 'WHATEVER')] });
    expect(r.publishPairs).toEqual([]);
    expect(r.retainPairs).toHaveLength(1);
  });
});

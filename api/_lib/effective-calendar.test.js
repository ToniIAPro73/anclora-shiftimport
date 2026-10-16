import { describe, expect, it } from 'vitest';
import {
  JT_COUNTS_AS_ADDITIONAL_WORK,
  buildDayProvenance,
  computeEffectiveStats,
  evaluateAnnualTarget,
  hoursToMinutes,
  resolveDay,
} from '../../src/lib/effective-calendar.js';

const row = (date, shiftType, startTime = null, endTime = null, extra = {}) => ({ date, shiftType, startTime, endTime, ...extra });
const stats = (rows, options = {}) => computeEffectiveStats(rows, options);

describe('effective stats', () => {
  it('Regular 08-16 = 8h', () => {
    const s = stats([row('2026-03-02', 'Regular', '08:00', '16:00')]);
    expect(s.total.regularMinutes).toBe(480);
    expect(s.total.effectiveMinutes).toBe(480);
    expect(s.total.workedDays).toBe(1);
  });

  it('Regular + Extras without overlap', () => {
    const s = stats([row('2026-03-02', 'Regular', '08:00', '16:00'), row('2026-03-02', 'Extras', '16:00', '18:00')]);
    expect(s.total.regularMinutes).toBe(480);
    expect(s.total.extrasMinutes).toBe(120);
    expect(s.total.effectiveMinutes).toBe(600);
  });

  it('Regular + segmented Ausencia', () => {
    const s = stats([
      row('2026-03-02', 'Regular', '08:00', '10:00'),
      row('2026-03-02', 'Ausencia', '10:00', '12:00'),
      row('2026-03-02', 'Regular', '12:00', '16:00'),
    ]);
    expect(s.total.regularMinutes).toBe(360);
    expect(s.total.absenceMinutes).toBe(120);
    expect(s.total.effectiveMinutes).toBe(360);
  });

  it.each([['Libre'], ['Vacaciones'], ['Baja']])('%s computes no work', (type) => {
    const s = stats([row('2026-03-02', type)]);
    expect(s.total.effectiveMinutes).toBe(0);
    expect(s.unresolvedDays).toBe(0);
  });

  it('counts full-day statuses as days', () => {
    const s = stats([row('2026-03-01', 'Libre'), row('2026-03-02', 'Vacaciones'), row('2026-03-03', 'Baja')]);
    expect([s.total.freeDays, s.total.vacationDays, s.total.sickLeaveDays]).toEqual([1, 1, 1]);
  });

  it('half-open intervals: 08-12 and 12-14 do not overlap', () => {
    const s = stats([row('2026-03-02', 'Regular', '08:00', '12:00'), row('2026-03-02', 'Regular', '12:00', '14:00')]);
    expect(s.total.effectiveMinutes).toBe(360);
    expect(s.unresolvedDays).toBe(0);
  });

  it('overnight shift is attributed to its start date', () => {
    const s = stats([row('2026-03-02', 'Regular', '21:00', '05:00')]);
    expect(s.total.effectiveMinutes).toBe(480);
  });

  it('exact duplicate rows are not double counted', () => {
    const s = stats([row('2026-03-02', 'Regular', '08:00', '16:00'), row('2026-03-02', 'Regular', '08:00', '16:00')]);
    expect(s.total.effectiveMinutes).toBe(480);
    expect(s.duplicateRows).toBe(1);
    expect(s.unresolvedDays).toBe(0);
  });

  it('overlap is reported and does not inflate the total', () => {
    const s = stats([row('2026-03-02', 'Regular', '08:00', '16:00'), row('2026-03-02', 'Extras', '15:00', '18:00')]);
    expect(s.total.effectiveMinutes).toBe(0);
    expect(s.unresolvedDays).toBe(1);
    expect(s.unresolved[0].issues).toContain('OVERLAP');
  });

  it.each([
    ['Libre', 'Regular'], ['Vacaciones', 'Regular'], ['Baja', 'Extras'],
  ])('%s + %s work is invalid', (fullDay, workType) => {
    const s = stats([row('2026-03-02', fullDay), row('2026-03-02', workType, '08:00', '16:00')]);
    expect(s.unresolvedDays).toBe(1);
    expect(s.total.effectiveMinutes).toBe(0);
  });

  it.each([['Libre', 'Vacaciones'], ['Libre', 'Baja'], ['Vacaciones', 'Baja']])('%s + %s is invalid', (a, b) => {
    const s = stats([row('2026-03-02', a), row('2026-03-02', b)]);
    expect(s.unresolved[0]?.issues).toContain('FULL_DAY_CONFLICT');
  });

  it('overnight spill that collides with the next day is unresolved', () => {
    const s = stats([row('2026-03-02', 'Regular', '21:00', '05:00'), row('2026-03-03', 'Regular', '04:00', '12:00')]);
    expect(s.unresolved.some((u) => u.issues.includes('OVERNIGHT_SPILL_OVERLAP'))).toBe(true);
  });

  it('splits realized and planned around today', () => {
    const rows = [row('2026-03-02', 'Regular', '08:00', '16:00'), row('2026-03-05', 'Regular', '08:00', '12:00')];
    const s = stats(rows, { today: '2026-03-03' });
    expect(s.realized.effectiveMinutes).toBe(480);
    expect(s.planned.effectiveMinutes).toBe(240);
    expect(s.total.effectiveMinutes).toBe(720);
  });
});

describe('legacy JT', () => {
  it('JT never counts as additional work', () => {
    expect(JT_COUNTS_AS_ADDITIONAL_WORK).toBe(false);
  });

  it('2026-02-06: Regular 13-20 + Extras 20-21 + JT 13-21 = 8h', () => {
    const s = stats([
      row('2026-02-06', 'Regular', '13:00', '20:00'),
      row('2026-02-06', 'Extras', '20:00', '21:00'),
      row('2026-02-06', 'JT', '13:00', '21:00'),
    ]);
    expect(s.total.regularMinutes).toBe(420);
    expect(s.total.extrasMinutes).toBe(60);
    expect(s.total.effectiveMinutes).toBe(480);
    expect(s.legacyDutyRows).toBe(1);
    expect(s.unresolvedDays).toBe(0);
  });

  it('2026-02-18: Regular 13-21 + Extras 21-23:15 + JT 13-23:15 = 10h15', () => {
    const s = stats([
      row('2026-02-18', 'Regular', '13:00', '21:00'),
      row('2026-02-18', 'Extras', '21:00', '23:15'),
      row('2026-02-18', 'JT', '13:00', '23:15'),
    ]);
    expect(s.total.regularMinutes).toBe(480);
    expect(s.total.extrasMinutes).toBe(135);
    expect(s.total.effectiveMinutes).toBe(615);
  });

  it('flags a JT-only day instead of inventing hours', () => {
    const day = resolveDay('2026-04-01', [row('2026-04-01', 'JT', '13:00', '21:00')]);
    expect(day.minutes.work).toBe(0);
    expect(day.status).toBe('DUTY_ONLY');
    expect(day.issues.some((i) => i.code === 'DUTY_ROLE_WITHOUT_WORK')).toBe(true);
    const s = stats([row('2026-04-01', 'JT', '13:00', '21:00')]);
    expect(s.total.effectiveMinutes).toBe(0);
    expect(s.unresolvedDays).toBe(1);
    expect(s.unresolved[0].issues).toEqual(['DUTY_ROLE_WITHOUT_WORK']);
  });

  it('metadata-only JT rows are ignored by the accounting', () => {
    const s = stats([
      row('2026-02-06', 'Regular', '13:00', '20:00'),
      row('2026-02-06', 'JT', '13:00', '21:00', { effectiveState: 'METADATA_ONLY' }),
    ]);
    expect(s.total.effectiveMinutes).toBe(420);
  });
});

describe('company plan revisions', () => {
  const plan = (type, start, end, extra) => row('2026-01-01', type, start, end, { layer: 'COMPANY_PLAN', ...extra });

  it('2026-01-01: original Libre superseded by Regular 11-19 = 8h', () => {
    const rows = [
      plan('Libre', null, null, { planRevision: 1, effectiveState: 'SUPERSEDED' }),
      row('2026-01-01', 'Regular', '11:00', '19:00', { layer: 'CHANGE', provenance: 'MANUAL_ADMIN_CHANGE', effectiveState: 'ABSORBED' }),
      plan('Regular', '11:00', '19:00', { planRevision: 2 }),
    ];
    const s = stats(rows);
    expect(s.total.effectiveMinutes).toBe(480);
    expect(s.total.freeDays).toBe(0);
    expect(s.unresolvedDays).toBe(0);
    const history = buildDayProvenance(rows);
    expect(history.companyOriginal.map((r) => r.shiftType)).toEqual(['Libre']);
    expect(history.companyCurrent.map((r) => r.shiftType)).toEqual(['Regular']);
    expect(history.effective).toHaveLength(1);
    expect(history.revisions).toEqual([1, 2]);
  });

  it('2026-06-02: company Baja vs historical Regular 14-22 requires review', () => {
    const rows = [
      row('2026-06-02', 'Baja', null, null, { layer: 'COMPANY_PLAN', planRevision: 2 }),
      row('2026-06-02', 'Regular', '14:00', '22:00', { effectiveState: 'REQUIRES_REVIEW' }),
    ];
    const s = stats(rows);
    expect(s.total.effectiveMinutes).toBe(0);
    expect(s.unresolvedDays).toBe(1);
    expect(s.unresolved[0].status).toBe('REQUIRES_REVIEW');
    expect(buildDayProvenance(rows).requiresReview).toBe(true);
  });

  it('flags changed days relative to the company plan', () => {
    const rows = [
      plan('Regular', '12:00', '20:00', { planRevision: 1 }),
      row('2026-01-01', 'Regular', '11:00', '19:00', { layer: 'CHANGE', planRevision: 1 }),
    ];
    expect(buildDayProvenance(rows).hasChangesFromPlan).toBe(true);
  });
});

describe('annual target', () => {
  const target = { minimumAnnualMinutes: hoursToMinutes(1529), maximumAnnualMinutes: hoursToMinutes(1540) };

  it('is exact in minutes', () => {
    expect(target.minimumAnnualMinutes).toBe(91740);
    expect(target.maximumAnnualMinutes).toBe(92400);
  });

  it('A: 1520h is 9h below the minimum', () => {
    const r = evaluateAnnualTarget(hoursToMinutes(1520), target);
    expect(r.status).toBe('BELOW_MINIMUM');
    expect(r.missingToMinimumMinutes).toBe(540);
  });

  it('B: 1529h reaches the minimum with 11h margin left', () => {
    const r = evaluateAnnualTarget(hoursToMinutes(1529), target);
    expect(r.status).toBe('WITHIN_RANGE');
    expect(r.marginRemainingMinutes).toBe(660);
    expect(r.marginMinutes).toBe(660);
  });

  it('C: 1535h is 6h above the minimum and 5h from the maximum', () => {
    const r = evaluateAnnualTarget(hoursToMinutes(1535), target);
    expect(r.aboveMinimumMinutes).toBe(360);
    expect(r.marginRemainingMinutes).toBe(300);
    expect(r.marginUsedMinutes).toBe(360);
  });

  it('D: 1540h reaches the maximum', () => {
    const r = evaluateAnnualTarget(hoursToMinutes(1540), target);
    expect(r.status).toBe('WITHIN_RANGE');
    expect(r.maximumReached).toBe(true);
    expect(r.marginRemainingMinutes).toBe(0);
  });

  it('E: 1542h exceeds the maximum by 2h', () => {
    const r = evaluateAnnualTarget(hoursToMinutes(1542), target);
    expect(r.status).toBe('ABOVE_MAXIMUM');
    expect(r.excessOverMaximumMinutes).toBe(120);
  });

  it('is UNCONFIGURED without a target', () => {
    expect(evaluateAnnualTarget(1000, null).status).toBe('UNCONFIGURED');
    expect(evaluateAnnualTarget(1000, { minimumAnnualMinutes: null, maximumAnnualMinutes: null }).status).toBe('UNCONFIGURED');
  });

  it('supports distinct per-employee contracts', () => {
    expect(evaluateAnnualTarget(hoursToMinutes(1680), { minimumAnnualMinutes: hoursToMinutes(1680), maximumAnnualMinutes: hoursToMinutes(1680) }).marginMinutes).toBe(0);
    expect(evaluateAnnualTarget(hoursToMinutes(1210), { minimumAnnualMinutes: hoursToMinutes(1200), maximumAnnualMinutes: hoursToMinutes(1250) }).marginRemainingMinutes).toBe(2400);
  });
});

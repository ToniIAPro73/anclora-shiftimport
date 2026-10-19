import { describe, expect, it } from 'vitest';
import {
  JT_COUNTS_AS_ADDITIONAL_WORK,
  JT_COUNTS_AS_WORK_INTERVAL,
  buildDayProvenance,
  attachAuditCurrentEvidence,
  computeEffectiveStats,
  evaluateAnnualTarget,
  hoursToMinutes,
  projectCurrentCalendarRows,
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

  it('JT counts as a work interval but never double counts', () => {
    expect(JT_COUNTS_AS_WORK_INTERVAL).toBe(true);
  });

  it('standalone JT 08-15 is 7h of LEGACY_UNCLASSIFIED_WORK with shift_lead duty (not Regular)', () => {
    const day = resolveDay('2026-04-01', [row('2026-04-01', 'JT', '08:00', '15:00')]);
    expect(day.status).toBe('WORK');
    expect(day.minutes.work).toBe(420);
    expect(day.minutes.unclassified).toBe(420);
    expect(day.minutes.regular).toBe(0);
    expect(day.minutes.duty).toBe(420);
    expect(day.dutyRole).toBe('shift_lead');
    const s = stats([row('2026-04-01', 'JT', '08:00', '15:00')]);
    expect(s.total.effectiveMinutes).toBe(420);
    expect(s.total.unclassifiedWorkMinutes).toBe(420);
    expect(s.total.dutyMinutes).toBe(420);
    expect(s.total.dutyDays).toBe(1);
    expect(s.total.regularMinutes).toBe(0);
    expect(s.unresolvedDays).toBe(0);
  });

  it('Regular 17-01 + identical JT = 8h effective, not 16h', () => {
    const s = stats([
      row('2026-03-03', 'Regular', '17:00', '01:00'),
      row('2026-03-03', 'JT', '17:00', '01:00'),
    ]);
    expect(s.total.effectiveMinutes).toBe(480);
    expect(s.total.regularMinutes).toBe(480);
    expect(s.total.unclassifiedWorkMinutes).toBe(0);
    expect(s.total.dutyMinutes).toBe(480);
  });

  it('keeps the JT duty envelope (8h) over Regular 7h + Extras 1h', () => {
    const s = stats([
      row('2026-02-06', 'Regular', '13:00', '20:00'),
      row('2026-02-06', 'Extras', '20:00', '21:00'),
      row('2026-02-06', 'JT', '13:00', '21:00', { effectiveState: 'METADATA_ONLY' }),
    ]);
    expect(s.total.effectiveMinutes).toBe(480);
    expect(s.total.dutyMinutes).toBe(480);
  });

  it('partial overlap: union duration plus a non-blocking warning', () => {
    const day = resolveDay('2026-03-20', [
      row('2026-03-20', 'Regular', '13:00', '20:00'),
      row('2026-03-20', 'JT', '13:00', '21:00', { effectiveState: 'METADATA_ONLY' }),
    ]);
    expect(day.minutes.work).toBe(480);
    expect(day.minutes.regular).toBe(420);
    expect(day.minutes.unclassified).toBe(60);
    expect(day.issues.find((i) => i.code === 'DUTY_INTERVAL_PARTIAL_OVERLAP')?.blocking).toBe(false);
  });

  it('JT on a Libre day adds no hours', () => {
    const day = resolveDay('2026-04-02', [
      row('2026-04-02', 'Libre', null, null),
      row('2026-04-02', 'JT', '13:00', '21:00', { effectiveState: 'METADATA_ONLY' }),
    ]);
    expect(day.minutes.work).toBe(0);
    expect(day.status).toBe('LIBRE');
  });

  it('a JT without usable times stays flagged instead of inventing hours', () => {
    const s = stats([row('2026-04-03', 'JT', null, null)]);
    expect(s.total.effectiveMinutes).toBe(0);
    expect(s.unresolved[0].issues).toEqual(['DUTY_ROLE_WITHOUT_WORK']);
  });
});

describe('legacy layer metadata', () => {
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
    expect(history.current.map((r) => r.shiftType)).toEqual(['Regular']);
    expect(history.proposed).toEqual([]);
    expect(history.effective).toHaveLength(1);
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

  it('counts a valid EFFECTIVE baseline once while retaining its review issue', () => {
    const rows = [
      row('2026-01-14', 'Regular', '06:00', '11:00', { effectiveState: 'EFFECTIVE' }),
      row('2026-01-14', 'Extras', '11:00', '13:00', { effectiveState: 'EFFECTIVE' }),
      row('2026-01-14', 'Regular', '06:00', '11:00', { effectiveState: 'REQUIRES_REVIEW' }),
    ];
    const day = resolveDay('2026-01-14', rows);
    const result = stats(rows, { today: '2026-01-15' });
    expect(day).toMatchObject({ status: 'REQUIRES_REVIEW', requiresReview: true, countedProvisionally: true, provisionalReason: 'CURRENT_EFFECTIVE' });
    expect(result.realized.effectiveMinutes).toBe(420);
    expect(result.realized.regularMinutes).toBe(300);
    expect(result.realized.extrasMinutes).toBe(120);
    expect(result.byType).toEqual({ Regular: 300, Extras: 120 });
    expect(result.provisionalReviewDays).toBe(1);
    expect(result.unresolvedDays).toBe(1);
  });

  it('uses the oldest legacy candidate without consulting plan revisions or layer metadata', () => {
    const rows = [
      row('2026-02-01', 'Regular', '17:00', '01:00', { layer: 'CHANGE', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-10-16T00:00:00Z' }),
      row('2026-02-01', 'Regular', '16:00', '00:00', { layer: 'COMPANY_PLAN', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-10-11T00:00:00Z' }),
    ];
    const result = computeEffectiveStats(rows, { today: '2026-02-02' });
    expect(result.total.effectiveMinutes).toBe(480);
    expect(result.total.regularMinutes).toBe(480);
    expect(result.provisionalReviewMinutes).toBe(480);
    expect(result.days[0]).toMatchObject({ status: 'REQUIRES_REVIEW', countedProvisionally: true, provisionalReason: 'LEGACY_OLDEST_FALLBACK' });
  });

  it('fails closed when pending alternatives have no temporal evidence', () => {
    const rows = [
      row('2026-03-03', 'Regular', '08:00', '16:00', { effectiveState: 'REQUIRES_REVIEW' }),
      row('2026-03-03', 'Regular', '09:00', '15:00', { effectiveState: 'REQUIRES_REVIEW' }),
    ];
    const result = stats(rows, { today: '2026-03-04' });
    expect(result.total.effectiveMinutes).toBe(0);
    expect(result.unresolvedUncountedDays).toBe(1);
    expect(result.days[0]).toMatchObject({ status: 'REQUIRES_REVIEW', requiresReview: true, countedProvisionally: false, provisionalReason: 'MISSING_CREATED_AT' });
  });

  it('fails closed on exact created_at ties without lineage evidence', () => {
    const createdAt = '2026-10-11T10:00:00.000Z';
    const result = stats([
      row('2026-05-17', 'Extras', '05:00', '13:00', { effectiveState: 'REQUIRES_REVIEW', createdAt }),
      row('2026-05-17', 'Libre', null, null, { effectiveState: 'REQUIRES_REVIEW', createdAt }),
    ]);
    expect(result.days[0]).toMatchObject({ countedProvisionally: false, provisionalReason: 'AMBIGUOUS_TIMESTAMP_TIE' });
    expect(result.total.effectiveMinutes).toBe(0);
  });

  it('counts a pending legacy JT interval provisionally as Regular once', () => {
    const result = stats([
      row('2026-07-17', 'JT', '17:00', '01:00', { effectiveState: 'EFFECTIVE' }),
      row('2026-07-17', 'Regular', '16:00', '00:00', { effectiveState: 'REQUIRES_REVIEW' }),
    ]);
    expect(result.days[0]).toMatchObject({ countedProvisionally: true, provisionalReason: 'LEGACY_JT_AS_REGULAR' });
    expect(result.total.regularMinutes).toBe(480);
    expect(result.total.effectiveMinutes).toBe(480);
  });

  it('uses the oldest coherent multirow legacy state as current', () => {
    const result = stats([
      row('2026-05-17', 'Regular', '06:00', '12:00', { effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-10-11T00:00:00Z', importId: 'batch-a' }),
      row('2026-05-17', 'Extras', '12:00', '14:00', { effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-10-11T00:00:00Z', importId: 'batch-a' }),
      row('2026-05-17', 'Regular', '07:00', '13:00', { effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-10-16T00:00:00Z', importId: 'batch-b' }),
    ]);
    expect(result.days[0]).toMatchObject({ countedProvisionally: true, provisionalReason: 'LEGACY_OLDEST_FALLBACK' });
    expect(result.total.effectiveMinutes).toBe(480);
  });

  it('uses an audited after-state before the proposal as current', () => {
    const rows = [
      row('2026-04-23', 'Vacaciones', null, null, { id: 'vac', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-10-16T00:00:00Z' }),
      row('2026-04-23', 'Libre', null, null, { id: 'free', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-10-16T00:00:00Z' }),
    ];
    const audited = attachAuditCurrentEvidence(rows, [{ date: '2026-04-23', createdAt: '2026-10-15T00:00:00Z', afterState: [{ id: 'vac' }] }]);
    const day = resolveDay('2026-04-23', audited);
    expect(day).toMatchObject({ countedProvisionally: true, provisionalReason: 'AUDIT_CURRENT' });
    expect(stats(audited).total.vacationDays).toBe(1);
  });

  it('keeps future pending baseline in planned and exposes its bucket metadata', () => {
    const rows = [row('2026-11-05', 'Regular', '09:00', '17:00', { effectiveState: 'EFFECTIVE' }), row('2026-11-05', 'Regular', '10:00', '18:00', { effectiveState: 'REQUIRES_REVIEW' })];
    const result = stats(rows, { today: '2026-10-19' });
    expect(result.realized.effectiveMinutes).toBe(0);
    expect(result.planned.effectiveMinutes).toBe(480);
    expect(result.realizedProvisionalReviewDays).toBe(0);
    expect(result.plannedProvisionalReviewDays).toBe(1);
    expect(result.plannedProvisionalReviewMinutes).toBe(480);
  });

  it('keeps JT as duty metadata and never adds it as a second provisional shift', () => {
    const rows = [
      row('2026-05-01', 'Regular', '08:00', '16:00', { effectiveState: 'EFFECTIVE' }),
      row('2026-05-01', 'Regular', '08:00', '16:00', { effectiveState: 'REQUIRES_REVIEW' }),
      row('2026-05-01', 'JT', '08:00', '16:00', { effectiveState: 'METADATA_ONLY' }),
    ];
    const result = stats(rows, { today: '2026-05-02' });
    expect(result.total.effectiveMinutes).toBe(480);
    expect(result.total.regularMinutes).toBe(480);
    expect(result.total.unclassifiedWorkMinutes).toBe(0);
    expect(result.days[0].legacyDutyRows).toBe(1);
  });

  it('counts pending full-day type without adding the alternative type', () => {
    const rows = [row('2026-04-01', 'Vacaciones', null, null, { effectiveState: 'EFFECTIVE' }), row('2026-04-01', 'Libre', null, null, { effectiveState: 'REQUIRES_REVIEW' })];
    const result = stats(rows, { today: '2026-04-02' });
    expect(result.total.vacationDays).toBe(1);
    expect(result.total.freeDays).toBe(0);
    const resolved = stats([row('2026-04-01', 'Libre', null, null, { effectiveState: 'EFFECTIVE' })], { today: '2026-04-02' });
    expect(resolved.total.vacationDays).toBe(0);
    expect(resolved.total.freeDays).toBe(1);
    expect(resolved.total.effectiveMinutes - result.total.effectiveMinutes).toBe(0);
  });

  it('switching a provisional Extras baseline to Libre changes work by exactly the alternative delta', () => {
    const pending = stats([
      row('2026-04-02', 'Extras', '21:00', '02:00', { effectiveState: 'EFFECTIVE' }),
      row('2026-04-02', 'Libre', null, null, { effectiveState: 'REQUIRES_REVIEW' }),
    ], { today: '2026-04-03' });
    const resolved = stats([row('2026-04-02', 'Libre', null, null, { effectiveState: 'EFFECTIVE' })], { today: '2026-04-03' });
    expect(pending.total).toMatchObject({ extrasMinutes: 300, workedDays: 1, freeDays: 0 });
    expect(resolved.total).toMatchObject({ extrasMinutes: 0, workedDays: 0, freeDays: 1 });
    expect(resolved.total.effectiveMinutes - pending.total.effectiveMinutes).toBe(-300);
  });

  it('does not account a structural conflict just because the day also has a review row', () => {
    const rows = [
      row('2026-04-03', 'Regular', '08:00', '14:00', { effectiveState: 'EFFECTIVE' }),
      row('2026-04-03', 'Extras', '13:00', '16:00', { effectiveState: 'EFFECTIVE' }),
      row('2026-04-03', 'Libre', null, null, { effectiveState: 'REQUIRES_REVIEW' }),
    ];
    const result = stats(rows, { today: '2026-04-04' });
    expect(result.total.effectiveMinutes).toBe(0);
    expect(result.unresolvedUncountedDays).toBe(1);
    expect(result.unresolved[0].status).toBe('REQUIRES_REVIEW');
  });

  it('legacy layer values do not choose the current calendar state', () => {
    const rows = [
      plan('Regular', '12:00', '20:00', { planRevision: 1, effectiveState: 'SUPERSEDED' }),
      row('2026-01-01', 'Regular', '11:00', '19:00', { layer: 'CHANGE', planRevision: 1 }),
    ];
    expect(buildDayProvenance(rows).current.map((r) => r.startTime)).toEqual(['11:00']);
    expect(buildDayProvenance(rows).proposed).toEqual([]);
  });

  it('projects the 2026-01-07 JT baseline once and excludes both proposed rows', () => {
    const current = row('2026-01-07', 'JT', '17:00', '01:00', { id: 'jt-current', effectiveState: 'EFFECTIVE', dutyRole: 'shift_lead' });
    const projected = projectCurrentCalendarRows([
      current,
      row('2026-01-07', 'Regular', '17:00', '01:00', { id: 'proposal-same', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-01-08T10:00:00Z' }),
      row('2026-01-07', 'Regular', '16:00', '00:00', { id: 'proposal-other', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-01-09T10:00:00Z' }),
    ]);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ id: 'jt-current', shiftType: 'Regular', startTime: '17:00', endTime: '01:00', dutyRole: 'shift_lead' });
  });

  it('projects both 2026-01-14 CURRENT intervals and excludes the matching proposed row', () => {
    const projected = projectCurrentCalendarRows([
      row('2026-01-14', 'Regular', '06:00', '11:00', { id: 'regular-current', effectiveState: 'EFFECTIVE' }),
      row('2026-01-14', 'Extras', '11:00', '13:00', { id: 'extras-current', effectiveState: 'EFFECTIVE' }),
      row('2026-01-14', 'Regular', '06:00', '11:00', { id: 'regular-proposed', effectiveState: 'REQUIRES_REVIEW' }),
    ]);
    expect(projected.map((item) => item.id)).toEqual(['regular-current', 'extras-current']);
  });

  it('fails closed for ambiguous pending rows and never projects proposed-only data as CURRENT', () => {
    const proposed = [
      row('2026-03-03', 'Regular', '08:00', '16:00', { id: 'p1', effectiveState: 'REQUIRES_REVIEW' }),
      row('2026-03-03', 'Regular', '09:00', '15:00', { id: 'p2', effectiveState: 'REQUIRES_REVIEW' }),
    ];
    expect(projectCurrentCalendarRows(proposed)).toEqual([]);
  });

  it('uses AUDIT_CURRENT evidence as the shared operational projection', () => {
    const rows = [
      row('2026-03-04', 'Regular', '08:00', '16:00', { id: 'audit-current', effectiveState: 'REQUIRES_REVIEW', currentEvidence: true }),
      row('2026-03-04', 'Regular', '09:00', '17:00', { id: 'proposal', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-03-05T10:00:00Z' }),
    ];
    expect(projectCurrentCalendarRows(rows).map((item) => item.id)).toEqual(['audit-current']);
  });

  it('uses the oldest coherent review state and preserves its source row IDs', () => {
    const rows = [
      row('2026-03-05', 'Regular', '08:00', '16:00', { id: 'older-a', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-03-01T10:00:00Z', changeId: 'old-change' }),
      row('2026-03-05', 'Extras', '16:00', '18:00', { id: 'older-b', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-03-01T10:00:00Z', changeId: 'old-change' }),
      row('2026-03-05', 'Regular', '10:00', '18:00', { id: 'newer', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-03-02T10:00:00Z', changeId: 'new-change' }),
    ];
    expect(projectCurrentCalendarRows(rows).map((item) => item.id)).toEqual(['older-a', 'older-b']);
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

describe('annual target without calendar data', () => {
  const target = { minimumAnnualMinutes: hoursToMinutes(1529), maximumAnnualMinutes: hoursToMinutes(1540) };

  it('zero calendar rows is NO_DATA, not BELOW_MINIMUM', () => {
    const empty = stats([], { from: '2025-01-01', to: '2025-12-31', today: '2026-10-16' });
    expect(empty.calendarRows).toBe(0);
    const evaluation = evaluateAnnualTarget(empty.realized.effectiveMinutes, target, { calendarRows: empty.calendarRows });
    expect(evaluation.status).toBe('NO_DATA');
    expect(evaluation.minimumMinutes).toBe(hoursToMinutes(1529));
    expect(evaluation.missingToMinimumMinutes).toBeUndefined();
  });

  it('rows present keep the normal evaluation; unconfigured stays UNCONFIGURED', () => {
    const some = stats([row('2026-03-02', 'Regular', '08:00', '16:00')]);
    expect(evaluateAnnualTarget(some.total.effectiveMinutes, target, { calendarRows: some.calendarRows }).status).toBe('BELOW_MINIMUM');
    expect(evaluateAnnualTarget(0, null, { calendarRows: 0 }).status).toBe('UNCONFIGURED');
  });
});

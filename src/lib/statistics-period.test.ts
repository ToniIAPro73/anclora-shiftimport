import { describe, expect, it } from 'vitest';
import { getStatisticsMonthRelation, statsBucketHasData } from './statistics-period';
import { computeEffectiveStats } from './effective-calendar.js';

describe('getStatisticsMonthRelation', () => {
  it('classifies months around today without using the machine clock', () => {
    expect(getStatisticsMonthRelation(2026, 8, '2026-10-19')).toBe('PAST');
    expect(getStatisticsMonthRelation(2026, 9, '2026-10-19')).toBe('CURRENT');
    expect(getStatisticsMonthRelation(2026, 10, '2026-10-19')).toBe('FUTURE');
  });

  it('compares correctly across year boundaries', () => {
    expect(getStatisticsMonthRelation(2025, 11, '2026-01-10')).toBe('PAST');
    expect(getStatisticsMonthRelation(2026, 0, '2025-12-10')).toBe('FUTURE');
    expect(getStatisticsMonthRelation(2026, 11, '2027-01-10')).toBe('PAST');
    expect(getStatisticsMonthRelation(2027, 0, '2026-12-10')).toBe('FUTURE');
  });

  it('leaves the effective-calendar realized/planned boundary unchanged', () => {
    const rows = [
      { date: '2026-10-18', shiftType: 'Regular', startTime: '08:00', endTime: '14:00' },
      { date: '2026-10-19', shiftType: 'Regular', startTime: '08:00', endTime: '14:00' },
      { date: '2026-11-04', shiftType: 'Regular', startTime: '08:00', endTime: '14:00' },
    ];
    const stats = computeEffectiveStats(rows, { from: '2026-11-01', to: '2026-11-30', today: '2026-10-19' });
    expect(stats.realized.effectiveMinutes).toBe(0);
    expect(stats.planned.effectiveMinutes).toBe(360);
    expect(stats.planned.regularMinutes).toBe(360);
    expect(stats.planned.workedDays).toBe(1);
  });

  it('treats zero-hour leave/day buckets as calendar data', () => {
    expect(statsBucketHasData({
      effectiveMinutes: 0, regularMinutes: 0, extrasMinutes: 0, otherWorkMinutes: 0,
      unclassifiedWorkMinutes: 0, absenceMinutes: 0, dutyMinutes: 0, dutyDays: 0,
      workedDays: 0, freeDays: 0, vacationDays: 1, sickLeaveDays: 0,
    })).toBe(true);
  });
});

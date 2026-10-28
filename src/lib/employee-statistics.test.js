import { describe, expect, it } from 'vitest';
import { applyEmployeeStatisticsPolicy, employeeTargetMinutes, usesRegularOnlyStatistics } from './employee-statistics.js';

const bucket = { effectiveMinutes: 600, regularMinutes: 480, extrasMinutes: 120, byType: { Regular: 480, Extras: 120 } };

describe('annual target shift type accounting', () => {
  it('counts only the selected shift types in totals while keeping per-type counters intact', () => {
    expect(usesRegularOnlyStatistics(['Regular'])).toBe(true);
    expect(applyEmployeeStatisticsPolicy(bucket, ['Regular'])).toEqual({ ...bucket, effectiveMinutes: 480 });
    expect(employeeTargetMinutes(bucket, ['Regular'])).toBe(480);
    expect(bucket.extrasMinutes).toBe(120);
  });

  it('sums multiple selected types and leaves totals unchanged when no objective types are configured', () => {
    expect(usesRegularOnlyStatistics(['Regular', 'Extras'])).toBe(false);
    expect(employeeTargetMinutes(bucket, ['Regular', 'Extras'])).toBe(600);
    expect(applyEmployeeStatisticsPolicy(bucket, null)).toBe(bucket);
    expect(employeeTargetMinutes(bucket, null)).toBe(600);
  });
});

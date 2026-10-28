import { describe, expect, it } from 'vitest';
import { applyEmployeeStatisticsPolicy, employeeTargetMinutes, usesRegularOnlyStatistics } from './employee-statistics.js';

const bucket = { effectiveMinutes: 600, regularMinutes: 480, extrasMinutes: 120 };
const SOURCE_ORG = 'a4cf0768-f08d-49e6-bb81-0d3635d58028';
const QA_ORG = 'a908c138-495a-4e1c-9449-867a1f4cd984';

describe('employee-specific statistics policy', () => {
  it('excludes Extras from Sebastian (external employee ID 84881) totals and target, while retaining the Extras counter', () => {
    expect(usesRegularOnlyStatistics('84881', SOURCE_ORG)).toBe(true);
    expect(usesRegularOnlyStatistics('84881', QA_ORG)).toBe(true);
    expect(applyEmployeeStatisticsPolicy(bucket, '84881', SOURCE_ORG)).toEqual({ ...bucket, effectiveMinutes: 480 });
    expect(employeeTargetMinutes(bucket, '84881', SOURCE_ORG)).toBe(480);
  });

  it('leaves every other employee total and annual target unchanged', () => {
    expect(usesRegularOnlyStatistics('84882', SOURCE_ORG)).toBe(false);
    expect(usesRegularOnlyStatistics('84881', 'other-organization')).toBe(false);
    expect(applyEmployeeStatisticsPolicy(bucket, '84882', SOURCE_ORG)).toBe(bucket);
    expect(employeeTargetMinutes(bucket, '84882', SOURCE_ORG)).toBe(600);
  });
});

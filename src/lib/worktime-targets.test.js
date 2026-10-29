import { describe, expect, it } from 'vitest';
import { evaluateWorktimeTarget, resolveWorktimeTargets, validateWorktimeTarget } from './worktime-targets.js';

const base = {
  id: 'v1', organizationId: 'org', employeeId: 'employee', targetKind: 'CONTRACTUAL', periodType: 'ANNUAL',
  periodStart: '2026-01-01', periodEnd: '2026-12-31', effectiveFrom: '2026-01-01', revision: 1,
  minimumMinutes: 91740, targetMinutes: null, maximumMinutes: 92400, includedWorkBuckets: ['Regular'], createdAt: '2026-01-01T00:00:00Z',
};

describe('versioned worktime targets', () => {
  it('validates range, exact and centered targets in integer minutes', () => {
    expect(validateWorktimeTarget(base).maximumMinutes).toBe(92400);
    expect(validateWorktimeTarget({ ...base, minimumMinutes: 102720, targetMinutes: 102720, maximumMinutes: 102720 }).targetMinutes).toBe(102720);
    expect(validateWorktimeTarget({ ...base, minimumMinutes: 90000, targetMinutes: 91200, maximumMinutes: 92400 }).targetMinutes).toBe(91200);
    expect(() => validateWorktimeTarget({ ...base, minimumMinutes: 92401 })).toThrow();
    expect(() => validateWorktimeTarget({ ...base, periodType: 'WEEKLY' })).toThrow();
    expect(validateWorktimeTarget({ ...base, periodType: 'MONTHLY', periodStart: '2026-02-01', periodEnd: '2026-02-28' }).periodEnd).toBe('2026-02-28');
    expect(validateWorktimeTarget({ ...base, periodType: 'WEEKLY', periodStart: '2026-02-02', periodEnd: '2026-02-08' }).periodType).toBe('WEEKLY');
    expect(validateWorktimeTarget({ ...base, periodType: 'CUSTOM', periodStart: '2026-02-03', periodEnd: '2026-02-14' }).periodType).toBe('CUSTOM');
    expect(() => validateWorktimeTarget({ ...base, periodType: 'MONTHLY', periodStart: '2026-02-01', periodEnd: '2026-02-27' })).toThrow();
  });

  it('resolves history, same-day revision ordering, and scheduled future revisions deterministically', () => {
    const v2 = { ...base, id: 'v2', revision: 2, effectiveFrom: '2026-03-01', maximumMinutes: 93000 };
    const v3 = { ...base, id: 'v3', revision: 3, effectiveFrom: '2026-11-01', maximumMinutes: 94000 };
    expect(resolveWorktimeTargets([base, v2, v3], { asOf: '2026-02-15' })[0].id).toBe('v1');
    expect(resolveWorktimeTargets([base, v2, v3], { asOf: '2026-03-15' })[0].id).toBe('v2');
    expect(resolveWorktimeTargets([base, v2, v3], { asOf: '2026-10-28' })[0].id).toBe('v2');
    expect(resolveWorktimeTargets([base, v2, v3], { asOf: '2026-11-02' })[0].id).toBe('v3');
  });

  it('rejects overlapping distinct target series while allowing contractual and operational targets together', () => {
    const operational = { ...base, id: 'op', targetKind: 'OPERATIONAL', periodType: 'WEEKLY', periodStart: '2026-02-02', periodEnd: '2026-02-08' };
    expect(resolveWorktimeTargets([base, operational], { asOf: '2026-02-04' })).toHaveLength(2);
    const conflict = { ...operational, targetKind: 'CONTRACTUAL' };
    expect(() => resolveWorktimeTargets([base, conflict], { asOf: '2026-02-04' })).toThrow(/ambiguous/i);
  });

  it('calculates balance from realized and planned work without changing target revisions', () => {
    expect(evaluateWorktimeTarget({ target: base, realizedMinutes: 70000, plannedMinutes: 21000, asOf: '2026-10-01' })).toMatchObject({
      projectedMinutes: 91000, remainingToMinimumFromRealized: 21740, projectedGapToMinimum: 740, projectedExcessOverMaximum: 0,
    });
    expect(evaluateWorktimeTarget({ target: null }).status).toBe('UNCONFIGURED');
  });

  it('keeps balance revisions outside the immutable target series', () => {
    const balanceOnly = evaluateWorktimeTarget({ target: base, realizedMinutes: 70000, plannedMinutes: 22000, asOf: '2026-10-01' });
    expect(balanceOnly.projectedMinutes).toBe(92000);
    expect(resolveWorktimeTargets([base], { asOf: '2026-10-01' })).toHaveLength(1);
  });
});

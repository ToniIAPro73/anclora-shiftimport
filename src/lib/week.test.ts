import { describe, expect, it } from 'vitest';
import { getFirstWeekdayOfMonth, orderWeekdayLabels } from './week';
import { getWeekStartsOn } from './i18n';

describe('locale week-start policy', () => {
  it('es and en (en-GB) both start the week on Monday', () => {
    expect(getWeekStartsOn('es')).toBe(1);
    expect(getWeekStartsOn('en')).toBe(1);
  });

  it('getFirstWeekdayOfMonth defaults to Monday-start and matches an explicit weekStartsOn=1', () => {
    // 2026-08-01 is a Saturday -> index 5 in a Monday-first week (Mo=0..Su=6).
    expect(getFirstWeekdayOfMonth(2026, 7)).toBe(5);
    expect(getFirstWeekdayOfMonth(2026, 7, 1)).toBe(5);
  });

  it('a Sunday-first policy (future en-US) would shift the same date to a different index', () => {
    // Same 2026-08-01 Saturday -> index 6 in a Sunday-first week (Su=0..Sa=6).
    expect(getFirstWeekdayOfMonth(2026, 7, 0)).toBe(6);
  });

  it('handles another month start (2026-09-01 is a Tuesday -> index 1 Monday-first)', () => {
    expect(getFirstWeekdayOfMonth(2026, 8)).toBe(1);
  });
});

describe('orderWeekdayLabels', () => {
  const sundayFirst = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

  it('reorders a Sunday-first list to Monday-first (weekStartsOn=1)', () => {
    expect(orderWeekdayLabels(sundayFirst, 1)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
  });

  it('leaves a Sunday-first list unchanged for weekStartsOn=0', () => {
    expect(orderWeekdayLabels(sundayFirst, 0)).toEqual(sundayFirst);
  });

  it('produces the expected ES and EN Monday-first headers', () => {
    expect(orderWeekdayLabels(['D', 'L', 'M', 'X', 'J', 'V', 'S'], 1)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    expect(orderWeekdayLabels(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], 1)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  });
});

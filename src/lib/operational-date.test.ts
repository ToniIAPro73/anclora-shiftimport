import { describe, expect, it } from 'vitest';
import { getOperationalDate, isHistoricalDate } from './operational-date';

describe('operational date', () => {
  it('uses the operational timezone instead of the UTC calendar boundary', () => {
    expect(getOperationalDate(new Date('2026-09-06T22:30:00.000Z'))).toBe('2026-09-07');
  });

  it('defines manual history as strictly before today', () => {
    expect(isHistoricalDate('2026-09-05', '2026-09-06')).toBe(true);
    expect(isHistoricalDate('2026-09-06', '2026-09-06')).toBe(false);
    expect(isHistoricalDate('2026-09-07', '2026-09-06')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { getOperationalDate, isHistoricalDate } from './operational-date.js';

describe('API operational date', () => {
  it('matches the browser timezone boundary', () => {
    expect(getOperationalDate(new Date('2026-09-06T22:30:00.000Z'))).toBe('2026-09-07');
  });

  it('accepts only dates before today as historical', () => {
    expect(isHistoricalDate('2026-09-05', '2026-09-06')).toBe(true);
    expect(isHistoricalDate('2026-09-06', '2026-09-06')).toBe(false);
  });
});

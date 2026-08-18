import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  aggregateWeeklyStats,
  computeShiftCategory,
  enrichShift,
  getShiftOrigin,
  getShiftType,
  hasShiftTimes,
  isZeroDurationShift,
} from './shifts';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from './shift-types';
import { normalizeShift } from './storage';
import { Shift } from './types';

setupLocalStorageMock();

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 's1',
  date: '2026-08-01',
  startTime: '08:00',
  endTime: '14:00',
  location: '',
  origin: 'MAN',
  ...overrides,
});

describe('getShiftType', () => {
  it('derives type from the location label', () => {
    expect(getShiftType(shift({ location: 'Libre' }))).toBe('Libre');
    expect(getShiftType(shift({ location: 'Vacaciones' }))).toBe('Vacaciones');
  });

  it('falls back to Libre when no times and no label', () => {
    expect(getShiftType(shift({ startTime: '', endTime: '' }))).toBe('Libre');
  });

  it('falls back to Regular for timed shifts', () => {
    expect(getShiftType(shift({ startTime: '17:00', endTime: '01:00' }))).toBe('Regular');
  });

  it('resolves company-specific labels only when the preset is loaded', () => {
    expect(getShiftType(shift({ location: 'JT' }))).toBe('Regular');
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    expect(getShiftType(shift({ location: 'JT' }))).toBe('JT');
  });
});

describe('computeShiftCategory', () => {
  it('maps Mañana / Tarde / Noche bands', () => {
    expect(computeShiftCategory('08:00')).toBe('Mañana');
    expect(computeShiftCategory('13:59')).toBe('Mañana');
    expect(computeShiftCategory('14:00')).toBe('Tarde');
    expect(computeShiftCategory('21:59')).toBe('Tarde');
    expect(computeShiftCategory('22:00')).toBe('Noche');
    expect(computeShiftCategory('06:00')).toBe('Noche');
  });
});

describe('enrichShift', () => {
  it('computes overnight duration', () => {
    const enriched = enrichShift(shift({ startTime: '22:00', endTime: '06:00' }));
    expect(enriched.duration).toBe(8);
    expect(enriched.category).toBe('Noche');
  });

  it('zeroes duration for non-work types', () => {
    const enriched = enrichShift(shift({ startTime: '', endTime: '', location: 'Libre' }));
    expect(enriched.duration).toBe(0);
  });
});

describe('hasShiftTimes / isZeroDurationShift / getShiftOrigin', () => {
  it('distinguishes timed and untimed shifts', () => {
    expect(hasShiftTimes(shift({ startTime: '08:00', endTime: '14:00' }))).toBe(true);
    expect(hasShiftTimes(shift({ startTime: '', endTime: '' }))).toBe(false);
  });

  it('treats Libre as zero duration and imported origin as IMP', () => {
    expect(isZeroDurationShift(shift({ startTime: '', endTime: '', location: 'Libre' }))).toBe(true);
    expect(getShiftOrigin(shift({ origin: 'MAN' }))).toBe('MAN');
    expect(getShiftOrigin(shift({ origin: 'IMP' }))).toBe('IMP');
  });

  it('normalizes legacy persisted PDF origin to the generic import origin', () => {
    const legacy = { ...shift({}), origin: 'PDF' } as unknown as Shift;
    expect(getShiftOrigin(legacy)).toBe('IMP');
    expect(normalizeShift(legacy).origin).toBe('IMP');
  });
});

describe('aggregateWeeklyStats', () => {
  it('sums worked hours and free days for a week', () => {
    const week = [
      shift({ id: 'a', date: '2026-08-01', startTime: '08:00', endTime: '14:00' }),
      shift({ id: 'b', date: '2026-08-01', startTime: '22:00', endTime: '06:00' }),
      shift({ id: 'c', date: '2026-08-02', startTime: '', endTime: '', location: 'Libre' }),
    ];
    const stats = aggregateWeeklyStats(week, 7);
    expect(stats.totalWorkedHours).toBe(14);
    expect(stats.totalWorkedDays).toBe(2);
    expect(stats.hoursByType.Regular).toBe(14);
    expect(stats.freeDays).toBe(6);
  });
});

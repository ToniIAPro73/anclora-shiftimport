import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  aggregateWeeklyStats,
  computeShiftCategory,
  enrichShift,
  getAssignmentShiftType,
  getShiftOrigin,
  getShiftType,
  hasShiftTimes,
  isZeroDurationShift,
  preserveShiftTimesOnTypeChange,
} from './shifts';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE, upsertShiftType } from './shift-types';
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

  it('uses an explicit configured shift type independently from location', () => {
    expect(getShiftType(shift({ shiftType: 'Vacaciones', location: 'Hotel' }))).toBe('Vacaciones');
  });

  it('uses countsAsWork for custom non-working types without special-casing their label', () => {
    upsertShiftType({ id: 'Festivo', label: 'Festivo', shortLabel: 'Festivo', color: '#111111', countsAsWork: false });
    expect(isZeroDurationShift(shift({ shiftType: 'Festivo', startTime: '', endTime: '', location: 'Festivo' }))).toBe(true);
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

  it('counts a temporal absence as absence hours, never as worked hours or a free day', () => {
    const stats = aggregateWeeklyStats([
      shift({ id: 'regular-a', date: '2026-09-01', startTime: '08:00', endTime: '11:00', shiftType: 'Regular' }),
      shift({ id: 'absence', date: '2026-09-01', startTime: '11:00', endTime: '12:00', shiftType: 'Ausencia', countsAsWork: false, location: 'Ausencia' }),
      shift({ id: 'regular-b', date: '2026-09-01', startTime: '12:00', endTime: '16:00', shiftType: 'Regular' }),
    ], 1);

    expect(stats.totalWorkedHours).toBe(7);
    expect(stats.totalAbsenceHours).toBe(1);
    expect(stats.hoursByType.Regular).toBe(7);
    expect(stats.hoursByType.Ausencia).toBe(1);
    expect(stats.freeDays).toBe(0);
  });
});

describe('getAssignmentShiftType', () => {
  it('resolves explicit canonical and custom shift types', () => {
    expect(getAssignmentShiftType({ shiftType: 'Regular', startTime: '09:00', endTime: '17:00' })).toBe('Regular');
    expect(getAssignmentShiftType({ shiftType: 'Libre' })).toBe('Libre');
    expect(getAssignmentShiftType({ shiftType: 'Vacaciones' })).toBe('Vacaciones');

    upsertShiftType({ id: 'Baja', label: 'Baja', shortLabel: 'Baja', color: '#8b5cf6', countsAsWork: false });
    expect(getAssignmentShiftType({ shiftType: 'Baja' })).toBe('Baja');
  });

  it('falls back to Libre when no times and no type are present', () => {
    expect(getAssignmentShiftType({})).toBe('Libre');
    expect(getAssignmentShiftType({ startTime: null, endTime: null })).toBe('Libre');
  });

  it('falls back to Regular when times are present without explicit type', () => {
    expect(getAssignmentShiftType({ startTime: '09:00', endTime: '17:00' })).toBe('Regular');
  });
});

describe('preserveShiftTimesOnTypeChange', () => {
  it('Caso 1: preserves entered dates and hours when selecting Ausencia', () => {
    const initial = {
      date: '2026-09-20',
      startTime: '13:00',
      endTime: '14:30',
      location: 'Regular',
      shiftType: 'Regular',
    };

    const updated = preserveShiftTimesOnTypeChange(initial, 'Ausencia');
    expect(updated.startTime).toBe('13:00');
    expect(updated.endTime).toBe('14:30');
    expect(updated.date).toBe('2026-09-20');
    expect(updated.shiftType).toBe('Ausencia');
  });

  it('Caso 2: preserves dates and hours when choosing Ausencias', () => {
    upsertShiftType({ id: 'Ausencias', label: 'Ausencias', shortLabel: 'AUS', color: '#f59e0b', countsAsWork: false });
    const initial = {
      date: '2026-09-25',
      startTime: '10:00',
      endTime: '12:00',
      shiftType: 'Regular',
    };

    const updated = preserveShiftTimesOnTypeChange(initial, 'Ausencias');
    expect(updated.startTime).toBe('10:00');
    expect(updated.endTime).toBe('12:00');
    expect(updated.countsAsWork).toBe(false);
  });

  it('Caso 3: preserves interval through sequence Regular -> Ausencia -> Jefe de turno -> Ausencia', () => {
    upsertShiftType({ id: 'JT', label: 'Jefe de turno', shortLabel: 'JT', color: '#a78bfa', countsAsWork: true });
    let current = {
      date: '2026-09-20',
      startTime: '13:00',
      endTime: '14:30',
      shiftType: 'Regular',
      countsAsWork: true,
    };

    // Regular -> Ausencia
    current = preserveShiftTimesOnTypeChange(current, 'Ausencia');
    expect(current.startTime).toBe('13:00');
    expect(current.endTime).toBe('14:30');

    // Ausencia -> Jefe de turno
    current = preserveShiftTimesOnTypeChange(current, 'JT');
    expect(current.startTime).toBe('13:00');
    expect(current.endTime).toBe('14:30');
    expect(current.shiftType).toBe('JT');

    // Jefe de turno -> Ausencia
    current = preserveShiftTimesOnTypeChange(current, 'Ausencia');
    expect(current.startTime).toBe('13:00');
    expect(current.endTime).toBe('14:30');
    expect(current.shiftType).toBe('Ausencia');
  });

  it('Caso 4: editing an existing absence and changing its type does not lose time interval', () => {
    const existingAbsence = {
      id: 'shift-abs-1',
      date: '2026-09-22',
      startTime: '11:00',
      endTime: '13:30',
      shiftType: 'Ausencia',
      countsAsWork: false,
    };

    const changed = preserveShiftTimesOnTypeChange(existingAbsence, 'Regular');
    expect(changed.startTime).toBe('11:00');
    expect(changed.endTime).toBe('13:30');
    expect(changed.date).toBe('2026-09-22');
    expect(changed.id).toBe('shift-abs-1');
  });

  it('Caso 5: preserves overnight absence interval crossing midnight', () => {
    const overnight = {
      date: '2026-09-20',
      startTime: '23:00',
      endTime: '02:00',
      shiftType: 'Regular',
    };

    const updated = preserveShiftTimesOnTypeChange(overnight, 'Ausencia');
    expect(updated.startTime).toBe('23:00');
    expect(updated.endTime).toBe('02:00');
  });

  it('Regression check: never resets startTime or endTime to empty string, null, or undefined when times exist', () => {
    const testCases = ['Ausencia', 'Ausencias', 'Vacaciones', 'Libre', 'Regular', 'CustomNonWork'];
    upsertShiftType({ id: 'CustomNonWork', label: 'Custom Non Work', shortLabel: 'CNW', color: '#999', countsAsWork: false });

    for (const targetType of testCases) {
      const result = preserveShiftTimesOnTypeChange({ startTime: '13:00', endTime: '14:30' }, targetType);
      expect(result.startTime).not.toBe('');
      expect(result.startTime).not.toBeNull();
      expect(result.startTime).not.toBeUndefined();
      expect(result.startTime).toBe('13:00');

      expect(result.endTime).not.toBe('');
      expect(result.endTime).not.toBeNull();
      expect(result.endTime).not.toBeUndefined();
      expect(result.endTime).toBe('14:30');
    }
  });
});

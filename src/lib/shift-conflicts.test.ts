import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { findShiftConflict } from './shift-conflicts';
import { Shift } from './types';

setupLocalStorageMock();

const baseShift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'existing-1',
  date: '2026-08-01',
  startTime: '08:00',
  endTime: '14:00',
  location: '',
  origin: 'MAN',
  ...overrides,
});

describe('findShiftConflict', () => {
  it('returns null when the day is empty', () => {
    expect(findShiftConflict([], baseShift())).toBeNull();
  });

  it('rejects a full-day vacation combined with a timed shift', () => {
    const existing = [baseShift({ id: 'vac', date: '2026-08-01', location: 'Vacaciones', startTime: '', endTime: '' })];
    expect(findShiftConflict(existing, baseShift({ id: 'incoming', startTime: '08:00', endTime: '14:00' }))).toContain('vacaciones');
  });

  it('allows multiple non-overlapping timed records of the same type', () => {
    const existing = [baseShift({ id: 'a', startTime: '08:00', endTime: '14:00' })];
    expect(findShiftConflict(existing, baseShift({ id: 'b', startTime: '14:00', endTime: '22:00' }))).toBeNull();
  });

  it('allows a temporal absence next to a regular interval', () => {
    const absence = baseShift({ id: 'absence', shiftType: 'Ausencia', location: 'Ausencia', startTime: '08:00', endTime: '09:00' });
    expect(findShiftConflict([absence], baseShift({ id: 'regular', startTime: '09:00', endTime: '16:00' }))).toBeNull();
    expect(findShiftConflict([baseShift({ id: 'regular', startTime: '08:00', endTime: '11:00' })], {
      ...absence, id: 'absence-2', startTime: '11:00', endTime: '12:00',
    })).toBeNull();
  });

  it('rejects a real overlap without translating the existing type to Libre', () => {
    const absence = baseShift({ id: 'absence', shiftType: 'Ausencia', location: 'Ausencia', startTime: '08:00', endTime: '10:00' });
    const conflict = findShiftConflict([absence], baseShift({ id: 'regular', startTime: '09:00', endTime: '16:00' }));
    expect(conflict).toBe('Este horario se solapa con otro registro del mismo día.');
    expect(conflict).not.toContain('Libre');
  });

  it('allows two non-overlapping temporal absences', () => {
    const first = baseShift({ id: 'a', shiftType: 'Ausencia', location: 'Ausencia', startTime: '08:00', endTime: '09:00' });
    const second = baseShift({ id: 'b', shiftType: 'Ausencia', location: 'Ausencia', startTime: '10:00', endTime: '11:00' });
    expect(findShiftConflict([first], second)).toBeNull();
  });

  it('rejects two overlapping temporal absences', () => {
    const first = baseShift({ id: 'a', shiftType: 'Ausencia', location: 'Ausencia', startTime: '08:00', endTime: '10:00' });
    const second = baseShift({ id: 'b', shiftType: 'Ausencia', location: 'Ausencia', startTime: '09:00', endTime: '11:00' });
    expect(findShiftConflict([first], second)).toContain('solapa');
  });

  it('blocks overlapping Extras on the same day', () => {
    const existing = [baseShift({ id: 'a', location: 'Extras', startTime: '10:00', endTime: '12:00' })];
    const incoming = baseShift({ id: 'b', location: 'Extras', startTime: '11:00', endTime: '13:00' });
    expect(findShiftConflict(existing, incoming)).toContain('solapa');
  });

  it('allows non-overlapping Extras on the same day', () => {
    const existing = [baseShift({ id: 'a', location: 'Extras', startTime: '10:00', endTime: '12:00' })];
    const incoming = baseShift({ id: 'b', location: 'Extras', startTime: '14:00', endTime: '16:00' });
    expect(findShiftConflict(existing, incoming)).toBeNull();
  });

  it('detects overlap across midnight', () => {
    const existing = [baseShift({ id: 'a', location: 'Extras', startTime: '22:00', endTime: '06:00' })];
    const incoming = baseShift({ id: 'b', location: 'Extras', startTime: '23:00', endTime: '01:00' });
    expect(findShiftConflict(existing, incoming)).toContain('solapa');
  });

  it('ignores shifts of a different origin on the same day', () => {
    const existing = [baseShift({ id: 'a', origin: 'IMP', startTime: '08:00', endTime: '14:00' })];
    const incoming = baseShift({ id: 'b', origin: 'MAN', startTime: '16:00', endTime: '22:00' });
    expect(findShiftConflict(existing, incoming)).toBeNull();
  });
});

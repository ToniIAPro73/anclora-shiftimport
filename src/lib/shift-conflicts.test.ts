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

  it('blocks adding a work shift over existing Vacaciones', () => {
    const existing = [baseShift({ id: 'vac', date: '2026-08-01', location: 'Vacaciones', startTime: '', endTime: '' })];
    expect(findShiftConflict(existing, baseShift({ id: 'incoming', startTime: '08:00', endTime: '14:00' }))).toContain('Vacaciones');
  });

  it('blocks a duplicate of the same type on the same day', () => {
    const existing = [baseShift({ id: 'a', startTime: '08:00', endTime: '14:00' })];
    expect(findShiftConflict(existing, baseShift({ id: 'b', startTime: '16:00', endTime: '22:00' }))).toContain('Ya existe');
  });

  it('blocks Libre combined with a Regular shift', () => {
    const existing = [baseShift({ id: 'a', startTime: '08:00', endTime: '14:00' })];
    const libre = baseShift({ id: 'b', startTime: '', endTime: '', location: 'Libre' });
    expect(findShiftConflict(existing, libre)).toContain('Libre');
  });

  it('blocks Regular combined with Libre', () => {
    const existing = [baseShift({ id: 'a', startTime: '', endTime: '', location: 'Libre' })];
    expect(findShiftConflict(existing, baseShift({ id: 'b', startTime: '08:00', endTime: '14:00' }))).toContain('Libre');
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

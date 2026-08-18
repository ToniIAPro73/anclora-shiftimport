import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { buildShiftEntriesForDay } from './shift-builder';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from '../../lib/shift-types';

setupLocalStorageMock();

const summarize = (shifts: ReturnType<typeof buildShiftEntriesForDay>) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

describe('buildShiftEntriesForDay', () => {
  it('builds a Libre shift for an OFF token', () => {
    expect(summarize(buildShiftEntriesForDay('2026-08-02', ['OFF']))).toEqual([
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
    ]);
  });

  it('builds a Regular shift crossing midnight', () => {
    expect(summarize(buildShiftEntriesForDay('2026-08-01', ['17:00-01:00']))).toEqual([
      { date: '2026-08-01', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', isValid: true },
    ]);
  });

  it('splits a split shift into two entries', () => {
    expect(summarize(buildShiftEntriesForDay('2026-08-04', ['08:00-12:00 -- 16:00-20:00']))).toEqual([
      { date: '2026-08-04', startTime: '08:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
      { date: '2026-08-04', startTime: '16:00', endTime: '20:00', shiftType: 'Regular', isValid: true },
    ]);
  });

  it('marks an odd trailing time as incomplete', () => {
    expect(summarize(buildShiftEntriesForDay('2026-08-03', ['17:00']))).toEqual([
      { date: '2026-08-03', startTime: '17:00', endTime: '??:??', shiftType: 'Regular', isValid: false },
    ]);
  });

  it('returns nothing for an empty cell', () => {
    expect(buildShiftEntriesForDay('2026-08-06', [''])).toEqual([]);
  });

  it('treats company tokens as nothing unless the preset alias is loaded', () => {
    expect(buildShiftEntriesForDay('2026-08-03', ['DL'])).toEqual([]);
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    expect(summarize(buildShiftEntriesForDay('2026-08-03', ['DL']))).toEqual([
      { date: '2026-08-03', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
    ]);
  });
});

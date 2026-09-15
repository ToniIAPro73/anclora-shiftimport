import { describe, expect, it } from 'vitest';
import { assertTimedTypeHasTimes, findAssignmentConflict, getShiftSemantics } from './shift-compatibility.js';

const timed = (id, shiftType, startTime, endTime, countsAsWork = shiftType !== 'Ausencia') => ({
  id, date: '2026-09-01', shift_type: shiftType, start_time: startTime, end_time: endTime, counts_as_work: countsAsWork,
});

describe('authoritative shift compatibility semantics', () => {
  it('models Ausencia as a timed, non-working absence segment', () => {
    expect(getShiftSemantics(timed('a', 'Ausencia', '08:00', '09:00', false))).toEqual({
      type: 'Ausencia', timed: true, allDay: false, exclusive: false,
      contributesWorkedTime: false, contributesAbsenceTime: true,
    });
  });

  it('allows contiguous Regular/Ausencia/Regular segments', () => {
    const rows = [timed('a', 'Regular', '08:00', '11:00'), timed('b', 'Ausencia', '11:00', '12:00', false)];
    expect(findAssignmentConflict(rows, { ...timed('c', 'Regular', '12:00', '16:00'), id: null })).toBeNull();
  });

  it('rejects real overlaps and whole-day combinations', () => {
    expect(findAssignmentConflict(
      [timed('a', 'Ausencia', '08:00', '10:00', false)],
      { ...timed('b', 'Regular', '09:00', '16:00'), id: null },
    )?.code).toBe('OVERLAP');
    expect(findAssignmentConflict(
      [{ id: 'free', date: '2026-09-01', shift_type: 'Libre', start_time: null, end_time: null, counts_as_work: false }],
      { ...timed('b', 'Regular', '09:00', '16:00'), id: null },
    )?.code).toBe('FULL_DAY_CONFLICT');
  });

  it('requires times for a temporal absence', () => {
    expect(() => assertTimedTypeHasTimes({ shiftType: 'Ausencia', countsAsWork: false, startTime: null, endTime: null }))
      .toThrow(expect.objectContaining({ code: 'SHIFT_TIMES_REQUIRED', status: 400 }));
  });
});

import { describe, expect, it } from 'vitest';
import { classifyRows, identityKey, mapSourceRow, weekStart } from './groundsync-84881-lib.mjs';

describe('GroundSync 84881 migration mapping', () => {
it('maps GroundSync semantics without inventing times for non-working types', () => {
  expect(mapSourceRow({ id: '1', date: '2026-10-12', start_time: '', end_time: '', location: 'Libre', origin: 'PDF' })).toEqual({
    sourceId: '1', date: '2026-10-12', startTime: null, endTime: null, location: 'Libre', origin: 'PDF', shiftType: 'Libre', countsAsWork: false, reasons: [],
  });
  expect(mapSourceRow({ id: '2', date: '2026-10-12', start_time: '13:00', end_time: '21:00', location: 'Regular', origin: 'PDF' }).countsAsWork).toBe(true);
});

it('classifies invalid, duplicate, conflict, historical and future rows', () => {
  const source = [
    { id: 'bad', date: '0024-12-22', start_time: '08:00', end_time: '15:00', location: 'JT', origin: 'MAN' },
    { id: 'old', date: '2026-10-11', start_time: '', end_time: '', location: 'Libre', origin: 'PDF' },
    { id: 'future', date: '2026-10-12', start_time: '13:00', end_time: '21:00', location: 'Regular', origin: 'PDF' },
  ];
  const existing = [{ date: '2026-10-13', startTime: '13:00', endTime: '21:00', shiftType: 'Regular', countsAsWork: true }];
  const result = classifyRows(source, existing);
  expect(Object.fromEntries(Object.entries(result).map(([key, rows]) => [key, rows.length]))).toEqual({ historical: 1, future: 1, duplicate: 0, conflict: 0, invalid: 1 });
  expect(identityKey(result.future[0])).toBe('2026-10-12|Regular|13:00|21:00|1');
});

it('groups future assignments by Monday', () => {
  expect(weekStart('2026-10-15')).toBe('2026-10-12');
});
});

/**
 * Synthetic TYPE_A fixture (monthly grid calendar).
 *
 * Layout: `dd/mm` day headers across the top, one horizontal strip per
 * employee (name + parenthesized id in the left marker column, shift cells
 * aligned under the day columns at the same y as the markers).
 *
 * All names/ids are fictional. No real employee data.
 */
import { PdfTextItem } from '../core/text-items';

export const TYPE_A_FIXTURE_ITEMS: PdfTextItem[] = [
  // Document header (fixes the year for deterministic goldens)
  { text: 'PERIODO: AGOSTO 2026', x: 400, y: 450, width: 0, height: 0, page: 1 },

  // Day headers (dd/mm), one column per day of August 2026
  { text: '01/08', x: 100, y: 400, width: 0, height: 0, page: 1 },
  { text: '02/08', x: 200, y: 400, width: 0, height: 0, page: 1 },
  { text: '03/08', x: 300, y: 400, width: 0, height: 0, page: 1 },
  { text: '04/08', x: 400, y: 400, width: 0, height: 0, page: 1 },
  { text: '05/08', x: 500, y: 400, width: 0, height: 0, page: 1 },

  // Previous employee row (acts as the ceiling boundary for Ana's band)
  { text: 'Carlos Ruiz', x: 30, y: 300, width: 0, height: 0, page: 1 },
  { text: '(1002)', x: 55, y: 300, width: 0, height: 0, page: 1 },

  // Target employee row: name + parenthesized id in the marker column
  { text: 'Ana Martinez', x: 30, y: 200, width: 0, height: 0, page: 1 },
  { text: '(1001)', x: 55, y: 200, width: 0, height: 0, page: 1 },

  // Shift cells aligned under the day columns at the marker y
  { text: '17:00-01:00', x: 100, y: 200, width: 0, height: 0, page: 1 }, // overnight regular
  { text: 'OFF', x: 200, y: 200, width: 0, height: 0, page: 1 },        // day off (default token)
  { text: 'DL', x: 300, y: 200, width: 0, height: 0, page: 1 },         // company alias: Libre only with preset
  { text: '08:00-12:00 -- 16:00-20:00', x: 400, y: 200, width: 0, height: 0, page: 1 }, // split shift
  { text: 'AJ', x: 500, y: 200, width: 0, height: 0, page: 1 },         // company alias: Libre only with preset
];

export const TYPE_A_SELECTOR = {
  employeeName: 'Ana Martinez',
  employeeIdentifiers: ['1001'],
};

/** Expected normalized result WITHOUT the company preset loaded. */
export const TYPE_A_EXPECTED = [
  { date: '2026-08-01', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', isValid: true },
  { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  { date: '2026-08-04', startTime: '08:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
  { date: '2026-08-04', startTime: '16:00', endTime: '20:00', shiftType: 'Regular', isValid: true },
  // Day 5 (AJ) produces nothing without the company preset: the alias is not
  // a universal ShiftImport token.
];

/** Expected normalized result WITH SHIFT_TYPE_PRESET_EXAMPLE loaded (dl/aj -> Libre). */
export const TYPE_A_EXPECTED_WITH_PRESET = [
  { date: '2026-08-01', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', isValid: true },
  { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  { date: '2026-08-03', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  { date: '2026-08-04', startTime: '08:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
  { date: '2026-08-04', startTime: '16:00', endTime: '20:00', shiftType: 'Regular', isValid: true },
  { date: '2026-08-05', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
];

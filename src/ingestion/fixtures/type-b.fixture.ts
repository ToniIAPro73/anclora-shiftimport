/**
 * Synthetic TYPE_B fixture (weekly-band calendar with company sections).
 *
 * Layout: weekday headers (`L5`, `M6`, ... `D11`) per week band, a `nomina`
 * header, plain-number employee ids in the left marker column. One employee
 * spans a vertical band covering all week rows, bounded below by the next
 * employee id or a section header.
 *
 * All names/ids are fictional. No real employee data.
 */
import { PdfTextItem } from '../core/text-items';

export const TYPE_B_FIXTURE_ITEMS: PdfTextItem[] = [
  // Document headers
  { text: 'NOMINA', x: 500, y: 600, width: 0, height: 0, page: 1 },
  { text: 'JULIO 2026', x: 400, y: 580, width: 0, height: 0, page: 1 },

  // Week-band day headers (weekday letter + day number)
  { text: 'L5', x: 160, y: 540, width: 0, height: 0, page: 1 },
  { text: 'M6', x: 260, y: 540, width: 0, height: 0, page: 1 },
  { text: 'X7', x: 360, y: 540, width: 0, height: 0, page: 1 },
  { text: 'J8', x: 460, y: 540, width: 0, height: 0, page: 1 },
  { text: 'V9', x: 560, y: 540, width: 0, height: 0, page: 1 },
  { text: 'S10', x: 660, y: 540, width: 0, height: 0, page: 1 },
  { text: 'D11', x: 760, y: 540, width: 0, height: 0, page: 1 },

  // Section label above the employee band (row-boundary + category token)
  { text: 'SUPERVISOR', x: 60, y: 500, width: 0, height: 0, page: 1 },

  // Target employee marker: plain numeric id in the marker column
  { text: '1001', x: 60, y: 450, width: 0, height: 0, page: 1 },

  // Shift cells on the marker line, under the day columns (x > dataMinX=150)
  { text: '17:00-01:00', x: 160, y: 450, width: 0, height: 0, page: 1 }, // overnight regular
  { text: 'OFF', x: 260, y: 450, width: 0, height: 0, page: 1 },        // day off (default token)
  { text: 'DL', x: 360, y: 450, width: 0, height: 0, page: 1 },         // company alias: Libre only with preset
  { text: '20:00-23:00', x: 460, y: 450, width: 0, height: 0, page: 1 },
  { text: 'AJ', x: 560, y: 450, width: 0, height: 0, page: 1 },         // company alias: Libre only with preset
  { text: '08:00-12:00 -- 16:00-20:00', x: 660, y: 450, width: 0, height: 0, page: 1 }, // split shift
  { text: 'OFF', x: 760, y: 450, width: 0, height: 0, page: 1 },        // day off (default token)

  // Next employee marker (bounds the previous band from below)
  { text: '1002', x: 60, y: 300, width: 0, height: 0, page: 1 },
];

export const TYPE_B_SELECTOR = {
  employeeName: '',
  employeeIdentifiers: ['1001'],
};

/** Expected normalized result WITH SHIFT_TYPE_PRESET_EXAMPLE loaded (dl/aj -> Libre). */
export const TYPE_B_EXPECTED_WITH_PRESET = [
  { date: '2026-07-05', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', isValid: true },
  { date: '2026-07-06', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  { date: '2026-07-07', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  { date: '2026-07-08', startTime: '20:00', endTime: '23:00', shiftType: 'Regular', isValid: true },
  { date: '2026-07-09', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  { date: '2026-07-10', startTime: '08:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
  { date: '2026-07-10', startTime: '16:00', endTime: '20:00', shiftType: 'Regular', isValid: true },
  { date: '2026-07-11', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
];

/**
 * Synthetic TYPE_B "split-line" fixture: mirrors the layout family of real
 * fortnight rosters where ONE day cell is split across three physical lines —
 * start times above the marker line, nómina id + employee name + day codes on
 * the marker line, end times below it.
 *
 * Regression coverage:
 * - The row band must include BOTH time lines but exclude the next
 *   employee's start line (which sits ~5pt above the next id marker) —
 *   otherwise cells yield phantom `??:??` second segments.
 * - Candidate listing must skip the structural header band ("NOMINA" row
 *   whose siblings are the day-number headers) and must still find employees
 *   whose name sits a few points right of the marker column (anchored by the
 *   id marker on the same line).
 *
 * All names/ids are fictional. No real employee data.
 */
import { PdfTextItem } from '../core/text-items';

const item = (text: string, x: number, y: number): PdfTextItem => ({
  text, x, y, width: 0, height: 0, page: 1,
});

// Day columns x positions (five days).
const COLS = [263, 295, 327, 360, 392];
const DAY_HEADERS = ['L1', 'M2', 'X3', 'J4', 'V5'];

// Employee block line offsets (from the real layout family).
const START_DY = 5.1;
const END_DY = -5.1;

interface MultilineBlock {
  id: string;
  name: string;
  /** name x may sit right of markerMaxX (100) — anchored by the id marker */
  nameX: number;
  y: number;
  /** per column: [start, end] times; a bare code goes on the marker line */
  cells: Array<{ start?: string; end?: string; code?: string }>;
}

const block = ({ id, name, nameX, y, cells }: MultilineBlock): PdfTextItem[] => {
  const items: PdfTextItem[] = [item(id, 28, y), item(name, nameX, y)];
  cells.forEach((cell, index) => {
    const x = COLS[index];
    if (cell.start) items.push(item(cell.start, x, y + START_DY));
    if (cell.end) items.push(item(cell.end, x, y + END_DY));
    if (cell.code) items.push(item(cell.code, x, y));
  });
  return items;
};

export const TYPE_B_MULTILINE_ITEMS: PdfTextItem[] = [
  item('NOMINA', 21, 500),
  item('EMPLEADO', 120, 500),
  item('SEPTIEMBRE 2026', 440, 515),
  ...DAY_HEADERS.map((header, index) => item(header, COLS[index], 500)),

  ...block({
    id: '90001',
    name: 'Ficticio Uno',
    nameX: 88,
    y: 450,
    cells: [
      { start: '10:00', end: '12:00' },
      { code: 'OFF' },
      { start: '10:00', end: '13:00' },
      {},
      { start: '08:00', end: '14:00' },
    ],
  }),
  ...block({
    id: '90002',
    name: 'Ficticia Dos',
    nameX: 108, // right of markerMaxX — only reachable via the id anchor
    y: 423.9,
    cells: [
      { start: '17:00', end: '01:00' },
      { start: '08:00', end: '12:00' },
      { code: 'OFF' },
      { code: 'OFF' },
      { code: 'OFF' },
    ],
  }),
];

export const TYPE_B_MULTILINE_CONTEXT = { month: 8, year: 2026 };

export const TYPE_B_MULTILINE_SELECTOR = { employeeName: '', employeeIdentifiers: ['90001'] };

/** Golden: both physical lines of each cell combine into one complete shift. */
export const TYPE_B_MULTILINE_EXPECTED = [
  { date: '2026-09-01', startTime: '10:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
  { date: '2026-09-02', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  { date: '2026-09-03', startTime: '10:00', endTime: '13:00', shiftType: 'Regular', isValid: true },
  { date: '2026-09-05', startTime: '08:00', endTime: '14:00', shiftType: 'Regular', isValid: true },
];

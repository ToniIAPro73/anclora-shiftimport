import { IngestionError } from '../../lib/ingestion-errors';
import { detectSourceKind, sourceSystemFor, type SourceKind } from '../source-kind';
import { loadXlsxWorksheets, xlsxStyleToken } from './xlsx-workbook';

/**
 * TRYP individual calendar exports (".xlsx": months as rows, days 1–31 as columns, plus a "Leyenda" sheet).
 * Two variants share the grid: "Calendario = Empleado" (what the employee calendar shows) and
 * "Calendario = Publicado" (what the company published). Cells:
 *   `HH:MM HH:MM`            worked shift             `DL` / `AJ`   day off
 *   `(V)` vacation           `(B)` sick leave         `! (DCF)`     incidence, hours NOT in the file
 *   `[text]`                 employee observation
 */
export interface TrypCalendarRow {
  date: string;
  shiftType: 'Regular' | 'Libre' | 'Vacaciones' | 'Baja';
  startTime: string;
  endTime: string;
  /** The cell flags a DCF incidence. Its hours are NOT in the source and are never invented. */
  dcf: boolean;
  comment: string | null;
  code: string;
}

export interface TrypCalendarExport {
  sourceKind: Exclude<SourceKind, 'UNKNOWN' | 'TEAM_SCHEDULE_EXPORT'>;
  sourceSystem: string;
  /** Payroll number printed in the legend (NOT assumed equal to any other system's number). */
  sourceIdentifier: string | null;
  employeeName: string | null;
  year: number;
  rows: TrypCalendarRow[];
  unrecognized: Array<{ date: string; text: string }>;
  /** Day cells with a solid colour but no text: their meaning lives in the colour, which this adapter does not interpret. */
  colorOnlyCells: number;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value !== null) {
    const rich = (value as { richText?: Array<{ text: string }> }).richText;
    if (rich) return rich.map((part) => part.text).join('');
    const result = (value as { result?: unknown }).result;
    if (result !== undefined) return cellText(result);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return String(value);
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (value: string) => { const [h, m] = value.split(':'); return `${pad(Number(h))}:${m}`; };

/** Pure cell interpreter (exported for tests). */
export function interpretTrypCell(raw: string): {
  kind: 'shift' | 'dayOff' | 'vacation' | 'sick' | 'empty' | 'unknown';
  startTime: string; endTime: string; dcf: boolean; comment: string | null; code: string;
} {
  let text = raw.replace(/\s+/g, ' ').trim();
  const commentMatch = /\[(.*)\]\s*$/.exec(text);
  const comment = commentMatch ? commentMatch[1].trim() || null : null;
  if (commentMatch) text = text.slice(0, commentMatch.index).trim();
  const dcf = /\(\s*DCF\s*\)/i.test(text);
  text = text.replace(/\(\s*DCF\s*\)/gi, '').replace(/!/g, '').replace(/\s+/g, ' ').trim();
  const base = { startTime: '', endTime: '', dcf, comment, code: text };
  const times = /^(\d{1,2}:\d{2}) (\d{1,2}:\d{2})$/.exec(text);
  if (times) return { ...base, kind: 'shift', startTime: hhmm(times[1]), endTime: hhmm(times[2]) };
  const upper = text.toUpperCase();
  if (upper === 'DL' || upper === 'AJ') return { ...base, kind: 'dayOff' };
  if (upper === '(V)') return { ...base, kind: 'vacation' };
  if (upper === '(B)') return { ...base, kind: 'sick' };
  if (!text) return { ...base, kind: dcf || comment ? 'unknown' : 'empty' };
  return { ...base, kind: 'unknown' };
}

/** Returns null when the workbook is not a TRYP individual calendar export (caller falls back to the generic parser). */
export async function parseTrypCalendarExport(file: File): Promise<TrypCalendarExport | null> {
  if (!/\.xlsx$/i.test(file.name)) return null;
  let workbook;
  try {
    workbook = await loadXlsxWorksheets(file);
  } catch (error) {
    if (error instanceof IngestionError) return null;
    throw error;
  }
  const legendSheet = workbook.worksheets.find((sheet) => norm(sheet.name) === 'leyenda');
  const legend = new Map<string, string>();
  legendSheet?.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => cells.push(cellText(cell.value)));
    if (cells.length >= 2) legend.set(norm(cells[0]), cells[1].trim());
  });
  const sourceKind = detectSourceKind({ legendCalendar: legend.get('calendario'), sheetNames: workbook.worksheets.map((s) => s.name) });
  if (sourceKind !== 'EMPLOYEE_CALENDAR_EXPORT' && sourceKind !== 'PUBLISHED_CALENDAR_EXPORT') return null;

  const grid = workbook.worksheets.find((sheet) => norm(sheet.name) !== 'leyenda');
  if (!grid) return null;
  const lines = new Map<number, Map<number, string>>();
  const colorOnly = new Map<number, Set<number>>(); // cells whose only content is a semantic fill
  grid.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = new Map<number, string>();
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const text = cellText(cell.value);
      if (text.trim()) cells.set(column, text);
      else if (xlsxStyleToken(cell.fill)) { if (!colorOnly.has(rowNumber)) colorOnly.set(rowNumber, new Set()); colorOnly.get(rowNumber)!.add(column); }
    });
    lines.set(rowNumber, cells);
  });

  const startMatch = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(legend.get('fecha inicio') ?? '');
  let year = startMatch ? Number(startMatch[3]) : 0;
  if (!year) for (const cells of lines.values()) { const m = /(?:19|20)\d{2}/.exec(cells.get(1) ?? ''); if (m && /calendario/i.test(cells.get(1) ?? '')) { year = Number(m[0]); break; } }
  if (!year) return null;

  // Day columns come from the header row (1..31); never assumed.
  let dayColumns = new Map<number, number>();
  for (const cells of lines.values()) {
    const numeric = [...cells.entries()].filter(([, v]) => /^\d{1,2}$/.test(v.trim())).map(([c, v]) => [c, Number(v)] as const);
    if (numeric.length >= 28 && numeric[0][1] === 1) { dayColumns = new Map(numeric); break; }
  }
  if (dayColumns.size === 0) return null;

  const rows: TrypCalendarRow[] = [];
  let colorOnlyCells = 0;
  const unrecognized: Array<{ date: string; text: string }> = [];
  for (const [rowNumber, cells] of lines) {
    const month = MONTHS.indexOf(norm(cells.get(1) ?? ''));
    if (month < 0) continue;
    for (const [column] of dayColumns) if (colorOnly.get(rowNumber)?.has(column)) colorOnlyCells += 1;
    for (const [column, day] of dayColumns) {
      const raw = cells.get(column);
      if (raw === undefined || !raw.trim()) continue;
      const date = `${year}-${pad(month + 1)}-${pad(day)}`;
      const cell = interpretTrypCell(raw);
      if (cell.kind === 'empty') continue;
      if (cell.kind === 'unknown') { unrecognized.push({ date, text: raw.replace(/\s+/g, ' ').trim().slice(0, 60) }); continue; }
      const shiftType = cell.kind === 'shift' ? 'Regular' : cell.kind === 'dayOff' ? 'Libre' : cell.kind === 'vacation' ? 'Vacaciones' : 'Baja';
      rows.push({ date, shiftType, startTime: cell.startTime, endTime: cell.endTime, dcf: cell.dcf, comment: cell.comment, code: cell.code });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return {
    sourceKind,
    sourceSystem: sourceSystemFor(sourceKind) as string,
    sourceIdentifier: (legend.get('nomina') ?? '').trim() || null,
    employeeName: (legend.get('nombre completo') ?? '').trim() || null,
    year,
    rows,
    unrecognized,
    colorOnlyCells,
  };
}

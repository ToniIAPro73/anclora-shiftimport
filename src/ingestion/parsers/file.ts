/**
 * Multi-format document ingestion: routes any supported file type to its
 * extractor, producing the same positioned PdfTextItem[] the pure ingestion
 * core consumes (or the canonical roster parser for CSV/text with known
 * headers).
 *
 * Supported today:
 *   - PDF (vector text) via pdfjs
 *   - CSV / plain text via canonical roster CSV (alias headers) or tabular grid
 *   - Excel (xlsx/xls) via exceljs, cells mapped to positions
 *   - Images via local Tesseract OCR (browser-side, Spanish)
 *
 * The UI (ImportModal) depends on the generic contract here, never on the
 * PDF implementation. Capability metadata lives in ../formats.ts.
 */
import { CalendarImportContext, ParsedCalendarShift } from '../../lib/import-types';
import { IngestionError } from '../../lib/ingestion-errors';
import { computeImportResult, ImportResult, QualitySignals } from '../../lib/import-quality';
import { UserFormatProfile } from '../../lib/format-profiles';
import { normalizeText, normalizeTimeToken } from '../core/normalize';
import { EmployeeSelector, matchesNameTokens } from '../core/row-detection';
import { PdfTextItem } from '../core/text-items';
import { detectCalendarContextFromItems, parseShiftsFromItems } from './parse-items';
import { extractPdfTextItems } from './pdf';
import { resolveShiftTypeId } from '../../lib/shift-types';
import { analyzeShiftsFromItems, DocumentStructureAnalysis } from '../analysis';
import { AssistantQuestion, generateAssistantQuestions } from '../assistant';

export type DocumentKind = 'pdf' | 'image' | 'excel' | 'csv' | 'text' | 'unknown';

// Text files are intentionally NOT a supported import kind: a .txt roster is
// rejected as UNSUPPORTED_FORMAT (corpus GN-05). CSV is the supported
// tabular text format.
const KIND_BY_EXTENSION: Record<string, DocumentKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  xlsx: 'excel',
  xls: 'excel',
  csv: 'csv',
};

export function classifyDocument(file: File): DocumentKind {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot + 1) : '';
  const byExtension = KIND_BY_EXTENSION[extension];
  if (byExtension) {
    return byExtension;
  }

  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'excel';
  if (mime.includes('csv')) return 'csv';
  if (mime.startsWith('text/')) return 'text';
  return 'unknown';
}

/** Marker column at x=40; data columns spaced by 100 starting at x=140. */
const MARKER_X = 40;
const DATA_X_START = 140;
const CELL_STEP_X = 100;
const CELL_STEP_Y = 50;
const TOP_Y = 700;

export function cellPositionToItem(
  text: string,
  columnIndex: number,
  rowIndex: number,
  page = 1,
): PdfTextItem {
  const x = columnIndex === 0 ? MARKER_X : DATA_X_START + (columnIndex - 1) * CELL_STEP_X;
  return {
    text,
    x,
    y: TOP_Y - (rowIndex + 1) * CELL_STEP_Y,
    width: CELL_STEP_X,
    height: CELL_STEP_Y,
    page,
  };
}

/** Extracts positioned items from a CSV or plain-text tabular document. */
export function extractTabularItems(text: string, page = 1): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  rows.forEach((line, rowIndex) => {
    const cells = line.split(/[,;\t]/).map((cell) => cell.trim()).filter(Boolean);
    cells.forEach((cell, columnIndex) => {
      items.push(cellPositionToItem(cell, columnIndex, rowIndex, page));
    });
  });

  return items;
}

/** Extracts positioned items from an Excel workbook (first sheet is enough). */
export async function extractExcelItems(file: File): Promise<PdfTextItem[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const items: PdfTextItem[] = [];
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return items;
  }

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const raw = cell.value;
      if (raw === null || raw === undefined) {
        return;
      }
      const text = raw instanceof Date
        ? raw.toISOString().slice(0, 10)
        : String(raw).trim();
      if (!text) {
        return;
      }
      items.push(cellPositionToItem(text, columnNumber - 1, rowNumber - 1));
    });
  });

  return items;
}

/**
 * Extracts positioned items from an image via local Tesseract OCR.
 * Runs entirely in the browser; worker/language binaries may be fetched
 * from the tesseract.js CDN on first use (no schedule data is uploaded).
 */
export async function extractImageItems(file: File): Promise<PdfTextItem[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa');
  try {
    const { data } = await worker.recognize(file);
    const words: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            if (word.text.trim()) {
              words.push({ text: word.text.trim(), bbox: word.bbox });
            }
          }
        }
      }
    }
    const maxY = words.reduce((max, word) => Math.max(max, word.bbox.y1), 0);
    return words.map((word) => ({
      text: word.text,
      x: word.bbox.x0,
      y: maxY - word.bbox.y0,
      width: word.bbox.x1 - word.bbox.x0,
      height: word.bbox.y1 - word.bbox.y0,
      page: 1,
    }));
  } finally {
    await worker.terminate();
  }
}

/**
 * Canonical roster CSV: one shift per row with flexible header aliases.
 * Aliases are matched after normalization so accents/case do not matter.
 * Returns null when the document does not look like a roster (the caller
 * falls back to the tabular grid path).
 */
export const ROSTER_HEADER_ALIASES: Record<string, string[]> = {
  date: ['fecha', 'dia', 'fecha turno', 'fecha del turno', 'fecha de trabajo', 'date', 'day'],
  start: ['inicio', 'hora inicio', 'entrada', 'desde', 'start'],
  end: ['fin', 'hora fin', 'salida', 'hasta', 'end'],
  type: ['tipo', 'turno', 'tipo turno', 'tipo de turno', 'shift type', 'type'],
  employee: ['empleado', 'nombre', 'trabajador', 'employee'],
  employeeId: ['id', 'legajo', 'identificador', 'employee id', 'worker id', 'member id'],
  value: ['value', 'registro', 'detalle', 'turnos', 'slots', 'allotment'],
};

function normalizeHeader(value: string): string {
  // underscores become spaces so worker_id matches the alias "worker id"
  return normalizeText(value).replace(/_/g, ' ');
}

/** Parses dd/mm/yyyy, d/m/yyyy, dd-mm-yyyy and ISO yyyy-mm-dd. */
function parseRosterDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const dayFirst = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (dayFirst) {
    const [, day, month, yearRaw] = dayFirst;
    const now = new Date();
    const year = yearRaw ? (yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : String(now.getFullYear());
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

const splitRosterLine = (line: string): string[] => line.split(/[,;\t]/).map((cell) => cell.trim());

const WEEKDAY_OFFSET: Record<string, number> = {
  mon: 0, lunes: 0, lun: 0,
  tue: 1, martes: 1, mar: 1,
  wed: 2, miercoles: 2, mie: 2, mié: 2,
  thu: 3, jueves: 3, jue: 3,
  fri: 4, viernes: 4, vie: 4,
  sat: 5, sabado: 5, sab: 5, sábado: 5,
  sun: 6, domingo: 6, dom: 6,
};

/** Parses a slot cell like "Mon 00-04", "Tue 20-24" or "22:00-06:00". */
function parseRosterSlot(
  cell: string,
  rowDate: string | null,
  weekStart: string | null,
): Array<{ date: string; start: string; end: string }> | null {
  const trimmed = cell.trim();
  if (!trimmed) {
    return [];
  }

  // Free/absence/unknown codes (VAC, BAJA, AUS, L, XYZ, ...) produce an
  // untimed shift resolved by the caller against the type registry.
  if (!/\d/.test(trimmed)) {
    return null;
  }

  const weekday = trimmed.match(/^(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2})-(\d{1,2})$/i);
  if (weekday) {
    if (!weekStart) {
      return null;
    }
    const [year, month, day] = weekStart.split('-').map(Number);
    const offset = WEEKDAY_OFFSET[weekday[1].toLowerCase()];
    const date = new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
    return [{
      date,
      start: normalizeTimeToken(`${weekday[2]}:00`),
      end: normalizeTimeToken(`${weekday[3]}:00`),
    }];
  }

  // Split ranges: "09:00-13:00 + 17:00-21:00"
  const split = trimmed.split(/\s*\+\s*/).map((part) => part.trim()).filter(Boolean);
  if (split.length > 1) {
    const out: Array<{ date: string; start: string; end: string }> = [];
    for (const part of split) {
      const parsed = parseRosterSlot(part, rowDate, weekStart);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [];
      }
      out.push(...parsed);
    }
    return out;
  }

  const range = trimmed.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (range && rowDate) {
    return [{
      date: rowDate,
      start: normalizeTimeToken(`${range[1]}:${range[2]}`),
      end: normalizeTimeToken(`${range[3]}:${range[4]}`),
    }];
  }

  return null;
}

export interface RosterParseOptions {
  /** ISO date (YYYY-MM-DD) of the week start; required for weekday slots. */
  weekStart?: string;
}

/**
 * Parses a canonical roster CSV into shifts. Flexible header aliases;
 * a date column (or weekday slots with weekStart) is required. Produces
 * shifts directly (no positioned items needed) and marks sourceFormat by
 * the caller.
 */
export function parseRosterCsv(text: string, options: RosterParseOptions = {}): ParsedCalendarShift[] | null {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length < 2) {
    return null;
  }

  // A quoted field means the simple CSV parser cannot trust the structure.
  if (text.includes('"')) {
    throw new IngestionError(
      'MALFORMED_INPUT',
      'El CSV contiene campos entre comillas no soportados por el importador simple.',
    );
  }

  const headers = splitRosterLine(rows[0]);
  const columnByField = new Map<string, number>();
  for (const [field, aliases] of Object.entries(ROSTER_HEADER_ALIASES)) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    const index = headers.findIndex((header) => aliasSet.has(normalizeHeader(header)));
    if (index >= 0) {
      columnByField.set(field, index);
    }
  }

  const hasDate = columnByField.has('date');
  const hasValue = columnByField.has('value');
  const hasStructured = columnByField.has('start') || columnByField.has('end') || columnByField.has('type');

  // Slot-mode rosters (e.g. `worker_id,slots`) have no date column.
  if (!hasDate && !(hasValue && !hasStructured)) {
    return null;
  }

  const dateCol = columnByField.get('date');
  const startCol = columnByField.get('start');
  const endCol = columnByField.get('end');
  const typeCol = columnByField.get('type');
  const valueCol = columnByField.get('value');
  const employeeIdCol = columnByField.get('employeeId');

  const shifts: ParsedCalendarShift[] = [];
  for (const line of rows.slice(1)) {
    const cells = splitRosterLine(line);
    const rowDate = dateCol !== undefined ? parseRosterDate(cells[dateCol] ?? '') : null;
    const workerId = employeeIdCol !== undefined ? (cells[employeeIdCol] ?? '').trim() : '';

    // Slot-mode: every value cell beyond the marker may hold one or more slots.
    if (valueCol !== undefined && !rowDate) {
      for (let col = valueCol; col < cells.length; col += 1) {
        const cell = cells[col] ?? '';
        const slots = parseRosterSlot(cell, null, options.weekStart ?? null);
        const base = {
          notes: workerId || null,
          isValid: true,
        };
        if (slots === null) {
          // Untimed code for this worker on this slot position.
          const typeId = cell ? resolveShiftTypeId(cell) : null;
          shifts.push({
            date: '',
            startTime: '',
            endTime: '',
            origin: 'IMP',
            confidence: 0.8,
            rawText: cell,
            shiftType: typeId,
            ...base,
            color: null,
          });
          continue;
        }
        for (const slot of slots) {
          shifts.push({
            date: slot.date,
            startTime: slot.start,
            endTime: slot.end,
            origin: 'IMP',
            confidence: 0.9,
            rawText: cell,
            shiftType: 'Regular',
            ...base,
            color: null,
          });
        }
      }
      continue;
    }

    if (!rowDate) {
      continue;
    }

    const rawStart = startCol !== undefined ? (cells[startCol] ?? '') : '';
    const rawEnd = endCol !== undefined ? (cells[endCol] ?? '') : '';
    const valueRaw = valueCol !== undefined ? (cells[valueCol] ?? '') : '';
    const startTime = rawStart ? normalizeTimeToken(rawStart) : '';
    const endTime = rawEnd ? normalizeTimeToken(rawEnd) : '';
    const hasTime = Boolean(startTime && endTime);
    const rawType = typeCol !== undefined ? (cells[typeCol] ?? '') : '';
    const effectiveValue = valueRaw || rawType;

    // value cell may hold "22:00-06:00", "(split) + (split)" or a code.
    let slots: Array<{ date: string; start: string; end: string }> | null | undefined;
    if (effectiveValue && !hasTime) {
      slots = parseRosterSlot(effectiveValue, rowDate, options.weekStart ?? null);
    }

    if (Array.isArray(slots) && slots.length > 0 && !hasTime) {
      for (const slot of slots) {
        shifts.push({
          date: slot.date,
          startTime: slot.start,
          endTime: slot.end,
          origin: 'IMP',
          isValid: true,
          confidence: 0.9,
          rawText: line,
          shiftType: 'Regular',
          notes: null,
          color: null,
        });
      }
      continue;
    }

    const typeId = rawType ? resolveShiftTypeId(rawType) : null;
    if (!hasTime && !typeId && !effectiveValue) {
      continue;
    }

    const isAbsence = typeId === 'Libre' || typeId === 'Vacaciones';
    shifts.push({
      date: rowDate,
      startTime: isAbsence && !hasTime ? '' : startTime,
      endTime: isAbsence && !hasTime ? '' : endTime,
      origin: 'IMP',
      isValid: true,
      confidence: hasTime ? 1.0 : 0.8,
      // For value-based rows the rawText is the value cell itself so callers
      // can classify VAC/BAJA/AUS/L/XYZ codes without scanning the line.
      rawText: hasTime || !effectiveValue ? line : effectiveValue,
      shiftType: typeId ?? (hasTime ? 'Regular' : null),
      notes: null,
      color: null,
    });
  }

  return shifts;
}

export async function extractDocumentItems(file: File): Promise<PdfTextItem[]> {
  const kind = classifyDocument(file);
  switch (kind) {
    case 'pdf':
      return extractPdfTextItems(file);
    case 'image':
      return extractImageItems(file);
    case 'excel':
      return extractExcelItems(file);
    case 'csv':
      return extractTabularItems(await file.text());
    default:
      throw new IngestionError(
        'UNSUPPORTED_FORMAT',
        'Formato de documento no soportado. Formatos admitidos: PDF, PNG/JPG/WebP, CSV y XLSX.',
      );
  }
}

async function rosterShiftsFor(file: File): Promise<ParsedCalendarShift[] | null> {
  const kind = classifyDocument(file);
  if (kind !== 'csv') {
    return null;
  }
  const roster = parseRosterCsv(await file.text());
  if (roster === null) {
    return null; // not a roster → tabular grid path
  }
  if (roster.length === 0) {
    throw new IngestionError(
      'NO_SHIFTS_FOUND',
      'No se detectaron turnos para el empleado indicado dentro del documento.',
    );
  }
  return roster.map((shift) => ({ ...shift, sourceFormat: 'csv' }));
}

export async function detectCalendarContext(file: File): Promise<CalendarImportContext> {
  const roster = await rosterShiftsFor(file);
  if (roster && roster.length > 0) {
    const first = roster[0].date;
    const [year, month] = first.split('-').map(Number);
    return { month: month - 1, year };
  }
  return detectCalendarContextFromItems(await extractDocumentItems(file));
}

export async function parseEmployeeShiftsFromFile(
  file: File,
  context: CalendarImportContext,
  selector: EmployeeSelector,
): Promise<ParsedCalendarShift[]> {
  const kind = classifyDocument(file);
  if (kind === 'unknown' || kind === 'text') {
    throw new IngestionError(
      'UNSUPPORTED_FORMAT',
      'Formato de documento no soportado. Formatos admitidos: PDF, PNG/JPG/WebP, CSV y XLSX.',
    );
  }

  const roster = await rosterShiftsFor(file);
  if (roster) {
    return roster;
  }

  const allItems = await extractDocumentItems(file);
  const shifts = parseShiftsFromItems(allItems, context, selector);
  if (shifts.length === 0) {
    throw new IngestionError(
      'NO_SHIFTS_FOUND',
      'No se detectaron turnos para el empleado indicado dentro del documento.',
    );
  }
  return shifts.map((shift) => ({ ...shift, sourceFormat: kind }));
}

/* ------------------------------------------------------------------------
 * Phase 1A (wave 2): analysis-driven document import.
 * analyzeDocumentFile wraps the existing pipelines with quality signals
 * (src/ingestion/analysis.ts) and assistant questions (src/ingestion/
 * assistant.ts). It never throws for unrecognized/ambiguous content —
 * those become UNRECOGNIZED/REVIEW states with questions for the UI.
 * --------------------------------------------------------------------- */

export interface DocumentAnalysisResult {
  kind: DocumentKind;
  context: CalendarImportContext;
  shifts: ParsedCalendarShift[];
  quality: ImportResult;
  /** null for the roster-CSV fast path (no positioned layout to fingerprint) */
  structure: DocumentStructureAnalysis | null;
  /** empty when quality.state === 'CORRECT' */
  questions: AssistantQuestion[];
}

/** Header alias lookup used by the roster quality signals. */
function findRosterColumnIndex(headers: string[], field: keyof typeof ROSTER_HEADER_ALIASES): number | undefined {
  const aliasSet = new Set(ROSTER_HEADER_ALIASES[field].map(normalizeHeader));
  const index = headers.findIndex((header) => aliasSet.has(normalizeHeader(header)));
  return index >= 0 ? index : undefined;
}

const ROSTER_WEEKDAY_SLOT = /^(mon|tue|wed|thu|fri|sat|sun)\s+\d{1,2}-\d{1,2}$/i;
const ROSTER_TIME_LIKE = /\d{1,2}:\d{2}/;

/**
 * Quality signals for the roster-CSV fast path. employeeMatch is 'strong'
 * only when an employee/employee-id column exists AND some row matches the
 * selector (id digits or name tokens); otherwise 'none'. Token stats scan
 * the value/type columns: recognized = resolvable via the shift-type
 * registry, a time range or a weekday slot; time-ish failures count as
 * invalidTimes; anything else is an unknown token.
 */
function analyzeRosterDocument(
  text: string,
  roster: ParsedCalendarShift[],
  selector: EmployeeSelector,
): DocumentAnalysisResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headers = splitRosterLine(lines[0] ?? '');
  const rows = lines.slice(1);

  const employeeCol = findRosterColumnIndex(headers, 'employee');
  const employeeIdCol = findRosterColumnIndex(headers, 'employeeId');
  const valueCol = findRosterColumnIndex(headers, 'value');
  const typeCol = findRosterColumnIndex(headers, 'type');

  let employeeMatch: 'strong' | 'none' = 'none';
  if (employeeCol !== undefined || employeeIdCol !== undefined) {
    const targetIds = selector.employeeIdentifiers.map((value) => value.replace(/\D/g, '')).filter(Boolean);
    const nameTokens = normalizeText(selector.employeeName).split(' ').filter((token) => token.length >= 3);
    for (const line of rows) {
      const cells = splitRosterLine(line);
      const idCell = employeeIdCol !== undefined ? (cells[employeeIdCol] ?? '').replace(/\D/g, '') : '';
      const nameCell = employeeCol !== undefined ? (cells[employeeCol] ?? '') : '';
      const idHit = idCell.length > 0 && targetIds.includes(idCell);
      const nameHit = nameTokens.length > 0 && nameCell.length > 0 && matchesNameTokens(nameCell, nameTokens);
      if (idHit || nameHit) {
        employeeMatch = 'strong';
        break;
      }
    }
  }

  let totalTokens = 0;
  let recognizedTokens = 0;
  let invalidTimes = 0;
  const unknownTokens = new Set<string>();
  for (const line of rows) {
    const cells = splitRosterLine(line);
    for (const column of [valueCol, typeCol]) {
      if (column === undefined) {
        continue;
      }
      const cell = (cells[column] ?? '').trim();
      if (!cell) {
        continue;
      }
      totalTokens += 1;
      if (resolveShiftTypeId(cell) || ROSTER_TIME_LIKE.test(cell) || ROSTER_WEEKDAY_SLOT.test(cell)) {
        recognizedTokens += 1;
        continue;
      }
      if (cell.includes(':')) {
        invalidTimes += 1;
        continue;
      }
      unknownTokens.add(cell);
    }
  }

  const datedShifts = roster.filter((shift) => shift.date);
  const context: CalendarImportContext = datedShifts.length > 0
    ? (() => {
      const [year, month] = datedShifts[0].date.split('-').map(Number);
      return { month: month - 1, year };
    })()
    : { month: new Date().getMonth(), year: new Date().getFullYear() };

  const mappedDays = new Set(datedShifts.map((shift) => shift.date)).size;
  const signals: QualitySignals = {
    knownProfileMatched: false,
    profileDrift: false,
    periodDetected: true,
    employeeMatch,
    expectedDays: mappedDays,
    mappedDays,
    totalTokens,
    recognizedTokens,
    unknownTokens: [...unknownTokens],
    invalidTimes,
    incompleteAssignments: roster.filter((shift) => !shift.isValid).length,
  };

  const shifts = roster.map((shift) => ({ ...shift, sourceFormat: 'csv' }));
  let quality = computeImportResult(shifts, signals);
  if (shifts.length === 0 && !quality.warnings.some((warning) => warning.code === 'PARTIAL_EXTRACTION')) {
    quality = { ...quality, warnings: [...quality.warnings, { code: 'PARTIAL_EXTRACTION' as const }] };
  }

  const questions: AssistantQuestion[] = quality.state === 'CORRECT'
    ? []
    : [...unknownTokens].slice(0, 6).map((token) => ({ kind: 'token-meaning' as const, token }));

  return { kind: 'csv', context, shifts, quality, structure: null, questions };
}

/**
 * Analysis-driven import entry point: classifies the file, extracts shifts
 * and composes quality signals + assistant questions.
 *
 * - Roster CSV fast path: canonical roster parsing (no positioned layout,
 *   so structure is null); MALFORMED_INPUT from the CSV parser rethrows.
 * - Everything else: positioned items → context detection →
 *   analyzeShiftsFromItems; questions are generated unless the result is
 *   already CORRECT.
 *
 * savedProfilesHint is an optional performance hint: when provided, profile
 * matching runs against that list instead of reading storage again (same
 * scoring as matchFormatProfile).
 */
export async function analyzeDocumentFile(
  file: File,
  selector: EmployeeSelector,
  savedProfilesHint?: UserFormatProfile[],
): Promise<DocumentAnalysisResult> {
  const kind = classifyDocument(file);
  if (kind === 'unknown' || kind === 'text') {
    throw new IngestionError(
      'UNSUPPORTED_FORMAT',
      'Formato de documento no soportado. Formatos admitidos: PDF, PNG/JPG/WebP, CSV y XLSX.',
    );
  }

  if (kind === 'csv') {
    const text = await file.text();
    const roster = parseRosterCsv(text);
    if (roster !== null) {
      return analyzeRosterDocument(text, roster, selector);
    }
    // Not a canonical roster: fall through to the tabular item path.
  }

  const items = await extractDocumentItems(file);
  const context = detectCalendarContextFromItems(items);
  const parsed = analyzeShiftsFromItems(items, context, selector, savedProfilesHint);
  const shifts = parsed.shifts.map((shift) => ({ ...shift, sourceFormat: kind }));
  const quality: ImportResult = { ...parsed.quality, shifts };
  const questions = quality.state === 'CORRECT'
    ? []
    : generateAssistantQuestions(items, context, parsed.analysis);

  return { kind, context, shifts, quality, structure: parsed.analysis.structure, questions };
}
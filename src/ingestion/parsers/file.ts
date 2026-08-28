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
import { IngestionError, VlmErrorCode } from '../../lib/ingestion-errors';
import { computeImportResult, ImportResult, QualitySignals } from '../../lib/import-quality';
import { UserFormatProfile } from '../../lib/format-profiles';
import { normalizeText, normalizeTimeToken } from '../core/normalize';
import { EmployeeSelector, matchesNameTokens } from '../core/row-detection';
import { PdfTextItem } from '../core/text-items';
import { analyzeWithVlmFallback, isVlmFallbackAvailable, VlmRecords } from '../vlm-client';
import { classifyVlmTrigger } from '../vlm-trigger';
import {
  analyzeRosterTable,
  detectCsvDelimiter,
  generateTabularQuestions,
  normalizeTableHeader,
  parseCsvLine,
  parseRosterTable,
  parseTableDate,
  ROSTER_HEADER_ALIASES,
  RosterTable,
  stripBom,
  tabularRowSelectionQuestion,
} from '../tabular-assistant';
import { detectCalendarContextFromItems, parseShiftsFromItems } from './parse-items';
import { detectSections } from './multi-section';
import { extractPdfTextItems } from './pdf';
import { resolveShiftTypeId } from '../../lib/shift-types';
import { analyzeShiftsFromItems, DocumentStructureAnalysis } from '../analysis';
import { AssistantQuestion, generateAssistantQuestions } from '../assistant';

// The canonical alias table lives in ../tabular-assistant (shared with the
// tabular assistant fallback); re-exported here for API compatibility.
export { ROSTER_HEADER_ALIASES };

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
  const rows = stripBom(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length < 2) {
    return null;
  }

  // A quoted field is now genuinely supported (parseCsvLine) — only a truly
  // malformed quote structure in the header is rejected outright. Delimiter
  // is auto-detected (`,`/`;`/tab) — Spanish/German/French Excel exports
  // default to `;`, since `,` is their locale's decimal separator.
  const delimiter = detectCsvDelimiter(rows[0]);
  const headerParsed = parseCsvLine(rows[0], delimiter);
  if (headerParsed.malformed) {
    throw new IngestionError(
      'MALFORMED_INPUT',
      'El CSV contiene una cabecera con comillas mal formadas.',
    );
  }
  const parsedDataRows = rows.slice(1).map((line) => ({ line, ...parseCsvLine(line, delimiter) }));
  const malformedRow = parsedDataRows.find((parsed) => parsed.malformed);
  if (malformedRow) {
    throw new IngestionError(
      'MALFORMED_INPUT',
      'El CSV contiene una fila con comillas mal formadas.',
    );
  }

  const headers = headerParsed.cells;
  const columnByField = new Map<string, number>();
  for (const [field, aliases] of Object.entries(ROSTER_HEADER_ALIASES)) {
    const aliasSet = new Set(aliases.map(normalizeTableHeader));
    const index = headers.findIndex((header) => aliasSet.has(normalizeTableHeader(header)));
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
  for (const { cells, line } of parsedDataRows) {
    const rowDate = dateCol !== undefined ? parseTableDate(cells[dateCol] ?? '') : null;
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
  /**
   * The period the document itself indicates (month-name/day-header evidence
   * or roster dates). When it conflicts with the user's explicit selection,
   * the diagnosis layer raises MONTH_MISMATCH — the selection is never
   * silently overridden.
   */
  detectedContext?: CalendarImportContext;
  /**
   * TYPE_MULTI only: the month/year sections the document actually covers.
   * The diagnosis layer compares the user's selection against this list —
   * a selection outside it is a MONTH_MISMATCH, never a silent fallback.
   */
  coveredPeriods?: CalendarImportContext[];
  /**
   * Parsed CSV table for the tabular assistant fallback (roster fast path and
   * UNKNOWN-layout grids). Present only when the document is tabular text the
   * positional pipeline could not fully handle on its own.
   */
  table?: RosterTable;
  /**
   * VLM fallback failure marker: the document qualified for the server-side
   * visual analysis but it failed. The deterministic result is preserved
   * untouched; the diagnosis layer appends a non-blocking VLM_* diagnostic
   * (retry via the existing Process action).
   */
  vlmError?: { code: VlmErrorCode };
}

/** Hooks the UI passes to observe/control the VLM fallback stage. */
export interface VlmFallbackHooks {
  onStage?: (stage: 'analyzing') => void;
  signal?: AbortSignal;
}

const VLM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VLM_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** VLM output is model output, not parsed text: fixed, mid-range confidence. */
const VLM_SHIFT_CONFIDENCE = 0.6;

/**
 * Maps the VLM extraction payload to parsed shifts. Undated rows and rows
 * with no content at all are dropped (they cannot be placed on a calendar);
 * malformed times are blanked and counted so the quality signals reflect
 * them. Unknown shift codes are kept as-is (resolvable via the registry when
 * known) so the preview shows exactly what the model read.
 */
function mapVlmRecordsToShifts(records: VlmRecords, sourceFormat: string): { shifts: ParsedCalendarShift[]; invalidTimes: number } {
  const shifts: ParsedCalendarShift[] = [];
  let invalidTimes = 0;
  for (const entry of records.entries) {
    if (!VLM_DATE_RE.test(entry.date ?? '')) {
      continue;
    }
    const rawStart = entry.startTime?.trim() ?? '';
    const rawEnd = entry.endTime?.trim() ?? '';
    if ((rawStart && !VLM_TIME_RE.test(rawStart)) || (rawEnd && !VLM_TIME_RE.test(rawEnd))) {
      invalidTimes += 1;
    }
    const startTime = VLM_TIME_RE.test(rawStart) ? rawStart : '';
    const endTime = VLM_TIME_RE.test(rawEnd) ? rawEnd : '';
    const rawType = entry.shiftType?.trim() ?? '';
    const shiftType = rawType ? (resolveShiftTypeId(rawType) ?? rawType) : null;
    const notes = entry.notes?.trim() || null;
    if (!shiftType && !startTime && !endTime && !notes) {
      continue;
    }
    // Complete = typed absence row (no times) or fully timed work row.
    const isValid = Boolean(shiftType && !startTime && !endTime) || Boolean(startTime && endTime);
    const label = [rawType || null, startTime && endTime ? `${startTime}-${endTime}` : null].filter(Boolean).join(' ');
    shifts.push({
      date: entry.date,
      startTime,
      endTime,
      origin: 'IMP',
      sourceFormat,
      isValid,
      confidence: VLM_SHIFT_CONFIDENCE,
      rawText: label ? `VLM: ${label}` : `VLM: ${entry.date}`,
      shiftType,
      notes,
      color: null,
    });
  }
  return { shifts, invalidTimes };
}

/**
 * Builds a DocumentAnalysisResult from VLM records. There is no positioned
 * layout to fingerprint (structure: null, documented on the interface) and
 * no assistant questions. employeeMatch stays 'none' when the model could
 * not name the employee — the ambiguity is preserved for the diagnosis
 * layer, never resolved by guessing. The quality state is capped at REVIEW:
 * model output always requires human review, however clean it looks.
 */
function buildVlmAnalysisResult(
  records: VlmRecords,
  base: { kind: DocumentKind; context: CalendarImportContext },
): DocumentAnalysisResult {
  const sourceFormat = `${base.kind}+vlm`;
  const { shifts, invalidTimes } = mapVlmRecordsToShifts(records, sourceFormat);

  const dated = shifts.filter((shift) => shift.date);
  const mappedDays = new Set(dated.map((shift) => shift.date)).size;
  const signals: QualitySignals = {
    knownProfileMatched: false,
    profileDrift: false,
    // The caller always passes the (user-authoritative) month/year as context
    // to the endpoint, so the dates come back aligned to a known period.
    periodDetected: true,
    employeeMatch: records.employeeName?.trim() ? 'strong' : 'none',
    expectedDays: mappedDays,
    mappedDays,
    totalTokens: records.entries.length,
    recognizedTokens: shifts.length,
    unknownTokens: [],
    invalidTimes,
    incompleteAssignments: shifts.filter((shift) => !shift.isValid).length,
  };

  let quality = computeImportResult(shifts, signals);
  if (quality.state === 'CORRECT') {
    // VLM output is never CORRECT: it always requires human review.
    quality = { ...quality, state: 'REVIEW' };
  }

  const firstDate = dated[0]?.date;
  const detectedContext: CalendarImportContext = firstDate
    ? { month: Number(firstDate.slice(5, 7)) - 1, year: Number(firstDate.slice(0, 4)) }
    : base.context;

  return {
    kind: base.kind,
    context: base.context,
    shifts,
    quality,
    structure: null,
    questions: [],
    detectedContext,
  };
}

/**
 * Server-side VLM fallback, attempted after the deterministic pipeline when
 * the trigger classifier marks the document eligible. Success replaces the
 * result with the mapped records (capped at REVIEW); failure preserves the
 * deterministic result and marks it with vlmError for the diagnosis layer.
 * An aborted analysis silently returns the deterministic result — the caller
 * (modal reset/close) is already tearing the state down.
 */
async function applyVlmFallback(
  file: File,
  kind: DocumentKind,
  itemCount: number,
  deterministic: DocumentAnalysisResult,
  hooks?: VlmFallbackHooks,
): Promise<DocumentAnalysisResult> {
  const decision = classifyVlmTrigger({
    kind,
    itemCount,
    quality: deterministic.quality,
    authenticated: isVlmFallbackAvailable(),
  });
  if (decision.kind !== 'VLM_ELIGIBLE') {
    return deterministic;
  }

  hooks?.onStage?.('analyzing');
  let outcome;
  try {
    outcome = await analyzeWithVlmFallback(file, {
      month: deterministic.context.month + 1,
      year: deterministic.context.year,
      signal: hooks?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return deterministic;
    }
    throw error;
  }

  if (!outcome.ok) {
    return { ...deterministic, vlmError: { code: outcome.code } };
  }
  return buildVlmAnalysisResult(outcome.records, { kind, context: deterministic.context });
}

/**
 * Drops shifts whose explicit date falls outside the chosen month. Applied
 * only on the user's explicit "keep my selected period" decision after a
 * MONTH_MISMATCH — never silently, so no cross-month date can slip through.
 */
export function filterShiftsToContext(
  shifts: ParsedCalendarShift[],
  context: CalendarImportContext,
): ParsedCalendarShift[] {
  const prefix = `${context.year}-${String(context.month + 1).padStart(2, '0')}-`;
  return shifts.filter((shift) => !shift.date || shift.date.startsWith(prefix));
}

/** Header alias lookup used by the roster quality signals. */
function findRosterColumnIndex(headers: string[], field: keyof typeof ROSTER_HEADER_ALIASES): number | undefined {
  const aliasSet = new Set(ROSTER_HEADER_ALIASES[field].map(normalizeTableHeader));
  const index = headers.findIndex((header) => aliasSet.has(normalizeTableHeader(header)));
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
  const lines = stripBom(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const delimiter = detectCsvDelimiter(lines[0] ?? '');
  const headers = parseCsvLine(lines[0] ?? '', delimiter).cells;
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
      const cells = parseCsvLine(line, delimiter).cells;
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
    const cells = parseCsvLine(line, delimiter).cells;
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

  const questions: AssistantQuestion[] = quality.state === 'CORRECT' && unknownTokens.size === 0
    ? []
    : [...unknownTokens].slice(0, 6).map((token) => ({ kind: 'token-meaning' as const, token }));

  // Tabular assistant (Phase 1A remediation): the roster fast path has no
  // positioned layout, so row disambiguation is offered from the parsed
  // table when the selector matches zero/several rows.
  const table = parseRosterTable(text);
  if (table && quality.state !== 'CORRECT') {
    const rowSelection = tabularRowSelectionQuestion(table, analyzeRosterTable(table, selector));
    if (rowSelection) {
      questions.unshift(rowSelection);
    }
  }

  return { kind: 'csv', context, shifts, quality, structure: null, questions, detectedContext: context, ...(table ? { table } : {}) };
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
 *
 * vlm (optional) hooks the server-side visual fallback: when the
 * deterministic result is unusable (no items / UNRECOGNIZED with zero
 * shifts) and a session is active, the document is rasterized and sent to
 * /api/ingestion/vlm. The outcome either replaces the result (state capped
 * at REVIEW) or marks it with vlmError — it never throws.
 */
export async function analyzeDocumentFile(
  file: File,
  selector: EmployeeSelector,
  savedProfilesHint?: UserFormatProfile[],
  contextOverride?: CalendarImportContext,
  vlm?: VlmFallbackHooks,
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
    // Not a canonical roster: positioned tabular path, with a tabular
    // assistant fallback when the layout is UNKNOWN (no positional profile
    // can fingerprint it, e.g. day-number grid headers).
    const table = parseRosterTable(text);
    const items = extractTabularItems(text);
    const detectedContext = detectCalendarContextFromItems(items);
    const context = contextOverride ?? detectedContext;
    const parsed = analyzeShiftsFromItems(items, context, selector, savedProfilesHint);
    const shifts = parsed.shifts.map((shift) => ({ ...shift, sourceFormat: kind }));
    const quality: ImportResult = { ...parsed.quality, shifts };
    // Questions are generated unless the result is clean AND complete:
    // unknown tokens under a CORRECT confidence would otherwise be dropped
    // silently (GS-10).
    let questions = quality.state === 'CORRECT' && parsed.analysis.unknownTokens.length === 0
      ? []
      : generateAssistantQuestions(items, context, parsed.analysis);

    if (table && parsed.analysis.structure.documentType === 'UNKNOWN') {
      const tabularQuestions = generateTabularQuestions(table, analyzeRosterTable(table, selector));
      // Safe failure: no actionable tabular structure → UNRECOGNIZED stands
      // with no questions.
      if (tabularQuestions.length > 0) {
        questions = tabularQuestions;
        return { kind, context, shifts, quality, structure: parsed.analysis.structure, questions, detectedContext, table };
      }
    }

    return { kind, context, shifts, quality, structure: parsed.analysis.structure, questions, detectedContext };
  }

  const items = await extractDocumentItems(file);
  const detectedContext = detectCalendarContextFromItems(items);
  const context = contextOverride ?? detectedContext;
  const parsed = analyzeShiftsFromItems(items, context, selector, savedProfilesHint);
  const shifts = parsed.shifts.map((shift) => ({ ...shift, sourceFormat: kind }));
  const quality: ImportResult = { ...parsed.quality, shifts };
  const questions = quality.state === 'CORRECT' && parsed.analysis.unknownTokens.length === 0
    ? []
    : generateAssistantQuestions(items, context, parsed.analysis);

  // TYPE_MULTI: the periods the document covers, so the diagnosis layer can
  // tell "user picked another covered month" (fine) from "picked a month the
  // document does not contain" (blocking MONTH_MISMATCH).
  const coveredPeriods = parsed.analysis.structure.documentType === 'TYPE_MULTI'
    ? detectSections(items).map((section) => ({ month: section.month, year: section.year }))
    : undefined;

  const deterministic: DocumentAnalysisResult = {
    kind,
    context,
    shifts,
    quality,
    structure: parsed.analysis.structure,
    questions,
    detectedContext,
    ...(coveredPeriods && coveredPeriods.length > 0 ? { coveredPeriods } : {}),
  };

  // Server-side VLM fallback (pdf/image only, authenticated sessions only):
  // attempted when the deterministic pipeline could not read the document —
  // never replaces a usable result. See applyVlmFallback.
  return applyVlmFallback(file, kind, items.length, deterministic, vlm);
}
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
import { normalizeText, normalizeTimeToken } from '../core/normalize';
import { EmployeeSelector } from '../core/row-detection';
import { PdfTextItem } from '../core/text-items';
import { detectCalendarContextFromItems, parseShiftsFromItems } from './parse-items';
import { extractPdfTextItems } from './pdf';
import { resolveShiftTypeId } from '../../lib/shift-types';

export type DocumentKind = 'pdf' | 'image' | 'excel' | 'csv' | 'text' | 'unknown';

const KIND_BY_EXTENSION: Record<string, DocumentKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  xlsx: 'excel',
  xls: 'excel',
  csv: 'csv',
  txt: 'text',
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
  employeeId: ['id', 'legajo', 'identificador', 'employee id'],
};

function normalizeHeader(value: string): string {
  return normalizeText(value);
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

/**
 * Parses a canonical roster CSV into shifts. Flexible header aliases;
 * only the date column is required. Produces shifts directly (no positioned
 * items needed) and marks sourceFormat by the caller.
 */
export function parseRosterCsv(text: string): ParsedCalendarShift[] | null {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length < 2) {
    return null;
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

  // Roster detected only when a date column exists; otherwise the document
  // is treated as a tabular grid.
  if (!columnByField.has('date')) {
    return null;
  }

  const dateCol = columnByField.get('date') as number;
  const startCol = columnByField.get('start');
  const endCol = columnByField.get('end');
  const typeCol = columnByField.get('type');

  const shifts: ParsedCalendarShift[] = [];
  for (const line of rows.slice(1)) {
    const cells = splitRosterLine(line);
    const date = parseRosterDate(cells[dateCol] ?? '');
    if (!date) {
      continue;
    }

    const rawStart = startCol !== undefined ? (cells[startCol] ?? '') : '';
    const rawEnd = endCol !== undefined ? (cells[endCol] ?? '') : '';
    const startTime = rawStart ? normalizeTimeToken(rawStart) : '';
    const endTime = rawEnd ? normalizeTimeToken(rawEnd) : '';
    const hasTime = Boolean(startTime && endTime);

    const rawType = typeCol !== undefined ? (cells[typeCol] ?? '') : '';
    const typeId = rawType ? resolveShiftTypeId(rawType) : null;

    if (!hasTime && !typeId) {
      continue;
    }

    const isAbsence = typeId === 'Libre' || typeId === 'Vacaciones';
    shifts.push({
      date,
      startTime: isAbsence && !hasTime ? '' : startTime,
      endTime: isAbsence && !hasTime ? '' : endTime,
      origin: 'IMP',
      isValid: true,
      confidence: 1.0,
      rawText: line,
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
    case 'text':
      return extractTabularItems(await file.text());
    default:
      throw new Error(
        'Formato de documento no soportado. Usa PDF, Excel, CSV, texto o una imagen.',
      );
  }
}

async function rosterShiftsFor(file: File): Promise<ParsedCalendarShift[] | null> {
  const kind = classifyDocument(file);
  if (kind !== 'csv' && kind !== 'text') {
    return null;
  }
  const roster = parseRosterCsv(await file.text());
  if (!roster || roster.length === 0) {
    return null;
  }
  return roster.map((shift) => ({ ...shift, sourceFormat: kind }));
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

  const roster = await rosterShiftsFor(file);
  if (roster) {
    return roster;
  }

  const allItems = await extractDocumentItems(file);
  return parseShiftsFromItems(allItems, context, selector)
    .map((shift) => ({ ...shift, sourceFormat: kind }));
}
/**
 * XLSX multi-sheet team-roster adapter. Every worksheet in the workbook is
 * read (ExcelJS — already a project dependency, no SheetJS added) and
 * independently converted into a RosterTable, then converged through the
 * SAME normalizer every other format uses (adapters/structured-rows.ts).
 *
 * A sheet is classified before it is trusted:
 *  - 'processed'  — header row matched employee+date columns, rows parsed.
 *  - 'empty'      — no non-empty rows at all.
 *  - 'ignored'    — has content but no recognizable roster header
 *                   (instructions/notes sheets land here, not as an error).
 *
 * Sheets are merged by employee key across the whole workbook — two sheets
 * describing the same employee/date collide through the normalizer's
 * existing duplicate handling, never silently double-imported. A sheet
 * name that matches an existing area (e.g. "Logística") is carried as an
 * area-name HINT only on rows that don't already have their own area
 * column — it never creates an area and never overrides an explicit one.
 */
import { IngestionError } from '../../lib/ingestion-errors';
import { ParsedCalendarShift } from '../../lib/import-types';
import { findHeaderColumnIndex, RosterTable } from '../tabular-assistant';
import { normalizeStructuredRows, RowDiagnostic, StructuredShiftRow } from './structured-rows';
import { DetectedTeamEmployee, TeamRosterDetection } from '../team-roster';
import { normalizeTimeToken } from '../core/normalize';
import { resolveShiftTypeId } from '../../lib/shift-types';

export type SheetStatus = 'processed' | 'empty' | 'ignored';

export interface SheetSummary {
  sheetName: string;
  status: SheetStatus;
  rowCount: number;
}

export interface WorkbookTeamRosterResult extends TeamRosterDetection {
  diagnostics: RowDiagnostic[];
  sheets: SheetSummary[];
  /** Positional employee calendars are eligible for automatic dispatch. */
  layout: 'tabular' | 'individual-calendar' | 'unknown';
}

interface Worksheet {
  name: string;
  eachRow: (options: { includeEmpty: boolean }, callback: (row: WorksheetRow, rowNumber: number) => void) => void;
}

interface WorksheetRow {
  eachCell: (options: { includeEmpty: boolean }, callback: (cell: { value: unknown }, columnNumber: number) => void) => void;
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  // ExcelJS formula cells expose { result } / rich text exposes { richText }.
  if (typeof value === 'object') {
    const obj = value as { result?: unknown; text?: string; richText?: Array<{ text: string }> };
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part) => part.text).join('').trim();
    }
    if (obj.result !== undefined) {
      return cellToText(obj.result);
    }
    if (typeof obj.text === 'string') {
      return obj.text.trim();
    }
    return '';
  }
  return String(value).trim();
}

type SheetGridResult =
  | { kind: 'empty' }
  | { kind: 'ignored' }
  | { kind: 'table'; table: RosterTable };

function sheetToRosterTable(sheet: Worksheet): SheetGridResult {
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellToText(cell.value);
    });
    grid[rowNumber - 1] = cells.map((cell) => cell ?? '');
  });

  const nonEmptyRows = grid.filter((row) => row && row.some((cell) => cell.trim().length > 0));
  if (nonEmptyRows.length === 0) {
    return { kind: 'empty' };
  }
  if (nonEmptyRows.length < 2) {
    return { kind: 'ignored' };
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  if (headerRow.filter(Boolean).length < 2) {
    return { kind: 'ignored' };
  }
  return { kind: 'table', table: { headers: headerRow, rows: dataRows } };
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

function cleanCell(value: string): string {
  return value.replace(/!/g, '').replace(/\s+/g, ' ').trim();
}

function positionalCalendarFromSheet(sheet: Worksheet): { employee: DetectedTeamEmployee; rowCount: number } | null {
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellToText(cell.value);
    });
    grid[rowNumber - 1] = cells.map((cell) => cell ?? '');
  });

  const title = grid.flat().find((value) => /calendario\s+\d{4}/i.test(value)) ?? '';
  const yearMatch = title.match(/calendario\s+(\d{4})/i);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const employeeName = title
    .replace(/\s+calendario\s+\d{4}.*/i, '')
    .trim();
  if (!year || !employeeName) {
    return null;
  }

  const shifts: ParsedCalendarShift[] = [];
  let populatedMonths = 0;
  for (const row of grid) {
    const month = MONTHS[cleanCell(row?.[0] ?? '').toLowerCase()];
    if (!month) continue;
    const dayHeader = grid.find((candidate) => candidate?.slice(1).some((value) => /^\d{1,2}$/.test(value.trim())));
    if (!dayHeader) continue;
    let monthHasData = false;
    for (let column = 1; column < row.length; column += 1) {
      const day = Number(dayHeader[column]);
      if (!day || day > 31) continue;
      const raw = cleanCell(row[column] ?? '');
      if (!raw) continue;
      const times = raw.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (times.length >= 2) {
        shifts.push({ date, startTime: normalizeTimeToken(times[0] ?? ''), endTime: normalizeTimeToken(times[1] ?? ''), origin: 'IMP', isValid: true, confidence: 0.95, rawText: raw, shiftType: 'Regular', notes: null, color: null });
        monthHasData = true;
      } else {
        // These document codes are known rest markers in this calendar
        // family. Keep the product registry authoritative, with the
        // documented DL/AJ compatibility fallback when no user alias exists.
        const type = resolveShiftTypeId(raw) ?? (/^(DL|AJ)$/i.test(raw) ? 'Libre' : null);
        if (type) {
          shifts.push({ date, startTime: '', endTime: '', origin: 'IMP', isValid: true, confidence: 0.95, rawText: raw, shiftType: type, notes: null, color: null });
          monthHasData = true;
        }
      }
    }
    if (monthHasData) populatedMonths += 1;
  }
  return populatedMonths > 0 ? {
    employee: { key: `name:${employeeName.toLowerCase()}`, externalEmployeeId: '', name: employeeName, shifts },
    rowCount: shifts.length,
  } : null;
}

/**
 * Reads every worksheet of the given file, classifies each, and merges the
 * processed ones into one TeamRosterDetection. Throws
 * IngestionError('INVALID_XLSX') when the workbook itself cannot be loaded.
 */
export async function parseXlsxTeamWorkbook(file: File): Promise<WorkbookTeamRosterResult> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch (err) {
    throw new IngestionError('INVALID_XLSX', `No se pudo leer el archivo XLSX: ${(err as Error).message}`);
  }

  if (workbook.worksheets.length === 0) {
    throw new IngestionError('INVALID_XLSX', 'El libro XLSX no contiene ninguna hoja.');
  }

  const sheets: SheetSummary[] = [];
  const allRows: StructuredShiftRow[] = [];
  const allDiagnostics: RowDiagnostic[] = [];
  let positionalEmployee: DetectedTeamEmployee | null = null;
  let sawTabularSheet = false;

  for (const sheet of workbook.worksheets as unknown as Worksheet[]) {
    const gridResult = sheetToRosterTable(sheet);
    const positional = positionalCalendarFromSheet(sheet);
    if (positional) {
      positionalEmployee = positional.employee;
      sheets.push({ sheetName: sheet.name, status: 'processed', rowCount: positional.rowCount });
      continue;
    }
    if (gridResult.kind !== 'table') {
      sheets.push({ sheetName: sheet.name, status: gridResult.kind, rowCount: 0 });
      allDiagnostics.push({
        code: gridResult.kind === 'empty' ? 'SHEET_EMPTY' : 'SHEET_IGNORED',
        severity: 'warning',
        message: `Sheet "${sheet.name}" has no usable content.`,
        sourceRef: sheet.name,
      });
      continue;
    }
    const { table } = gridResult;

    const nameCol = findHeaderColumnIndex(table.headers, 'employee');
    const dateCol = findHeaderColumnIndex(table.headers, 'date');
    if (nameCol === null || dateCol === null) {
      sheets.push({ sheetName: sheet.name, status: 'ignored', rowCount: table.rows.length });
      allDiagnostics.push({
        code: 'SHEET_SCHEMA_UNKNOWN',
        severity: 'warning',
        message: `Sheet "${sheet.name}" has no recognizable employee/date columns — treated as notes/instructions.`,
        sourceRef: sheet.name,
      });
      continue;
    }
    sawTabularSheet = true;

    const idCol = findHeaderColumnIndex(table.headers, 'employeeId');
    const startCol = findHeaderColumnIndex(table.headers, 'start');
    const endCol = findHeaderColumnIndex(table.headers, 'end');
    const typeCol = findHeaderColumnIndex(table.headers, 'type');
    const areaCol = findHeaderColumnIndex(table.headers, 'area');
    const areaCodeCol = findHeaderColumnIndex(table.headers, 'areaCode');
    const notesCol = findHeaderColumnIndex(table.headers, 'notes');

    table.rows.forEach((row, index) => {
      allRows.push({
        employeeName: row[nameCol] ?? '',
        externalEmployeeId: idCol !== null ? (row[idCol] ?? '') : '',
        date: row[dateCol] ?? '',
        startTime: startCol !== null ? (row[startCol] ?? '') : '',
        endTime: endCol !== null ? (row[endCol] ?? '') : '',
        shiftType: typeCol !== null ? (row[typeCol] ?? '') : '',
        // Sheet name is only used as an area hint when the sheet carries no
        // explicit area column of its own — never overrides real data, and
        // never creates an area on its own (resolution/creation happens
        // server-side against the org's real areas).
        areaName: areaCol !== null ? (row[areaCol] ?? '') : sheet.name,
        areaCode: areaCodeCol !== null ? (row[areaCodeCol] ?? '') : undefined,
        notes: notesCol !== null ? (row[notesCol] ?? '') : undefined,
        sourceRef: `${sheet.name}!row${index + 2}`,
      });
    });
    sheets.push({ sheetName: sheet.name, status: 'processed', rowCount: table.rows.length });
  }

  const { employees, diagnostics } = normalizeStructuredRows(allRows);
  if (positionalEmployee) {
    return { employees: [positionalEmployee], diagnostics: allDiagnostics, sheets, layout: 'individual-calendar' };
  }
  return { employees, diagnostics: [...allDiagnostics, ...diagnostics], sheets, layout: sawTabularSheet ? 'tabular' : 'unknown' };
}

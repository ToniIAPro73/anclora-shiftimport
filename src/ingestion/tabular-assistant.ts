/**
 * Tabular (CSV / non-positional) format assistant — Phase 1A remediation.
 *
 * Pure module for roster-style CSV documents that the positional pipeline
 * cannot fingerprint (no positioned layout): it parses the raw text into a
 * plain table (headers + rows), detects date/employee/day columns WITHOUT
 * inventing coordinates, and turns assistant answers into a PII-free
 * UserFormatProfile plus a one-shot re-parse.
 *
 * PII boundary (hard rule, same as assistant.ts):
 * - EmployeeRowCandidate.label is the employee cell AS PRINTED — display-only,
 *   never persisted. For tabular candidates page/y are SENTINELS (0/0): table
 *   rows have no positional meaning, only rowIndex identifies the row.
 * - The profile stores rowIndex/column indices and document TOKENS only —
 *   never person names, ids or cell values (headers are hashed one-way into
 *   the layout signature's structureHash).
 *
 * This module also owns the shared CSV primitives (splitTableLine,
 * normalizeTableHeader, parseTableDate, ROSTER_HEADER_ALIASES) so both the
 * canonical roster parser (parsers/file.ts) and the assistant fallback use
 * the exact same delimiter/date logic.
 */
import {
  computeLayoutSignature,
  FORMAT_PROFILE_VERSION,
  UserFormatProfile,
} from '../lib/format-profiles';
import { CalendarImportContext, ParsedCalendarShift } from '../lib/import-types';
import { computeImportResult, ImportResult, QualitySignals } from '../lib/import-quality';
import { resolveShiftTypeId } from '../lib/shift-types';
import { getDaysInMonth } from '../lib/week';
import { normalizeText, normalizeTimeToken } from './core/normalize';
import { EmployeeSelector, matchesNameTokens } from './core/row-detection';
import {
  AssistantAnswers,
  AssistantQuestion,
  DOCUMENT_TYPE_LABELS,
  EmployeeRowCandidate,
} from './assistant';

export interface RosterTable {
  headers: string[];
  rows: string[][];
}

export const splitTableLine = (line: string): string[] =>
  line.split(/[,;\t]/).map((cell) => cell.trim());

/**
 * RFC4180-style single-line CSV field parser: a field starting with `"` is
 * quoted (delimiters inside it are literal, `""` is an escaped quote) and
 * runs until its closing `"`. Any other field is read verbatim up to the
 * next delimiter — this is what makes `30394,"Casero Bosquet, Ana Maria"`
 * parse as two fields (`30394`, `Casero Bosquet, Ana Maria`) instead of
 * three, which a naive `split(',')` can never do correctly.
 *
 * Returns `malformed: true` only for a genuinely broken quote structure —
 * a quote that never closes before the line ends, or a `"` appearing
 * somewhere a real quoted field never puts one (mid-field, not as the
 * field's very first character or a doubled `""` escape). A well-formed
 * quoted field (or a field with no quotes at all) is always `malformed:
 * false` — this is deliberately NOT "any quote character present".
 */
export function parseCsvLine(line: string, delimiter = ','): { cells: string[]; malformed: boolean } {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  let malformed = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      if (current === '') {
        inQuotes = true;
      } else {
        // A quote appearing after the field has already started (not as an
        // escape, since we're not inQuotes) never happens in well-formed
        // CSV — this is the actual malformed-structure signal.
        malformed = true;
        current += char;
      }
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (inQuotes) {
    malformed = true;
  }
  cells.push(current.trim());
  return { cells, malformed };
}

/** Strips a leading UTF-8 BOM (U+FEFF), if present — a CSV saved as
 * "UTF-8 with BOM" must parse identically to plain UTF-8. */
export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

const CSV_DELIMITER_CANDIDATES = [',', ';', '\t'];

/**
 * Picks the delimiter that splits the header line into the most columns \u2014
 * `,` is the RFC4180 default, but Spanish/German/French Excel exports
 * `;`-delimited CSV by default (their locale uses `,` as the decimal
 * separator), and some exports use tabs. Matches the delimiter set the
 * previous naive splitter (`splitTableLine`) accepted, so switching to a
 * real quote-aware parser doesn't narrow what already worked.
 */
export function detectCsvDelimiter(headerLine: string): string {
  let best = CSV_DELIMITER_CANDIDATES[0];
  let bestCount = 0;
  for (const candidate of CSV_DELIMITER_CANDIDATES) {
    const { cells, malformed } = parseCsvLine(headerLine, candidate);
    if (!malformed && cells.length > bestCount) {
      best = candidate;
      bestCount = cells.length;
    }
  }
  return best;
}

export function normalizeTableHeader(value: string): string {
  // underscores become spaces so worker_id matches the alias "worker id"
  return normalizeText(value).replace(/_/g, ' ');
}

/**
 * Canonical roster CSV header aliases. Matched after normalization so
 * accents/case do not matter.
 */
export const ROSTER_HEADER_ALIASES: Record<string, string[]> = {
  date: ['fecha', 'dia', 'fecha turno', 'fecha del turno', 'fecha de trabajo', 'date', 'day'],
  start: ['inicio', 'hora inicio', 'entrada', 'desde', 'start', 'start time', 'starttime', 'hora_inicio'],
  end: ['fin', 'hora fin', 'salida', 'hasta', 'end', 'end time', 'endtime', 'hora_fin'],
  type: ['tipo', 'turno', 'tipo turno', 'tipo de turno', 'shift type', 'shifttype', 'type'],
  employee: ['empleado', 'nombre', 'nombre empleado', 'trabajador', 'employee', 'employee name', 'employeename'],
  employeeId: ['id', 'legajo', 'identificador', 'employee id', 'employeeid', 'worker id', 'member id', 'external employee id', 'externalemployeeid', 'external id'],
  value: ['value', 'registro', 'detalle', 'turnos', 'slots', 'allotment'],
  area: ['area', 'área', 'departamento', 'department', 'sección', 'seccion', 'areaname'],
  areaCode: ['area code', 'areacode', 'codigo area', 'código área'],
  notes: ['notes', 'notas', 'observaciones', 'comentarios', 'comment', 'comments'],
};

export type RosterHeaderField = keyof typeof ROSTER_HEADER_ALIASES;

/** Header alias lookup; null when no column matches the field's aliases. */
export function findHeaderColumnIndex(headers: string[], field: RosterHeaderField): number | null {
  const aliasSet = new Set(ROSTER_HEADER_ALIASES[field].map(normalizeTableHeader));
  const index = headers.findIndex((header) => aliasSet.has(normalizeTableHeader(header)));
  return index >= 0 ? index : null;
}

/** Parses dd/mm/yyyy, d/m/yyyy, dd-mm-yyyy and ISO yyyy-mm-dd. */
export function parseTableDate(value: string): string | null {
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

/**
 * Extracts a day-of-month (1..31) from a grid header: a plain day number
 * ("1", "05"), a dd/mm(/yyyy) header or an ISO date. Null when the header
 * carries no day information.
 */
export function dayNumberFromHeader(header: string): number | null {
  const trimmed = header.trim();
  const plain = trimmed.match(/^(\d{1,2})$/);
  if (plain) {
    const day = Number.parseInt(plain[1], 10);
    return day >= 1 && day <= 31 ? day : null;
  }
  const iso = trimmed.match(/^\d{4}-\d{1,2}-(\d{1,2})$/);
  if (iso) {
    return Number.parseInt(iso[1], 10);
  }
  const dayFirst = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.]\d{2,4})?$/);
  if (dayFirst) {
    return Number.parseInt(dayFirst[1], 10);
  }
  return null;
}

/**
 * Parses raw CSV/plain text into a plain table: first non-empty line is the
 * header row, the rest are data rows. A quoted field (`30394,"Casero
 * Bosquet, Ana Maria"`) is parsed correctly — the comma inside the quotes
 * stays part of the field, never splits it. Returns null for a genuinely
 * malformed line (an malformed quote) or for documents without at least
 * a header row plus one data row. Strips a leading UTF-8 BOM first, so
 * "UTF-8 with BOM" and plain UTF-8 parse identically.
 */
export function parseRosterTable(text: string): RosterTable | null {
  const lines = stripBom(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    return null;
  }
  const delimiter = detectCsvDelimiter(lines[0]);
  const headerParsed = parseCsvLine(lines[0], delimiter);
  if (headerParsed.malformed) {
    return null;
  }
  const headers = headerParsed.cells;
  if (headers.filter(Boolean).length < 2) {
    return null;
  }
  const rows: string[][] = [];
  for (const line of lines.slice(1)) {
    const parsed = parseCsvLine(line, delimiter);
    if (parsed.malformed) {
      return null;
    }
    rows.push(parsed.cells);
  }
  return { headers, rows };
}

export interface RosterTableAnalysis {
  /** date column via header alias, else first column whose non-empty cells ALL parse as dates */
  dateColumnIndex: number | null;
  /** employee column via header alias; grid layouts fall back to the leftmost label column */
  employeeColumnIndex: number | null;
  /** rows whose employee cell matches the selector (name tokens or id digits) */
  matchingRowIndices: number[];
  /** distinct value-column cells that are neither times, dates nor known shift types */
  unknownTokens: string[];
  /** grid-style CSV: columns whose header is a day number/date */
  dayHeaderColumns: number[];
  /** columns carrying shift values (everything except date/employee/employee-id) */
  valueColumnIndices: number[];
}

const TIME_LIKE = /\d{1,2}:\d{2}/;

/** Date column: header alias first, then strict per-column date detection. */
const detectDateColumnIndex = (table: RosterTable): number | null => {
  const byAlias = findHeaderColumnIndex(table.headers, 'date');
  if (byAlias !== null) {
    return byAlias;
  }
  for (let columnIndex = 0; columnIndex < table.headers.length; columnIndex += 1) {
    const cells = table.rows.map((row) => (row[columnIndex] ?? '').trim()).filter(Boolean);
    if (cells.length > 0 && cells.every((cell) => parseTableDate(cell) !== null)) {
      return columnIndex;
    }
  }
  return null;
};

export function analyzeRosterTable(table: RosterTable, selector: EmployeeSelector): RosterTableAnalysis {
  const dateColumnIndex = detectDateColumnIndex(table);
  const dayHeaderColumns = table.headers
    .map((header, index) => (dayNumberFromHeader(header) !== null ? index : -1))
    .filter((index) => index >= 0);
  const employeeIdColumnIndex = findHeaderColumnIndex(table.headers, 'employeeId');

  let employeeColumnIndex = findHeaderColumnIndex(table.headers, 'employee');
  if (
    employeeColumnIndex === null
    && dayHeaderColumns.length > 0
    && dateColumnIndex !== 0
    && !dayHeaderColumns.includes(0)
  ) {
    // Grid layout without a known employee alias: the leftmost column carries
    // the row labels.
    employeeColumnIndex = 0;
  }

  const excluded = new Set(
    [dateColumnIndex, employeeColumnIndex, employeeIdColumnIndex]
      .filter((index): index is number => index !== null),
  );
  const valueColumnIndices = table.headers
    .map((_, index) => index)
    .filter((index) => !excluded.has(index));

  const matchingRowIndices: number[] = [];
  if (employeeColumnIndex !== null) {
    const targetIds = selector.employeeIdentifiers
      .map((value) => value.replace(/\D/g, ''))
      .filter(Boolean);
    const nameTokens = normalizeText(selector.employeeName).split(' ').filter((token) => token.length >= 3);
    table.rows.forEach((row, rowIndex) => {
      const cell = (row[employeeColumnIndex] ?? '').trim();
      if (!cell) {
        return;
      }
      const cellDigits = cell.replace(/\D/g, '');
      const idHit = cellDigits.length > 0 && targetIds.includes(cellDigits);
      const nameHit = nameTokens.length > 0 && matchesNameTokens(cell, nameTokens);
      if (idHit || nameHit) {
        matchingRowIndices.push(rowIndex);
      }
    });
  }

  const seen = new Set<string>();
  const unknownTokens: string[] = [];
  for (const row of table.rows) {
    for (const columnIndex of valueColumnIndices) {
      const cell = (row[columnIndex] ?? '').trim();
      if (!cell || seen.has(cell)) {
        continue;
      }
      if (TIME_LIKE.test(cell) || resolveShiftTypeId(cell) || parseTableDate(cell)) {
        continue;
      }
      seen.add(cell);
      unknownTokens.push(cell);
    }
  }

  return {
    dateColumnIndex,
    employeeColumnIndex,
    matchingRowIndices,
    unknownTokens,
    dayHeaderColumns,
    valueColumnIndices,
  };
}

const MAX_TABULAR_ROWS = 8;
const MAX_TOKEN_QUESTIONS = 6;

/** Selector with no identity: used when only column detection is needed. */
const EMPTY_SELECTOR: EmployeeSelector = { employeeName: '', employeeIdentifiers: [] };

/**
 * Row-selection candidates from a table's employee column: one per DISTINCT
 * employee cell (an employee may span many rows), rowIndex = first row
 * carrying it. page/y are 0/0 sentinels — meaningless for tabular data.
 */
export function tabularRowCandidates(
  table: RosterTable,
  employeeColumnIndex: number,
): EmployeeRowCandidate[] {
  const firstRowByLabel = new Map<string, number>();
  table.rows.forEach((row, rowIndex) => {
    const label = (row[employeeColumnIndex] ?? '').trim();
    if (label && !firstRowByLabel.has(label)) {
      firstRowByLabel.set(label, rowIndex);
    }
  });
  return [...firstRowByLabel.entries()]
    .slice(0, MAX_TABULAR_ROWS)
    .map(([label, rowIndex]) => ({ label, page: 0, y: 0, rowIndex }));
}

/**
 * The tabular row-selection question, or null when the employee column is
 * missing, the selector already matches exactly one DISTINCT employee (a
 * roster spans many rows per person), or there are no candidates to show.
 */
export function tabularRowSelectionQuestion(
  table: RosterTable,
  analysis: RosterTableAnalysis,
): AssistantQuestion | null {
  if (analysis.employeeColumnIndex === null) {
    return null;
  }
  const matchedLabels = new Set(
    analysis.matchingRowIndices.map(
      (rowIndex) => (table.rows[rowIndex]?.[analysis.employeeColumnIndex as number] ?? '').trim(),
    ),
  );
  if (matchedLabels.size === 1) {
    return null;
  }
  const candidates = tabularRowCandidates(table, analysis.employeeColumnIndex);
  return candidates.length > 0 ? { kind: 'row-selection', candidates } : null;
}

/**
 * Turns a RosterTableAnalysis into assistant questions for CSV flows:
 * - row-selection when the employee column exists but the selector matches
 *   zero or several rows;
 * - day-mapping for grid-style CSV without a date column: asks which day the
 *   first day column represents (anchor; header-parsed day proposed);
 * - token-meaning per unknown value cell (cap 6).
 *
 * Safe failure: no date column AND no day headers (or no data rows) → no
 * questions at all; the UNRECOGNIZED state stands.
 */
export function generateTabularQuestions(
  table: RosterTable,
  analysis: RosterTableAnalysis,
): AssistantQuestion[] {
  if (table.rows.length === 0) {
    return [];
  }
  if (analysis.dateColumnIndex === null && analysis.dayHeaderColumns.length === 0) {
    return [];
  }

  const questions: AssistantQuestion[] = [];

  const rowSelection = tabularRowSelectionQuestion(table, analysis);
  if (rowSelection) {
    questions.push(rowSelection);
  }

  if (analysis.dateColumnIndex === null && analysis.dayHeaderColumns.length > 0) {
    const columnIndex = analysis.dayHeaderColumns[0];
    const header = table.headers[columnIndex] ?? '';
    const sampleTokens = [header, ...table.rows.slice(0, 2).map((row) => row[columnIndex] ?? '')]
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 3);
    questions.push({
      kind: 'day-mapping',
      columnIndex,
      sampleTokens,
      proposedDay: dayNumberFromHeader(header) ?? 1,
    });
  }

  for (const token of analysis.unknownTokens.slice(0, MAX_TOKEN_QUESTIONS)) {
    questions.push({ kind: 'token-meaning', token });
  }

  return questions;
}

const generateProfileId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Resolved day for a day-mapping answer over a tabular grid anchor column. */
const resolvedTabularDay = (
  table: RosterTable,
  analysis: RosterTableAnalysis,
  dayMapping: { confirmed: boolean; correctedDay?: number },
): number | null => {
  const anchorColumn = analysis.dayHeaderColumns[0];
  if (anchorColumn === undefined) {
    return null;
  }
  const headerDay = dayNumberFromHeader(table.headers[anchorColumn] ?? '') ?? 1;
  const day = dayMapping.confirmed ? headerDay : (dayMapping.correctedDay ?? null);
  return day !== null && Number.isInteger(day) && day >= 1 ? day : null;
};

/**
 * Builds the persisted format profile for a tabular document from the
 * assistant answers. PII-free by construction: rowIndex strategy (never the
 * employee cell), hashed header signature, answered tokens only, and the
 * positional `tabular` column memory for repeat documents.
 */
export function buildTabularProfileFromAnswers(
  table: RosterTable,
  analysis: RosterTableAnalysis,
  answers: AssistantAnswers,
): UserFormatProfile {
  const now = new Date().toISOString();

  const tokenAliases: Record<string, string> = {};
  const offTokens: string[] = [];
  for (const [token, meaning] of Object.entries(answers.tokenMeanings)) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }
    tokenAliases[trimmed] = meaning.shiftTypeId ?? (meaning.kind === 'work' ? 'Regular' : 'Libre');
    if (meaning.kind === 'rest') {
      offTokens.push(trimmed);
    }
  }

  let dayColumnMap: Record<number, number> | undefined;
  if (answers.dayMapping) {
    const anchorColumn = analysis.dayHeaderColumns[0];
    const day = resolvedTabularDay(table, analysis, answers.dayMapping);
    if (anchorColumn !== undefined && day !== null) {
      dayColumnMap = { [anchorColumn]: day };
    }
  }

  return {
    profileVersion: FORMAT_PROFILE_VERSION,
    id: generateProfileId(),
    label: DOCUMENT_TYPE_LABELS.TYPE_TAB,
    signature: computeLayoutSignature({
      documentType: 'TYPE_TAB',
      dayHeaderCount: analysis.dayHeaderColumns.length,
      columnCount: table.headers.length,
      hasLegend: false,
      structureTokens: table.headers,
    }),
    tokenAliases,
    offTokens,
    employeeRow: answers.selectedRow
      ? { strategy: 'manual-row', rowIndex: answers.selectedRow.rowIndex }
      : { strategy: 'name' },
    parserParams: { clusterTolerance: 0, columnMatchMaxDistance: 0 },
    ...(dayColumnMap ? { dayColumnMap } : {}),
    tabular: {
      dateColumnIndex: analysis.dateColumnIndex,
      employeeColumnIndex: analysis.employeeColumnIndex,
      valueColumnIndices: analysis.valueColumnIndices,
    },
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  };
}

const untimedShift = (date: string, shiftType: string, rawText: string): ParsedCalendarShift => ({
  date,
  startTime: '',
  endTime: '',
  origin: 'IMP',
  isValid: true,
  confidence: 0.8,
  rawText,
  shiftType,
  notes: null,
  color: null,
});

/**
 * Builds the shifts of ONE date from its value cells:
 * - answered tokens apply first (work/rest classification, optional times);
 * - time-bearing cells contribute their times, paired sequentially into
 *   work shifts (covers "08:00-14:00" ranges and split shifts);
 * - cells resolving through the shift-type registry become untimed typed
 *   shifts (Libre/Vacaciones) or annotate the row's work shifts (Extras…);
 * - unknown cells are skipped (they are surfaced via token-meaning).
 */
function buildTabularCellShifts(
  date: string,
  cells: string[],
  tokenMeanings: AssistantAnswers['tokenMeanings'],
): ParsedCalendarShift[] {
  const shifts: ParsedCalendarShift[] = [];
  const workTimes: string[] = [];
  const rawWorkCells: string[] = [];
  let typedWork: { typeId: string; raw: string } | null = null;

  for (const rawCell of cells) {
    const cell = rawCell.trim();
    if (!cell) {
      continue;
    }

    const meaning = tokenMeanings[cell];
    if (meaning) {
      if (meaning.kind === 'rest') {
        shifts.push(untimedShift(date, meaning.shiftTypeId ?? 'Libre', cell));
      } else if (meaning.startTime && meaning.endTime) {
        shifts.push({
          date,
          startTime: meaning.startTime,
          endTime: meaning.endTime,
          origin: 'IMP',
          isValid: true,
          confidence: 0.9,
          rawText: cell,
          shiftType: meaning.shiftTypeId ?? 'Regular',
          notes: null,
          color: null,
        });
      } else {
        shifts.push(untimedShift(date, meaning.shiftTypeId ?? 'Regular', cell));
      }
      continue;
    }

    const times = Array.from(
      cell.matchAll(/\b(\d{1,2}:\d{2})\b/g),
      (match) => normalizeTimeToken(match[1]),
    );
    if (times.length > 0) {
      workTimes.push(...times);
      rawWorkCells.push(cell);
      continue;
    }

    const typeId = resolveShiftTypeId(cell);
    if (!typeId) {
      continue;
    }
    if (typeId === 'Libre' || typeId === 'Vacaciones') {
      shifts.push(untimedShift(date, typeId, cell));
    } else {
      typedWork ??= { typeId, raw: cell };
    }
  }

  for (let index = 0; index < workTimes.length; index += 2) {
    const startTime = workTimes[index];
    const endTime = workTimes[index + 1] ?? '??:??';
    shifts.push({
      date,
      startTime,
      endTime,
      origin: 'IMP',
      isValid: endTime !== '??:??',
      confidence: 0.9,
      rawText: rawWorkCells.join(' '),
      shiftType: typedWork?.typeId ?? 'Regular',
      notes: null,
      color: null,
    });
  }
  if (workTimes.length === 0 && typedWork) {
    shifts.push(untimedShift(date, typedWork.typeId, typedWork.raw));
  }

  return shifts;
}

/** Rows the answers scope the re-parse to (manual selection by cell label). */
const targetRows = (
  table: RosterTable,
  analysis: RosterTableAnalysis,
  answers: AssistantAnswers,
): string[][] => {
  if (!answers.selectedRow || analysis.employeeColumnIndex === null) {
    return table.rows;
  }
  const label = answers.selectedRow.label.trim();
  return table.rows.filter(
    (row) => (row[analysis.employeeColumnIndex as number] ?? '').trim() === label,
  );
};

/**
 * One-shot re-parse of a tabular document with the assistant answers.
 *
 * - Date-column mode: one date per row from the real date cell; unparseable
 *   dates are skipped (never fabricated).
 * - Grid mode (no date column): dates come from the day-number headers plus
 *   the context month/year, with the answered day-mapping correction applied
 *   to the anchor column (clamped to the month length; on collision the
 *   corrected anchor wins and the displaced column stays unassigned). No
 *   date outside the context month can be produced here.
 */
export function parseRosterTableWithAnswers(
  table: RosterTable,
  answers: AssistantAnswers,
  context: CalendarImportContext,
): ParsedCalendarShift[] {
  const analysis = analyzeRosterTable(table, EMPTY_SELECTOR);
  const rows = targetRows(table, analysis, answers);
  const shifts: ParsedCalendarShift[] = [];

  if (analysis.dateColumnIndex !== null) {
    for (const row of rows) {
      const date = parseTableDate(row[analysis.dateColumnIndex] ?? '');
      if (!date) {
        continue;
      }
      const cells = analysis.valueColumnIndices.map((index) => row[index] ?? '');
      shifts.push(...buildTabularCellShifts(date, cells, answers.tokenMeanings));
    }
  } else if (analysis.dayHeaderColumns.length > 0) {
    const daysInMonth = getDaysInMonth(context.year, context.month);
    const anchorColumn = analysis.dayHeaderColumns[0];
    const correctedDay = answers.dayMapping
      ? resolvedTabularDay(table, analysis, answers.dayMapping)
      : null;

    const usedDays = new Set<number>();
    const columnDays: Array<{ columnIndex: number; day: number }> = [];
    for (const columnIndex of analysis.dayHeaderColumns) {
      let day = dayNumberFromHeader(table.headers[columnIndex] ?? '');
      if (columnIndex === anchorColumn && correctedDay !== null) {
        day = Math.min(Math.max(1, correctedDay), daysInMonth);
      }
      if (day === null || day < 1 || day > daysInMonth || usedDays.has(day)) {
        continue;
      }
      usedDays.add(day);
      columnDays.push({ columnIndex, day });
    }

    for (const row of rows) {
      for (const { columnIndex, day } of columnDays) {
        const date = `${context.year}-${String(context.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        shifts.push(...buildTabularCellShifts(date, [row[columnIndex] ?? ''], answers.tokenMeanings));
      }
    }
  }

  return shifts.sort((left, right) =>
    left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime));
}

/**
 * Re-parse + quality recompute for the tabular assistant confirm path, so
 * the preview refreshes with the same signal model as the positional flow.
 */
export function buildTabularImportResult(
  table: RosterTable,
  answers: AssistantAnswers,
  context: CalendarImportContext,
): { shifts: ParsedCalendarShift[]; quality: ImportResult } {
  const shifts = parseRosterTableWithAnswers(table, answers, context);
  const analysis = analyzeRosterTable(table, EMPTY_SELECTOR);

  const answeredTokens = new Set(Object.keys(answers.tokenMeanings));
  const remainingUnknown = analysis.unknownTokens.filter((token) => !answeredTokens.has(token));

  let totalTokens = 0;
  let recognizedTokens = 0;
  for (const row of table.rows) {
    for (const columnIndex of analysis.valueColumnIndices) {
      const cell = (row[columnIndex] ?? '').trim();
      if (!cell) {
        continue;
      }
      totalTokens += 1;
      if (!analysis.unknownTokens.includes(cell) || answeredTokens.has(cell)) {
        recognizedTokens += 1;
      }
    }
  }

  const mappedDays = new Set(shifts.map((shift) => shift.date)).size;
  const signals: QualitySignals = {
    knownProfileMatched: false,
    profileDrift: false,
    periodDetected: true,
    // No employee column = single-employee document; a manual row selection
    // is a strong match by construction.
    employeeMatch: analysis.employeeColumnIndex === null || answers.selectedRow ? 'strong' : 'none',
    expectedDays: mappedDays,
    mappedDays,
    totalTokens,
    recognizedTokens,
    unknownTokens: remainingUnknown,
    invalidTimes: 0,
    incompleteAssignments: shifts.filter((shift) => !shift.isValid).length,
  };

  return { shifts, quality: computeImportResult(shifts, signals) };
}

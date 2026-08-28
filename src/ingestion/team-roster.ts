/**
 * Fase 1.2F: team roster CSV detection — one row per (employee, date),
 * enumerating every distinct employee in the file so the UI can offer
 * individual/multi/select-all import (contract 1.2F.1-1.2F.4).
 *
 * Deliberately narrower than the single-employee tabular assistant
 * (`tabular-assistant.ts`), which resolves ONE selector via interactive
 * Q&A: this scans the whole file and groups by employee up front, no
 * questions asked. Only the date-column CSV shape is supported (external
 * id / name / date / start / end columns) — grid/day-header CSVs and PDFs
 * stay on the existing single-employee flow.
 *
 * Shift type is inferred structurally, not via the shift-type alias
 * registry: a row with both start and end times is a worked (Regular)
 * shift; anything else (DL, AJ, blank) is treated as Libre. That keeps
 * this module dependency-light and matches the reference dataset
 * (test-data/fixtures/parser-regression/04_turnos_septiembre_2026.csv).
 */
import { ParsedCalendarShift } from '../lib/import-types';
import { findHeaderColumnIndex, parseRosterTable, RosterTable } from './tabular-assistant';
import { normalizeStructuredRows, RowDiagnostic, StructuredShiftRow } from './adapters/structured-rows';

export interface DetectedTeamEmployee {
  /** Stable grouping key: external id when present, else a normalized-name key. */
  key: string;
  externalEmployeeId: string;
  name: string;
  shifts: ParsedCalendarShift[];
  /** Area carried by the source file (area/areaCode column), when present.
   * A hint only — resolution against the org's real areas happens server
   * side; an unknown area never creates one implicitly. */
  areaName?: string;
  areaCode?: string;
}

export interface TeamRosterDetection {
  employees: DetectedTeamEmployee[];
  /** Row-level issues (invalid date, incomplete shift, duplicate, unknown
   * code) collected while normalizing — additive, existing callers that
   * ignore it are unaffected. */
  diagnostics?: RowDiagnostic[];
}

/**
 * Converts an already-parsed RosterTable into structured rows and feeds
 * them through the shared normalizer (adapters/structured-rows.ts) — the
 * single convergence point every format (CSV, XLSX per-sheet, JSON, XML)
 * shares. Returns null when the table doesn't even have the minimum
 * employee+date columns (not tabular-roster-shaped at all); this null
 * short-circuit stays a per-format decision, not the normalizer's job.
 */
export function buildTeamRosterFromTable(table: RosterTable): TeamRosterDetection | null {
  const nameCol = findHeaderColumnIndex(table.headers, 'employee');
  const dateCol = findHeaderColumnIndex(table.headers, 'date');
  if (nameCol === null || dateCol === null) {
    return null;
  }
  const idCol = findHeaderColumnIndex(table.headers, 'employeeId');
  const startCol = findHeaderColumnIndex(table.headers, 'start');
  const endCol = findHeaderColumnIndex(table.headers, 'end');
  const typeCol = findHeaderColumnIndex(table.headers, 'type');
  const areaCol = findHeaderColumnIndex(table.headers, 'area');
  const areaCodeCol = findHeaderColumnIndex(table.headers, 'areaCode');
  const notesCol = findHeaderColumnIndex(table.headers, 'notes');

  const rows: StructuredShiftRow[] = table.rows.map((row, index) => ({
    employeeName: row[nameCol] ?? '',
    externalEmployeeId: idCol !== null ? (row[idCol] ?? '') : '',
    date: row[dateCol] ?? '',
    startTime: startCol !== null ? (row[startCol] ?? '') : '',
    endTime: endCol !== null ? (row[endCol] ?? '') : '',
    shiftType: typeCol !== null ? (row[typeCol] ?? '') : '',
    areaName: areaCol !== null ? (row[areaCol] ?? '') : undefined,
    areaCode: areaCodeCol !== null ? (row[areaCodeCol] ?? '') : undefined,
    notes: notesCol !== null ? (row[notesCol] ?? '') : undefined,
    sourceRef: `row ${index + 2}`,
  }));

  const result = normalizeStructuredRows(rows);
  return result.employees.length > 0 ? result : null;
}

export function detectTeamRoster(text: string): TeamRosterDetection | null {
  const table = parseRosterTable(text);
  if (!table) {
    return null;
  }
  return buildTeamRosterFromTable(table);
}

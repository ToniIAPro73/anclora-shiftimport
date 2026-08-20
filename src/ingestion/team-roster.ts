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
 * (test-data/synthetic/shiftimport-v1/04_turnos_septiembre_2026.csv).
 */
import { ParsedCalendarShift } from '../lib/import-types';
import { findHeaderColumnIndex, parseRosterTable, parseTableDate } from './tabular-assistant';

export interface DetectedTeamEmployee {
  /** Stable grouping key: external id when present, else a normalized-name key. */
  key: string;
  externalEmployeeId: string;
  name: string;
  shifts: ParsedCalendarShift[];
}

export interface TeamRosterDetection {
  employees: DetectedTeamEmployee[];
}

export function detectTeamRoster(text: string): TeamRosterDetection | null {
  const table = parseRosterTable(text);
  if (!table) {
    return null;
  }

  const nameCol = findHeaderColumnIndex(table.headers, 'employee');
  const dateCol = findHeaderColumnIndex(table.headers, 'date');
  if (nameCol === null || dateCol === null) {
    return null;
  }
  const idCol = findHeaderColumnIndex(table.headers, 'employeeId');
  const startCol = findHeaderColumnIndex(table.headers, 'start');
  const endCol = findHeaderColumnIndex(table.headers, 'end');

  const byKey = new Map<string, DetectedTeamEmployee>();

  for (const row of table.rows) {
    const name = (row[nameCol] ?? '').trim();
    if (!name) {
      continue;
    }
    const date = parseTableDate(row[dateCol] ?? '');
    if (!date) {
      continue;
    }

    const externalEmployeeId = idCol !== null ? (row[idCol] ?? '').trim() : '';
    const key = externalEmployeeId || `name:${name.toLowerCase()}`;

    let employee = byKey.get(key);
    if (!employee) {
      employee = { key, externalEmployeeId, name, shifts: [] };
      byKey.set(key, employee);
    }

    const startTime = startCol !== null ? (row[startCol] ?? '').trim() : '';
    const endTime = endCol !== null ? (row[endCol] ?? '').trim() : '';
    const isWork = Boolean(startTime && endTime);

    employee.shifts.push({
      date,
      startTime: isWork ? startTime : '',
      endTime: isWork ? endTime : '',
      origin: 'IMP',
      isValid: true,
      confidence: 0.9,
      rawText: row.join(' '),
      shiftType: isWork ? 'Regular' : 'Libre',
      notes: null,
      color: null,
    });
  }

  const employees = [...byKey.values()];
  return employees.length > 0 ? { employees } : null;
}

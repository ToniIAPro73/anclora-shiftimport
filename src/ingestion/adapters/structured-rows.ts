/**
 * Canonical convergence point for every structured team-import source
 * (CSV/table, XLSX per-sheet, JSON, XML). Each format-specific adapter only
 * has to produce `StructuredShiftRow[]` — one row per (employee, date)
 * candidate, field names already resolved — and hand it to
 * `normalizeStructuredRows`, which does the ONE grouping/validation/dedup
 * pass every format shares: employee grouping by external id (falling back
 * to normalized name), date/time validation, incomplete-shift detection and
 * intra-batch duplicate handling.
 *
 * This is deliberately the single place that turns raw rows into
 * `DetectedTeamEmployee[]` — no format gets its own parallel copy of this
 * logic (see SHIFTIMPORT_MULTIFORMAT_INGESTION architecture notes).
 */
import { ParsedCalendarShift } from '../../lib/import-types';
import { IngestionErrorCode } from '../../lib/ingestion-errors';
import { resolveShiftTypeId } from '../../lib/shift-types';
import { normalizeTimeToken } from '../core/normalize';
import { parseTableDate } from '../tabular-assistant';
import { DetectedTeamEmployee, TeamRosterDetection } from '../team-roster';

/** One row before grouping — field names already resolved by the adapter. */
export interface StructuredShiftRow {
  externalEmployeeId: string;
  employeeName: string;
  areaName?: string;
  areaCode?: string;
  /** Raw date token as found in the source; parsed via parseTableDate. */
  date: string;
  shiftType?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  /** Provenance for diagnostics (sheet name, array index, element position). */
  sourceRef?: string;
}

export interface RowDiagnostic {
  code: IngestionErrorCode;
  severity: 'error' | 'warning';
  /** Dev-facing detail; the UI maps `code` to an i18n key. */
  message: string;
  sourceRef?: string;
  employeeKey?: string;
  date?: string;
}

export interface StructuredNormalizeResult extends TeamRosterDetection {
  diagnostics: RowDiagnostic[];
}

function groupKey(externalEmployeeId: string, name: string): string {
  return externalEmployeeId || `name:${name.toLowerCase()}`;
}

/**
 * Converges any structured row source into the same shape the CSV team
 * roster produces. Returns `{ employees: [], diagnostics }` (never null) —
 * callers that need the CSV "not tabular at all" null contract keep that
 * decision at the adapter boundary, before rows ever reach here.
 */
export function normalizeStructuredRows(rows: StructuredShiftRow[]): StructuredNormalizeResult {
  const diagnostics: RowDiagnostic[] = [];
  const byKey = new Map<string, DetectedTeamEmployee & { areaName?: string; areaCode?: string }>();
  const seenDates = new Map<string, Set<string>>();

  for (const row of rows) {
    const name = (row.employeeName ?? '').trim();
    const externalEmployeeId = (row.externalEmployeeId ?? '').trim();
    if (!name && !externalEmployeeId) {
      diagnostics.push({
        code: 'INSUFFICIENT_DATA',
        severity: 'error',
        message: 'Row has no employee name or external id.',
        sourceRef: row.sourceRef,
      });
      continue;
    }

    const date = parseTableDate(row.date ?? '');
    if (!date) {
      diagnostics.push({
        code: 'INVALID_DATE',
        severity: 'error',
        message: `Unparseable date "${row.date}".`,
        sourceRef: row.sourceRef,
        employeeKey: groupKey(externalEmployeeId, name || externalEmployeeId),
      });
      continue;
    }

    const key = groupKey(externalEmployeeId, name || externalEmployeeId);
    const startRaw = (row.startTime ?? '').trim();
    const endRaw = (row.endTime ?? '').trim();
    const hasStart = startRaw.length > 0;
    const hasEnd = endRaw.length > 0;

    if (hasStart !== hasEnd) {
      diagnostics.push({
        code: 'INCOMPLETE_SHIFT',
        severity: 'warning',
        message: `Row has only one of start/end time (${hasStart ? startRaw : endRaw}).`,
        sourceRef: row.sourceRef,
        employeeKey: key,
        date,
      });
      continue;
    }

    let dedupeSet = seenDates.get(key);
    if (!dedupeSet) {
      dedupeSet = new Set();
      seenDates.set(key, dedupeSet);
    }
    if (dedupeSet.has(date)) {
      diagnostics.push({
        code: 'DUPLICATE_RECORD',
        severity: 'warning',
        message: `Duplicate shift for ${key} on ${date}; keeping the first occurrence.`,
        sourceRef: row.sourceRef,
        employeeKey: key,
        date,
      });
      continue;
    }
    dedupeSet.add(date);

    const startTime = hasStart ? normalizeTimeToken(startRaw) : '';
    const endTime = hasEnd ? normalizeTimeToken(endRaw) : '';
    const isWork = hasStart && hasEnd;
    const rawType = (row.shiftType ?? '').trim();
    // Only registry-known codes (Regular/Libre/Vacaciones/Extras/custom
    // org aliases) are resolved; an org-specific work-shift label (M, T,
    // X1, ...) that isn't in the registry is NOT flagged as "unknown" here
    // — times are authoritative for a work row, and the raw label is kept
    // verbatim so it stays visible in preview/notes instead of being
    // collapsed into a generic "Regular".
    const resolvedType = rawType ? resolveShiftTypeId(rawType) : null;
    const shiftType = isWork ? (resolvedType || rawType || 'Regular') : (resolvedType || rawType || 'Libre');

    const shift: ParsedCalendarShift = {
      date,
      startTime: isWork ? startTime : '',
      endTime: isWork ? endTime : '',
      origin: 'IMP',
      isValid: true,
      confidence: 0.9,
      rawText: row.notes ? `${row.sourceRef ?? ''} ${row.notes}`.trim() : (row.sourceRef ?? ''),
      shiftType,
      notes: row.notes || null,
      color: null,
    };

    let employee = byKey.get(key);
    if (!employee) {
      employee = {
        key,
        externalEmployeeId,
        name: name || externalEmployeeId,
        shifts: [],
        areaName: row.areaName?.trim() || undefined,
        areaCode: row.areaCode?.trim() || undefined,
      };
      byKey.set(key, employee);
    } else if (!employee.areaName && row.areaName?.trim()) {
      employee.areaName = row.areaName.trim();
      employee.areaCode = row.areaCode?.trim() || employee.areaCode;
    }
    employee.shifts.push(shift);
  }

  return { employees: [...byKey.values()], diagnostics };
}

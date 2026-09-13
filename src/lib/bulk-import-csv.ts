/**
 * Generic bulk-import CSV parsing for organization management (Employees /
 * Users), distinct from the shift-roster domain in `src/ingestion/`. Reuses
 * the shared line-splitting/table-shape primitives from
 * `src/ingestion/tabular-assistant.ts` (parseRosterTable/splitTableLine) —
 * never a second CSV splitter — but resolves its own columns by exact header
 * name instead of the shift-roster alias table (which has no "name"/"email"/
 * "role" aliases and shouldn't grow them just for this unrelated format).
 */
import { parseCsvRecords } from '../ingestion/tabular-assistant';

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '');
}

function columnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  const accepted = new Set(aliases.map(normalizeHeader));
  return normalized.findIndex((header) => accepted.has(header));
}

export type BulkCsvParseError = 'invalid_file' | 'missing_header' | 'duplicate_header' | 'missing_required_column' | 'too_many_rows' | 'field_too_long';
export interface BulkCsvParseResult<T> { rows: T[]; error?: BulkCsvParseError; }

const MAX_FIELD_LENGTH = 500;
const MAX_ROWS = 1000;
function parseRecords(text: string): string[][] | null {
  if (typeof text !== 'string' || [...text].some((char) => {
    const code = char.charCodeAt(0);
    return code === 0 || (code >= 1 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31);
  })) return null;
  return parseCsvRecords(text, { maxRows: MAX_ROWS, maxBytes: 2_000_000 });
}

function validateHeaders(headers: string[]): BulkCsvParseError | undefined {
  const normalized = headers.map(normalizeHeader);
  if (normalized.some((header) => !header)) return 'missing_header';
  if (new Set(normalized).size !== normalized.length) return 'duplicate_header';
  return undefined;
}

function hasExcessiveField(records: string[][]): boolean {
  return records.some((record) => record.some((cell) => cell.length > MAX_FIELD_LENGTH));
}

export interface EmployeeCsvRow {
  externalEmployeeId: string;
  name: string;
  /** Optional `area` column (Anclora roster format) — resolved server-side
   * by the bulk endpoint against the org's active areas; an unknown area
   * fails only that row and is never auto-created. */
  areaName?: string;
}

/** Format: `external_employee_id,name` (extra columns are ignored; optional
 * `area` column is captured for area-scoped roster imports). Null when
 * the file isn't a recognizable table or is missing a required column. */
export function parseEmployeesCsv(text: string): EmployeeCsvRow[] | null {
  const result = parseEmployeesCsvDetailed(text);
  return result.error ? null : result.rows;
}

export function parseEmployeesCsvDetailed(text: string): BulkCsvParseResult<EmployeeCsvRow> {
  const records = parseRecords(text);
  if (!records) return { rows: [], error: 'invalid_file' };
  const headerError = validateHeaders(records[0]);
  if (headerError) return { rows: [], error: headerError };
  const idIndex = columnIndex(records[0], ['externalEmployeeId', 'employeeId', 'idEmpleado', 'codigoEmpleado']);
  const nameIndex = columnIndex(records[0], ['name', 'nombre']);
  if (idIndex === -1 || nameIndex === -1) {
    return { rows: [], error: 'missing_required_column' };
  }
  if (hasExcessiveField(records)) return { rows: [], error: 'field_too_long' };
  const areaIndex = columnIndex(records[0], ['area', 'areaName', 'areaCode']);
  return { rows: records.slice(1)
    .map((row) => ({
      externalEmployeeId: (row[idIndex] ?? '').trim(),
      name: (row[nameIndex] ?? '').trim(),
      ...(areaIndex >= 0 ? { areaName: (row[areaIndex] ?? '').trim() } : {}),
    }))
    .filter((row) => row.externalEmployeeId || row.name) };
}

export type UserCsvRole = 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE';
const VALID_ROLES: UserCsvRole[] = ['OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'];

export interface UserCsvRow {
  email: string;
  name: string;
  role: UserCsvRole | '';
  externalEmployeeId: string;
  locale?: 'es' | 'en' | '';
  /** Set when the row fails basic validation (missing email, bad role) —
   * the row is still returned so the preview can show it as an error. */
  rowError?: 'missingEmail' | 'invalidRole' | 'invalidLocale';
}

/** Format: `email,name,role,external_employee_id` — email and role required
 * per-row (validated here, never silently coerced); name/external id
 * optional. Null when the file isn't a recognizable table or is missing the
 * email/role columns entirely. */
export function parseUsersCsv(text: string): UserCsvRow[] | null {
  const result = parseUsersCsvDetailed(text);
  return result.error ? null : result.rows;
}

export function parseUsersCsvDetailed(text: string): BulkCsvParseResult<UserCsvRow> {
  const records = parseRecords(text);
  if (!records) return { rows: [], error: 'invalid_file' };
  const headerError = validateHeaders(records[0]);
  if (headerError) return { rows: [], error: headerError };
  const emailIndex = columnIndex(records[0], ['email', 'correo']);
  const roleIndex = columnIndex(records[0], ['role', 'rol']);
  if (emailIndex === -1 || roleIndex === -1) {
    return { rows: [], error: 'missing_required_column' };
  }
  if (hasExcessiveField(records)) return { rows: [], error: 'field_too_long' };
  const nameIndex = columnIndex(records[0], ['displayName', 'name', 'nombre']);
  const idIndex = columnIndex(records[0], ['externalEmployeeId', 'employeeId', 'idEmpleado', 'codigoEmpleado']);
  const localeIndex = columnIndex(records[0], ['locale', 'idioma']);

  return { rows: records.slice(1).map((row) => {
    const email = (row[emailIndex] ?? '').trim().toLowerCase();
    const roleRaw = (row[roleIndex] ?? '').trim().toUpperCase();
    const role = (VALID_ROLES as string[]).includes(roleRaw) ? (roleRaw as UserCsvRole) : '';
    const name = nameIndex >= 0 ? (row[nameIndex] ?? '').trim() : '';
    const externalEmployeeId = idIndex >= 0 ? (row[idIndex] ?? '').trim() : '';
    const localeRaw = localeIndex >= 0 ? (row[localeIndex] ?? '').trim().toLowerCase() : '';

    let rowError: UserCsvRow['rowError'];
    if (!email) {
      rowError = 'missingEmail';
    } else if (!role) {
      rowError = 'invalidRole';
    } else if (localeIndex >= 0 && localeRaw && localeRaw !== 'es' && localeRaw !== 'en') {
      rowError = 'invalidLocale';
    }

    return {
      email, name, role, externalEmployeeId, rowError,
      ...(localeIndex >= 0 ? { locale: localeRaw === 'es' || localeRaw === 'en' ? localeRaw : '' } : {}),
    };
  }) };
}

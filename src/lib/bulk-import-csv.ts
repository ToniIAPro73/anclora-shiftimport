/**
 * Generic bulk-import CSV parsing for organization management (Employees /
 * Users), distinct from the shift-roster domain in `src/ingestion/`. Reuses
 * the shared line-splitting/table-shape primitives from
 * `src/ingestion/tabular-assistant.ts` (parseRosterTable/splitTableLine) —
 * never a second CSV splitter — but resolves its own columns by exact header
 * name instead of the shift-roster alias table (which has no "name"/"email"/
 * "role" aliases and shouldn't grow them just for this unrelated format).
 */
import { parseRosterTable } from '../ingestion/tabular-assistant';

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function columnIndex(headers: string[], name: string): number {
  const normalized = headers.map(normalizeHeader);
  return normalized.indexOf(name);
}

export interface EmployeeCsvRow {
  externalEmployeeId: string;
  name: string;
}

/** Format: `external_employee_id,name` (extra columns are ignored). Null when
 * the file isn't a recognizable table or is missing a required column. */
export function parseEmployeesCsv(text: string): EmployeeCsvRow[] | null {
  const table = parseRosterTable(text);
  if (!table) {
    return null;
  }
  const idIndex = columnIndex(table.headers, 'external_employee_id');
  const nameIndex = columnIndex(table.headers, 'name');
  if (idIndex === -1 || nameIndex === -1) {
    return null;
  }
  return table.rows
    .map((row) => ({
      externalEmployeeId: (row[idIndex] ?? '').trim(),
      name: (row[nameIndex] ?? '').trim(),
    }))
    .filter((row) => row.externalEmployeeId || row.name);
}

export type UserCsvRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
const VALID_ROLES: UserCsvRole[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];

export interface UserCsvRow {
  email: string;
  name: string;
  role: UserCsvRole | '';
  externalEmployeeId: string;
  /** Set when the row fails basic validation (missing email, bad role) —
   * the row is still returned so the preview can show it as an error. */
  rowError?: 'missingEmail' | 'invalidRole';
}

/** Format: `email,name,role,external_employee_id` — email and role required
 * per-row (validated here, never silently coerced); name/external id
 * optional. Null when the file isn't a recognizable table or is missing the
 * email/role columns entirely. */
export function parseUsersCsv(text: string): UserCsvRow[] | null {
  const table = parseRosterTable(text);
  if (!table) {
    return null;
  }
  const emailIndex = columnIndex(table.headers, 'email');
  const roleIndex = columnIndex(table.headers, 'role');
  if (emailIndex === -1 || roleIndex === -1) {
    return null;
  }
  const nameIndex = columnIndex(table.headers, 'name');
  const idIndex = columnIndex(table.headers, 'external_employee_id');

  return table.rows.map((row) => {
    const email = (row[emailIndex] ?? '').trim().toLowerCase();
    const roleRaw = (row[roleIndex] ?? '').trim().toUpperCase();
    const role = (VALID_ROLES as string[]).includes(roleRaw) ? (roleRaw as UserCsvRole) : '';
    const name = nameIndex >= 0 ? (row[nameIndex] ?? '').trim() : '';
    const externalEmployeeId = idIndex >= 0 ? (row[idIndex] ?? '').trim() : '';

    let rowError: UserCsvRow['rowError'];
    if (!email) {
      rowError = 'missingEmail';
    } else if (!role) {
      rowError = 'invalidRole';
    }

    return { email, name, role, externalEmployeeId, rowError };
  });
}

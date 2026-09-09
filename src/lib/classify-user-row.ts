import { RemoteEmployee, RemoteMember } from './remote';
import { UserCsvRow } from './bulk-import-csv';

/**
 * Preview-only classification (Fase 4): informational, mirrors the backend's
 * own validation/guards (bulkAddMembers in api/_lib/data.js) so the ADMIN
 * sees an accurate picture before confirming — the server independently
 * re-validates every row, this is never trusted as authorization.
 *
 * Extracted from `MembersModal.tsx` (CX-F05, UXR-F2-M05) so this pure
 * classification can be unit-tested in isolation, following the same
 * precedent as `bulk-import-csv.ts`.
 */
export type UserPreviewStatus =
  | 'new_and_link' | 'existing_and_link' | 'new_no_employee' | 'no_employee' | 'already_linked'
  | 'employee_not_found' | 'employee_already_linked' | 'user_already_linked'
  | 'invalid_role' | 'invalid_email' | 'duplicate_in_file' | 'duplicate_employee_id_in_file';

export interface UserPreviewRow {
  row: UserCsvRow;
  status: UserPreviewStatus;
  /** Locally-resolved target employee (by external_employee_id), when any. */
  employee?: RemoteEmployee;
  /** 0-based index of the row this one duplicates within the same file
   * (email or external_employee_id) — lets the preview point back at the
   * original row instead of only reporting an aggregate count (CX-F05). */
  duplicateOfIndex?: number;
}

export const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function classifyUserRow(
  row: UserCsvRow,
  rowIndex: number,
  seenEmails: Map<string, number>,
  seenExternalEmployeeIds: Map<string, number>,
  members: RemoteMember[],
  employees: RemoteEmployee[],
): UserPreviewRow {
  if (row.rowError === 'missingEmail' || !row.email || !EMAIL_FORMAT_RE.test(row.email)) {
    return { row, status: 'invalid_email' };
  }
  if (row.rowError === 'invalidRole' || !row.role) {
    return { row, status: 'invalid_role' };
  }
  const firstEmailRow = seenEmails.get(row.email);
  if (firstEmailRow !== undefined) {
    return { row, status: 'duplicate_in_file', duplicateOfIndex: firstEmailRow };
  }
  seenEmails.set(row.email, rowIndex);

  // Two different rows claiming the same external_employee_id in one file
  // is always a conflict — only one user can end up linked to that
  // employee — regardless of whether the id resolves to a real Employee.
  // Flagged before resolution so it never silently resolves to two
  // independent "new" rows (CX-F05).
  if (row.externalEmployeeId) {
    const firstIdRow = seenExternalEmployeeIds.get(row.externalEmployeeId);
    if (firstIdRow !== undefined) {
      return { row, status: 'duplicate_employee_id_in_file', duplicateOfIndex: firstIdRow };
    }
    seenExternalEmployeeIds.set(row.externalEmployeeId, rowIndex);
  }

  let employee: RemoteEmployee | undefined;
  if (row.externalEmployeeId) {
    employee = employees.find((candidate) => candidate.externalEmployeeId === row.externalEmployeeId);
    if (!employee) {
      return { row, status: 'employee_not_found' };
    }
  }

  const existingMember = members.find((member) => member.email.toLowerCase() === row.email);
  const linkedEmployee = existingMember
    ? employees.find((candidate) => candidate.userId === existingMember.userId)
    : undefined;

  if (employee?.userId && employee.userId !== existingMember?.userId) {
    return { row, status: 'employee_already_linked', employee };
  }
  if (employee && linkedEmployee && linkedEmployee.id !== employee.id) {
    return { row, status: 'user_already_linked', employee };
  }

  if (existingMember) {
    if (employee && linkedEmployee?.id === employee.id) {
      return { row, status: 'already_linked', employee };
    }
    if (employee) {
      return { row, status: 'existing_and_link', employee };
    }
    // Account already exists but has no linked employee: an "existing"
    // row, never to be confused with a brand-new one (see 'new_no_employee').
    return { row, status: linkedEmployee ? 'already_linked' : 'no_employee', employee: linkedEmployee };
  }

  // Brand-new email, no employee link: this is a NEW row, not "already a
  // member" — the resume summary must count it under "new", not "existing"
  // (CX-F05, the presentation defect the audit measured).
  return employee ? { row, status: 'new_and_link', employee } : { row, status: 'new_no_employee' };
}

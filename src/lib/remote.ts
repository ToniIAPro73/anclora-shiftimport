import { Shift } from './types';
import { apiFetch } from './session';

/**
 * Remote, tenant-scoped persistence (Fase 1). All queries run inside the
 * session's organization; the server enforces isolation, the client never
 * sends organization ids.
 */

export interface RemoteEmployee {
  id: string;
  organizationId: string;
  externalEmployeeId: string | null;
  name: string;
  userId: string | null;
  status: 'active' | 'inactive' | 'pending_access';
}

export interface RemoteImport {
  id: string;
  fileName: string;
  sourceFormat: string;
  periodYear: number | null;
  periodMonth: number | null;
  status: string;
}

/** `recognized_inactive`: the single match exists but its status is
 * 'inactive' — never silently reactivated nor duplicated by import flows. */
export type EmployeeMatchKind = 'recognized' | 'recognized_inactive' | 'ambiguous' | 'new';

interface RemoteShiftRow {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  origin: 'MAN' | 'IMP';
}

const toShift = (row: RemoteShiftRow): Shift => ({
  id: row.id,
  date: row.date,
  startTime: row.startTime,
  endTime: row.endTime,
  location: row.location,
  origin: row.origin === 'MAN' ? 'MAN' : 'IMP',
});

export async function loadRemoteShifts(employeeId: string): Promise<Shift[]> {
  const payload = await apiFetch<{ shifts: RemoteShiftRow[] }>(
    `/api/shifts?employeeId=${encodeURIComponent(employeeId)}`,
  );
  return payload.shifts.map(toShift);
}

/**
 * Returns what the server actually persisted (not just a count) — a caller
 * that needs to prove "expected == persisted" (see reconcileImport in
 * import-reconciliation.ts) needs the real rows, not a trust-me number.
 */
export async function syncRemoteShifts(
  employeeId: string,
  changes: { upserts?: Shift[]; deleteIds?: string[]; importId?: string },
): Promise<{ saved: Shift[]; deleted: number }> {
  const payload = await apiFetch<{ saved: RemoteShiftRow[]; deleted: number }>('/api/shifts', {
    method: 'PATCH',
    body: JSON.stringify({
      employeeId,
      upserts: (changes.upserts ?? []).map((shift) => ({
        id: shift.id,
        employeeId,
        importId: changes.importId ?? undefined,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        location: shift.location,
        origin: shift.origin === 'MAN' ? 'MAN' : 'IMP',
      })),
      deleteIds: changes.deleteIds ?? [],
    }),
  });
  return { saved: payload.saved.map(toShift), deleted: payload.deleted };
}

export async function listRemoteEmployees(): Promise<RemoteEmployee[]> {
  const payload = await apiFetch<{ employees: RemoteEmployee[] }>('/api/employees');
  return payload.employees;
}

export async function matchRemoteEmployee(
  selector: { name: string; externalId: string },
): Promise<{ kind: EmployeeMatchKind; employees: RemoteEmployee[] }> {
  // Built by hand (not URLSearchParams): URLSearchParams encodes spaces as
  // '+', which the API's req.query parser does not decode back to a space —
  // any name with a space (i.e. almost every real name) would silently
  // never match. %20 (via encodeURIComponent) decodes correctly everywhere.
  const parts = ['match=1'];
  if (selector.externalId.trim()) {
    parts.push(`externalEmployeeId=${encodeURIComponent(selector.externalId.trim())}`);
  }
  if (selector.name.trim()) {
    parts.push(`name=${encodeURIComponent(selector.name.trim())}`);
  }
  return apiFetch(`/api/employees?${parts.join('&')}`);
}

export async function createRemoteEmployee(input: {
  name: string;
  externalEmployeeId?: string;
}): Promise<RemoteEmployee> {
  const payload = await apiFetch<{ employee: RemoteEmployee }>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.employee;
}

/** Safe-fields-only update: name (and optionally externalEmployeeId/status
 * carried through explicitly by the caller to avoid the PATCH default of
 * forcing status back to 'active' when omitted). Never touches userId. */
export async function updateRemoteEmployee(input: {
  id: string;
  name?: string;
  externalEmployeeId?: string;
  status?: 'active' | 'inactive' | 'pending_access';
}): Promise<RemoteEmployee> {
  const payload = await apiFetch<{ employee: RemoteEmployee }>('/api/employees', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.employee;
}

/** EMPLOYEE (or ADMIN): update own employee's name via /self endpoint. */
export async function updateOwnEmployeeName(name: string): Promise<RemoteEmployee> {
  const payload = await apiFetch<{ employee: RemoteEmployee }>('/api/employees?self=true', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return payload.employee;
}

/** ADMIN only: link an existing org member user to a free employee (or
 * unlink with null). The server rejects with 409 `EMPLOYEE_ALREADY_LINKED`
 * when the employee already has another user and 409 `USER_ALREADY_LINKED`
 * when the user already has another employee. */
export async function linkEmployeeUser(employeeId: string, userId: string | null): Promise<RemoteEmployee> {
  const payload = await apiFetch<{ employee: RemoteEmployee }>('/api/employees', {
    method: 'PATCH',
    body: JSON.stringify({ id: employeeId, userId }),
  });
  return payload.employee;
}

/** Hard delete (ADMIN only). The server rejects with 409
 * `EMPLOYEE_HAS_HISTORY` when the employee has shift history (kept; the
 * caller should offer deactivation instead) and 400 `LAST_ADMIN` when the
 * employee is linked to the org's last ADMIN user. */
export async function deleteRemoteEmployee(id: string): Promise<void> {
  await apiFetch('/api/employees', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

export type BulkCreateStatus = 'created' | 'existing' | 'existing_inactive' | 'failed';
export type BulkCreateFailReason = 'invalid' | 'plan_limit' | 'error';

export interface BulkCreateResult {
  key: string;
  status: BulkCreateStatus;
  employee?: RemoteEmployee;
  reason?: BulkCreateFailReason;
}

/** "Create all new employees" — one request, many rows. `key` is a
 * caller-supplied correlation id (e.g. the TeamRow key) echoed back per
 * result so the caller can map results back without parsing name/id. */
export async function bulkCreateRemoteEmployees(items: {
  key: string;
  name: string;
  externalEmployeeId?: string;
}[]): Promise<BulkCreateResult[]> {
  const payload = await apiFetch<{ results: BulkCreateResult[] }>('/api/employees/bulk', {
    method: 'POST',
    body: JSON.stringify({ employees: items }),
  });
  return payload.results;
}

export async function createRemoteImport(input: {
  fileName: string;
  sourceFormat: string;
  periodYear: number;
  periodMonth: number;
}): Promise<RemoteImport> {
  const payload = await apiFetch<{ import: RemoteImport }>('/api/imports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.import;
}

// ------------------------------------------------------------ memberships

export interface RemoteMember {
  userId: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export async function listRemoteMembers(): Promise<RemoteMember[]> {
  const payload = await apiFetch<{ members: RemoteMember[] }>('/api/memberships');
  return payload.members;
}

/** Account-level: update current user's display_name. */
export async function updateUserDisplayName(displayName: string): Promise<{ user: { id: string; email: string; displayName: string } }> {
  const payload = await apiFetch<{ user: { id: string; email: string; displayName: string } }>('/api/user/me', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
  return payload;
}

export interface AddedMember {
  userId: string;
  email: string;
  role: string;
  /** Present only when the server generated it (password omitted from the
   * request) — shown once by the caller, never persisted, never re-fetchable. */
  temporaryPassword?: string;
}

export async function addRemoteMember(input: {
  email: string;
  role: RemoteMember['role'];
  password?: string;
  displayName?: string;
  employeeId?: string;
}): Promise<AddedMember> {
  const payload = await apiFetch<{ member: AddedMember }>('/api/memberships', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.member;
}

export async function updateRemoteMemberRole(userId: string, role: RemoteMember['role']): Promise<void> {
  await apiFetch('/api/memberships', {
    method: 'PATCH',
    body: JSON.stringify({ userId, role }),
  });
}

export async function removeRemoteMember(userId: string): Promise<void> {
  await apiFetch('/api/memberships', {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

/** ADMIN only: restore the organization to its initial operational state
 * (deletes shifts, imports, employees and user↔employee links; keeps the
 * organization and the admin account). Org-scoped, irreversible. */
export async function resetOrganization(): Promise<{ reset: boolean; deleted: { shifts: number; imports: number; employees: number } }> {
  return apiFetch('/api/organizations/reset', { method: 'POST' });
}

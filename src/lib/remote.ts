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
  status: 'active' | 'inactive';
}

export interface RemoteImport {
  id: string;
  fileName: string;
  sourceFormat: string;
  periodYear: number | null;
  periodMonth: number | null;
  status: string;
}

export type EmployeeMatchKind = 'recognized' | 'ambiguous' | 'new';

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

export async function syncRemoteShifts(
  employeeId: string,
  changes: { upserts?: Shift[]; deleteIds?: string[]; importId?: string },
): Promise<void> {
  await apiFetch('/api/shifts', {
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
  status?: 'active' | 'inactive';
}): Promise<RemoteEmployee> {
  const payload = await apiFetch<{ employee: RemoteEmployee }>('/api/employees', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.employee;
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
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
}

export async function listRemoteMembers(): Promise<RemoteMember[]> {
  const payload = await apiFetch<{ members: RemoteMember[] }>('/api/memberships');
  return payload.members;
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

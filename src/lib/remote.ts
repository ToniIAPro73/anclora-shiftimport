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
  areaId?: string | null;
  status: 'active' | 'inactive' | 'pending_access';
}

export interface RemoteImport {
  id: string;
  fileName: string;
  sourceFormat: string;
  periodYear: number | null;
  periodMonth: number | null;
  periodKind?: 'single' | 'multi';
  periodLabel?: string;
  importMode?: 'individual' | 'team';
  status: string;
  areaId?: string | null;
  areaNameSnapshot?: string | null;
  scopeType?: 'global' | 'area';
  importedByUserId?: string | null;
  importedByUserName?: string | null;
  employeeCount?: number;
  shiftCount?: number;
  createdShiftCount?: number;
  existingShiftCount?: number;
  createdAt?: string;
  deletedAt?: string | null;
  deduplicated?: boolean;
}

export interface ScheduleVersion {
  id: string;
  scheduleId: string;
  areaId: string | null;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED' | 'LOCKED' | 'COMPLETED';
  periodStart: string;
  periodEnd: string;
  createdAt?: string;
  publishedAt?: string | null;
}

export interface SchedulingEmployee {
  id: string;
  name: string;
  externalEmployeeId: string | null;
  areaId: string | null;
}

export interface ShiftAssignment {
  id: string;
  scheduleVersionId: string;
  importId?: string | null;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

export interface RemoteShiftDetail {
  shift: Shift;
  areaName: string | null;
  acknowledgementStatus: 'PENDING' | 'ACKNOWLEDGED';
  acknowledgedAt: string | null;
}

export interface ShiftComment {
  id: string;
  shiftId: string;
  employeeId: string;
  body: string;
  createdAt: string;
}

export type ChangeRequestType = 'TIME_CHANGE' | 'OTHER';
export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ChangeRequest {
  id: string;
  shiftId: string;
  employeeId: string;
  organizationId: string;
  requestType: ChangeRequestType;
  reason: string;
  status: ChangeRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
}

export interface ScheduleSnapshot {
  version: ScheduleVersion;
  employees: SchedulingEmployee[];
  assignments: ShiftAssignment[];
}

export interface SchedulePublicationResult {
  status: 'PUBLISHED';
  publishedAt: string;
  createdShiftCount: number;
  excludedAssignments: Array<{ assignmentId: string; employeeId: string }>;
  excludedAssignmentCount: number;
}

export interface FutureImportResult {
  classification: 'FUTURE' | 'MIXED';
  cutoff: string;
  importId: string;
  deduplicated: boolean;
  historical: { submittedCount: number; persistedCount: number; deletedCount: number };
  future: {
    submittedCount: number;
    createdAssignmentCount: number;
    existingAssignmentCount: number;
    draftCount: number;
    createdDraftCount: number;
    drafts: Array<{
      scheduleId: string;
      scheduleVersionId: string;
      versionNumber: number;
      periodStart: string;
      periodEnd: string;
      areaId: string | null;
    }>;
  };
  import: RemoteImport;
}

export interface NewScheduleDraftResult {
  newVersionId: string;
  scheduleId: string;
  versionNumber: number;
  copiedAssignmentCount: number;
}

export interface ScheduleVersionHistoryEntry {
  id: string;
  scheduleId: string;
  versionNumber: number;
  status: ScheduleVersion['status'];
  createdByUserId: string;
  createdByUserName?: string | null;
  createdAt?: string;
  publishedByUserId?: string | null;
  publishedByUserName?: string | null;
  publishedAt?: string | null;
}

export interface ImportHistoryFilters {
  page?: number;
  pageSize?: number;
  areaId?: string | null;
  userId?: string | null;
  importMode?: 'individual' | 'team' | null;
  scopeType?: 'global' | 'area' | null;
  sourceFormat?: string | null;
  status?: string | null;
}

export interface ImportHistoryPage {
  imports: RemoteImport[];
  total: number;
  page: number;
  pageSize: number;
}

/** `recognized_inactive`: the single match exists but its status is
 * 'inactive' — never silently reactivated nor duplicated by import flows.
 * `recognized_pending`: the single match exists but is still
 * 'pending_access' (detected/created but never linked to a user) — an
 * import may not target it until an ADMIN completes its registration in
 * "Usuarios de la organización" (backend also rejects it, EMPLOYEE_NOT_ACTIVE). */
export type EmployeeMatchKind = 'recognized' | 'recognized_inactive' | 'recognized_pending' | 'ambiguous' | 'new';

interface RemoteShiftRow {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  origin: 'MAN' | 'IMP';
  acknowledgementStatus?: 'PENDING' | 'ACKNOWLEDGED';
  acknowledgedAt?: string | null;
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

/** Loads only the authenticated employee's shifts for the server-defined day. */
export async function loadRemoteTodayShifts(): Promise<Shift[]> {
  const payload = await apiFetch<{ shifts: RemoteShiftRow[] }>('/api/me/shifts/today');
  return payload.shifts.map(toShift);
}

export async function loadRemoteWeekShifts(weekStart: string): Promise<{ weekStart: string; shifts: Shift[] }> {
  const payload = await apiFetch<{ weekStart: string; days: Array<{ date: string; shifts: RemoteShiftRow[] }> }>(
    `/api/me/shifts/week?week_start=${encodeURIComponent(weekStart)}`,
  );
  return { weekStart: payload.weekStart, shifts: payload.days.flatMap((day) => day.shifts.map(toShift)) };
}

export async function loadRemoteShiftDetail(shiftId: string): Promise<RemoteShiftDetail> {
  const payload = await apiFetch<{ shift: RemoteShiftRow & { areaName?: string | null } }>(
    `/api/me/shifts/${encodeURIComponent(shiftId)}`,
  );
  return {
    shift: toShift(payload.shift),
    areaName: payload.shift.areaName ?? null,
    acknowledgementStatus: payload.shift.acknowledgementStatus ?? 'PENDING',
    acknowledgedAt: payload.shift.acknowledgedAt ?? null,
  };
}

export async function acknowledgeRemoteShift(shiftId: string): Promise<{
  status: 'ACKNOWLEDGED';
  acknowledgedAt: string | null;
}> {
  const payload = await apiFetch<{ acknowledgement: { status: 'ACKNOWLEDGED'; acknowledgedAt: string | null } }>(
    `/api/me/shifts/${encodeURIComponent(shiftId)}/acknowledge`,
    { method: 'POST' },
  );
  return payload.acknowledgement;
}

export async function loadRemoteShiftComments(shiftId: string): Promise<ShiftComment[]> {
  const payload = await apiFetch<{ comments: ShiftComment[] }>(
    `/api/me/shifts/${encodeURIComponent(shiftId)}/comments`,
  );
  return payload.comments;
}

export async function createRemoteShiftComment(shiftId: string, body: string): Promise<ShiftComment> {
  const payload = await apiFetch<{ comment: ShiftComment }>(
    `/api/me/shifts/${encodeURIComponent(shiftId)}/comments`,
    { method: 'POST', body: JSON.stringify({ body }) },
  );
  return payload.comment;
}

export async function createRemoteChangeRequest(
  shiftId: string,
  requestType: ChangeRequestType,
  reason: string,
): Promise<ChangeRequest> {
  const payload = await apiFetch<{ request: ChangeRequest }>(
    `/api/me/shifts/${encodeURIComponent(shiftId)}/change-requests`,
    { method: 'POST', body: JSON.stringify({ requestType, reason }) },
  );
  return payload.request;
}

export async function cancelRemoteChangeRequest(requestId: string): Promise<ChangeRequest> {
  const payload = await apiFetch<{ request: ChangeRequest }>(
    `/api/me/change-requests/${encodeURIComponent(requestId)}/cancel`,
    { method: 'POST' },
  );
  return payload.request;
}

export async function listRemoteScheduleVersions(areaId?: string | null): Promise<ScheduleVersion[]> {
  const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
  const payload = await apiFetch<{ schedules: ScheduleVersion[] }>(`/api/schedules${query}`);
  return payload.schedules;
}

export async function listRemoteScheduleVersionHistory(scheduleId: string): Promise<ScheduleVersionHistoryEntry[]> {
  return apiFetch<ScheduleVersionHistoryEntry[]>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/versions`,
  );
}

export async function createRemoteScheduleDraft(input: {
  periodStart: string;
  areaId?: string | null;
}): Promise<ScheduleVersion> {
  const payload = await apiFetch<{
    scheduleId: string;
    scheduleVersionId: string;
    versionNumber: number;
    status: ScheduleVersion['status'];
  }>('/api/schedules', {
    method: 'POST',
    body: JSON.stringify({ periodStart: input.periodStart, areaId: input.areaId ?? undefined }),
  });
  return {
    id: payload.scheduleVersionId,
    scheduleId: payload.scheduleId,
    areaId: input.areaId ?? null,
    versionNumber: payload.versionNumber,
    status: payload.status,
    periodStart: input.periodStart,
    periodEnd: addDaysToIso(input.periodStart, 6),
  };
}

export async function loadRemoteScheduleSnapshot(
  scheduleId: string,
  versionId: string,
): Promise<ScheduleSnapshot> {
  return apiFetch<ScheduleSnapshot>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/versions/${encodeURIComponent(versionId)}`,
  );
}

export async function createRemoteAssignment(
  scheduleId: string,
  versionId: string,
  input: Pick<ShiftAssignment, 'employeeId' | 'date' | 'startTime' | 'endTime' | 'location'>,
): Promise<ShiftAssignment> {
  const payload = await apiFetch<{ assignment: ShiftAssignment }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/versions/${encodeURIComponent(versionId)}/assignments`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return payload.assignment;
}

export async function updateRemoteAssignment(
  scheduleId: string,
  versionId: string,
  assignmentId: string,
  input: Partial<Pick<ShiftAssignment, 'employeeId' | 'date' | 'startTime' | 'endTime' | 'location'>>,
): Promise<ShiftAssignment> {
  const payload = await apiFetch<{ assignment: ShiftAssignment }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/versions/${encodeURIComponent(versionId)}/assignments/${encodeURIComponent(assignmentId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return payload.assignment;
}

export async function deleteRemoteAssignment(
  scheduleId: string,
  versionId: string,
  assignmentId: string,
): Promise<void> {
  await apiFetch<void>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/versions/${encodeURIComponent(versionId)}/assignments/${encodeURIComponent(assignmentId)}`,
    { method: 'DELETE' },
  );
}

export async function publishRemoteScheduleVersion(
  scheduleId: string,
  versionId: string,
): Promise<SchedulePublicationResult> {
  return apiFetch<SchedulePublicationResult>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/versions/${encodeURIComponent(versionId)}/publish`,
    { method: 'POST' },
  );
}

export async function createRemoteScheduleDraftFromVersion(
  scheduleId: string,
  versionId: string,
): Promise<NewScheduleDraftResult> {
  return apiFetch<NewScheduleDraftResult>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/versions/${encodeURIComponent(versionId)}/new-draft`,
    { method: 'POST' },
  );
}

function addDaysToIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

export async function listRemoteEmployees(areaId?: string | null): Promise<RemoteEmployee[]> {
  const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
  const payload = await apiFetch<{ employees: RemoteEmployee[] }>(`/api/employees${query}`);
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
  areaId?: string | null;
  areaName?: string;
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
  areaId?: string | null;
  areaName?: string;
  status?: 'active' | 'inactive' | 'pending_access';
}): Promise<RemoteEmployee> {
  const payload = await apiFetch<{ employee: RemoteEmployee }>('/api/employees', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.employee;
}

export interface RemoteOrganization {
  id: string;
  name: string;
  plan: string | null;
}

/** ADMIN/OWNER only: rename the active organization. `plan` is read-only (no
 * billing integration exists yet, R2-M01 scope). */
export async function updateRemoteOrganizationName(name: string): Promise<RemoteOrganization> {
  const payload = await apiFetch<{ organization: RemoteOrganization }>('/api/organizations/current', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return payload.organization;
}

/** EMPLOYEE (or ADMIN): update own employee's name via /self endpoint. */
export async function updateOwnEmployeeName(name: string): Promise<RemoteEmployee> {
  const payload = await apiFetch<{ employee: RemoteEmployee }>('/api/employees?self=true', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  return payload.employee;
}

/** ADMIN/OWNER only: link an existing org member user to a free employee (or
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

/** Hard delete (ADMIN/OWNER only). The server rejects with 409
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
export type BulkCreateFailReason = 'invalid' | 'plan_limit' | 'unknown_area' | 'error';

export interface BulkCreateResult {
  key: string;
  status: BulkCreateStatus;
  employee?: RemoteEmployee;
  reason?: BulkCreateFailReason;
  /** Present when areaName was provided but could not be resolved */
  areaError?: string;
}

/** "Create all new employees" — one request, many rows. `key` is a
 * caller-supplied correlation id (e.g. the TeamRow key) echoed back per
 * result so the caller can map results back without parsing name/id. */
export async function bulkCreateRemoteEmployees(items: {
  key: string;
  name: string;
  externalEmployeeId?: string;
  areaId?: string | null;
  areaName?: string;
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
  fileFingerprint?: string;
  employeeId?: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  areaId?: string | null;
  importMode?: 'individual' | 'team';
  periodKind?: 'single' | 'multi';
  periodLabel?: string;
  employeeCount?: number;
  shiftCount?: number;
  createdShiftCount?: number;
  existingShiftCount?: number;
}): Promise<RemoteImport> {
  const payload = await apiFetch<{ import: RemoteImport }>('/api/imports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.import;
}

export async function confirmRemoteFutureImport(input: {
  fileName: string;
  sourceFormat: string;
  fileFingerprint: string;
  employeeId: string;
  shifts: Array<Pick<Shift, 'id' | 'date' | 'startTime' | 'endTime' | 'location' | 'origin' | 'sourceFormat'> & { employeeId?: string; areaId?: string | null }>;
  deleteIds?: string[];
  periodYear: number | null;
  periodMonth: number | null;
  areaId?: string | null;
  importMode?: 'individual' | 'team';
  periodKind?: 'single' | 'multi';
  periodLabel?: string;
}): Promise<FutureImportResult> {
  return apiFetch<FutureImportResult>('/api/imports/confirm-split', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Org-scoped import history, paginated. Read access follows the same
 * broad-role convention as /api/areas — EMPLOYEE can view, deletion is
 * ADMIN/OWNER-only (the server rejects a lower role with 403). */
export async function listRemoteImports(filters: ImportHistoryFilters = {}): Promise<ImportHistoryPage> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.areaId) params.set('areaId', filters.areaId);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.importMode) params.set('importMode', filters.importMode);
  if (filters.scopeType) params.set('scopeType', filters.scopeType);
  if (filters.sourceFormat) params.set('sourceFormat', filters.sourceFormat);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return apiFetch<ImportHistoryPage>(`/api/imports${query ? `?${query}` : ''}`);
}

/** ADMIN/OWNER only: deletes exactly this import's created shifts (by import_id)
 * and soft-deletes the import row. Manual shifts and shifts from other
 * imports are never touched — see deleteImport in api/_lib/data.js. */
export async function deleteRemoteImport(id: string): Promise<{ deleted: boolean; importId: string; deletedShiftCount: number }> {
  return apiFetch('/api/imports', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

// ------------------------------------------------------------ areas

/**
 * Organization areas (optional, 0..N per org). Listing is allowed for any
 * role (EMPLOYEE needs it to resolve its own area context); create/update
 * are ADMIN-only — the server enforces it, the client simply surfaces 403s.
 */
export interface RemoteArea {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  createdAt: string;
}

export async function listRemoteAreas(): Promise<RemoteArea[]> {
  const payload = await apiFetch<{ areas: RemoteArea[] }>('/api/areas');
  return payload.areas;
}

export async function createRemoteArea(input: { name: string; code?: string }): Promise<RemoteArea> {
  const payload = await apiFetch<{ area: RemoteArea }>('/api/areas', {
    method: 'POST',
    body: JSON.stringify({ name: input.name, ...(input.code ? { code: input.code } : {}) }),
  });
  return payload.area;
}

/** Rename / change code / deactivate (ADMIN). No DELETE exists server-side:
 * historical shifts/imports keep referencing the area, so removal is always
 * `deactivate: true`. Send `code: ''` to clear an existing code. */
export async function updateRemoteArea(input: {
  id: string;
  name?: string;
  code?: string;
  deactivate?: boolean;
}): Promise<RemoteArea> {
  const payload = await apiFetch<{ area: RemoteArea }>('/api/areas', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.area;
}

// ------------------------------------------------------------ memberships

export interface RemoteMember {
  userId: string;
  email: string;
  displayName: string;
  role: 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE';
  scopedAreaId?: string | null;
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
  scopedAreaId?: string | null;
}): Promise<AddedMember> {
  const payload = await apiFetch<{ member: AddedMember }>('/api/memberships', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.member;
}

export type BulkMemberStatus =
  | 'created_and_linked' | 'created' | 'linked' | 'existing' | 'already_linked' | 'error';
export type BulkMemberErrorCode =
  | 'INVALID_EMAIL' | 'INVALID_ROLE' | 'DUPLICATE_IN_FILE' | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_ALREADY_LINKED' | 'USER_ALREADY_LINKED';

export interface BulkMemberResult {
  row: number;
  key: string;
  email: string | null;
  status: BulkMemberStatus;
  userId?: string;
  employeeId?: string | null;
  code?: BulkMemberErrorCode;
  error?: string;
  temporaryPassword?: string;
}

/** Bulk user provisioning + automatic User<->Employee linking (Usuarios CSV
 * import). `key` is a caller-supplied correlation id echoed back per result.
 * Never creates an Employee — `externalEmployeeId` only resolves one. */
export async function bulkAddRemoteMembers(items: {
  key: string;
  email: string;
  name?: string;
  role: RemoteMember['role'];
  externalEmployeeId?: string;
}[]): Promise<{ results: BulkMemberResult[]; summary: { created: number; linked: number; existing: number; failed: number } }> {
  return apiFetch('/api/memberships/bulk', {
    method: 'POST',
    body: JSON.stringify({ members: items }),
  });
}

export async function updateRemoteMemberRole(userId: string, role: RemoteMember['role'], scopedAreaId?: string | null): Promise<void> {
  await apiFetch('/api/memberships', {
    method: 'PATCH',
    body: JSON.stringify({ userId, role, ...(role === 'PLANNER' ? { scopedAreaId: scopedAreaId ?? null } : {}) }),
  });
}

export async function removeRemoteMember(userId: string): Promise<void> {
  await apiFetch('/api/memberships', {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

/** ADMIN/OWNER only: restore the organization to its initial operational state
 * (deletes shifts, imports, employees and user↔employee links; keeps the
 * organization and the admin account). Org-scoped, irreversible. */
export async function resetOrganization(): Promise<{ reset: boolean; deleted: { shifts: number; imports: number; employees: number } }> {
  return apiFetch('/api/organizations/reset', { method: 'POST' });
}

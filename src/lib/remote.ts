import { Shift } from './types';
import type { ContractEvaluation, DayProvenance, StatsBucket } from './effective-calendar.js';
import { apiFetch } from './session';
import { getShiftType } from './shifts';
import { shiftTypeCountsAsWork } from './shift-types';

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
  status: 'pending' | 'completed' | 'partial' | 'blocked' | 'failed' | 'deleted' | 'reverted' | string;
  outcomeReason?: string | null;
  outcomeDetail?: Record<string, unknown> | null;
  blockingEmployeeId?: string | null;
  blockingEmployeeName?: string | null;
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
  revertedAt?: string | null;
  revertedByUserName?: string | null;
  /** Light, server-side hint for the history list (the preview is authoritative). */
  reversibility?: 'REVERSIBLE' | 'LEGACY_SAFE_CANDIDATE' | 'BLOCKED_LEGACY' | 'NO_EFFECTS' | 'REVERTED' | 'DELETED' | null;
  deduplicated?: boolean;
  importDecision?: 'historical-only' | 'historical-and-plan' | null;
  documentClass?: 'COMPANY_PLAN' | 'COMPANY_PLAN_UPDATE' | 'HISTORICAL_CALENDAR' | 'UNDETERMINED' | null;
  temporalClass?: 'HISTORICAL' | 'FUTURE' | 'MIXED' | null;
  duplicateKind?: 'DUPLICATE_FILE' | 'DUPLICATE_DOCUMENT' | 'DUPLICATE_PLAN' | null;
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
  startTime: string | null;
  endTime: string | null;
  shiftType?: string | null;
  countsAsWork?: boolean;
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
  rejectionReason?: string | null;
  requestedStartTime?: string | null;
  requestedEndTime?: string | null;
  shiftDate?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  shiftLocation?: string;
}

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  changeRequestId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  policySnapshot: ApprovalPolicy;
  createdAt: string;
  requestType: ChangeRequestType;
  reason: string;
  employeeId: string;
  employeeName: string;
  areaId: string | null;
  areaName: string | null;
  shiftId: string;
  shiftDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftLocation: string;
}

export async function listRemoteApprovalRequests(): Promise<ApprovalRequest[]> {
  const payload = await apiFetch<{ requests: ApprovalRequest[] }>('/api/approval-requests?status=pending');
  return payload.requests;
}

export async function approveRemoteApprovalRequest(approvalRequestId: string): Promise<void> {
  await apiFetch(`/api/approval-requests/${encodeURIComponent(approvalRequestId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function rejectRemoteApprovalRequest(approvalRequestId: string, reason: string): Promise<void> {
  await apiFetch(`/api/approval-requests/${encodeURIComponent(approvalRequestId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export type NotificationType = 'SHIFT_PUBLISHED' | 'CHANGE_REQUEST_RESOLVED' | 'APPROVAL_REQUEST_CREATED';

export interface EmployeeNotification {
  id: string;
  userId: string;
  organizationId: string;
  type: NotificationType;
  resourceType: 'SHIFT' | 'CHANGE_REQUEST' | 'APPROVAL_REQUEST';
  resourceId: string;
  readAt: string | null;
  createdAt: string;
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

export type ImportDuplicateKind = 'DUPLICATE_FILE' | 'DUPLICATE_DOCUMENT' | 'DUPLICATE_PLAN';
export type ImportDocumentClass = 'COMPANY_PLAN' | 'COMPANY_PLAN_UPDATE' | 'HISTORICAL_CALENDAR' | 'UNDETERMINED';

export interface PlanChangeCounts {
  new: number;
  unchanged: number;
  modified: number;
  keptLocal: number;
  companyAdoptedLocal: number;
  requiresReview: number;
  evidenceApplied?: number;
}

export interface FutureImportResult {
  classification: 'FUTURE' | 'MIXED';
  cutoff: string;
  decision?: FutureImportConsent;
  importId: string;
  deduplicated: boolean;
  duplicate?: ImportDuplicateKind | null;
  sameFileDifferentDecision?: boolean;
  document?: { documentClass: ImportDocumentClass; confidence: string; evidence: string[] };
  historical: { submittedCount: number; persistedCount: number; deletedCount: number; requiresReviewDays?: number };
  future: {
    submittedCount: number;
    createdAssignmentCount: number;
    existingAssignmentCount: number;
    affectedWeekCount: number;
    /** Weeks whose DRAFT plan was created/updated. Import never publishes. */
    draftWeekCount?: number;
    publishedWeekCount: number;
    publishedShiftCount: number;
    publicationResults: Array<{ periodStart: string; status: string; createdShiftCount: number }>;
  };
  plan?: {
    autoPublished: false;
    revisionNumber: number | null;
    baselineRevision: number | null;
    revisionCreated: boolean;
    changes: PlanChangeCounts;
    evidenceDaysApplied?: number;
  };
  sourceKind?: string;
  annotations?: { submitted: number };
  import: RemoteImport;
}

/** `historical-and-plan` = also create/update the planning from the future rows (never publishes). */
export type FutureImportConsent = 'historical-and-plan';

export interface PlanBaselineInfo {
  status: 'MISSING' | 'EXISTS';
  canCreate: boolean;
  existingEquivalentRows: number;
  newRows: number;
  modifiedRows: number;
  reviewRows: number;
  sourceKind: string;
}

export interface PlanImportPreview {
  classification: 'HISTORICAL' | 'FUTURE' | 'MIXED';
  cutoff: string;
  document: { documentClass: ImportDocumentClass; confidence: string; evidence: string[] };
  historicalCount: number;
  futureCount: number;
  employeeCount: number;
  /** Legacy bootstrap: calendar data exists but no versioned company plan was ever recorded. */
  planBaseline?: PlanBaselineInfo;
  plan: { baselineRevision: number | null; changes: PlanChangeCounts; wouldCreateRevision: boolean; weeksAffected: string[] };
  autoPublish: false;
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
  startTime: string | null;
  endTime: string | null;
  location: string;
  origin: 'MAN' | 'IMP';
  shiftType?: string | null;
  countsAsWork?: boolean | null;
  acknowledgementStatus?: 'PENDING' | 'ACKNOWLEDGED';
  acknowledgedAt?: string | null;
  layer?: 'COMPANY_PLAN' | 'CHANGE';
  provenance?: string | null;
  dutyRole?: string | null;
  effectiveState?: Shift['effectiveState'];
  planRevision?: number;
  changeId?: string | null;
  hasHistory?: boolean;
}

const toShift = (row: RemoteShiftRow): Shift => ({
  id: row.id,
  date: row.date,
  startTime: row.startTime ?? '',
  endTime: row.endTime ?? '',
  shiftType: row.shiftType ?? null,
  countsAsWork: row.countsAsWork ?? null,
  location: row.location,
  origin: row.origin === 'MAN' ? 'MAN' : 'IMP',
  employeeId: row.employeeId,
  acknowledgementStatus: row.acknowledgementStatus,
  acknowledgedAt: row.acknowledgedAt,
  layer: row.layer,
  provenance: row.provenance ?? null,
  dutyRole: row.dutyRole ?? null,
  effectiveState: row.effectiveState,
  planRevision: row.planRevision,
  changeId: row.changeId ?? null,
  hasHistory: row.hasHistory === true,
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
  requestedStartTime?: string,
  requestedEndTime?: string,
): Promise<ChangeRequest> {
  const payload = await apiFetch<{ request: ChangeRequest }>(
    `/api/me/shifts/${encodeURIComponent(shiftId)}/change-requests`,
    { method: 'POST', body: JSON.stringify({ requestType, reason, requestedStartTime, requestedEndTime }) },
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

export async function loadRemoteChangeRequests(status?: ChangeRequestStatus): Promise<ChangeRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const payload = await apiFetch<{ requests: ChangeRequest[] }>(`/api/me/change-requests${query}`);
  return payload.requests;
}

export async function loadRemoteNotifications(): Promise<{
  notifications: EmployeeNotification[];
  unreadCount: number;
}> {
  return apiFetch<{ notifications: EmployeeNotification[]; unreadCount: number }>('/api/me/notifications');
}

export async function markRemoteNotificationRead(notificationId: string): Promise<EmployeeNotification> {
  const payload = await apiFetch<{ notification: EmployeeNotification }>(
    `/api/me/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST' },
  );
  return payload.notification;
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
  input: Pick<ShiftAssignment, 'employeeId' | 'date' | 'startTime' | 'endTime' | 'location' | 'shiftType' | 'countsAsWork'>,
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
  input: Partial<Pick<ShiftAssignment, 'employeeId' | 'date' | 'startTime' | 'endTime' | 'location' | 'shiftType' | 'countsAsWork'>>,
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
      importId: changes.importId ?? undefined,
      upserts: (changes.upserts ?? []).map((shift) => ({
        id: shift.id,
        employeeId,
        importId: changes.importId ?? undefined,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        shiftType: shift.shiftType ?? getShiftType(shift),
        countsAsWork: shift.countsAsWork ?? shiftTypeCountsAsWork(getShiftType(shift)),
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
  entitlement?: RemoteEntitlement;
}

export interface RemoteEntitlement {
  planId: 'free' | 'personal' | 'team';
  features: {
    multiEmployeeImport: boolean;
    teamManagement: boolean;
    fullHistory: boolean;
  };
  limits: {
    maxEmployees: number | null;
    maxMonthlyImports: number | null;
  };
  usage: { activeEmployees: number };
}

export async function loadRemoteOrganization(): Promise<RemoteOrganization> {
  const payload = await apiFetch<{ organization: RemoteOrganization; entitlement: RemoteEntitlement }>('/api/organizations/current');
  return { ...payload.organization, entitlement: payload.entitlement };
}

export type ApprovalPolicy = 'NO_APPROVAL' | 'AREA_RESPONSIBLE' | 'ORGANIZATION_ADMIN';

export interface RemoteAreaResponsible {
  userId: string;
  email: string;
  displayName: string;
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

export async function loadRemoteApprovalPolicy(organizationId: string): Promise<ApprovalPolicy> {
  const payload = await apiFetch<{ policy: ApprovalPolicy }>(`/api/organizations/${encodeURIComponent(organizationId)}/approval-policy`);
  return payload.policy;
}

export async function updateRemoteApprovalPolicy(organizationId: string, policy: ApprovalPolicy): Promise<ApprovalPolicy> {
  const payload = await apiFetch<{ policy: ApprovalPolicy }>(`/api/organizations/${encodeURIComponent(organizationId)}/approval-policy`, {
    method: 'PUT',
    body: JSON.stringify({ policy }),
  });
  return payload.policy;
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

export type BulkCreateStatus = 'created' | 'updated' | 'existing' | 'existing_inactive' | 'failed';
export type BulkCreateFailReason = 'invalid' | 'plan_limit' | 'unknown_area' | 'error';

export interface BulkCreateResult {
  key: string;
  status: BulkCreateStatus;
  employee?: RemoteEmployee;
  reason?: BulkCreateFailReason;
  /** Present when an area reference could not be resolved — raw data (the
   * value the row referenced), never a message: the caller renders it
   * through its own localized copy for reason 'unknown_area'. */
  areaLabel?: string;
}

/** "Create all new employees" — one request, many rows. `key` is a
 * caller-supplied correlation id (e.g. the TeamRow key) echoed back per
 * result so the caller can map results back without parsing name/id.
 * Team PDF imports may explicitly activate records without worker access;
 * ordinary employee bulk imports keep the pending-access default. */
export async function bulkCreateRemoteEmployees(items: {
  key: string;
  name: string;
  externalEmployeeId?: string;
  areaId?: string | null;
  areaName?: string;
}[], options: { activateWithoutAccess?: boolean } = {}): Promise<BulkCreateResult[]> {
  const payload = await apiFetch<{ results: BulkCreateResult[] }>('/api/employees/bulk', {
    method: 'POST',
    body: JSON.stringify({ employees: items, sync: true, activateWithoutAccess: options.activateWithoutAccess === true }),
  });
  return payload.results;
}

export type BulkInvitationStatus = 'INVITED' | 'UPDATE_ROLE' | 'UNCHANGED' | 'UNCHANGED_PENDING' | 'ERROR';
export interface BulkInvitationResult {
  row: number;
  key: string;
  email: string | null;
  status: BulkInvitationStatus;
  invitationStatus?: string | null;
  deliveryStatus?: string | null;
  code?: string | null;
}

export async function bulkCreateRemoteInvitations(items: {
  key: string;
  email: string;
  displayName?: string;
  role: Exclude<RemoteMember['role'], 'OWNER'>;
  externalEmployeeId?: string;
  locale?: 'es' | 'en';
}[], locale: 'es' | 'en'): Promise<{
  results: BulkInvitationResult[];
  summary: { invited: number; updated: number; unchanged: number; failed: number };
}> {
  return apiFetch('/api/invitations/bulk', {
    method: 'POST',
    body: JSON.stringify({ users: items, locale }),
  });
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
  outcome?: {
    status: 'pending' | 'completed' | 'partial' | 'blocked' | 'failed';
    reason?: string;
    detail?: Record<string, unknown>;
    blockingEmployeeId?: string | null;
  };
}): Promise<RemoteImport> {
  const payload = await apiFetch<{ import: RemoteImport }>('/api/imports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.import;
}

export async function updateRemoteImportOutcome(input: {
  id: string;
  status: 'partial' | 'blocked' | 'failed' | 'completed';
  reason: string;
  detail?: Record<string, unknown>;
  blockingEmployeeId?: string | null;
  createdShiftCount?: number;
  existingShiftCount?: number;
}): Promise<RemoteImport> {
  const payload = await apiFetch<{ import: RemoteImport }>('/api/imports', {
    method: 'PATCH',
    body: JSON.stringify({ id: input.id, outcome: input }),
  });
  return payload.import;
}

export async function confirmRemoteFutureImport(input: {
  fileName: string;
  sourceFormat: string;
  fileFingerprint: string;
  employeeId: string;
  shifts: Array<Pick<Shift, 'id' | 'date' | 'startTime' | 'endTime' | 'location' | 'origin' | 'sourceFormat' | 'annotations'> & { employeeId?: string; areaId?: string | null }>;
  deleteIds?: string[];
  periodYear: number | null;
  periodMonth: number | null;
  areaId?: string | null;
  importMode?: 'individual' | 'team';
  periodKind?: 'single' | 'multi';
  periodLabel?: string;
  futureConsent: FutureImportConsent;
  weekStart?: 'monday' | 'sunday';
  sourceKind?: 'EMPLOYEE_CALENDAR_EXPORT' | 'PUBLISHED_CALENDAR_EXPORT' | 'TEAM_SCHEDULE_EXPORT' | 'UNKNOWN';
  /** Source-system number carried by the document; the server verifies it against the target employee. */
  sourceSystem?: string | null;
  sourceIdentifier?: string | null;
  /** Annotations (DCF, observations) of every row of the document. */
  annotations?: Array<{ date: string; kind: 'DCF' | 'COMMENT'; text?: string; startTime?: string | null; endTime?: string | null }>;
}): Promise<FutureImportResult> {
  return apiFetch<FutureImportResult>('/api/imports/confirm-split', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Read-only reconciliation of a parsed document against the company plan (no writes). PLANNER+ only. */
export async function previewPlanImport(input: {
  fileFingerprint: string;
  employeeId?: string;
  shifts: Array<Pick<Shift, 'id' | 'date' | 'startTime' | 'endTime' | 'location' | 'origin' | 'sourceFormat' | 'annotations'> & { employeeId?: string; areaId?: string | null }>;
  areaId?: string | null;
  importMode?: 'individual' | 'team';
  periodKind?: 'single' | 'multi';
  deleteIds?: string[];
  sourceKind?: 'EMPLOYEE_CALENDAR_EXPORT' | 'PUBLISHED_CALENDAR_EXPORT' | 'TEAM_SCHEDULE_EXPORT' | 'UNKNOWN';
}): Promise<PlanImportPreview> {
  return apiFetch<PlanImportPreview>('/api/imports/plan-preview', { method: 'POST', body: JSON.stringify(input) });
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

// ------------------------------------------------------------ import reversions

export type ReversionBlockerCode =
  | 'LATER_MANUAL_CHANGE_UNSAFE' | 'PUBLISHED_DEPENDENCY' | 'LEGACY_PROVENANCE_INSUFFICIENT' | 'ALREADY_REVERTED'
  | 'NO_REVERSIBLE_EFFECTS' | 'REVERSION_DEPENDENCY_CYCLE';

export interface ReversionPlanImport {
  id: string;
  fileName: string;
  sourceFormat: string;
  importMode?: 'individual' | 'team';
  createdAt: string;
  importedByName: string | null;
  requestedByUser: boolean;
  autoIncluded: boolean;
  executionOrder: number | null;
  legacy: boolean;
}

export interface ReversionImpact {
  shiftsRemoved: number; shiftsRestored: number; reviewCleared: number;
  planRevisionsReverted: number;
  assignmentsRemoved: number; assignmentsRestored: number; draftVersionsRemoved: number; draftVersionsRestored: number;
  schedulesRemoved: number; schedulesRestored: number;
  dcfRemoved: number; dcfPreserved: number; commentsRemoved: number;
  changesRemoved: number; changesRestored: number;
  employeesAffected: number; alreadyAbsent: number;
}

export interface ReversionPlan {
  status: 'READY' | 'BLOCKED';
  planHash: string;
  requestedIds: string[];
  imports: ReversionPlanImport[];
  /** Import ids in the order the SERVER will execute them (dependents first). Informational: never user-controlled. */
  order: string[];
  impact: ReversionImpact;
  blockers: Array<{ code: ReversionBlockerCode; importId: string | null; count: number; reason?: string }>;
  warnings: Array<{ code: string; count: number }>;
}

export interface ReversionResult {
  reversionId: string;
  status: 'completed';
  idempotent: boolean;
  requestedImportCount: number;
  effectiveImportCount: number;
  impact: ReversionImpact | null;
  executionOrder: string[];
}

export interface ReversionDetail {
  id: string;
  reason: string | null;
  createdAt: string;
  requestedByName: string | null;
  impact: ReversionImpact | null;
  items: Array<{ importId: string; fileName: string; requestedByUser: boolean; autoIncludedDependency: boolean; executionOrder: number; effectCount: number }>;
}

/** READ-ONLY: the server closes the dependency set and orders the execution; nothing is written. OWNER / ADMIN. */
export async function previewImportReversion(importIds: string[]): Promise<ReversionPlan> {
  return apiFetch<ReversionPlan>('/api/imports/reversions/preview', { method: 'POST', body: JSON.stringify({ importIds }) });
}

/** Executes the previewed plan atomically. A changed state answers 409 REVERSION_PLAN_STALE (preview again). */
export async function confirmImportReversion(input: { importIds: string[]; planHash: string; reason?: string }): Promise<ReversionResult> {
  return apiFetch<ReversionResult>('/api/imports/reversions/confirm', { method: 'POST', body: JSON.stringify(input) });
}

export async function loadReversionDetail(importId: string): Promise<ReversionDetail> {
  return apiFetch<ReversionDetail>(`/api/imports/reversions/detail?importId=${encodeURIComponent(importId)}`);
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
  code?: string | null;
  deactivate?: boolean;
  reactivate?: boolean;
  active?: boolean;
}): Promise<RemoteArea> {
  const payload = await apiFetch<{ area: RemoteArea }>('/api/areas', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return payload.area;
}

export async function listRemoteAreaResponsibles(areaId: string): Promise<RemoteAreaResponsible[]> {
  const payload = await apiFetch<{ responsibles: RemoteAreaResponsible[] }>(`/api/areas/${encodeURIComponent(areaId)}/responsibles`);
  return payload.responsibles;
}

export async function addRemoteAreaResponsible(areaId: string, userId: string): Promise<RemoteAreaResponsible> {
  const payload = await apiFetch<{ responsible: RemoteAreaResponsible }>(`/api/areas/${encodeURIComponent(areaId)}/responsibles`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return payload.responsible;
}

export async function removeRemoteAreaResponsible(areaId: string, userId: string): Promise<void> {
  await apiFetch(`/api/areas/${encodeURIComponent(areaId)}/responsibles`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

// ------------------------------------------------------------ memberships

export interface RemoteMember {
  userId: string;
  email: string;
  displayName: string;
  role: 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE';
  scopedAreaId?: string | null;
  plannerScopeType?: 'ORGANIZATION' | 'AREAS' | 'EMPLOYEES' | null;
  scopedAreaIds?: string[];
  scopedEmployeeIds?: string[];
  employeeId?: string | null;
  employeeName?: string | null;
  employeeExternalId?: string | null;
  employeeAreaId?: string | null;
}

export async function listRemoteMembers(): Promise<RemoteMember[]> {
  const payload = await apiFetch<{ members: RemoteMember[] }>('/api/memberships');
  return payload.members;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export type InvitationDeliveryStatus = 'NOT_SENT' | 'SENT' | 'FAILED' | 'DELIVERED' | 'BOUNCED' | 'COMPLAINED';

export interface RemoteAccessInvitation {
  id: string;
  organizationId: string;
  organizationPersonId: string | null;
  email: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastSentAt: string | null;
  lastDeliveryAt: string | null;
  deliveryStatus: InvitationDeliveryStatus;
  sendAttempts: number;
  employeeName?: string | null;
  inviterDisplayName?: string | null;
}

export interface RemoteDirectoryPerson {
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  accountStatus: 'PENDING_INVITATION' | 'ACTIVE' | 'SUSPENDED' | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_INVITATION';
  role: RemoteMember['role'] | null;
  employeeId: string | null;
  employeeName: string | null;
  employmentStatus: string | null;
  externalEmployeeId: string | null;
}

export async function listRemoteAccessDirectory(): Promise<{
  people: RemoteDirectoryPerson[];
  invitations: RemoteAccessInvitation[];
}> {
  return apiFetch('/api/invitations');
}

export async function createRemoteAccessInvitation(input: {
  email: string;
  displayName?: string;
  role: Exclude<RemoteMember['role'], 'OWNER'>;
  employeeId?: string | null;
  employeeName?: string;
  externalEmployeeId?: string;
  areaId?: string | null;
  locale: 'es' | 'en';
}): Promise<{ invitation: RemoteAccessInvitation; delivery: { status: string; code?: string; id?: string | null } }> {
  return apiFetch('/api/invitations', { method: 'POST', body: JSON.stringify(input) });
}

export async function revokeRemoteAccessInvitation(id: string): Promise<void> {
  await apiFetch(`/api/invitations/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ action: 'revoke' }),
  });
}

export async function resendRemoteAccessInvitation(id: string, locale: 'es' | 'en'): Promise<{ invitationId: string; status: string; code?: string }> {
  return apiFetch(`/api/invitations/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ action: 'resend', locale }),
  });
}

export interface InvitationValidation {
  status: 'VALID';
  invitationId: string;
  organizationName: string;
  role: RemoteMember['role'];
  employeeName: string | null;
  email: string;
  expiresAt: string;
  acceptanceMode: 'CREATE_ACCOUNT' | 'LINK_EXISTING';
}

export async function validateRemoteAccessInvitation(token: string): Promise<InvitationValidation> {
  return apiFetch('/api/invitations/validate', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/**
 * Minimal accept payload: the email is authoritative from the validated
 * invitation server-side (never sent here), and displayName/locale/theme
 * are auto-resolved server-side — this screen never asks for them.
 * `password` is only meaningful for a brand-new account; the confirmation
 * field is validated client-side only and never transmitted.
 */
export async function acceptRemoteAccessInvitation(input: {
  token: string;
  password?: string;
}): Promise<{
  status: 'ACCEPTED';
  organizationId: string;
  userId: string;
  /** Present only when the caller was authenticated as a different identity
   * than the invitation just activated: no session was created/replaced. */
  requiresAccountSwitch?: boolean;
  currentEmail?: string;
}> {
  return apiFetch('/api/invitations/accept', { method: 'POST', body: JSON.stringify(input) });
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
  plannerScopeType?: 'ORGANIZATION' | 'AREAS' | 'EMPLOYEES' | null;
  scopedAreaIds?: string[];
  scopedEmployeeIds?: string[];
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

/** Legacy bulk user provisioning kept for non-CSV compatibility callers.
 * The secure CSV import uses bulkCreateRemoteInvitations instead. */
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

export async function updateRemoteMemberRole(
  userId: string,
  role: RemoteMember['role'],
  scopedAreaId?: string | null,
  options?: {
    plannerScopeType?: 'ORGANIZATION' | 'AREAS' | 'EMPLOYEES' | null;
    scopedAreaIds?: string[];
    scopedEmployeeIds?: string[];
  },
): Promise<void> {
  await apiFetch('/api/memberships', {
    method: 'PATCH',
    body: JSON.stringify({
      userId,
      role,
      ...(role === 'PLANNER'
        ? {
          scopedAreaId: scopedAreaId ?? null,
          plannerScopeType: options?.plannerScopeType ?? null,
          scopedAreaIds: options?.scopedAreaIds ?? [],
          scopedEmployeeIds: options?.scopedEmployeeIds ?? [],
        }
        : {}),
    }),
  });
}

export async function removeRemoteMember(userId: string): Promise<void> {
  await apiFetch('/api/memberships', {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

// ------------------------------------------------------------ ownership transfer (P5.7)

export interface OwnershipTransferResult {
  transferred: boolean;
  previousOwnerUserId: string;
  newOwnerUserId: string;
  previousOwnerRole: string;
}

export async function transferRemoteOwnership(
  targetUserId: string,
  previousOwnerRole: 'ADMIN' | 'PLANNER' = 'ADMIN',
): Promise<OwnershipTransferResult> {
  return apiFetch<OwnershipTransferResult>('/api/organizations/transfer-ownership', {
    method: 'POST',
    body: JSON.stringify({ targetUserId, previousOwnerRole }),
  });
}

// ------------------------------------------------------------ operational assignments (P5.7)

export interface RemoteOperationalAssignment {
  id: string;
  organizationId: string;
  assignmentType: 'EMPLOYEE_AREA' | 'PLANNER_AREA' | 'PLANNER_EMPLOYEE';
  subjectId: string;
  targetId: string;
  validFrom: string;
  validTo: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function listRemoteOperationalAssignments(filter?: {
  assignmentType?: string;
  subjectId?: string;
  targetId?: string;
}): Promise<RemoteOperationalAssignment[]> {
  const params = new URLSearchParams();
  if (filter?.assignmentType) params.set('type', filter.assignmentType);
  if (filter?.subjectId) params.set('subjectId', filter.subjectId);
  if (filter?.targetId) params.set('targetId', filter.targetId);
  const query = params.toString();
  const payload = await apiFetch<{ assignments: RemoteOperationalAssignment[] }>(`/api/assignments${query ? `?${query}` : ''}`);
  return payload.assignments;
}

export async function createOrUpdateRemoteOperationalAssignment(input: {
  assignmentType: 'EMPLOYEE_AREA' | 'PLANNER_AREA' | 'PLANNER_EMPLOYEE';
  subjectId: string;
  targetId: string;
  effectiveDate?: string;
}): Promise<RemoteOperationalAssignment> {
  const payload = await apiFetch<{ assignment: RemoteOperationalAssignment }>('/api/assignments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.assignment;
}

export async function removeRemoteOperationalAssignment(input: {
  id?: string;
  subjectId?: string;
  targetId?: string;
  assignmentType?: string;
  effectiveDate?: string;
}): Promise<{ removed: boolean; count: number }> {
  return apiFetch<{ removed: boolean; count: number }>('/api/assignments', {
    method: 'DELETE',
    body: JSON.stringify(input),
  });
}

export async function bulkMoveRemoteEmployeesArea(input: {
  employeeIds: string[];
  targetAreaId: string | null;
  effectiveDate?: string;
}): Promise<{ moved: boolean; count: number; targetAreaId: string | null; effectiveDate: string }> {
  return apiFetch('/api/assignments/bulk-move', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** ADMIN/OWNER only: restore the organization to its initial operational state
 * (deletes shifts, imports, employees and user↔employee links; keeps the
 * organization and the admin account). Org-scoped, irreversible. */
export async function resetOrganization(): Promise<{ reset: boolean; deleted: { shifts: number; imports: number; employees: number } }> {
  return apiFetch('/api/organizations/reset', { method: 'POST' });
}


// ---------------------------------------------------------------------------
// Effective calendar: annual targets, day provenance, administrative changes.
// ---------------------------------------------------------------------------

export interface RemoteAnnualTarget {
  id: string;
  employeeId: string;
  year: number;
  minimumAnnualMinutes: number;
  maximumAnnualMinutes: number;
  marginMinutes: number;
  notes: string;
  source: string;
  updatedAt: string;
}

export async function loadAnnualTargets(employeeId: string): Promise<RemoteAnnualTarget[]> {
  const payload = await apiFetch<{ targets: RemoteAnnualTarget[] }>(
    `/api/calendar/annual-targets?employeeId=${encodeURIComponent(employeeId)}`,
  );
  return payload.targets;
}

export async function saveAnnualTarget(input: {
  employeeId: string;
  year: number;
  minimumAnnualMinutes: number;
  maximumAnnualMinutes: number;
  notes?: string;
}): Promise<RemoteAnnualTarget> {
  const payload = await apiFetch<{ target: RemoteAnnualTarget }>('/api/calendar/annual-targets', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return payload.target;
}

export interface RemoteCalendarChange {
  id: string;
  changeType: string;
  actorRole: string;
  actorName: string | null;
  selfChange: boolean;
  source: string;
  reason: string;
  before: Array<{ shiftType: string; startTime: string | null; endTime: string | null }>;
  after: Array<{ shiftType: string; startTime: string | null; endTime: string | null }>;
  approvalStatus: string;
  createdAt: string;
}

export interface RemoteDayHistory {
  employeeId: string;
  date: string;
  rows: RemoteShiftRow[];
  changes: RemoteCalendarChange[];
  provenance: DayProvenance;
}

export async function loadDayHistory(employeeId: string, date: string): Promise<RemoteDayHistory> {
  return apiFetch<RemoteDayHistory>(
    `/api/calendar/changes?employeeId=${encodeURIComponent(employeeId)}&date=${encodeURIComponent(date)}`,
  );
}

export interface CalendarChangeInput {
  employeeId: string;
  date: string;
  changeType: string;
  reason: string;
  after?: Array<{ shiftType: string; startTime?: string | null; endTime?: string | null }>;
  supersedeShiftIds?: string[];
}

export async function applyCalendarChangeRemote(input: CalendarChangeInput) {
  return apiFetch<{ result: { changeId: string; selfChange: boolean } }>('/api/calendar/changes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function reconcileCalendarDayRemote(input: {
  employeeId: string;
  date: string;
  keepShiftIds: string[];
  reason: string;
}) {
  return apiFetch<{ result: { changeId: string } }>('/api/calendar/changes', {
    method: 'POST',
    body: JSON.stringify({ action: 'RECONCILE', ...input }),
  });
}

export interface RemoteCalendarStats {
  employeeId: string;
  year: number;
  today: string;
  calendarRows: number;
  total: StatsBucket;
  realized: StatsBucket;
  planned: StatsBucket;
  unresolvedDays: number;
  monthStats: { month: number; realized: StatsBucket; planned: StatsBucket } | null;
  target: RemoteAnnualTarget | null;
  contract: ContractEvaluation;
  projection: { realizedMinutes: number; plannedMinutes: number; projectedMinutes: number };
}

export async function loadCalendarStats(employeeId: string, year: number, month?: number): Promise<RemoteCalendarStats> {
  const monthParam = month ? `&month=${month}` : '';
  return apiFetch<RemoteCalendarStats>(
    `/api/calendar/stats?employeeId=${encodeURIComponent(employeeId)}&year=${year}${monthParam}`,
  );
}

export interface ReconciliationShiftLabel { type: string; startTime: string | null; endTime: string | null }

export type ReconciliationReasonCode = 'EFFECTIVE_DIFFERS_FROM_PLAN' | 'PLAN_CHANGED' | 'PENDING_REVIEW';

export interface ReconciliationItem {
  date: string;
  status: 'PENDING' | 'RESOLVED';
  /** Company plan before the latest change / now, and the effective calendar (when the information exists). */
  companyBefore?: ReconciliationShiftLabel[] | null;
  companyNow?: ReconciliationShiftLabel[] | null;
  effective?: ReconciliationShiftLabel[];
  reasonCode?: ReconciliationReasonCode;
  company: ReconciliationShiftLabel[];
  current: ReconciliationShiftLabel[];
  resolvedAt: string | null;
  resolvedReason: string | null;
  selfChange: boolean | null;
}

export interface ReconciliationWorklist {
  employeeId: string;
  year: number;
  pendingCount: number;
  resolvedCount: number;
  items: ReconciliationItem[];
}

export async function loadReconciliation(employeeId: string, year: number): Promise<ReconciliationWorklist> {
  return apiFetch<ReconciliationWorklist>(
    `/api/calendar/reconciliation?employeeId=${encodeURIComponent(employeeId)}&year=${year}`,
  );
}


// ------------------------------------------------------------ day annotations (DCF, observations)

export interface DayAnnotation {
  id: string;
  employeeId: string;
  date: string;
  kind: 'DCF' | 'COMMENT';
  text: string | null;
  startTime: string | null;
  endTime: string | null;
  /** DCF: HOURS_UNKNOWN = the source says it exists but not when (never invented). */
  completeness: 'HOURS_UNKNOWN' | 'HOURS_KNOWN' | null;
  origin: 'IMPORT' | 'MANUAL';
  sourceKind: string | null;
}

export async function loadCalendarAnnotations(employeeId: string, from: string, to: string): Promise<DayAnnotation[]> {
  const payload = await apiFetch<{ annotations: DayAnnotation[] }>(
    `/api/calendar/annotations?employeeId=${encodeURIComponent(employeeId)}&from=${from}&to=${to}`,
  );
  return payload.annotations;
}

export async function saveImportAnnotations(input: {
  employeeId: string;
  importId?: string | null;
  sourceKind?: string | null;
  items: Array<{ date: string; kind: 'DCF' | 'COMMENT'; text?: string; startTime?: string | null; endTime?: string | null }>;
}): Promise<{ saved: number }> {
  return apiFetch('/api/calendar/annotations', { method: 'POST', body: JSON.stringify(input) });
}

/** OWNER / ADMIN / PLANNER only. Both times empty = back to "hours unknown". */
export async function setDcfInterval(input: { employeeId: string; date: string; startTime: string | null; endTime: string | null }) {
  return apiFetch<{ completeness: 'HOURS_UNKNOWN' | 'HOURS_KNOWN' }>('/api/calendar/annotations', { method: 'PATCH', body: JSON.stringify(input) });
}

// ------------------------------------------------------------ source identifiers (explicit mappings only)

export interface SourceIdentifierResolution {
  mapped: boolean;
  employee: { id: string; name: string; externalEmployeeId: string | null; status: string } | null;
}

export async function resolveSourceIdentifier(sourceSystem: string, externalIdentifier: string): Promise<SourceIdentifierResolution> {
  return apiFetch(`/api/employees/identifiers?sourceSystem=${encodeURIComponent(sourceSystem)}&externalIdentifier=${encodeURIComponent(externalIdentifier)}`);
}

export type SourceIdentityStatus = 'MAPPED' | 'CANONICAL' | 'CANDIDATE' | 'AMBIGUOUS' | 'NONE' | 'MISMATCH' | 'NOT_YOURS';
export interface SourceIdentityEmployee { id: string; name: string; externalEmployeeId: string | null; status: string }
export interface SourceIdentityResolution {
  status: SourceIdentityStatus;
  employee: SourceIdentityEmployee | null;
  /** AMBIGUOUS: every exact name match (with its canonical id to tell them apart). MISMATCH: the employee the name points to. */
  candidates: SourceIdentityEmployee[];
}

/** Mapping -> canonical id -> unique exact name (deterministic, server side, role aware). */
export async function resolveSourceIdentity(input: { sourceSystem: string; externalIdentifier: string; documentName: string }): Promise<SourceIdentityResolution> {
  const query = `sourceSystem=${encodeURIComponent(input.sourceSystem)}&externalIdentifier=${encodeURIComponent(input.externalIdentifier)}&documentName=${encodeURIComponent(input.documentName)}`;
  return apiFetch<SourceIdentityResolution>(`/api/employees/identifiers?${query}`);
}

/** Explicit association of a source number with an employee (ADMIN+; an EMPLOYEE may only bind their own record). */
export async function createSourceIdentifierMapping(input: { employeeId: string; sourceSystem: string; externalIdentifier: string; documentName?: string }) {
  return apiFetch<{ created: boolean } & SourceIdentifierResolution>('/api/employees/identifiers', { method: 'POST', body: JSON.stringify(input) });
}

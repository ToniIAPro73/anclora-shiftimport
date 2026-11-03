import { randomUUID } from 'node:crypto';
import { HttpError, employeeRowInScope, requireRole, resolveEffectiveAccessScope } from './auth.js';
import { createShiftPublishedNotifications, recordAuditEvent } from './data.js';
import { getOperationalDate, shiftOperationalDate } from './operational-date.js';
import { assertTimedTypeHasTimes, findAssignmentConflict, getShiftSemantics } from './shift-compatibility.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function databaseDateToIso(value) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  // PostgreSQL DATE has no timezone. The Neon driver may materialize it as a
  // local-midnight Date, so using toISOString() can shift it to the prior day
  // in positive-offset environments.
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0'))
    .join('-');
}

function normalizePeriodStart(value) {
  const periodStart = String(value ?? '').trim();
  if (!ISO_DATE_RE.test(periodStart)) {
    throw new HttpError(400, 'periodStart must be an ISO date (YYYY-MM-DD)');
  }

  const [year, month, day] = periodStart.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) {
    throw new HttpError(400, 'periodStart must be a valid date');
  }
  if (date.getUTCDay() !== 0 && date.getUTCDay() !== 1) {
    throw new HttpError(400, 'periodStart must be a Monday or Sunday');
  }

  const periodEndDate = new Date(date.getTime());
  periodEndDate.setUTCDate(periodEndDate.getUTCDate() + 6);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);
  if (periodEnd < getOperationalDate()) {
    const error = new HttpError(400, 'Planning weeks cannot be fully in the past');
    error.code = 'PAST_PLANNING_FORBIDDEN';
    throw error;
  }
  return { periodStart, periodEnd };
}

function assertPlanningDate(date) {
  if (date < getOperationalDate()) {
    const error = new HttpError(400, 'Planning dates cannot be before today');
    error.code = 'PAST_PLANNING_FORBIDDEN';
    throw error;
  }
}

function normalizeAreaId(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const areaId = String(value).trim();
  if (!UUID_RE.test(areaId)) {
    throw new HttpError(400, 'areaId must be a valid UUID');
  }
  return areaId;
}

function normalizeDate(value, field = 'date') {
  const date = String(value ?? '').trim();
  if (!ISO_DATE_RE.test(date)) throw new HttpError(400, `${field} must be an ISO date (YYYY-MM-DD)`);
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, `${field} must be a valid date`);
  }
  return date;
}

function normalizeTime(value, field) {
  const time = String(value ?? '').trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new HttpError(400, `${field} must use HH:mm format`);
  }
  return time;
}

function normalizeOptionalTime(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return normalizeTime(value, field);
}

function resolveAssignmentSemantics(input = {}, existing = null) {
  const shiftType = input.shiftType === undefined
    ? (existing?.shift_type ?? 'Regular')
    : String(input.shiftType ?? '').trim() || 'Regular';
  const countsAsWork = typeof input.countsAsWork === 'boolean'
    ? input.countsAsWork
    : typeof existing?.counts_as_work === 'boolean'
      ? existing.counts_as_work
      : getShiftSemantics({ shiftType, startTime: input.startTime, endTime: input.endTime }).contributesWorkedTime;
  const startTime = input.startTime === undefined
    ? normalizeOptionalTime(existing?.start_time, 'startTime')
    : normalizeOptionalTime(input.startTime, 'startTime');
  const endTime = input.endTime === undefined
    ? normalizeOptionalTime(existing?.end_time, 'endTime')
    : normalizeOptionalTime(input.endTime, 'endTime');

  if ((startTime === null) !== (endTime === null)) {
    const error = new HttpError(400, 'A shift must contain both startTime and endTime, or neither');
    error.code = 'SHIFT_TIMES_INCOMPLETE';
    throw error;
  }
  assertTimedTypeHasTimes({ shiftType, countsAsWork, startTime, endTime });
  return { shiftType, countsAsWork, startTime, endTime };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

export const MINIMUM_REST_HOURS = 11;
const MINIMUM_REST_MINUTES = MINIMUM_REST_HOURS * 60;

function dateToDayNumber(value) {
  const date = databaseDateToIso(value);
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function assignmentInterval(assignment) {
  if (assignment.start_time === null || assignment.end_time === null
    || assignment.start_time === undefined || assignment.end_time === undefined) {
    return null;
  }
  const start = dateToDayNumber(assignment.date) * 1440 + timeToMinutes(assignment.start_time);
  let end = dateToDayNumber(assignment.date) * 1440 + timeToMinutes(assignment.end_time);
  // Preserve the existing shift convention: an end time at or before the
  // start time represents an overnight assignment.
  if (end <= start) end += 1440;
  return { start, end };
}

export function calculateRestGapMinutes(first, second) {
  const a = assignmentInterval(first);
  const b = assignmentInterval(second);
  if (!a || !b) return null;
  if (a.end <= b.start) return b.start - a.end;
  if (b.end <= a.start) return a.start - b.end;
  return null;
}

/** Half-open interval rule: touching assignments are valid, overlap is not. */
export function rangesOverlap(startTime, endTime, existingStartTime, existingEndTime) {
  return timeToMinutes(startTime) < timeToMinutes(existingEndTime)
    && timeToMinutes(endTime) > timeToMinutes(existingStartTime);
}

/** The employee-level scope the SQL statements enforce for a non-organisation-wide actor (see `publishScheduleVersionTx`). */
function scopeGuardOf(scope) {
  if (scope.type === 'AREA') return { scopeMode: 'AREAS', scopeIds: [scope.areaId] };
  if (scope.type === 'AREAS') return { scopeMode: 'AREAS', scopeIds: scope.areaIds || [] };
  if (scope.type === 'EMPLOYEES') return { scopeMode: 'EMPLOYEES', scopeIds: scope.employeeIds || [] };
  return { scopeMode: 'NONE', scopeIds: [] };
}

function employeeScopeError() {
  const error = new HttpError(403, 'Employee is outside your assigned scope');
  error.code = 'SCOPE_FORBIDDEN';
  return error;
}

function scheduleScopeError() {
  const error = new HttpError(403, 'Schedule is outside your assigned area');
  error.code = 'SCOPE_FORBIDDEN';
  return error;
}

async function loadScheduleVersion(sql, ctx, scheduleId, versionId) {
  const rows = await sql`
    SELECT sv.id AS version_id, sv.schedule_id, sv.status,
           s.organization_id, s.area_id, s.period_start, s.period_end
    FROM schedule_versions sv
    JOIN schedules s ON s.id = sv.schedule_id
    WHERE sv.id = ${versionId}
      AND sv.schedule_id = ${scheduleId}
      AND s.organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) throw new HttpError(404, 'Schedule version not found');
  const schedule = {
    ...rows[0],
    period_start: databaseDateToIso(rows[0].period_start),
    period_end: databaseDateToIso(rows[0].period_end),
  };
  const scope = await resolveEffectiveAccessScope(sql, ctx);
  if (scope.type === 'AREA' && schedule.area_id !== scope.areaId) throw scheduleScopeError();
  if (schedule.status !== 'DRAFT') {
    const error = new HttpError(409, 'Schedule version is not editable');
    error.code = 'VERSION_NOT_EDITABLE';
    throw error;
  }
  return schedule;
}

function assertAssignmentDateInPeriod(date, schedule) {
  if (date < schedule.period_start || date > schedule.period_end) {
    throw new HttpError(400, 'Assignment date must be inside the schedule period');
  }
}

async function assertEmployeeForSchedule(sql, ctx, schedule, employeeId) {
  if (!UUID_RE.test(employeeId)) throw new HttpError(400, 'employeeId must be a valid UUID');
  const rows = await sql`
    SELECT id, area_id, status
    FROM employees
    WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) throw new HttpError(404, 'Employee not found');
  if (rows[0].status !== 'active') throw new HttpError(409, 'Employee is not active');
  if (schedule.area_id && rows[0].area_id !== schedule.area_id) throw scheduleScopeError();
  // F4-REM-01: the schedule's area is NOT a substitute for the actor's scope over this employee.
  if (!employeeRowInScope(await resolveEffectiveAccessScope(sql, ctx), rows[0])) throw employeeScopeError();
}

/**
 * An approved vacation is protected: no draft assignment may coexist with it on the same (employee, date) (spec §4.4.4, F3-M03).
 * Data-driven (an EFFECTIVE shift born from a time-off request), so it needs no flag: without such rows nothing changes.
 */
async function assertNotProtectedAbsenceDay(sql, ctx, employeeId, date) {
  const rows = await sql`
    SELECT 1 FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId} AND date = ${date}
      AND effective_state = 'EFFECTIVE' AND time_off_request_id IS NOT NULL
    LIMIT 1
  `;
  if (rows.length > 0) {
    const error = new HttpError(422, 'This day has an approved vacation and cannot be planned');
    error.code = 'PROTECTED_ABSENCE_DAY';
    throw error;
  }
}

async function assertNoAssignmentOverlap(sql, { scheduleVersionId, employeeId, date, startTime, endTime, excludeId = null }) {
  if (startTime === null || endTime === null) return;
  const rows = excludeId
    ? await sql`
      SELECT id, start_time, end_time, shift_type, counts_as_work
      FROM shift_assignments
      WHERE schedule_version_id = ${scheduleVersionId}
        AND employee_id = ${employeeId}
        AND date = ${date}
        AND id <> ${excludeId}
      ORDER BY start_time, id
    `
    : await sql`
      SELECT id, start_time, end_time, shift_type, counts_as_work
      FROM shift_assignments
      WHERE schedule_version_id = ${scheduleVersionId}
        AND employee_id = ${employeeId}
        AND date = ${date}
      ORDER BY start_time, id
    `;
  const conflict = findAssignmentConflict(rows, {
    id: null, date, startTime, endTime, shiftType: 'Regular', countsAsWork: true,
  }, excludeId);
  if (conflict) {
    const error = new HttpError(422, conflict.code === 'OVERLAP'
      ? 'This time overlaps another record on the same day'
      : 'A whole-day record cannot be combined with timed records on the same date');
    error.code = conflict.code;
    error.conflictingAssignmentId = conflict.existing.id;
    error.fullDayType = conflict.fullDayType;
    throw error;
  }
}

async function assertMinimumRest(sql, {
  scheduleVersionId, employeeId, date, startTime, endTime, shiftType = 'Regular', countsAsWork = true, excludeId = null,
}) {
  const rows = excludeId
    ? await sql`
      SELECT id, date, start_time, end_time
      FROM shift_assignments
      WHERE schedule_version_id = ${scheduleVersionId}
        AND employee_id = ${employeeId}
        AND date BETWEEN (${date}::date - 2) AND (${date}::date + 2)
        AND id <> ${excludeId}
    `
    : await sql`
      SELECT id, date, start_time, end_time
      FROM shift_assignments
      WHERE schedule_version_id = ${scheduleVersionId}
        AND employee_id = ${employeeId}
        AND date BETWEEN (${date}::date - 2) AND (${date}::date + 2)
    `;
  const candidate = { date, start_time: startTime, end_time: endTime, counts_as_work: countsAsWork, shift_type: shiftType };
  const candidateSemantics = getShiftSemantics(candidate);
  // A temporal absence is not worked time and must not create a rest-period
  // conflict. Same-day contiguous segments are explicitly valid in the
  // segment model, so rest is only evaluated between different dates.
  if (!candidateSemantics.contributesWorkedTime) return;
  const conflict = rows
    .filter((row) => databaseDateToIso(row.date) !== date && getShiftSemantics(row).contributesWorkedTime)
    .map((row) => ({ row, gap: calculateRestGapMinutes(candidate, row) }))
    .filter(({ gap }) => gap !== null && gap < MINIMUM_REST_MINUTES)
    .sort((a, b) => a.gap - b.gap)[0];
  if (conflict) {
    const error = new HttpError(422, `Minimum rest period is ${MINIMUM_REST_HOURS} hours`);
    error.code = 'REST_RULE_VIOLATION';
    error.minimumRestHours = MINIMUM_REST_HOURS;
    error.conflictingAssignmentId = conflict.row.id;
    throw error;
  }
}

function mapAssignment(row) {
  return {
    id: row.id,
    scheduleVersionId: row.schedule_version_id,
    employeeId: row.employee_id,
    importId: row.import_id ?? null,
    date: databaseDateToIso(row.date),
    startTime: row.start_time === null || row.start_time === undefined ? null : String(row.start_time).slice(0, 5),
    endTime: row.end_time === null || row.end_time === undefined ? null : String(row.end_time).slice(0, 5),
    location: row.location,
    shiftType: row.shift_type ?? 'Regular',
    countsAsWork: row.counts_as_work !== false,
    // DRAFT only: a later manual calendar change contradicts this assignment (spec §4.5); it is kept but never published.
    staleAgainstCalendar: row.stale_against_calendar === true,
    // PUBLISHED/LOCKED/COMPLETED only: derived from the shifts the publication created (never stored); drives the header counters.
    excludedFromPublication: row.excluded_from_publication === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScheduleVersion(row) {
  return {
    id: row.version_id,
    scheduleId: row.schedule_id,
    areaId: row.area_id ?? null,
    versionNumber: row.version_number,
    status: row.status,
    periodStart: databaseDateToIso(row.period_start),
    periodEnd: databaseDateToIso(row.period_end),
    createdAt: row.created_at,
    publishedAt: row.published_at ?? null,
  };
}

function mapScheduleVersionHistory(row) {
  return {
    id: row.version_id,
    scheduleId: row.schedule_id,
    versionNumber: row.version_number,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdByUserName: row.created_by_user_name ?? null,
    createdAt: row.created_at,
    publishedByUserId: row.published_by_user_id ?? null,
    publishedByUserName: row.published_by_user_name ?? null,
    publishedAt: row.published_at ?? null,
  };
}

function mapSchedulingEmployee(row) {
  return {
    id: row.id,
    name: row.name,
    externalEmployeeId: row.external_employee_id ?? null,
    areaId: row.area_id ?? null,
  };
}

async function schedulingScope(sql, ctx, requestedAreaId = null) {
  const scope = await resolveEffectiveAccessScope(sql, ctx);
  if (scope.type === 'AREA') {
    if (requestedAreaId && requestedAreaId !== scope.areaId) {
      throw scheduleScopeError();
    }
    return { scope, areaId: scope.areaId };
  }
  if (scope.type === 'AREAS' && requestedAreaId && !(scope.areaIds || []).includes(requestedAreaId)) {
    throw scheduleScopeError();
  }
  return { scope, areaId: requestedAreaId || null };
}

async function schedulingScopeAreaId(sql, ctx, requestedAreaId = null) {
  return (await schedulingScope(sql, ctx, requestedAreaId)).areaId;
}

/** Lists the latest version for each tenant-scoped schedule for draft discovery. */
export async function listScheduleVersions(sql, ctx, { areaId = null } = {}) {
  requireRole(ctx, 'PLANNER');
  const scopedAreaId = await schedulingScopeAreaId(sql, ctx, areaId);
  const rows = scopedAreaId
    ? await sql`
      SELECT s.id AS schedule_id, s.area_id, s.period_start, s.period_end,
             sv.id AS version_id, sv.version_number, sv.status,
             sv.created_at, sv.published_at
      FROM schedules s
      JOIN LATERAL (
        SELECT id, version_number, status, created_at, published_at
        FROM schedule_versions
        WHERE schedule_id = s.id
        ORDER BY version_number DESC
        LIMIT 1
      ) sv ON TRUE
      WHERE s.organization_id = ${ctx.organizationId}
        AND s.area_id = ${scopedAreaId}
      ORDER BY s.period_start DESC, s.id
    `
    : await sql`
      SELECT s.id AS schedule_id, s.area_id, s.period_start, s.period_end,
             sv.id AS version_id, sv.version_number, sv.status,
             sv.created_at, sv.published_at
      FROM schedules s
      JOIN LATERAL (
        SELECT id, version_number, status, created_at, published_at
        FROM schedule_versions
        WHERE schedule_id = s.id
        ORDER BY version_number DESC
        LIMIT 1
      ) sv ON TRUE
      WHERE s.organization_id = ${ctx.organizationId}
      ORDER BY s.period_start DESC, s.id
    `;
  return rows.map(mapScheduleVersion);
}

/** Lists every version for one tenant-scoped schedule, newest first. */
export async function listScheduleVersionHistory(sql, ctx, scheduleId) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId)) throw new HttpError(400, 'scheduleId must be a valid UUID');
  const rows = await sql`
    SELECT sv.id AS version_id, sv.schedule_id, sv.version_number, sv.status,
           sv.created_by_user_id, sv.created_at, sv.published_by_user_id, sv.published_at,
           s.area_id,
           creator.display_name AS created_by_user_name,
           publisher.display_name AS published_by_user_name
    FROM schedule_versions sv
    JOIN schedules s ON s.id = sv.schedule_id
    JOIN users creator ON creator.id = sv.created_by_user_id
    LEFT JOIN users publisher ON publisher.id = sv.published_by_user_id
    WHERE sv.schedule_id = ${scheduleId}
      AND s.organization_id = ${ctx.organizationId}
    ORDER BY sv.version_number DESC
  `;
  if (rows.length === 0) throw new HttpError(404, 'Schedule not found');
  const scope = await resolveEffectiveAccessScope(sql, ctx);
  if (scope.type === 'AREA' && rows[0].area_id !== scope.areaId) throw scheduleScopeError();
  return rows.map(mapScheduleVersionHistory);
}

/** Reads one schedule version and the scoped active roster for the planner grid. */
export async function getScheduleSnapshot(sql, ctx, scheduleId, versionId) {
  requireRole(ctx, 'PLANNER');
  const rows = await sql`
    SELECT sv.id AS version_id, sv.schedule_id, sv.version_number, sv.status,
           sv.created_at, sv.published_at,
           s.organization_id, s.area_id, s.period_start, s.period_end
    FROM schedule_versions sv
    JOIN schedules s ON s.id = sv.schedule_id
    WHERE sv.id = ${versionId}
      AND sv.schedule_id = ${scheduleId}
      AND s.organization_id = ${ctx.organizationId}
  `;
  if (rows.length === 0) throw new HttpError(404, 'Schedule version not found');
  const schedule = rows[0];
  const { scope, areaId: scopedAreaId } = await schedulingScope(sql, ctx, schedule.area_id ?? null);
  const employeeQuery = scopedAreaId
    ? sql`
      SELECT id, name, external_employee_id, area_id
      FROM employees
      WHERE organization_id = ${ctx.organizationId}
        AND status = 'active'
        AND area_id = ${scopedAreaId}
      ORDER BY name ASC, id
    `
    : sql`
      SELECT id, name, external_employee_id, area_id
      FROM employees
      WHERE organization_id = ${ctx.organizationId}
        AND status = 'active'
      ORDER BY name ASC, id
    `;
  const assignmentQuery = scopedAreaId
    ? sql`
      SELECT sa.id, sa.schedule_version_id, sa.import_id, sa.employee_id, sa.date,
             sa.start_time, sa.end_time, sa.location, sa.shift_type, sa.counts_as_work,
             sa.created_at, sa.updated_at,
             ((${schedule.status === 'DRAFT'}::boolean OR NOT EXISTS (
          -- A published version only keeps flagging what its publication did not materialize (the exclusion is derived, never stored).
          SELECT 1 FROM shifts mat
          WHERE mat.organization_id = ${ctx.organizationId} AND mat.schedule_version_id = sa.schedule_version_id
            AND mat.employee_id = sa.employee_id AND mat.date = sa.date
            AND mat.start_time IS NOT DISTINCT FROM TO_CHAR(sa.start_time, 'HH24:MI')
            AND mat.end_time IS NOT DISTINCT FROM TO_CHAR(sa.end_time, 'HH24:MI')
            AND lower(btrim(COALESCE(mat.shift_type, ''))) = lower(btrim(COALESCE(sa.shift_type, '')))
        )) AND EXISTS (
          SELECT 1 FROM shifts m
          WHERE m.organization_id = ${ctx.organizationId}
            AND m.employee_id = sa.employee_id AND m.date = sa.date
            AND m.effective_state = 'EFFECTIVE' AND m.schedule_version_id IS NULL
            AND m.provenance = 'MANUAL_ADMIN_CHANGE'
            AND lower(btrim(COALESCE(m.shift_type, ''))) <> 'jt'
            AND (
              (sa.start_time IS NULL) <> (NULLIF(btrim(m.start_time), '') IS NULL)
              OR (sa.start_time IS NULL AND NULLIF(btrim(m.start_time), '') IS NULL
                  AND lower(btrim(COALESCE(sa.shift_type, ''))) <> lower(btrim(COALESCE(m.shift_type, ''))))
              OR (sa.start_time IS NOT NULL AND sa.end_time IS NOT NULL
                  AND NULLIF(btrim(m.start_time), '') IS NOT NULL AND NULLIF(btrim(m.end_time), '') IS NOT NULL
                  AND (sa.date + sa.start_time,
                       sa.date + sa.end_time + CASE WHEN sa.end_time <= sa.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END)
                      OVERLAPS
                      (m.date + btrim(m.start_time)::time,
                       m.date + btrim(m.end_time)::time
                         + CASE WHEN btrim(m.end_time)::time <= btrim(m.start_time)::time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END))
            )
        )) AS stale_against_calendar,
             -- Published versions only: the publication did not materialize this assignment (same key the publication uses to dedupe).
             (${schedule.status !== 'DRAFT'}::boolean AND NOT EXISTS (
          SELECT 1 FROM shifts pub
          WHERE pub.organization_id = ${ctx.organizationId} AND pub.schedule_version_id = sa.schedule_version_id
            AND pub.employee_id = sa.employee_id AND pub.date = sa.date
            AND pub.start_time IS NOT DISTINCT FROM TO_CHAR(sa.start_time, 'HH24:MI')
            AND pub.end_time IS NOT DISTINCT FROM TO_CHAR(sa.end_time, 'HH24:MI')
            AND lower(btrim(COALESCE(pub.shift_type, ''))) = lower(btrim(COALESCE(sa.shift_type, '')))
            AND pub.counts_as_work IS NOT DISTINCT FROM sa.counts_as_work
            AND pub.location IS NOT DISTINCT FROM COALESCE(sa.location, '')
        )) AS excluded_from_publication
      FROM shift_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE sa.schedule_version_id = ${versionId}
        AND e.organization_id = ${ctx.organizationId}
        AND e.status = 'active'
        AND e.area_id = ${scopedAreaId}
      ORDER BY sa.date, sa.start_time, sa.employee_id, sa.id
    `
    : sql`
      SELECT sa.id, sa.schedule_version_id, sa.import_id, sa.employee_id, sa.date,
             sa.start_time, sa.end_time, sa.location, sa.shift_type, sa.counts_as_work,
             sa.created_at, sa.updated_at,
             ((${schedule.status === 'DRAFT'}::boolean OR NOT EXISTS (
          -- A published version only keeps flagging what its publication did not materialize (the exclusion is derived, never stored).
          SELECT 1 FROM shifts mat
          WHERE mat.organization_id = ${ctx.organizationId} AND mat.schedule_version_id = sa.schedule_version_id
            AND mat.employee_id = sa.employee_id AND mat.date = sa.date
            AND mat.start_time IS NOT DISTINCT FROM TO_CHAR(sa.start_time, 'HH24:MI')
            AND mat.end_time IS NOT DISTINCT FROM TO_CHAR(sa.end_time, 'HH24:MI')
            AND lower(btrim(COALESCE(mat.shift_type, ''))) = lower(btrim(COALESCE(sa.shift_type, '')))
        )) AND EXISTS (
          SELECT 1 FROM shifts m
          WHERE m.organization_id = ${ctx.organizationId}
            AND m.employee_id = sa.employee_id AND m.date = sa.date
            AND m.effective_state = 'EFFECTIVE' AND m.schedule_version_id IS NULL
            AND m.provenance = 'MANUAL_ADMIN_CHANGE'
            AND lower(btrim(COALESCE(m.shift_type, ''))) <> 'jt'
            AND (
              (sa.start_time IS NULL) <> (NULLIF(btrim(m.start_time), '') IS NULL)
              OR (sa.start_time IS NULL AND NULLIF(btrim(m.start_time), '') IS NULL
                  AND lower(btrim(COALESCE(sa.shift_type, ''))) <> lower(btrim(COALESCE(m.shift_type, ''))))
              OR (sa.start_time IS NOT NULL AND sa.end_time IS NOT NULL
                  AND NULLIF(btrim(m.start_time), '') IS NOT NULL AND NULLIF(btrim(m.end_time), '') IS NOT NULL
                  AND (sa.date + sa.start_time,
                       sa.date + sa.end_time + CASE WHEN sa.end_time <= sa.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END)
                      OVERLAPS
                      (m.date + btrim(m.start_time)::time,
                       m.date + btrim(m.end_time)::time
                         + CASE WHEN btrim(m.end_time)::time <= btrim(m.start_time)::time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END))
            )
        )) AS stale_against_calendar,
             -- Published versions only: the publication did not materialize this assignment (same key the publication uses to dedupe).
             (${schedule.status !== 'DRAFT'}::boolean AND NOT EXISTS (
          SELECT 1 FROM shifts pub
          WHERE pub.organization_id = ${ctx.organizationId} AND pub.schedule_version_id = sa.schedule_version_id
            AND pub.employee_id = sa.employee_id AND pub.date = sa.date
            AND pub.start_time IS NOT DISTINCT FROM TO_CHAR(sa.start_time, 'HH24:MI')
            AND pub.end_time IS NOT DISTINCT FROM TO_CHAR(sa.end_time, 'HH24:MI')
            AND lower(btrim(COALESCE(pub.shift_type, ''))) = lower(btrim(COALESCE(sa.shift_type, '')))
            AND pub.counts_as_work IS NOT DISTINCT FROM sa.counts_as_work
            AND pub.location IS NOT DISTINCT FROM COALESCE(sa.location, '')
        )) AS excluded_from_publication
      FROM shift_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE sa.schedule_version_id = ${versionId}
        AND e.organization_id = ${ctx.organizationId}
        AND e.status = 'active'
      ORDER BY sa.date, sa.start_time, sa.employee_id, sa.id
    `;
  // Calendar-entered manual shifts are already operational records, not draft
  // assignments. Return them separately so Planning can show them without
  // counting or publishing them a second time.
  const calendarShiftQuery = scopedAreaId
    ? sql`
      SELECT sh.id, sh.employee_id, sh.date, sh.start_time, sh.end_time,
             sh.location, sh.shift_type, sh.counts_as_work, sh.time_off_request_id
      FROM shifts sh
      JOIN employees e ON e.id = sh.employee_id
      WHERE sh.organization_id = ${ctx.organizationId}
        AND e.organization_id = ${ctx.organizationId}
        AND e.status = 'active'
        AND e.area_id = ${scopedAreaId}
        AND sh.area_id = ${scopedAreaId}
        AND sh.date BETWEEN ${schedule.period_start} AND ${schedule.period_end}
        AND sh.origin = 'MAN'
        AND sh.provenance IN ('MANUAL_ADMIN_CHANGE', 'MANUAL_CONFIRMED_WHOLE_DAY_OVERRIDE', 'EMPLOYEE_REQUEST')
        AND sh.effective_state = 'EFFECTIVE'
        AND sh.schedule_version_id IS NULL
      ORDER BY sh.date, sh.start_time NULLS FIRST, sh.employee_id, sh.id
    `
    : sql`
      SELECT sh.id, sh.employee_id, sh.date, sh.start_time, sh.end_time,
             sh.location, sh.shift_type, sh.counts_as_work, sh.time_off_request_id
      FROM shifts sh
      JOIN employees e ON e.id = sh.employee_id
      WHERE sh.organization_id = ${ctx.organizationId}
        AND e.organization_id = ${ctx.organizationId}
        AND e.status = 'active'
        AND sh.date BETWEEN ${schedule.period_start} AND ${schedule.period_end}
        AND sh.origin = 'MAN'
        AND sh.provenance IN ('MANUAL_ADMIN_CHANGE', 'MANUAL_CONFIRMED_WHOLE_DAY_OVERRIDE', 'EMPLOYEE_REQUEST')
        AND sh.effective_state = 'EFFECTIVE'
        AND sh.schedule_version_id IS NULL
      ORDER BY sh.date, sh.start_time NULLS FIRST, sh.employee_id, sh.id
    `;
  const [allEmployeeRows, allAssignmentRows, allCalendarShiftRows] = await Promise.all([
    employeeQuery, assignmentQuery, calendarShiftQuery,
  ]);
  // Server-side read model: a scoped PLANNER (areas / employees) only receives its own roster and their assignments.
  const employeeRows = allEmployeeRows.filter((row) => employeeRowInScope(scope, row));
  const allowedEmployeeIds = new Set(employeeRows.map((row) => row.id));
  const assignmentRows = allAssignmentRows.filter((row) => allowedEmployeeIds.has(row.employee_id));
  const calendarShifts = allCalendarShiftRows
    .filter((row) => allowedEmployeeIds.has(row.employee_id))
    .map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      date: databaseDateToIso(row.date),
      startTime: row.start_time === null || row.start_time === undefined ? null : String(row.start_time).slice(0, 5),
      endTime: row.end_time === null || row.end_time === undefined ? null : String(row.end_time).slice(0, 5),
      location: row.location ?? null,
      shiftType: row.shift_type ?? 'Regular',
      countsAsWork: row.counts_as_work !== false,
      // An approved vacation (born from a time-off request) shows as a blocked day in Planning (spec §4.4.4).
      timeOffRequestId: row.time_off_request_id ?? null,
    }));
  return {
    version: mapScheduleVersion(schedule),
    employees: employeeRows.map(mapSchedulingEmployee),
    assignments: assignmentRows.map(mapAssignment),
    calendarShifts,
  };
}

export async function createAssignment(sql, ctx, scheduleId, versionId, input = {}) {
  requireRole(ctx, 'PLANNER');
  const schedule = await loadScheduleVersion(sql, ctx, scheduleId, versionId);
  const employeeId = String(input.employeeId ?? '').trim();
  const date = normalizeDate(input.date);
  const semantics = resolveAssignmentSemantics(input);
  const { startTime, endTime, shiftType, countsAsWork } = semantics;
  assertPlanningDate(date);
  assertAssignmentDateInPeriod(date, schedule);
  await assertEmployeeForSchedule(sql, ctx, schedule, employeeId);
  await assertNotProtectedAbsenceDay(sql, ctx, employeeId, date);
  await assertNoAssignmentOverlap(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime,
  });
  await assertMinimumRest(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime, shiftType, countsAsWork,
  });
  const location = input.location === undefined || input.location === null ? null : String(input.location).trim() || null;
  // The same scope the check above applied is enforced again BY the insert (no window between check and write).
  const { scopeMode, scopeIds } = scopeGuardOf(await resolveEffectiveAccessScope(sql, ctx));
  const rows = await sql`
    INSERT INTO shift_assignments
      (schedule_version_id, employee_id, date, start_time, end_time, location, shift_type, counts_as_work)
    SELECT ${versionId}::uuid, e.id, ${date}::date, ${startTime}::time, ${endTime}::time, ${location}::text, ${shiftType}::text, ${countsAsWork}::boolean
    FROM employees e
    WHERE e.id = ${employeeId}::uuid AND e.organization_id = ${ctx.organizationId}
      AND (${scopeMode}::text = 'NONE' OR (CASE ${scopeMode}::text
             WHEN 'EMPLOYEES' THEN e.id::text = ANY(${scopeIds}::text[])
             ELSE COALESCE(e.area_id::text = ANY(${scopeIds}::text[]), FALSE) END))
    RETURNING id, schedule_version_id, employee_id, date, start_time, end_time,
              location, shift_type, counts_as_work, created_at, updated_at
  `;
  if (rows.length === 0) throw employeeScopeError();
  return mapAssignment(rows[0]);
}

async function loadAssignment(sql, ctx, scheduleId, versionId, assignmentId) {
  const schedule = await loadScheduleVersion(sql, ctx, scheduleId, versionId);
  const rows = await sql`
    SELECT sa.id, sa.schedule_version_id, sa.employee_id, sa.date,
           sa.start_time, sa.end_time, sa.location, sa.shift_type, sa.counts_as_work,
           sa.created_at, sa.updated_at
    FROM shift_assignments sa
    WHERE sa.id = ${assignmentId} AND sa.schedule_version_id = ${versionId}
  `;
  if (rows.length === 0) throw new HttpError(404, 'Assignment not found');
  return { schedule, assignment: rows[0] };
}

export async function updateAssignment(sql, ctx, scheduleId, versionId, assignmentId, input = {}) {
  requireRole(ctx, 'PLANNER');
  const { schedule, assignment } = await loadAssignment(sql, ctx, scheduleId, versionId, assignmentId);
  const employeeId = input.employeeId === undefined ? assignment.employee_id : String(input.employeeId).trim();
  const date = input.date === undefined ? databaseDateToIso(assignment.date) : normalizeDate(input.date);
  const semantics = resolveAssignmentSemantics(input, assignment);
  const { startTime, endTime, shiftType, countsAsWork } = semantics;
  assertPlanningDate(date);
  assertAssignmentDateInPeriod(date, schedule);
  // An assignment is also protected against being MOVED away from an employee the actor cannot manage.
  if (employeeId !== assignment.employee_id) await assertEmployeeForSchedule(sql, ctx, schedule, assignment.employee_id);
  await assertEmployeeForSchedule(sql, ctx, schedule, employeeId);
  await assertNotProtectedAbsenceDay(sql, ctx, employeeId, date);
  await assertNoAssignmentOverlap(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime, excludeId: assignmentId,
  });
  await assertMinimumRest(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime, shiftType, countsAsWork, excludeId: assignmentId,
  });
  const location = input.location === undefined ? assignment.location : (input.location === null ? null : String(input.location).trim() || null);
  const { scopeMode, scopeIds } = scopeGuardOf(await resolveEffectiveAccessScope(sql, ctx));
  const rows = await sql`
    UPDATE shift_assignments
    SET employee_id = ${employeeId}, date = ${date}, start_time = ${startTime},
        end_time = ${endTime}, location = ${location}, shift_type = ${shiftType},
        counts_as_work = ${countsAsWork}, updated_at = NOW()
    WHERE id = ${assignmentId} AND schedule_version_id = ${versionId}
      AND (${scopeMode}::text = 'NONE' OR (
        EXISTS (SELECT 1 FROM employees e WHERE e.id = shift_assignments.employee_id AND e.organization_id = ${ctx.organizationId}
                  AND (CASE ${scopeMode}::text WHEN 'EMPLOYEES' THEN e.id::text = ANY(${scopeIds}::text[])
                       ELSE COALESCE(e.area_id::text = ANY(${scopeIds}::text[]), FALSE) END))
        AND EXISTS (SELECT 1 FROM employees e WHERE e.id = ${employeeId}::uuid AND e.organization_id = ${ctx.organizationId}
                  AND (CASE ${scopeMode}::text WHEN 'EMPLOYEES' THEN e.id::text = ANY(${scopeIds}::text[])
                       ELSE COALESCE(e.area_id::text = ANY(${scopeIds}::text[]), FALSE) END))))
    RETURNING id, schedule_version_id, employee_id, date, start_time, end_time,
              location, shift_type, counts_as_work, created_at, updated_at
  `;
  if (rows.length === 0) {
    const exists = await sql`SELECT 1 FROM shift_assignments WHERE id = ${assignmentId} AND schedule_version_id = ${versionId}`;
    throw exists.length > 0 ? employeeScopeError() : new HttpError(404, 'Assignment not found');
  }
  return mapAssignment(rows[0]);
}

export async function deleteAssignment(sql, ctx, scheduleId, versionId, assignmentId) {
  requireRole(ctx, 'PLANNER');
  const { schedule, assignment } = await loadAssignment(sql, ctx, scheduleId, versionId, assignmentId);
  // Deleting is a write over that employee's plan: the actor needs scope over THEM, not just over the schedule.
  await assertEmployeeForSchedule(sql, ctx, schedule, assignment.employee_id);
  const { scopeMode, scopeIds } = scopeGuardOf(await resolveEffectiveAccessScope(sql, ctx));
  const rows = await sql`
    DELETE FROM shift_assignments
    WHERE id = ${assignmentId} AND schedule_version_id = ${versionId}
      AND (${scopeMode}::text = 'NONE' OR EXISTS (
        SELECT 1 FROM employees e WHERE e.id = shift_assignments.employee_id AND e.organization_id = ${ctx.organizationId}
          AND (CASE ${scopeMode}::text WHEN 'EMPLOYEES' THEN e.id::text = ANY(${scopeIds}::text[])
               ELSE COALESCE(e.area_id::text = ANY(${scopeIds}::text[]), FALSE) END)))
    RETURNING id
  `;
  if (rows.length === 0) {
    const exists = await sql`SELECT 1 FROM shift_assignments WHERE id = ${assignmentId} AND schedule_version_id = ${versionId}`;
    throw exists.length > 0 ? employeeScopeError() : new HttpError(404, 'Assignment not found');
  }
}

async function assertScheduleArea(sql, ctx, areaId) {
  if (!areaId) return;
  const rows = await sql`
    SELECT id FROM areas
    WHERE id = ${areaId}
      AND organization_id = ${ctx.organizationId}
      AND active = TRUE
  `;
  if (rows.length === 0) throw new HttpError(404, 'Area not found');
}

/** Creates/reuses a weekly Schedule and creates its next DRAFT version. */
export async function createScheduleDraft(sql, ctx, input = {}) {
  requireRole(ctx, 'PLANNER');
  const scope = await resolveEffectiveAccessScope(sql, ctx);
  const areaId = normalizeAreaId(input.areaId);
  if (scope.type === 'AREA' && areaId !== scope.areaId) {
    const error = new HttpError(403, 'Schedule area is outside your assigned area');
    error.code = 'SCOPE_FORBIDDEN';
    throw error;
  }
  await assertScheduleArea(sql, ctx, areaId);
  const { periodStart, periodEnd } = normalizePeriodStart(input.periodStart);
  const scheduleId = randomUUID();
  const versionId = randomUUID();

  let transactionResult;
  try {
    transactionResult = await sql.transaction((txn) => [
      txn`
        INSERT INTO schedules (id, organization_id, area_id, period_start, period_end, created_by_user_id)
        VALUES (${scheduleId}, ${ctx.organizationId}, ${areaId}, ${periodStart}, ${periodEnd}, ${ctx.user.id})
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
      txn`
        WITH target_schedule AS MATERIALIZED (
          SELECT s.id
          FROM schedules s
          WHERE s.organization_id = ${ctx.organizationId}
            AND s.area_id IS NOT DISTINCT FROM ${areaId}
            AND s.period_start = ${periodStart}
          FOR UPDATE
        ), next_version AS (
          SELECT target_schedule.id AS schedule_id,
                 COALESCE(MAX(sv.version_number), 0) + 1 AS version_number
          FROM target_schedule
          LEFT JOIN schedule_versions sv ON sv.schedule_id = target_schedule.id
          GROUP BY target_schedule.id
        )
        INSERT INTO schedule_versions
          (id, schedule_id, version_number, status, created_by_user_id)
        SELECT ${versionId}, next_version.schedule_id, next_version.version_number,
               'DRAFT', ${ctx.user.id}
        FROM next_version
        WHERE NOT EXISTS (
          SELECT 1 FROM schedule_versions existing
          WHERE existing.schedule_id = next_version.schedule_id
            AND existing.status = 'DRAFT'
        )
        RETURNING id, schedule_id, version_number, status
      `,
    ]);
  } catch (error) {
    if (error?.code === '23505') {
      const conflict = new HttpError(409, 'A draft already exists for this schedule');
      conflict.code = 'SCHEDULE_DRAFT_EXISTS';
      throw conflict;
    }
    throw error;
  }

  const version = transactionResult?.[1]?.[0];
  if (!version) {
    const error = new HttpError(409, 'A draft already exists for this schedule');
    error.code = 'SCHEDULE_DRAFT_EXISTS';
    throw error;
  }
  return {
    scheduleId: version.schedule_id,
    scheduleVersionId: version.id,
    versionNumber: version.version_number,
    status: version.status,
  };
}

export function createNewDraftFromVersionTx(txn, ctx, scheduleId, versionId, newVersionId, isAreaScoped = false, scopedAreaId = null, { scopeMode = 'NONE', scopeIds = [] } = {}) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId) || !UUID_RE.test(newVersionId)) {
    throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  }
  return txn`
      WITH target AS MATERIALIZED (
        SELECT sv.id AS version_id, sv.schedule_id, sv.status,
               s.organization_id, s.area_id
        FROM schedule_versions sv
        JOIN schedules s ON s.id = sv.schedule_id
        WHERE sv.id = ${versionId}
          AND sv.schedule_id = ${scheduleId}
          AND s.organization_id = ${ctx.organizationId}
        FOR UPDATE
      ),
      draft_conflict AS MATERIALIZED (
        SELECT existing.id AS draft_version_id
        FROM schedule_versions existing
        JOIN target t ON t.schedule_id = existing.schedule_id
        WHERE existing.status = 'DRAFT'
        ORDER BY existing.version_number
        LIMIT 1
      ),
      next_version AS (
        SELECT t.schedule_id, t.status, t.area_id,
               COALESCE(MAX(sv.version_number), 0) + 1 AS version_number,
               (SELECT draft_version_id FROM draft_conflict) AS draft_version_id
        FROM target t
        LEFT JOIN schedule_versions sv ON sv.schedule_id = t.schedule_id
        GROUP BY t.schedule_id, t.status, t.area_id
      ),
      scope_check AS MATERIALIZED (
        -- F4-REM-01: copying a version writes assignments of EVERY employee in it; refuse (and write nothing) when any of them is outside the actor's scope.
        SELECT EXISTS (
          SELECT 1 FROM shift_assignments sa
          JOIN target t ON t.version_id = sa.schedule_version_id
          JOIN employees e ON e.id = sa.employee_id
          WHERE ${scopeMode}::text <> 'NONE'
            AND NOT (CASE ${scopeMode}::text WHEN 'EMPLOYEES' THEN e.id::text = ANY(${scopeIds}::text[])
                     ELSE COALESCE(e.area_id::text = ANY(${scopeIds}::text[]), FALSE) END)
        ) AS blocked
      ),
      created AS (
        INSERT INTO schedule_versions
          (id, schedule_id, version_number, status, created_by_user_id)
        SELECT ${newVersionId}, n.schedule_id, n.version_number, 'DRAFT', ${ctx.user.id}
        FROM next_version n
        WHERE n.status IN ('PUBLISHED', 'LOCKED', 'COMPLETED')
          AND n.draft_version_id IS NULL
          AND NOT (SELECT blocked FROM scope_check)
          AND (${isAreaScoped} = FALSE OR n.area_id = ${scopedAreaId})
        RETURNING id, schedule_id, version_number
      ),
      copied AS (
        INSERT INTO shift_assignments
          (schedule_version_id, employee_id, date, start_time, end_time, location, shift_type, counts_as_work)
        SELECT c.id, sa.employee_id, sa.date, sa.start_time, sa.end_time, sa.location,
               sa.shift_type, sa.counts_as_work
        FROM shift_assignments sa
        JOIN target t ON t.version_id = sa.schedule_version_id
        JOIN created c ON TRUE
        WHERE NOT EXISTS (
          SELECT 1 FROM shifts absence
          WHERE absence.organization_id = t.organization_id AND absence.employee_id = sa.employee_id
            AND absence.date = sa.date AND absence.effective_state = 'EFFECTIVE'
            AND absence.time_off_request_id IS NOT NULL
        )
        RETURNING id
      )
      SELECT
        EXISTS (SELECT 1 FROM target) AS found,
        (SELECT status FROM target LIMIT 1) AS current_status,
        (SELECT area_id FROM target LIMIT 1) AS area_id,
        (SELECT blocked FROM scope_check) AS scope_blocked,
        (SELECT draft_version_id FROM draft_conflict LIMIT 1) AS draft_version_id,
        (SELECT id FROM created LIMIT 1) AS new_version_id,
        (SELECT schedule_id FROM created LIMIT 1) AS schedule_id,
        (SELECT version_number FROM created LIMIT 1) AS version_number,
        (SELECT COUNT(*)::integer FROM copied) AS copied_assignment_count
    `;
}

/** Creates an independent DRAFT from a published or terminal version. */
export async function createNewDraftFromVersion(sql, ctx, scheduleId, versionId) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId)) {
    throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  }
  const scope = await resolveEffectiveAccessScope(sql, ctx);
  const newVersionId = randomUUID();
  const isAreaScoped = scope.type === 'AREA';
  const scopedAreaId = isAreaScoped ? scope.areaId : null;

  let transactionResult;
  try {
    transactionResult = await sql.transaction((txn) => [createNewDraftFromVersionTx(
      txn, ctx, scheduleId, versionId, newVersionId, isAreaScoped, scopedAreaId, scopeGuardOf(scope),
    )]);
  } catch (error) {
    if (error?.code === '23505') {
      const conflict = new HttpError(409, 'A draft already exists for this schedule');
      conflict.code = 'SCHEDULE_DRAFT_EXISTS';
      throw conflict;
    }
    throw error;
  }

  const outcome = transactionResult?.[0]?.[0];
  if (!outcome?.found) throw new HttpError(404, 'Schedule version not found');
  if (scope.type === 'AREA' && outcome.area_id !== scope.areaId) throw scheduleScopeError();
  if (outcome.scope_blocked) throw publishScopeError();
  if (outcome.current_status === 'DRAFT') {
    const error = new HttpError(409, 'Only a published version can create a new draft');
    error.code = 'VERSION_NOT_PUBLISHED';
    throw error;
  }
  if (!['PUBLISHED', 'LOCKED', 'COMPLETED'].includes(outcome.current_status)) {
    const error = new HttpError(409, 'Schedule version cannot create a new draft');
    error.code = 'VERSION_NOT_EDITABLE';
    throw error;
  }
  if (outcome.draft_version_id) {
    const error = new HttpError(409, 'A draft already exists for this schedule');
    error.code = 'SCHEDULE_DRAFT_EXISTS';
    error.draftVersionId = outcome.draft_version_id;
    throw error;
  }
  if (!outcome.new_version_id) {
    throw new HttpError(409, 'Schedule version cannot create a new draft');
  }

  return {
    newVersionId: outcome.new_version_id,
    scheduleId: outcome.schedule_id,
    versionNumber: Number(outcome.version_number),
    copiedAssignmentCount: Number(outcome.copied_assignment_count ?? 0),
  };
}

/**
 * Publishes one draft and materializes its active assignments as historical
 * shifts. Neon HTTP transactions are non-interactive, so validation,
 * transition, and materialization intentionally live in one CTE statement:
 * the database either returns a published result with every insert, or makes
 * no write at all.
 */
/**
 * `scopeGuard` (F4-M03): for a PLANNER whose scope is not the whole organisation, the statement itself refuses (SCOPE_FORBIDDEN, nothing
 * written) when ANY assignment of the version belongs to an employee outside that scope. Publishing supersedes and creates shifts for
 * exactly the employees of the version's assignments, so this covers the rows replaced as well as the rows created, and it is evaluated
 * in the same statement that publishes (no window between check and write). `dryRun` runs every validation and writes nothing.
 */
export function publishScheduleVersionTx(txn, ctx, scheduleId, versionId, { dryRun = false, scopeMode = 'NONE', scopeIds = [] } = {}) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId)) {
    throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  }
  return txn`
    WITH target AS MATERIALIZED (
      SELECT sv.id AS version_id, sv.schedule_id, sv.status,
             s.organization_id, s.area_id
      FROM schedule_versions sv
      JOIN schedules s ON s.id = sv.schedule_id
      WHERE sv.id = ${versionId}
        AND sv.schedule_id = ${scheduleId}
        AND s.organization_id = ${ctx.organizationId}
      FOR UPDATE
    ),
    all_assignments AS MATERIALIZED (
      SELECT sa.id, sa.schedule_version_id, sa.employee_id, sa.date,
             sa.start_time, sa.end_time, sa.location, sa.shift_type, sa.counts_as_work,
             e.status AS employee_status,
             EXISTS (
               SELECT 1 FROM shifts absence
               WHERE absence.organization_id = t.organization_id AND absence.employee_id = sa.employee_id
                 AND absence.date = sa.date AND absence.effective_state = 'EFFECTIVE'
                 AND absence.time_off_request_id IS NOT NULL
             ) AS protected_absence,
             -- A manual calendar change made after the draft was prepared contradicts this assignment (e.g. a day off replaced by
             -- Extras): it stays in the draft for review but must never re-enter the calendar silently.
             EXISTS (
            SELECT 1 FROM shifts m
            WHERE m.organization_id = t.organization_id
              AND m.employee_id = sa.employee_id AND m.date = sa.date
              AND m.effective_state = 'EFFECTIVE' AND m.schedule_version_id IS NULL
              AND m.provenance = 'MANUAL_ADMIN_CHANGE'
              AND lower(btrim(COALESCE(m.shift_type, ''))) <> 'jt'
              AND (
                (sa.start_time IS NULL) <> (NULLIF(btrim(m.start_time), '') IS NULL)
                OR (sa.start_time IS NULL AND NULLIF(btrim(m.start_time), '') IS NULL
                    AND lower(btrim(COALESCE(sa.shift_type, ''))) <> lower(btrim(COALESCE(m.shift_type, ''))))
                OR (sa.start_time IS NOT NULL AND sa.end_time IS NOT NULL
                    AND NULLIF(btrim(m.start_time), '') IS NOT NULL AND NULLIF(btrim(m.end_time), '') IS NOT NULL
                    AND (sa.date + sa.start_time,
                         sa.date + sa.end_time + CASE WHEN sa.end_time <= sa.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END)
                        OVERLAPS
                        (m.date + btrim(m.start_time)::time,
                         m.date + btrim(m.end_time)::time
                           + CASE WHEN btrim(m.end_time)::time <= btrim(m.start_time)::time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END))
              )
          ) AS stale_against_calendar
      FROM shift_assignments sa
      JOIN target t ON t.version_id = sa.schedule_version_id
      JOIN employees e ON e.id = sa.employee_id
        AND e.organization_id = t.organization_id
    ),
    active_assignments AS MATERIALIZED (
      SELECT * FROM all_assignments WHERE employee_status = 'active' AND NOT protected_absence AND NOT stale_against_calendar
    ),
    assignment_intervals AS MATERIALIZED (
      SELECT a.*,
             (a.date + a.start_time) AS start_at,
             (a.date + a.end_time
               + CASE WHEN a.end_time <= a.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END
             ) AS end_at
      FROM active_assignments a
      WHERE a.counts_as_work = TRUE
        AND a.start_time IS NOT NULL
        AND a.end_time IS NOT NULL
    ),
    overlap_conflicts AS (
      SELECT a.id AS conflicting_assignment_id
      FROM assignment_intervals a
      JOIN assignment_intervals b
        ON a.employee_id = b.employee_id
       AND a.id < b.id
      WHERE a.start_at < b.end_at
        AND b.start_at < a.end_at
      ORDER BY a.id, b.id
      LIMIT 1
    ),
    rest_conflicts AS (
      SELECT a.id AS conflicting_assignment_id
      FROM assignment_intervals a
      JOIN assignment_intervals b
        ON a.employee_id = b.employee_id
       AND a.id < b.id
      -- F4-REM-02: the 11 h rest separates DIFFERENT days, exactly as when the assignment is created (assertMinimumRest): two compatible
      -- segments of the same day (Regular 08-16 + Extras 18-21) are one working day. Overlaps stay blocked by overlap_conflicts.
      WHERE a.date <> b.date
        AND NOT (a.start_at < b.end_at AND b.start_at < a.end_at)
        AND (
          (b.start_at >= a.end_at AND b.start_at - a.end_at < INTERVAL '11 hours')
          OR (a.start_at >= b.end_at AND a.start_at - b.end_at < INTERVAL '11 hours')
        )
      ORDER BY a.id, b.id
      LIMIT 1
    ),
    conflicts AS (
      SELECT 'SCOPE_FORBIDDEN'::text AS error_code, NULL::uuid AS conflicting_assignment_id, NULL::integer AS minimum_rest_hours, 0 AS priority
      FROM target
      WHERE ${scopeMode}::text <> 'NONE'
        AND EXISTS (
          SELECT 1 FROM all_assignments a
          JOIN employees e ON e.id = a.employee_id
          WHERE NOT (CASE ${scopeMode}::text
                       WHEN 'EMPLOYEES' THEN e.id::text = ANY(${scopeIds}::text[])
                       ELSE COALESCE(e.area_id::text = ANY(${scopeIds}::text[]), FALSE)
                     END)
        )
      UNION ALL
      SELECT 'OVERLAP'::text, conflicting_assignment_id, NULL::integer, 1
      FROM overlap_conflicts
      UNION ALL
      SELECT 'REST_RULE_VIOLATION'::text, conflicting_assignment_id, ${MINIMUM_REST_HOURS}::integer, 2
      FROM rest_conflicts
    ),
    validation AS (
      SELECT
        (SELECT error_code FROM conflicts ORDER BY priority LIMIT 1) AS error_code,
        (SELECT conflicting_assignment_id FROM conflicts ORDER BY priority LIMIT 1) AS conflicting_assignment_id,
        (SELECT minimum_rest_hours FROM conflicts ORDER BY priority LIMIT 1) AS minimum_rest_hours
    ),
    excluded AS (
      SELECT
        COUNT(*) FILTER (WHERE employee_status <> 'active' OR protected_absence OR stale_against_calendar)::integer AS excluded_count,
        COALESCE(
          json_agg(
            json_build_object(
              'assignmentId', id, 'employeeId', employee_id,
              'reason', CASE WHEN employee_status <> 'active' THEN 'INACTIVE_EMPLOYEE'
                             WHEN protected_absence THEN 'PROTECTED_ABSENCE'
                             ELSE 'STALE_AGAINST_CALENDAR' END
            )
            ORDER BY id
          ) FILTER (WHERE employee_status <> 'active' OR protected_absence OR stale_against_calendar),
          '[]'::json
        ) AS excluded_assignments
      FROM all_assignments
    ),
    updated AS (
      UPDATE schedule_versions sv
      SET status = 'PUBLISHED', published_at = NOW(), published_by_user_id = ${ctx.user.id}
      FROM target t, validation v
      WHERE sv.id = t.version_id
        AND t.status = 'DRAFT'
        AND v.error_code IS NULL
        AND NOT ${dryRun}::boolean
      RETURNING sv.id, sv.published_at
    ),
    superseded AS (
      UPDATE shifts current_shift
      SET effective_state = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW()
      FROM target t
      JOIN updated u ON u.id = t.version_id
      JOIN schedule_versions previous ON previous.schedule_id = t.schedule_id
      WHERE previous.id <> t.version_id
        AND current_shift.schedule_version_id = previous.id
        AND current_shift.organization_id = t.organization_id
        AND current_shift.effective_state = 'EFFECTIVE'
        AND EXISTS (
          SELECT 1 FROM active_assignments replacement
          WHERE replacement.employee_id = current_shift.employee_id
            AND replacement.date = current_shift.date
        )
      RETURNING current_shift.id
    ),
    materialized AS (
      INSERT INTO shifts (
        organization_id, employee_id, import_id, area_id, date,
        start_time, end_time, location, origin, schedule_version_id, shift_type, counts_as_work, effective_state
      )
      SELECT t.organization_id, a.employee_id, NULL, t.area_id, a.date,
             TO_CHAR(a.start_time, 'HH24:MI'), TO_CHAR(a.end_time, 'HH24:MI'),
             COALESCE(a.location, ''), 'schedule', a.schedule_version_id,
             a.shift_type, a.counts_as_work, 'EFFECTIVE'
      FROM active_assignments a
      JOIN target t ON TRUE
      JOIN updated u ON u.id = t.version_id
      CROSS JOIN (SELECT COUNT(*) FROM superseded) retired
      WHERE NOT EXISTS (
        SELECT 1
        FROM shifts existing
        WHERE existing.schedule_version_id = a.schedule_version_id
          AND existing.organization_id = t.organization_id
          AND existing.employee_id = a.employee_id
          AND existing.date = a.date
          AND existing.start_time IS NOT DISTINCT FROM TO_CHAR(a.start_time, 'HH24:MI')
          AND existing.end_time IS NOT DISTINCT FROM TO_CHAR(a.end_time, 'HH24:MI')
          AND lower(btrim(COALESCE(existing.shift_type, ''))) = lower(btrim(COALESCE(a.shift_type, '')))
          AND existing.counts_as_work IS NOT DISTINCT FROM a.counts_as_work
          AND existing.location IS NOT DISTINCT FROM COALESCE(a.location, '')
          AND existing.area_id IS NOT DISTINCT FROM t.area_id
      )
      RETURNING id
    )
    SELECT
      EXISTS (SELECT 1 FROM target) AS found,
      (SELECT status FROM target LIMIT 1) AS current_status,
      validation.error_code,
      validation.conflicting_assignment_id,
      validation.minimum_rest_hours,
      (SELECT published_at FROM updated LIMIT 1) AS published_at,
      (SELECT COUNT(*)::integer FROM materialized) AS created_shift_count,
      excluded.excluded_count,
      excluded.excluded_assignments
    FROM validation
    CROSS JOIN excluded
  `;
}

/**
 * GRANULAR publication performed by an auto-publishing import (spec §4.1.3). Unlike `publishScheduleVersionTx` it materializes ONLY the
 * `(employee, date)` pairs of the import, never the carried-over assignments of the base version, and it never supersedes anything that
 * is not provably the import's own work. Everything is one gated CTE statement (Neon batches are static): if any gate fails the
 * statement writes nothing and reports `error_code`; the caller degrades the week to a draft instead of aborting the import.
 *
 * Gates (defence in depth, the pure planner already filtered): the version is a DRAFT of this organization, every pair has an active
 * assignment in the version, no overlap / rest violation inside the version, and no EFFECTIVE shift of the pairs has a provenance
 * outside the import white list (`COMPANY_IMPORT`, `SYSTEM`, or `SCHEDULE_PUBLICATION` that already belongs to an import).
 *
 * `importRef` resolves the import row inside the same transaction (the import is inserted earlier in the batch).
 */
export function publishImportedPairsTx(txn, ctx, { scheduleId, versionId, pairs, importRef }) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId)) {
    throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  }
  if (!Array.isArray(pairs) || pairs.length === 0) throw new HttpError(400, 'At least one (employee, date) pair is required');
  for (const pair of pairs) {
    if (!UUID_RE.test(pair.employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(pair.date))) {
      throw new HttpError(400, 'Every pair needs a valid employeeId and ISO date');
    }
  }
  const pairsJson = JSON.stringify(pairs.map((pair) => ({ employeeId: pair.employeeId, date: pair.date })));
  return txn`
    WITH pair_list AS MATERIALIZED (
      SELECT (p->>'employeeId')::uuid AS employee_id, (p->>'date')::date AS date
      FROM jsonb_array_elements(${pairsJson}::jsonb) AS p
    ),
    import_row AS MATERIALIZED (
      SELECT id FROM imports
      WHERE organization_id = ${ctx.organizationId} AND employee_id = ${importRef.employeeId}
        AND file_fingerprint = ${importRef.fileFingerprint} AND context_fingerprint = ${importRef.contextFingerprint}
      ORDER BY created_at ASC LIMIT 1
    ),
    target AS MATERIALIZED (
      SELECT sv.id AS version_id, sv.schedule_id, sv.status, s.organization_id, s.area_id
      FROM schedule_versions sv
      JOIN schedules s ON s.id = sv.schedule_id
      WHERE sv.id = ${versionId} AND sv.schedule_id = ${scheduleId} AND s.organization_id = ${ctx.organizationId}
      FOR UPDATE
    ),
    all_assignments AS MATERIALIZED (
      SELECT sa.id, sa.schedule_version_id, sa.employee_id, sa.date, sa.start_time, sa.end_time, sa.location,
             sa.shift_type, sa.counts_as_work, e.status AS employee_status
      FROM shift_assignments sa
      JOIN target t ON t.version_id = sa.schedule_version_id
      JOIN employees e ON e.id = sa.employee_id AND e.organization_id = t.organization_id
    ),
    active_assignments AS MATERIALIZED (SELECT * FROM all_assignments WHERE employee_status = 'active'),
    publish_assignments AS MATERIALIZED (
      SELECT a.* FROM active_assignments a JOIN pair_list pl ON pl.employee_id = a.employee_id AND pl.date = a.date
    ),
    assignment_intervals AS MATERIALIZED (
      SELECT a.*, (a.date + a.start_time) AS start_at,
             (a.date + a.end_time + CASE WHEN a.end_time <= a.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END) AS end_at
      FROM active_assignments a
      WHERE a.counts_as_work = TRUE AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
    ),
    overlap_conflicts AS (
      SELECT a.id AS conflicting_assignment_id
      FROM assignment_intervals a JOIN assignment_intervals b ON a.employee_id = b.employee_id AND a.id < b.id
      WHERE a.start_at < b.end_at AND b.start_at < a.end_at
      ORDER BY a.id, b.id LIMIT 1
    ),
    rest_conflicts AS (
      SELECT a.id AS conflicting_assignment_id
      FROM assignment_intervals a JOIN assignment_intervals b ON a.employee_id = b.employee_id AND a.id < b.id
      WHERE a.date <> b.date AND NOT (a.start_at < b.end_at AND b.start_at < a.end_at)
        AND ((b.start_at >= a.end_at AND b.start_at - a.end_at < INTERVAL '11 hours')
          OR (a.start_at >= b.end_at AND a.start_at - b.end_at < INTERVAL '11 hours'))
      ORDER BY a.id, b.id LIMIT 1
    ),
    missing_pairs AS (
      SELECT 1 AS found FROM pair_list pl
      WHERE NOT EXISTS (SELECT 1 FROM active_assignments a WHERE a.employee_id = pl.employee_id AND a.date = pl.date)
      LIMIT 1
    ),
    protected_current AS (
      SELECT sh.id AS conflicting_assignment_id
      FROM shifts sh
      JOIN pair_list pl ON pl.employee_id = sh.employee_id AND pl.date = sh.date
      WHERE sh.organization_id = ${ctx.organizationId} AND sh.effective_state = 'EFFECTIVE'
        -- COALESCE: a NULL provenance must evaluate to "not attributable", never to NULL (which would hide the row).
        AND NOT (COALESCE(sh.provenance, '') IN ('COMPANY_IMPORT', 'SYSTEM')
                 OR (COALESCE(sh.provenance, '') = 'SCHEDULE_PUBLICATION' AND sh.import_id IS NOT NULL))
      LIMIT 1
    ),
    conflicts AS (
      SELECT 'VERSION_NOT_FOUND'::text AS error_code, NULL::uuid AS conflicting_assignment_id, NULL::integer AS minimum_rest_hours, 0 AS priority
      WHERE NOT EXISTS (SELECT 1 FROM target) OR NOT EXISTS (SELECT 1 FROM import_row)
      UNION ALL SELECT 'NOT_DRAFT'::text, NULL::uuid, NULL::integer, 1 FROM target WHERE status <> 'DRAFT'
      UNION ALL SELECT 'MISSING_PAIR'::text, NULL::uuid, NULL::integer, 2 FROM missing_pairs
      UNION ALL SELECT 'PROTECTED_CURRENT'::text, conflicting_assignment_id, NULL::integer, 3 FROM protected_current
      UNION ALL SELECT 'OVERLAP'::text, conflicting_assignment_id, NULL::integer, 4 FROM overlap_conflicts
      UNION ALL SELECT 'REST_RULE_VIOLATION'::text, conflicting_assignment_id, ${MINIMUM_REST_HOURS}::integer, 5 FROM rest_conflicts
    ),
    validation AS (
      SELECT (SELECT error_code FROM conflicts ORDER BY priority LIMIT 1) AS error_code,
             (SELECT conflicting_assignment_id FROM conflicts ORDER BY priority LIMIT 1) AS conflicting_assignment_id,
             (SELECT minimum_rest_hours FROM conflicts ORDER BY priority LIMIT 1) AS minimum_rest_hours
    ),
    updated AS (
      UPDATE schedule_versions sv
      SET status = 'PUBLISHED', published_at = NOW(), published_by_user_id = ${ctx.user.id}
      FROM target t, validation v
      WHERE sv.id = t.version_id AND t.status = 'DRAFT' AND v.error_code IS NULL
      RETURNING sv.id, sv.published_at
    ),
    superseded AS (
      UPDATE shifts current_shift
      SET effective_state = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW()
      FROM pair_list pl, updated u
      WHERE current_shift.organization_id = ${ctx.organizationId}
        AND current_shift.employee_id = pl.employee_id AND current_shift.date = pl.date
        AND current_shift.effective_state = 'EFFECTIVE'
      RETURNING current_shift.id
    ),
    materialized AS (
      INSERT INTO shifts (
        organization_id, employee_id, import_id, area_id, date, start_time, end_time, location, origin,
        schedule_version_id, shift_type, counts_as_work, effective_state, provenance
      )
      SELECT t.organization_id, a.employee_id, (SELECT id FROM import_row), t.area_id, a.date,
             TO_CHAR(a.start_time, 'HH24:MI'), TO_CHAR(a.end_time, 'HH24:MI'), COALESCE(a.location, ''), 'schedule',
             a.schedule_version_id, a.shift_type, a.counts_as_work, 'EFFECTIVE', 'SCHEDULE_PUBLICATION'
      FROM publish_assignments a
      JOIN target t ON TRUE
      JOIN updated u ON u.id = t.version_id
      CROSS JOIN (SELECT COUNT(*) FROM superseded) retired
      WHERE NOT EXISTS (
        SELECT 1 FROM shifts existing
        WHERE existing.schedule_version_id = a.schedule_version_id AND existing.organization_id = t.organization_id
          AND existing.employee_id = a.employee_id AND existing.date = a.date
          AND existing.start_time IS NOT DISTINCT FROM TO_CHAR(a.start_time, 'HH24:MI')
          AND existing.end_time IS NOT DISTINCT FROM TO_CHAR(a.end_time, 'HH24:MI')
          AND lower(btrim(COALESCE(existing.shift_type, ''))) = lower(btrim(COALESCE(a.shift_type, '')))
          AND existing.counts_as_work IS NOT DISTINCT FROM a.counts_as_work
          AND existing.location IS NOT DISTINCT FROM COALESCE(a.location, '')
          AND existing.area_id IS NOT DISTINCT FROM t.area_id
      )
      RETURNING id
    )
    SELECT
      EXISTS (SELECT 1 FROM target) AS found,
      (SELECT status FROM target LIMIT 1) AS current_status,
      validation.error_code, validation.conflicting_assignment_id, validation.minimum_rest_hours,
      (SELECT published_at FROM updated LIMIT 1) AS published_at,
      (SELECT COUNT(*)::integer FROM materialized) AS created_shift_count,
      (SELECT COUNT(*)::integer FROM superseded) AS superseded_shift_count
    FROM validation
  `;
}

function publishScopeError() {
  // Deliberately says nothing about WHICH employee is out of scope: the actor must not learn about people they cannot see.
  const error = new HttpError(403, 'This version includes employees outside your assigned scope');
  error.code = 'SCOPE_FORBIDDEN';
  return error;
}

/**
 * Who may publish a version: the schedule must be inside the actor's scope and every employee the publication touches too (see
 * `publishScheduleVersionTx`). Returns the guard the publishing statement enforces itself.
 */
async function publishScopeGuard(sql, ctx, scheduleId) {
  const scope = await resolveEffectiveAccessScope(sql, ctx);
  const scheduleRows = await sql`
    SELECT area_id FROM schedules
    WHERE id = ${scheduleId} AND organization_id = ${ctx.organizationId}
  `;
  if (scheduleRows.length === 0) throw new HttpError(404, 'Schedule version not found');
  const areaId = scheduleRows[0].area_id ?? null;
  if (scope.type === 'AREA' && areaId !== scope.areaId) throw scheduleScopeError();
  if (scope.type === 'AREAS' && areaId && !(scope.areaIds || []).includes(areaId)) throw scheduleScopeError();
  return scopeGuardOf(scope);
}

export async function publishScheduleVersion(sql, ctx, scheduleId, versionId) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId)) {
    throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  }

  const guard = await publishScopeGuard(sql, ctx, scheduleId);
  const transactionResult = await sql.transaction((txn) => [publishScheduleVersionTx(txn, ctx, scheduleId, versionId, guard)]);

  const outcome = transactionResult?.[0]?.[0];
  if (!outcome?.found) {
    throw new HttpError(404, 'Schedule version not found');
  }
  if (outcome.current_status !== 'DRAFT') {
    const error = new HttpError(409, 'Schedule version is already published or locked');
    error.code = 'VERSION_NOT_EDITABLE';
    throw error;
  }
  if (outcome.error_code === 'SCOPE_FORBIDDEN') throw publishScopeError();
  if (outcome.error_code === 'OVERLAP') {
    const error = new HttpError(422, 'Assignment overlaps an existing assignment');
    error.code = 'OVERLAP';
    error.conflictingAssignmentId = outcome.conflicting_assignment_id;
    throw error;
  }
  if (outcome.error_code === 'REST_RULE_VIOLATION') {
    const error = new HttpError(422, `Minimum rest period is ${MINIMUM_REST_HOURS} hours`);
    error.code = 'REST_RULE_VIOLATION';
    error.minimumRestHours = MINIMUM_REST_HOURS;
    error.conflictingAssignmentId = outcome.conflicting_assignment_id;
    throw error;
  }

  const result = {
    status: 'PUBLISHED',
    publishedAt: outcome.published_at,
    createdShiftCount: Number(outcome.created_shift_count ?? 0),
    excludedAssignments: Array.isArray(outcome.excluded_assignments)
      ? outcome.excluded_assignments
      : [],
    excludedAssignmentCount: Number(outcome.excluded_count ?? 0),
  };

  try {
    await createShiftPublishedNotifications(sql, ctx, versionId);
  } catch (error) {
    console.error('[notifications] SHIFT_PUBLISHED generation failed', {
      organizationId: ctx.organizationId,
      scheduleVersionId: versionId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// F4-M03 / OD-F4-01 — copy the previous week's PUBLISHED plan into a draft.
// ---------------------------------------------------------------------------------------------------------------------------------

export const COPY_WEEK_SKIP_REASONS = Object.freeze([
  'ALREADY_ASSIGNED', 'PROTECTED_ABSENCE_DAY', 'PAST_DATE', 'INACTIVE_EMPLOYEE', 'OUT_OF_SCOPE', 'OVERLAP',
  'REST_RULE_VIOLATION', 'STALE_SOURCE', 'SOURCE_ABSENCE',
]);

const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const clock = (value) => (value === null || value === undefined ? null : String(value).slice(0, 5));
const identityOf = (row) => [
  row.employee_id, databaseDateToIso(row.date), clock(row.start_time) ?? '', clock(row.end_time) ?? '',
  String(row.shift_type ?? '').trim().toLowerCase(), row.counts_as_work !== false, String(row.location ?? '').trim().toLowerCase(),
].join('|');

/**
 * Plans (and, in `apply`, performs) the copy of the latest PUBLISHED version of `sourceWeekStart` into the DRAFT `versionId`.
 *
 * Source = the assignments that publication REALLY materialized and that are still the calendar's current shift (a shift with the
 * same key, `effective_state = 'EFFECTIVE'`, born from that version). Never copied: excluded assignments, replaced ones, manual extras
 * and operational substitutions (they are not assignments of that version), approved vacations, anything of a draft source.
 * Target = an EXISTING draft; nothing is created or published here, and nothing existing is overwritten.
 * Every candidate row passes the rules of a manual assignment (date not past, active employee in scope, approved-vacation day, overlap /
 * whole-day compatibility, minimum rest) plus the rest across the week boundary. `preview` writes nothing.
 */
export async function copyWeekIntoDraft(sql, ctx, scheduleId, versionId, input = {}) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId)) throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  const mode = String(input.mode ?? 'preview').trim();
  if (!['preview', 'apply'].includes(mode)) throw new HttpError(400, 'mode must be preview or apply');
  const sourceWeekStart = String(input.sourceWeekStart ?? '').trim();
  if (!ISO_DATE_RE.test(sourceWeekStart)) {
    const error = new HttpError(400, 'sourceWeekStart must be YYYY-MM-DD');
    error.code = 'INVALID_INPUT';
    throw error;
  }

  const target = await loadScheduleVersion(sql, ctx, scheduleId, versionId); // 404 / scope / 409 VERSION_NOT_EDITABLE unless DRAFT
  const { scope } = await schedulingScope(sql, ctx, target.area_id ?? null);
  if (sourceWeekStart === target.period_start) {
    const error = new HttpError(400, 'The source week must be a different week');
    error.code = 'INVALID_SOURCE_WEEK';
    throw error;
  }

  const sources = await sql`
    SELECT sv.id AS version_id, sv.version_number, s.id AS schedule_id,
           s.period_start, s.period_end
    FROM schedules s
    JOIN schedule_versions sv ON sv.schedule_id = s.id
    WHERE s.organization_id = ${ctx.organizationId}
      AND s.period_start = ${sourceWeekStart}
      AND s.area_id IS NOT DISTINCT FROM ${target.area_id ?? null}
      AND sv.status IN ('PUBLISHED', 'LOCKED', 'COMPLETED')
    ORDER BY sv.version_number DESC
    LIMIT 1
  `;
  if (sources.length === 0) {
    const error = new HttpError(404, 'The source week has no published version');
    error.code = 'SOURCE_NOT_PUBLISHED';
    throw error;
  }
  const source = { ...sources[0], period_start: databaseDateToIso(sources[0].period_start), period_end: databaseDateToIso(sources[0].period_end) };
  const delta = Math.round((Date.parse(`${target.period_start}T00:00:00Z`) - Date.parse(`${source.period_start}T00:00:00Z`)) / 86_400_000);
  const sourceLength = Math.round((Date.parse(`${source.period_end}T00:00:00Z`) - Date.parse(`${source.period_start}T00:00:00Z`)) / 86_400_000);
  const targetLength = Math.round((Date.parse(`${target.period_end}T00:00:00Z`) - Date.parse(`${target.period_start}T00:00:00Z`)) / 86_400_000);
  if (sourceLength !== targetLength) {
    const error = new HttpError(400, 'The source and target weeks must have the same length');
    error.code = 'INVALID_SOURCE_WEEK';
    throw error;
  }

  const sourceRows = await sql`
    SELECT sa.id, sa.employee_id, sa.date, sa.start_time, sa.end_time, sa.location, sa.shift_type, sa.counts_as_work,
           EXISTS (
             SELECT 1 FROM shifts pub
             WHERE pub.organization_id = ${ctx.organizationId} AND pub.schedule_version_id = sa.schedule_version_id
               AND pub.employee_id = sa.employee_id AND pub.date = sa.date
               AND pub.start_time IS NOT DISTINCT FROM TO_CHAR(sa.start_time, 'HH24:MI')
               AND pub.end_time IS NOT DISTINCT FROM TO_CHAR(sa.end_time, 'HH24:MI')
               AND lower(btrim(COALESCE(pub.shift_type, ''))) = lower(btrim(COALESCE(sa.shift_type, '')))
               AND pub.counts_as_work IS NOT DISTINCT FROM sa.counts_as_work
               AND pub.location IS NOT DISTINCT FROM COALESCE(sa.location, '')
               AND pub.effective_state = 'EFFECTIVE'
           ) AS still_current
    FROM shift_assignments sa
    WHERE sa.schedule_version_id = ${source.version_id}
    ORDER BY sa.date, sa.start_time NULLS FIRST, sa.id
  `;
  const employeeIds = [...new Set(sourceRows.map((row) => row.employee_id))];
  const employees = employeeIds.length === 0 ? [] : await sql`
    SELECT id, name, area_id, status FROM employees
    WHERE organization_id = ${ctx.organizationId} AND id::text = ANY(${employeeIds}::text[])
  `;
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  const existing = await sql`
    SELECT id, employee_id, date, start_time, end_time, location, shift_type, counts_as_work
    FROM shift_assignments WHERE schedule_version_id = ${versionId}
  `;
  const protectedDays = employeeIds.length === 0 ? [] : await sql`
    SELECT employee_id, date FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND effective_state = 'EFFECTIVE' AND time_off_request_id IS NOT NULL
      AND date BETWEEN ${target.period_start} AND ${target.period_end} AND employee_id::text = ANY(${employeeIds}::text[])
  `;
  const boundary = employeeIds.length === 0 ? [] : await sql`
    SELECT employee_id, date, start_time, end_time, shift_type, counts_as_work FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND effective_state = 'EFFECTIVE' AND employee_id::text = ANY(${employeeIds}::text[])
      AND date IN (${shiftOperationalDate(target.period_start, -1)}, ${shiftOperationalDate(target.period_end, 1)})
  `;

  const today = getOperationalDate();
  const protectedKeys = new Set(protectedDays.map((row) => `${row.employee_id}|${databaseDateToIso(row.date)}`));
  const planned = existing.map((row) => ({ ...row, date: databaseDateToIso(row.date) })); // grows with each accepted candidate
  const copy = [];
  const skipped = [];
  const skip = (row, targetDate, reason, employee, visible = true) => skipped.push({
    reason, sourceAssignmentId: visible ? row.id : null, targetDate,
    employeeId: visible ? row.employee_id : null, employeeName: visible ? (employee?.name ?? null) : null,
    shiftType: visible ? row.shift_type : null, startTime: visible ? clock(row.start_time) : null, endTime: visible ? clock(row.end_time) : null,
  });

  for (const row of sourceRows) {
    const sourceDate = databaseDateToIso(row.date);
    const targetDate = shiftOperationalDate(sourceDate, delta);
    const employee = employeeById.get(row.employee_id);
    // Out of scope first: nothing about an employee the actor cannot see (not even a name) is reported.
    if (!employee || !employeeRowInScope(scope, employee) || (target.area_id && employee.area_id !== target.area_id)) {
      skip(row, targetDate, 'OUT_OF_SCOPE', null, false);
      continue;
    }
    if (sameText(row.shift_type, 'Vacaciones')) { skip(row, targetDate, 'SOURCE_ABSENCE', employee); continue; }
    if (!row.still_current) { skip(row, targetDate, 'STALE_SOURCE', employee); continue; }
    if (employee.status !== 'active') { skip(row, targetDate, 'INACTIVE_EMPLOYEE', employee); continue; }
    if (targetDate < today) { skip(row, targetDate, 'PAST_DATE', employee); continue; }
    if (targetDate < target.period_start || targetDate > target.period_end) { skip(row, targetDate, 'PAST_DATE', employee); continue; }
    if (protectedKeys.has(`${row.employee_id}|${targetDate}`)) { skip(row, targetDate, 'PROTECTED_ABSENCE_DAY', employee); continue; }

    const candidate = { ...row, date: targetDate };
    if (planned.some((other) => identityOf(other) === identityOf(candidate))) { skip(row, targetDate, 'ALREADY_ASSIGNED', employee); continue; }
    const sameDay = planned.filter((other) => other.employee_id === row.employee_id && other.date === targetDate);
    const conflict = findAssignmentConflict(sameDay, {
      id: null, date: targetDate, startTime: clock(row.start_time), endTime: clock(row.end_time), shiftType: row.shift_type, countsAsWork: row.counts_as_work !== false,
    });
    if (conflict) { skip(row, targetDate, 'OVERLAP', employee); continue; }
    const semantics = getShiftSemantics({ ...candidate, start_time: row.start_time, end_time: row.end_time });
    if (semantics.contributesWorkedTime) {
      const neighbours = [
        ...planned.filter((other) => other.employee_id === row.employee_id && other.date !== targetDate && Math.abs(Date.parse(`${other.date}T00:00:00Z`) - Date.parse(`${targetDate}T00:00:00Z`)) <= 2 * 86_400_000),
        // The week boundary: what the employee really works the day before / after the target week.
        ...boundary.filter((other) => other.employee_id === row.employee_id).map((other) => ({ ...other, date: databaseDateToIso(other.date) })),
      ].filter((other) => other.date !== targetDate && getShiftSemantics(other).contributesWorkedTime);
      const tooClose = neighbours.some((other) => {
        const gap = calculateRestGapMinutes(candidate, other);
        return gap !== null && gap < MINIMUM_REST_MINUTES;
      });
      if (tooClose) { skip(row, targetDate, 'REST_RULE_VIOLATION', employee); continue; }
    }
    planned.push({ ...candidate, id: row.id });
    copy.push({
      sourceAssignmentId: row.id, employeeId: row.employee_id, employeeName: employee.name ?? null, sourceDate, targetDate,
      shiftType: row.shift_type ?? 'Regular', startTime: clock(row.start_time), endTime: clock(row.end_time),
      location: row.location ?? null, countsAsWork: row.counts_as_work !== false,
    });
  }

  const byReason = skipped.reduce((acc, item) => ({ ...acc, [item.reason]: (acc[item.reason] ?? 0) + 1 }), {});
  const base = {
    mode,
    source: { scheduleId: source.schedule_id, versionId: source.version_id, versionNumber: Number(source.version_number), periodStart: source.period_start, periodEnd: source.period_end },
    target: { scheduleId, versionId, periodStart: target.period_start, periodEnd: target.period_end },
    candidates: copy,
    skipped,
    summary: { candidates: copy.length, skipped: skipped.length, byReason },
  };
  if (mode === 'preview' || copy.length === 0) return { ...base, created: 0, createdAssignmentIds: [] };

  // Apply: the version row is locked FIRST (publication takes the same lock), then the insert runs as a NEW statement of the same
  // transaction, so it sees whatever a concurrent copy just committed. A row already present (same identity) is never inserted twice.
  const payload = JSON.stringify(copy.map((item) => ({
    employee_id: item.employeeId, date: item.targetDate, start_time: item.startTime, end_time: item.endTime,
    location: item.location, shift_type: item.shiftType, counts_as_work: item.countsAsWork,
  })));
  const copyGuard = scopeGuardOf(scope);
  const [, inserted] = await sql.transaction((txn) => [
    txn`SELECT id FROM schedule_versions WHERE id = ${versionId} AND status = 'DRAFT' FOR UPDATE`,
    txn`
      INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, location, shift_type, counts_as_work)
      SELECT ${versionId}, x.employee_id, x.date, x.start_time, x.end_time, x.location, x.shift_type, x.counts_as_work
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(employee_id uuid, date date, start_time time, end_time time, location text, shift_type text, counts_as_work boolean)
      JOIN employees emp ON emp.id = x.employee_id AND emp.organization_id = ${ctx.organizationId}
      WHERE EXISTS (SELECT 1 FROM schedule_versions WHERE id = ${versionId} AND status = 'DRAFT')
        -- scope enforced again by the statement that writes (an employee's scope may have changed since the preview)
        AND (${copyGuard.scopeMode}::text = 'NONE' OR (CASE ${copyGuard.scopeMode}::text
               WHEN 'EMPLOYEES' THEN emp.id::text = ANY(${copyGuard.scopeIds}::text[])
               ELSE COALESCE(emp.area_id::text = ANY(${copyGuard.scopeIds}::text[]), FALSE) END))
        AND NOT EXISTS (
          SELECT 1 FROM shift_assignments t
          WHERE t.schedule_version_id = ${versionId} AND t.employee_id = x.employee_id AND t.date = x.date
            AND t.start_time IS NOT DISTINCT FROM x.start_time AND t.end_time IS NOT DISTINCT FROM x.end_time
            AND lower(btrim(COALESCE(t.shift_type, ''))) = lower(btrim(COALESCE(x.shift_type, '')))
            AND t.counts_as_work IS NOT DISTINCT FROM x.counts_as_work
            AND COALESCE(t.location, '') = COALESCE(x.location, '')
        )
      RETURNING id, employee_id, date
    `,
  ]);
  const createdRows = inserted ?? [];
  if (createdRows.length === 0 && copy.length > 0) {
    // Nothing was inserted: either everything was already there (a concurrent copy) or the draft stopped being a draft.
    const [version] = await sql`SELECT status FROM schedule_versions WHERE id = ${versionId}`;
    if (!version || version.status !== 'DRAFT') {
      const error = new HttpError(409, 'Schedule version is not editable');
      error.code = 'VERSION_NOT_EDITABLE';
      throw error;
    }
  }
  await recordAuditEvent(sql, ctx, {
    // `schedule.week_copied` is NOT in the organization_audit_events CHECK (no migration allowed here), so the write failed silently:
    // the allowed «assignments created» type carries the operation in its metadata instead.
    eventType: 'ASSIGNMENT_CREATED',
    targetType: 'SCHEDULE_VERSION',
    targetId: versionId,
    metadata: { operation: 'WEEK_COPIED', sourceVersionId: source.version_id, sourceWeekStart, targetPeriodStart: target.period_start, created: createdRows.length, skipped: skipped.length, byReason },
  });
  return { ...base, created: createdRows.length, createdAssignmentIds: createdRows.map((row) => row.id) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// F4-M03 / OD-F4-02 — publish up to 12 pending weeks, one canonical publication per week.
// ---------------------------------------------------------------------------------------------------------------------------------

export const PUBLISH_PENDING_MAX = 12;

function fail(versionId, status, code, extra = {}) {
  return { versionId, ok: false, status, code, excluded: [], ...extra };
}

/** Every validation of the real publication, run against the current data, with NOTHING written (`dryRun`). */
async function inspectPublication(sql, ctx, scheduleId, versionId, guard) {
  const transactionResult = await sql.transaction((txn) => [publishScheduleVersionTx(txn, ctx, scheduleId, versionId, { ...guard, dryRun: true })]);
  const outcome = transactionResult?.[0]?.[0];
  if (!outcome?.found) return { eligible: false, status: 404, code: 'NOT_FOUND' };
  if (outcome.current_status !== 'DRAFT') return { eligible: false, status: 409, code: 'VERSION_NOT_EDITABLE' };
  if (outcome.error_code === 'SCOPE_FORBIDDEN') return { eligible: false, status: 403, code: 'SCOPE_FORBIDDEN' };
  if (outcome.error_code) return { eligible: false, status: 422, code: outcome.error_code };
  const excluded = Array.isArray(outcome.excluded_assignments) ? outcome.excluded_assignments : [];
  return {
    eligible: true,
    excludedCount: Number(outcome.excluded_count ?? 0),
    excludedByReason: excluded.reduce((acc, item) => ({ ...acc, [item.reason]: (acc[item.reason] ?? 0) + 1 }), {}),
  };
}

/**
 * Publishes (or, with `mode: 'preview'`, only checks) 1–12 distinct DRAFT versions. Each version is decided on its own by the SAME
 * publication the single button uses (`publishScheduleVersion`): its own transaction, its own scope check over every employee it
 * touches, its own conflicts, its own notifications. A version that cannot be published is reported and writes nothing; the others go on.
 *
 * Temporal rule (bulk only): a version whose assignments include a date already past is NOT eligible. Publishing it would replace
 * the calendar's history for those days, and a batch must never do that silently; it can still be published on its own, where the user
 * sees exactly that.
 */
export async function publishPendingVersions(sql, ctx, input = {}) {
  requireRole(ctx, 'PLANNER');
  const mode = String(input.mode ?? 'apply').trim();
  if (!['preview', 'apply'].includes(mode)) {
    const error = new HttpError(400, 'mode must be preview or apply');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  const ids = input.versionIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > PUBLISH_PENDING_MAX || ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    const error = new HttpError(400, `versionIds must be an array of 1 to ${PUBLISH_PENDING_MAX} valid UUIDs`);
    error.code = 'INVALID_INPUT';
    throw error;
  }
  if (new Set(ids).size !== ids.length) {
    const error = new HttpError(400, 'versionIds must not contain duplicates');
    error.code = 'DUPLICATE_VERSION_IDS';
    throw error;
  }

  const today = getOperationalDate();
  const results = [];
  for (const versionId of ids) {
    try {
      const rows = await sql`
        SELECT sv.schedule_id, sv.status, TO_CHAR(s.period_start, 'YYYY-MM-DD') AS period_start, TO_CHAR(s.period_end, 'YYYY-MM-DD') AS period_end
        FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id
        WHERE sv.id = ${versionId} AND s.organization_id = ${ctx.organizationId}
      `;
      if (rows.length === 0) { results.push(fail(versionId, 404, 'NOT_FOUND')); continue; }
      const scheduleId = rows[0].schedule_id;
      // Scope first: nothing about a version outside it (not even its dates) is reported.
      const guard = await publishScopeGuard(sql, ctx, scheduleId);
      const meta = { scheduleId, periodStart: rows[0].period_start, periodEnd: rows[0].period_end };
      if (rows[0].status !== 'DRAFT') { results.push(fail(versionId, 409, 'VERSION_NOT_EDITABLE', meta)); continue; }
      const counts = (await sql`
        SELECT COUNT(*)::integer AS total, COUNT(*) FILTER (WHERE date < ${today})::integer AS past
        FROM shift_assignments WHERE schedule_version_id = ${versionId}
      `)[0] ?? { total: 0, past: 0 };
      const assignmentCount = Number(counts.total);
      const pastAssignmentCount = Number(counts.past);
      if (meta.periodEnd < today || pastAssignmentCount > 0) {
        results.push(fail(versionId, 422, 'PAST_DATES_AFFECTED', { ...meta, assignmentCount, pastAssignmentCount }));
        continue;
      }
      if (mode === 'preview') {
        const verdict = await inspectPublication(sql, ctx, scheduleId, versionId, guard);
        results.push(verdict.eligible
          ? { versionId, ok: true, ...meta, assignmentCount, excludedCount: verdict.excludedCount, excludedByReason: verdict.excludedByReason, excluded: [] }
          : fail(versionId, verdict.status, verdict.code, { ...meta, assignmentCount }));
        continue;
      }
      const published = await publishScheduleVersion(sql, ctx, scheduleId, versionId);
      results.push({
        versionId, ok: true, ...meta, createdShiftCount: published.createdShiftCount,
        excluded: published.excludedAssignments, excludedAssignmentCount: published.excludedAssignmentCount,
      });
    } catch (error) {
      if (error?.status >= 400 && error?.status < 500) results.push(fail(versionId, error.status, error.code ?? 'ERROR'));
      else {
        console.error('[api] publish-pending item failed', { versionId, message: error?.message });
        results.push(fail(versionId, 500, 'ERROR'));
      }
    }
  }
  const ok = results.filter((item) => item.ok).length;
  return { mode, results, summary: { requested: ids.length, ok, failed: ids.length - ok } };
}

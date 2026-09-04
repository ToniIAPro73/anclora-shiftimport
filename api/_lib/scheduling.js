import { randomUUID } from 'node:crypto';
import { HttpError, requireRole, resolveAccessScope } from './auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function databaseDateToIso(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
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
  if (date.getUTCDay() !== 1) {
    throw new HttpError(400, 'periodStart must be a Monday');
  }

  const periodEndDate = new Date(date.getTime());
  periodEndDate.setUTCDate(periodEndDate.getUTCDate() + 6);
  return { periodStart, periodEnd: periodEndDate.toISOString().slice(0, 10) };
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
  const scope = resolveAccessScope(ctx);
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
}

function mapAssignment(row) {
  return {
    id: row.id,
    scheduleVersionId: row.schedule_version_id,
    employeeId: row.employee_id,
    date: databaseDateToIso(row.date),
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    location: row.location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAssignment(sql, ctx, scheduleId, versionId, input = {}) {
  requireRole(ctx, 'PLANNER');
  const schedule = await loadScheduleVersion(sql, ctx, scheduleId, versionId);
  const employeeId = String(input.employeeId ?? '').trim();
  const date = normalizeDate(input.date);
  const startTime = normalizeTime(input.startTime, 'startTime');
  const endTime = normalizeTime(input.endTime, 'endTime');
  assertAssignmentDateInPeriod(date, schedule);
  await assertEmployeeForSchedule(sql, ctx, schedule, employeeId);
  const location = input.location === undefined || input.location === null ? null : String(input.location).trim() || null;
  const rows = await sql`
    INSERT INTO shift_assignments
      (schedule_version_id, employee_id, date, start_time, end_time, location)
    VALUES (${versionId}, ${employeeId}, ${date}, ${startTime}, ${endTime}, ${location})
    RETURNING id, schedule_version_id, employee_id, date, start_time, end_time,
              location, created_at, updated_at
  `;
  return mapAssignment(rows[0]);
}

async function loadAssignment(sql, ctx, scheduleId, versionId, assignmentId) {
  const schedule = await loadScheduleVersion(sql, ctx, scheduleId, versionId);
  const rows = await sql`
    SELECT sa.id, sa.schedule_version_id, sa.employee_id, sa.date,
           sa.start_time, sa.end_time, sa.location, sa.created_at, sa.updated_at
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
  const startTime = input.startTime === undefined ? String(assignment.start_time).slice(0, 5) : normalizeTime(input.startTime, 'startTime');
  const endTime = input.endTime === undefined ? String(assignment.end_time).slice(0, 5) : normalizeTime(input.endTime, 'endTime');
  assertAssignmentDateInPeriod(date, schedule);
  await assertEmployeeForSchedule(sql, ctx, schedule, employeeId);
  const location = input.location === undefined ? assignment.location : (input.location === null ? null : String(input.location).trim() || null);
  const rows = await sql`
    UPDATE shift_assignments
    SET employee_id = ${employeeId}, date = ${date}, start_time = ${startTime},
        end_time = ${endTime}, location = ${location}, updated_at = NOW()
    WHERE id = ${assignmentId} AND schedule_version_id = ${versionId}
    RETURNING id, schedule_version_id, employee_id, date, start_time, end_time,
              location, created_at, updated_at
  `;
  if (rows.length === 0) throw new HttpError(404, 'Assignment not found');
  return mapAssignment(rows[0]);
}

export async function deleteAssignment(sql, ctx, scheduleId, versionId, assignmentId) {
  requireRole(ctx, 'PLANNER');
  await loadAssignment(sql, ctx, scheduleId, versionId, assignmentId);
  const rows = await sql`
    DELETE FROM shift_assignments
    WHERE id = ${assignmentId} AND schedule_version_id = ${versionId}
    RETURNING id
  `;
  if (rows.length === 0) throw new HttpError(404, 'Assignment not found');
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
  const scope = resolveAccessScope(ctx);
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

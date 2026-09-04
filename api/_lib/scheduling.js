import { randomUUID } from 'node:crypto';
import { HttpError, requireRole, resolveAccessScope } from './auth.js';

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
  if (a.end <= b.start) return b.start - a.end;
  if (b.end <= a.start) return a.start - b.end;
  return null;
}

/** Half-open interval rule: touching assignments are valid, overlap is not. */
export function rangesOverlap(startTime, endTime, existingStartTime, existingEndTime) {
  return timeToMinutes(startTime) < timeToMinutes(existingEndTime)
    && timeToMinutes(endTime) > timeToMinutes(existingStartTime);
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

async function assertNoAssignmentOverlap(sql, { scheduleVersionId, employeeId, date, startTime, endTime, excludeId = null }) {
  const rows = excludeId
    ? await sql`
      SELECT id, start_time, end_time
      FROM shift_assignments
      WHERE schedule_version_id = ${scheduleVersionId}
        AND employee_id = ${employeeId}
        AND date = ${date}
        AND id <> ${excludeId}
        AND start_time < ${endTime}::time
        AND end_time > ${startTime}::time
      ORDER BY start_time, id
    `
    : await sql`
      SELECT id, start_time, end_time
      FROM shift_assignments
      WHERE schedule_version_id = ${scheduleVersionId}
        AND employee_id = ${employeeId}
        AND date = ${date}
        AND start_time < ${endTime}::time
        AND end_time > ${startTime}::time
      ORDER BY start_time, id
    `;
  const conflict = rows.find((row) => rangesOverlap(startTime, endTime, row.start_time, row.end_time));
  if (conflict) {
    const error = new HttpError(422, 'Assignment overlaps an existing assignment');
    error.code = 'OVERLAP';
    error.conflictingAssignmentId = conflict.id;
    throw error;
  }
}

async function assertMinimumRest(sql, {
  scheduleVersionId, employeeId, date, startTime, endTime, excludeId = null,
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
  const candidate = { date, start_time: startTime, end_time: endTime };
  const conflict = rows
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
    date: databaseDateToIso(row.date),
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    location: row.location,
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

function schedulingScopeAreaId(ctx, requestedAreaId = null) {
  const scope = resolveAccessScope(ctx);
  if (scope.type === 'AREA') {
    if (requestedAreaId && requestedAreaId !== scope.areaId) {
      throw scheduleScopeError();
    }
    return scope.areaId;
  }
  return requestedAreaId || null;
}

/** Lists the latest version for each tenant-scoped schedule for draft discovery. */
export async function listScheduleVersions(sql, ctx, { areaId = null } = {}) {
  requireRole(ctx, 'PLANNER');
  const scopedAreaId = schedulingScopeAreaId(ctx, areaId);
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
  const scope = resolveAccessScope(ctx);
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
  const scopedAreaId = schedulingScopeAreaId(ctx, schedule.area_id ?? null);
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
      SELECT sa.id, sa.schedule_version_id, sa.employee_id, sa.date,
             sa.start_time, sa.end_time, sa.location, sa.created_at, sa.updated_at
      FROM shift_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE sa.schedule_version_id = ${versionId}
        AND e.organization_id = ${ctx.organizationId}
        AND e.status = 'active'
        AND e.area_id = ${scopedAreaId}
      ORDER BY sa.date, sa.start_time, sa.employee_id, sa.id
    `
    : sql`
      SELECT sa.id, sa.schedule_version_id, sa.employee_id, sa.date,
             sa.start_time, sa.end_time, sa.location, sa.created_at, sa.updated_at
      FROM shift_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE sa.schedule_version_id = ${versionId}
        AND e.organization_id = ${ctx.organizationId}
        AND e.status = 'active'
      ORDER BY sa.date, sa.start_time, sa.employee_id, sa.id
    `;
  const [employeeRows, assignmentRows] = await Promise.all([employeeQuery, assignmentQuery]);
  return {
    version: mapScheduleVersion(schedule),
    employees: employeeRows.map(mapSchedulingEmployee),
    assignments: assignmentRows.map(mapAssignment),
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
  await assertNoAssignmentOverlap(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime,
  });
  await assertMinimumRest(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime,
  });
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
  await assertNoAssignmentOverlap(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime, excludeId: assignmentId,
  });
  await assertMinimumRest(sql, {
    scheduleVersionId: versionId, employeeId, date, startTime, endTime, excludeId: assignmentId,
  });
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

/** Creates an independent DRAFT from a published or terminal version. */
export async function createNewDraftFromVersion(sql, ctx, scheduleId, versionId) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId)) {
    throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  }
  const scope = resolveAccessScope(ctx);
  const newVersionId = randomUUID();
  const isAreaScoped = scope.type === 'AREA';
  const scopedAreaId = isAreaScoped ? scope.areaId : null;

  let transactionResult;
  try {
    transactionResult = await sql.transaction((txn) => [txn`
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
      created AS (
        INSERT INTO schedule_versions
          (id, schedule_id, version_number, status, created_by_user_id)
        SELECT ${newVersionId}, n.schedule_id, n.version_number, 'DRAFT', ${ctx.user.id}
        FROM next_version n
        WHERE n.status IN ('PUBLISHED', 'LOCKED', 'COMPLETED')
          AND n.draft_version_id IS NULL
          AND (${isAreaScoped} = FALSE OR n.area_id = ${scopedAreaId})
        RETURNING id, schedule_id, version_number
      ),
      copied AS (
        INSERT INTO shift_assignments
          (schedule_version_id, employee_id, date, start_time, end_time, location)
        SELECT c.id, sa.employee_id, sa.date, sa.start_time, sa.end_time, sa.location
        FROM shift_assignments sa
        JOIN target t ON t.version_id = sa.schedule_version_id
        JOIN created c ON TRUE
        RETURNING id
      )
      SELECT
        EXISTS (SELECT 1 FROM target) AS found,
        (SELECT status FROM target LIMIT 1) AS current_status,
        (SELECT area_id FROM target LIMIT 1) AS area_id,
        (SELECT draft_version_id FROM draft_conflict LIMIT 1) AS draft_version_id,
        (SELECT id FROM created LIMIT 1) AS new_version_id,
        (SELECT schedule_id FROM created LIMIT 1) AS schedule_id,
        (SELECT version_number FROM created LIMIT 1) AS version_number,
        (SELECT COUNT(*)::integer FROM copied) AS copied_assignment_count
    `]);
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
export async function publishScheduleVersion(sql, ctx, scheduleId, versionId) {
  requireRole(ctx, 'PLANNER');
  if (!UUID_RE.test(scheduleId) || !UUID_RE.test(versionId)) {
    throw new HttpError(400, 'scheduleId and versionId must be valid UUIDs');
  }

  const transactionResult = await sql.transaction((txn) => [txn`
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
             sa.start_time, sa.end_time, sa.location, e.status AS employee_status
      FROM shift_assignments sa
      JOIN target t ON t.version_id = sa.schedule_version_id
      JOIN employees e ON e.id = sa.employee_id
        AND e.organization_id = t.organization_id
    ),
    active_assignments AS MATERIALIZED (
      SELECT * FROM all_assignments WHERE employee_status = 'active'
    ),
    assignment_intervals AS MATERIALIZED (
      SELECT a.*,
             (a.date + a.start_time) AS start_at,
             (a.date + a.end_time
               + CASE WHEN a.end_time <= a.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END
             ) AS end_at
      FROM active_assignments a
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
      WHERE NOT (a.start_at < b.end_at AND b.start_at < a.end_at)
        AND (
          (b.start_at >= a.end_at AND b.start_at - a.end_at < INTERVAL '11 hours')
          OR (a.start_at >= b.end_at AND a.start_at - b.end_at < INTERVAL '11 hours')
        )
      ORDER BY a.id, b.id
      LIMIT 1
    ),
    conflicts AS (
      SELECT 'OVERLAP'::text AS error_code, conflicting_assignment_id, NULL::integer AS minimum_rest_hours, 1 AS priority
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
        COUNT(*) FILTER (WHERE employee_status <> 'active')::integer AS excluded_count,
        COALESCE(
          json_agg(
            json_build_object('assignmentId', id, 'employeeId', employee_id)
            ORDER BY id
          ) FILTER (WHERE employee_status <> 'active'),
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
      RETURNING sv.id, sv.published_at
    ),
    materialized AS (
      INSERT INTO shifts (
        organization_id, employee_id, import_id, area_id, date,
        start_time, end_time, location, origin, schedule_version_id
      )
      SELECT t.organization_id, a.employee_id, NULL, t.area_id, a.date,
             TO_CHAR(a.start_time, 'HH24:MI'), TO_CHAR(a.end_time, 'HH24:MI'),
             COALESCE(a.location, ''), 'schedule', a.schedule_version_id
      FROM active_assignments a
      JOIN target t ON TRUE
      JOIN updated u ON u.id = t.version_id
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
  `]);

  const outcome = transactionResult?.[0]?.[0];
  if (!outcome?.found) {
    throw new HttpError(404, 'Schedule version not found');
  }
  if (outcome.current_status !== 'DRAFT') {
    const error = new HttpError(409, 'Schedule version is already published or locked');
    error.code = 'VERSION_NOT_EDITABLE';
    throw error;
  }
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

  return {
    status: 'PUBLISHED',
    publishedAt: outcome.published_at,
    createdShiftCount: Number(outcome.created_shift_count ?? 0),
    excludedAssignments: Array.isArray(outcome.excluded_assignments)
      ? outcome.excluded_assignments
      : [],
    excludedAssignmentCount: Number(outcome.excluded_count ?? 0),
  };
}

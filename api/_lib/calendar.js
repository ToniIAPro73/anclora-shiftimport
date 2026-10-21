import { randomUUID } from 'node:crypto';
import { HttpError } from './auth.js';
import { ACTIONS, can } from './authorization.js';
import { assertEmployeeInScope, mapShiftRow, recordAuditEvent } from './data.js';
import {
  CHANGE_TYPES,
  PROVENANCE,
  buildDayProvenance,
  attachAuditCurrentEvidence,
  classifyKind,
  computeEffectiveStats,
  evaluateAnnualTarget,
  normalizeCalendarRow,
  resolveDay,
  resolveProvisionalReviewRows,
} from '../../src/lib/effective-calendar.js';
import { getOperationalDate } from './operational-date.js';
import { assertTimedTypeHasTimes } from './shift-compatibility.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_ANNUAL_MINUTES = 366 * 24 * 60;
const MAX_REASON = 2000;

const SHIFT_COLUMNS = `id, organization_id, employee_id, import_id, area_id,
  TO_CHAR(date, 'YYYY-MM-DD') AS date, start_time, end_time, location, origin,
  shift_type, counts_as_work, layer, provenance, legacy_origin, duty_role,
  effective_state, plan_revision, change_id`;

function actorFromContext(ctx) {
  return {
    userId: ctx.user?.id ?? null,
    role: ctx.role,
    employeeId: ctx.employeeId ?? null,
    plannerScopeType: ctx.plannerScopeType,
    scopedAreaId: ctx.scopedAreaId,
    scopedAreaIds: ctx.scopedAreaIds,
    scopedEmployeeIds: ctx.scopedEmployeeIds,
  };
}

function badRequest(message, code) {
  const error = new HttpError(400, message);
  if (code) error.code = code;
  return error;
}

function mapTargetRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    year: row.year,
    minimumAnnualMinutes: row.minimum_annual_minutes,
    maximumAnnualMinutes: row.maximum_annual_minutes,
    // Derived, never stored twice.
    marginMinutes: row.maximum_annual_minutes - row.minimum_annual_minutes,
    notes: row.notes ?? '',
    source: row.source,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id ?? null,
  };
}

async function loadEmployeeArea(sql, ctx, employeeId) {
  const rows = await sql`
    SELECT area_id FROM employees
    WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
  `;
  return rows[0]?.area_id ?? null;
}

/** Annual targets of one employee (all years), authorized for the actor. */
export async function listAnnualTargets(sql, ctx, employeeId) {
  const targetEmployeeId = ctx.role === 'EMPLOYEE' ? ctx.employeeId : employeeId;
  if (!targetEmployeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  await assertEmployeeInScope(sql, ctx, targetEmployeeId);
  const areaId = await loadEmployeeArea(sql, ctx, targetEmployeeId);
  if (!can(actorFromContext(ctx), ACTIONS.VIEW_ANNUAL_TARGET, { employeeId: targetEmployeeId, areaId })) {
    throw new HttpError(403, 'Not allowed to view annual targets for this employee');
  }
  const rows = await sql`
    SELECT id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes,
           notes, source, updated_at, updated_by_user_id
    FROM employee_annual_targets
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
    ORDER BY year DESC
  `;
  return rows.map(mapTargetRow);
}

function assertMinutes(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ANNUAL_MINUTES) {
    throw badRequest(`${label} must be an integer number of minutes between 0 and ${MAX_ANNUAL_MINUTES}`, 'INVALID_ANNUAL_TARGET');
  }
}

/** Creates or replaces one employee/year target. OWNER/ADMIN only, audited. */
export async function setAnnualTarget(sql, ctx, input) {
  if (!can(actorFromContext(ctx), ACTIONS.MANAGE_ANNUAL_TARGET, {})) {
    throw new HttpError(403, 'Only an owner or administrator can configure annual targets');
  }
  const employeeId = String(input?.employeeId ?? '').trim();
  const year = Number(input?.year);
  if (!employeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw badRequest('year is invalid', 'INVALID_YEAR');
  const minimum = Number(input?.minimumAnnualMinutes);
  const maximum = Number(input?.maximumAnnualMinutes);
  assertMinutes(minimum, 'minimumAnnualMinutes');
  assertMinutes(maximum, 'maximumAnnualMinutes');
  if (maximum < minimum) throw badRequest('maximum must not be lower than minimum', 'INVALID_ANNUAL_TARGET');
  const notes = String(input?.notes ?? '').trim().slice(0, 2000);

  await assertEmployeeInScope(sql, ctx, employeeId);
  const previousRows = await sql`
    SELECT id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes,
           notes, source, updated_at, updated_by_user_id
    FROM employee_annual_targets
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId} AND year = ${year}
  `;
  const previous = mapTargetRow(previousRows[0]);
  const saved = await sql`
    INSERT INTO employee_annual_targets (
      organization_id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes,
      notes, source, created_by_user_id, updated_by_user_id
    ) VALUES (
      ${ctx.organizationId}, ${employeeId}, ${year}, ${minimum}, ${maximum},
      ${notes}, 'ADMIN_UI', ${ctx.user.id}, ${ctx.user.id}
    )
    ON CONFLICT (organization_id, employee_id, year) DO UPDATE SET
      minimum_annual_minutes = EXCLUDED.minimum_annual_minutes,
      maximum_annual_minutes = EXCLUDED.maximum_annual_minutes,
      notes = EXCLUDED.notes,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW()
    RETURNING id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes,
              notes, source, updated_at, updated_by_user_id
  `;
  const target = mapTargetRow(saved[0]);
  await recordAuditEvent(sql, ctx, {
    eventType: previous ? 'EMPLOYEE_ANNUAL_TARGET_UPDATED' : 'EMPLOYEE_ANNUAL_TARGET_SET',
    targetType: 'EMPLOYEE',
    targetId: employeeId,
    metadata: {
      year,
      before: previous
        ? { minimumAnnualMinutes: previous.minimumAnnualMinutes, maximumAnnualMinutes: previous.maximumAnnualMinutes }
        : null,
      after: { minimumAnnualMinutes: minimum, maximumAnnualMinutes: maximum },
    },
  });
  return target;
}

function snapshotRows(rows) {
  return rows.map((row) => {
    const normalized = normalizeCalendarRow(row);
    return {
      id: normalized.id,
      shiftType: normalized.shiftType,
      startTime: normalized.startTime ? String(normalized.startTime).slice(0, 5) : null,
      endTime: normalized.endTime ? String(normalized.endTime).slice(0, 5) : null,
      layer: normalized.layer,
      provenance: normalized.provenance,
    };
  });
}

function normalizeChangeRow(raw) {
  const shiftType = String(raw?.shiftType ?? '').trim();
  if (!shiftType) throw badRequest('Each resulting row needs a shiftType', 'SHIFT_TYPE_REQUIRED');
  const startTime = String(raw?.startTime ?? '').trim() || null;
  const endTime = String(raw?.endTime ?? '').trim() || null;
  for (const time of [startTime, endTime]) {
    if (time && !TIME_RE.test(time)) throw badRequest('Times must use HH:mm', 'INVALID_TIME');
  }
  const kind = classifyKind(normalizeCalendarRow({ date: '', shiftType, startTime, endTime }));
  if (kind.kind === 'LEGACY_DUTY_ROLE') {
    throw badRequest('JT is a legacy duty role and cannot be created as work; use dutyRole instead', 'JT_NOT_WORK');
  }
  const countsAsWork = kind.kind === 'WORK';
  assertTimedTypeHasTimes({ shiftType: kind.type, countsAsWork, startTime, endTime });
  if (kind.kind === 'FULL_DAY' && (startTime || endTime)) {
    throw badRequest('Whole-day types cannot carry times', 'UNEXPECTED_TIME');
  }
  return { shiftType: kind.type, startTime, endTime, countsAsWork, dutyRole: raw?.dutyRole === 'shift_lead' ? 'shift_lead' : null };
}

async function loadDayRows(sql, ctx, employeeId, date) {
  return sql`
    SELECT id, organization_id, employee_id, import_id, area_id,
           TO_CHAR(date, 'YYYY-MM-DD') AS date, start_time, end_time, location, origin,
           shift_type, counts_as_work, layer, provenance, legacy_origin, duty_role,
           effective_state, plan_revision, change_id
    FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId} AND date = ${date}
    ORDER BY start_time ASC NULLS FIRST, id ASC
  `;
}

const REPLACING_TYPES = new Set(['TIME_CHANGE', 'TYPE_CHANGE', 'CANCEL_SHIFT', 'REPLACE_DAY']);

/**
 * Direct administrative change on the effective calendar. This is NOT an
 * approval request: the actor exercises an administrative action that is
 * recorded with who/when/why/before/after (and `self_change` when the actor
 * edits their own employee profile). EMPLOYEE users go through change
 * requests instead.
 */
export async function applyCalendarChange(sql, ctx, input) {
  const employeeId = String(input?.employeeId ?? '').trim();
  const date = String(input?.date ?? '').trim();
  const changeType = String(input?.changeType ?? '').trim();
  const reason = String(input?.reason ?? '').trim();
  if (!employeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  if (!DATE_RE.test(date)) throw badRequest('date must be YYYY-MM-DD', 'INVALID_DATE');
  if (!CHANGE_TYPES.includes(changeType) || changeType === 'RECONCILIATION') {
    throw badRequest('Unsupported changeType', 'INVALID_CHANGE_TYPE');
  }
  if (!reason || reason.length > MAX_REASON) throw badRequest('A reason (1-2000 chars) is required', 'REASON_REQUIRED');
  if (ctx.role === 'EMPLOYEE') {
    throw new HttpError(403, 'Employees must submit a change request instead of editing the plan');
  }
  await assertEmployeeInScope(sql, ctx, employeeId);
  const areaId = await loadEmployeeArea(sql, ctx, employeeId);
  if (!can(actorFromContext(ctx), ACTIONS.EDIT_SHIFT, { employeeId, areaId })) {
    throw new HttpError(403, 'Not allowed to change this employee calendar');
  }

  const afterRows = (Array.isArray(input?.after) ? input.after : []).map(normalizeChangeRow);
  if (changeType === 'CANCEL_SHIFT' && afterRows.length > 0) throw badRequest('CANCEL_SHIFT cannot add rows', 'INVALID_CHANGE');
  if (changeType !== 'CANCEL_SHIFT' && afterRows.length === 0) throw badRequest('The change needs at least one resulting row', 'INVALID_CHANGE');

  const dayRows = await loadDayRows(sql, ctx, employeeId, date);
  const effectiveRows = dayRows.filter((row) => row.effective_state === 'EFFECTIVE'
    && classifyKind(normalizeCalendarRow(row)).kind !== 'LEGACY_DUTY_ROLE');
  const requestedIds = new Set((Array.isArray(input?.supersedeShiftIds) ? input.supersedeShiftIds : []).map(String));
  let supersededRows;
  if (changeType === 'REPLACE_DAY') {
    supersededRows = effectiveRows;
  } else if (REPLACING_TYPES.has(changeType)) {
    supersededRows = effectiveRows.filter((row) => requestedIds.has(row.id));
    if (supersededRows.length === 0 || supersededRows.length !== requestedIds.size) {
      throw badRequest('supersedeShiftIds must reference current effective rows of that day', 'SHIFT_NOT_EFFECTIVE');
    }
  } else {
    supersededRows = [];
  }

  const supersededIds = new Set(supersededRows.map((row) => row.id));
  const remaining = dayRows.filter((row) => row.effective_state === 'EFFECTIVE' && !supersededIds.has(row.id));
  const candidate = [
    ...remaining.map((row) => normalizeCalendarRow(row)),
    ...afterRows.map((row) => ({ date, ...row })),
  ];
  const resolved = resolveDay(date, candidate);
  const blocking = resolved.issues.filter((issue) => issue.blocking);
  if (blocking.length > 0) {
    const error = new HttpError(422, 'The resulting effective day would be inconsistent');
    error.code = blocking[0].code;
    throw error;
  }

  const changeId = randomUUID();
  const selfChange = Boolean(ctx.employeeId && ctx.employeeId === employeeId);
  const beforeState = snapshotRows(effectiveRows);
  const newIds = afterRows.map(() => randomUUID());
  const afterState = [
    ...snapshotRows(remaining.filter((row) => classifyKind(normalizeCalendarRow(row)).kind !== 'LEGACY_DUTY_ROLE')),
    ...afterRows.map((row, index) => ({
      id: newIds[index], shiftType: row.shiftType, startTime: row.startTime, endTime: row.endTime,
      layer: 'CHANGE', provenance: PROVENANCE.MANUAL_ADMIN_CHANGE,
    })),
  ];
  const originalShiftId = supersededRows[0]?.id ?? null;

  await sql.transaction((txn) => [
    txn`
      INSERT INTO calendar_changes (
        id, organization_id, employee_id, date, change_type, actor_user_id, actor_role,
        self_change, source, reason, before_state, after_state, approval_status, original_shift_id
      ) VALUES (
        ${changeId}, ${ctx.organizationId}, ${employeeId}, ${date}, ${changeType}, ${ctx.user.id}, ${ctx.role},
        ${selfChange}, ${PROVENANCE.MANUAL_ADMIN_CHANGE}, ${reason},
        ${JSON.stringify(beforeState)}::jsonb, ${JSON.stringify(afterState)}::jsonb, 'APPLIED', ${originalShiftId}
      )
    `,
    ...supersededRows.map((row) => txn`
      UPDATE shifts SET effective_state = 'SUPERSEDED', superseded_at = NOW(), updated_at = NOW()
      WHERE id = ${row.id} AND organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
    `),
    ...afterRows.map((row, index) => txn`
      INSERT INTO shifts (
        id, organization_id, employee_id, area_id, date, start_time, end_time, location, origin,
        shift_type, counts_as_work, layer, provenance, duty_role, effective_state, change_id, updated_at
      ) VALUES (
        ${newIds[index]}, ${ctx.organizationId}, ${employeeId}, ${areaId}, ${date}, ${row.startTime}, ${row.endTime},
        ${row.shiftType}, 'MAN', ${row.shiftType}, ${row.countsAsWork}, 'CHANGE', ${PROVENANCE.MANUAL_ADMIN_CHANGE},
        ${row.dutyRole}, 'EFFECTIVE', ${changeId}, NOW()
      )
    `),
  ]);

  await recordAuditEvent(sql, ctx, {
    eventType: 'CALENDAR_CHANGE_APPLIED',
    targetType: 'EMPLOYEE',
    targetId: employeeId,
    metadata: { changeId, date, changeType, selfChange, actorRole: ctx.role },
  });
  return { changeId, date, employeeId, changeType, selfChange, actorRole: ctx.role, before: beforeState, after: afterState };
}

/**
 * Explicit resolution of a REQUIRES_REVIEW day: the administrator names the
 * rows that remain effective; every other pending/effective row of the day is
 * superseded (kept for audit). Recorded as a RECONCILIATION change.
 */
export async function reconcileCalendarDay(sql, ctx, input) {
  const employeeId = String(input?.employeeId ?? '').trim();
  const date = String(input?.date ?? '').trim();
  const reason = String(input?.reason ?? '').trim();
  if (!employeeId || !DATE_RE.test(date)) throw badRequest('employeeId and date are required', 'INVALID_INPUT');
  if (!reason || reason.length > MAX_REASON) throw badRequest('A reason (1-2000 chars) is required', 'REASON_REQUIRED');
  if (ctx.role === 'EMPLOYEE') throw new HttpError(403, 'Only administrators can reconcile days');
  await assertEmployeeInScope(sql, ctx, employeeId);
  const areaId = await loadEmployeeArea(sql, ctx, employeeId);
  if (!can(actorFromContext(ctx), ACTIONS.EDIT_SHIFT, { employeeId, areaId })) {
    throw new HttpError(403, 'Not allowed to reconcile this employee calendar');
  }
  const keepIds = new Set((Array.isArray(input?.keepShiftIds) ? input.keepShiftIds : []).map(String));
  const dayRows = await loadDayRows(sql, ctx, employeeId, date);
  const pending = dayRows.filter((row) => row.effective_state === 'REQUIRES_REVIEW');
  if (pending.length === 0) throw badRequest('The day has nothing to reconcile', 'NOTHING_TO_RECONCILE');
  const candidates = dayRows.filter((row) => ['EFFECTIVE', 'REQUIRES_REVIEW'].includes(row.effective_state));
  const unknown = [...keepIds].filter((id) => !candidates.some((row) => row.id === id));
  if (unknown.length) throw badRequest('keepShiftIds must reference rows pending on that day', 'SHIFT_NOT_PENDING');

  // Legacy JT rows are the Jefe-de-Turno duty + interval; they are preserved
  // as METADATA_ONLY (still counted via the interval union), never dropped.
  const isDuty = (row) => classifyKind(normalizeCalendarRow(row)).kind === 'LEGACY_DUTY_ROLE';
  const dutyRows = candidates.filter(isDuty);
  const decidable = candidates.filter((row) => !isDuty(row));
  const kept = decidable.filter((row) => keepIds.has(row.id));
  const dropped = decidable.filter((row) => !keepIds.has(row.id));
  const resolved = resolveDay(date, [...kept, ...dutyRows].map((row) => ({ ...normalizeCalendarRow(row), effectiveState: 'EFFECTIVE' })));
  const blocking = resolved.issues.filter((issue) => issue.blocking);
  if (blocking.length) {
    const error = new HttpError(422, 'The chosen resolution would still be inconsistent');
    error.code = blocking[0].code;
    throw error;
  }

  const changeId = randomUUID();
  const selfChange = Boolean(ctx.employeeId && ctx.employeeId === employeeId);
  await sql.transaction((txn) => [
    txn`
      INSERT INTO calendar_changes (
        id, organization_id, employee_id, date, change_type, actor_user_id, actor_role,
        self_change, source, reason, before_state, after_state, approval_status
      ) VALUES (
        ${changeId}, ${ctx.organizationId}, ${employeeId}, ${date}, 'RECONCILIATION', ${ctx.user.id}, ${ctx.role},
        ${selfChange}, ${PROVENANCE.MANUAL_ADMIN_CHANGE}, ${reason},
        ${JSON.stringify(snapshotRows(candidates))}::jsonb, ${JSON.stringify(snapshotRows(kept))}::jsonb, 'APPLIED'
      )
    `,
    ...kept.map((row) => txn`
      UPDATE shifts SET effective_state = 'EFFECTIVE', superseded_at = NULL, change_id = ${changeId}, updated_at = NOW()
      WHERE id = ${row.id} AND organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
    `),
    ...dropped.map((row) => txn`
      UPDATE shifts SET effective_state = 'SUPERSEDED', superseded_at = NOW(), change_id = ${changeId}, updated_at = NOW()
      WHERE id = ${row.id} AND organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
    `),
    ...dutyRows.map((row) => txn`
      UPDATE shifts SET effective_state = 'METADATA_ONLY', duty_role = 'shift_lead', change_id = ${changeId}, updated_at = NOW()
      WHERE id = ${row.id} AND organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
    `),
  ]);
  await recordAuditEvent(sql, ctx, {
    eventType: 'CALENDAR_DAY_RECONCILED',
    targetType: 'EMPLOYEE',
    targetId: employeeId,
    metadata: { changeId, date, selfChange, kept: kept.length, dropped: dropped.length },
  });
  return { changeId, date, employeeId, kept: kept.length, dropped: dropped.length };
}

/** Full provenance of one day: every row ever recorded plus the change trail. */
export async function getDayHistory(sql, ctx, employeeId, date) {
  const targetEmployeeId = ctx.role === 'EMPLOYEE' ? ctx.employeeId : employeeId;
  if (!targetEmployeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  if (!DATE_RE.test(String(date ?? ''))) throw badRequest('date must be YYYY-MM-DD', 'INVALID_DATE');
  await assertEmployeeInScope(sql, ctx, targetEmployeeId);
  const rows = await loadDayRows(sql, ctx, targetEmployeeId, date);
  const changes = await sql`
    SELECT c.id, c.change_type, c.actor_role, c.self_change, c.source, c.reason,
           c.before_state, c.after_state, c.approval_status, c.created_at,
           c.actor_user_id, u.display_name AS actor_name
    FROM calendar_changes c
    LEFT JOIN users u ON u.id = c.actor_user_id
    WHERE c.organization_id = ${ctx.organizationId} AND c.employee_id = ${targetEmployeeId} AND c.date = ${date}
    ORDER BY c.created_at ASC
  `;
  const mappedChanges = changes.map((change) => ({
    id: change.id,
    changeType: change.change_type,
    actorRole: change.actor_role,
    actorUserId: change.actor_user_id,
    actorName: change.actor_name ?? null,
    selfChange: change.self_change,
    source: change.source,
    reason: change.reason,
    before: change.before_state,
    after: change.after_state,
    approvalStatus: change.approval_status,
    createdAt: change.created_at,
  }));
  return {
    employeeId: targetEmployeeId,
    date,
    rows: rows.map(mapShiftRow),
    changes: mappedChanges,
    provenance: buildDayProvenance(rows, mappedChanges),
  };
}

/** Server-side effective statistics + contract evaluation for one year. */
export async function getEffectiveStats(sql, ctx, employeeId, year, { today = getOperationalDate(), month = null } = {}) {
  const targetEmployeeId = ctx.role === 'EMPLOYEE' ? ctx.employeeId : employeeId;
  if (!targetEmployeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) throw badRequest('year is invalid', 'INVALID_YEAR');
  await assertEmployeeInScope(sql, ctx, targetEmployeeId);
  const from = `${numericYear}-01-01`;
  const to = `${numericYear}-12-31`;
  const rows = await sql`
    SELECT id, TO_CHAR(date, 'YYYY-MM-DD') AS date, start_time, end_time, shift_type, location,
           counts_as_work, layer, provenance, legacy_origin, duty_role, effective_state, plan_revision,
           created_at, import_id, change_id
    FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND date BETWEEN ${from} AND ${to}
      AND (effective_state IN ('EFFECTIVE', 'REQUIRES_REVIEW')
           OR (effective_state = 'METADATA_ONLY' AND shift_type = 'JT'))
      AND (schedule_version_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM schedule_versions current_version
        JOIN schedule_versions newer
          ON newer.schedule_id = current_version.schedule_id
         AND newer.version_number > current_version.version_number
         AND newer.status IN ('PUBLISHED', 'LOCKED', 'COMPLETED')
        JOIN shift_assignments newer_assignment
          ON newer_assignment.schedule_version_id = newer.id
         AND newer_assignment.employee_id = shifts.employee_id
         AND newer_assignment.date = shifts.date
        WHERE current_version.id = shifts.schedule_version_id
      ))
    ORDER BY date ASC, start_time ASC NULLS FIRST, id ASC
  `;
  const auditChanges = await sql`
    SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, after_state, created_at
    FROM calendar_changes
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND date BETWEEN ${from} AND ${to}
    ORDER BY created_at ASC
  `;
  const rowsWithAudit = attachAuditCurrentEvidence(rows, auditChanges);
  const stats = computeEffectiveStats(rowsWithAudit, { from, to, today });
  const monthNumber = month === undefined || month === null || month === '' ? null : Number(month);
  if (monthNumber !== null && (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12)) {
    throw badRequest('month is invalid', 'INVALID_MONTH');
  }
  const monthPrefix = monthNumber === null ? null : `${numericYear}-${String(monthNumber).padStart(2, '0')}`;
  const monthStats = monthPrefix
    ? computeEffectiveStats(rowsWithAudit, {
      from: `${monthPrefix}-01`,
      to: `${monthPrefix}-31`,
      today,
    })
    : null;
  const targetRows = await sql`
    SELECT id, employee_id, year, minimum_annual_minutes, maximum_annual_minutes,
           notes, source, updated_at, updated_by_user_id
    FROM employee_annual_targets
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId} AND year = ${numericYear}
  `;
  const target = mapTargetRow(targetRows[0]);
  const summary = { ...stats };
  delete summary.days;
  let monthSummary = null;
  if (monthStats) {
    monthSummary = { month: monthNumber, ...monthStats };
    delete monthSummary.days;
  }
  return {
    employeeId: targetEmployeeId,
    year: numericYear,
    today,
    ...summary,
    monthStats: monthSummary,
    target,
    contract: evaluateAnnualTarget(stats.realized.effectiveMinutes, target, { calendarRows: stats.calendarRows }),
    projection: {
      realizedMinutes: stats.realized.effectiveMinutes,
      plannedMinutes: stats.planned.effectiveMinutes,
      projectedMinutes: stats.total.effectiveMinutes,
      contract: evaluateAnnualTarget(stats.total.effectiveMinutes, target, { calendarRows: stats.calendarRows }),
    },
  };
}

/**
 * Reconciliation worklist for one employee-year: every day that is (or was)
 * REQUIRES_REVIEW. PENDING = rows still awaiting review; RESOLVED = days
 * closed by a RECONCILIATION change. Read-only; resolving goes through
 * reconcileCalendarDay so audit/provenance stay in one place.
 */
export async function listReconciliationDays(sql, ctx, employeeId, year) {
  const targetEmployeeId = ctx.role === 'EMPLOYEE' ? ctx.employeeId : employeeId;
  if (!targetEmployeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) throw badRequest('year is invalid', 'INVALID_YEAR');
  await assertEmployeeInScope(sql, ctx, targetEmployeeId);
  const from = `${numericYear}-01-01`;
  const to = `${numericYear}-12-31`;
  const changes = await sql`
    SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, reason, created_at, actor_role, self_change
    FROM calendar_changes
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND change_type = 'RECONCILIATION' AND date BETWEEN ${from} AND ${to}
    ORDER BY created_at ASC
  `;
  const resolvedByDate = new Map(changes.map((change) => [change.date, change]));
  const pendingDates = new Set((await sql`
    SELECT DISTINCT TO_CHAR(date, 'YYYY-MM-DD') AS date
    FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND date BETWEEN ${from} AND ${to} AND effective_state = 'REQUIRES_REVIEW'
  `).map((row) => row.date));
  const dates = [...new Set([...pendingDates, ...resolvedByDate.keys()])].sort();
  if (!dates.length) return { employeeId: targetEmployeeId, year: numericYear, pendingCount: 0, resolvedCount: 0, items: [] };
  const rows = await sql`
    SELECT id, TO_CHAR(date, 'YYYY-MM-DD') AS date, start_time, end_time, location,
           shift_type, counts_as_work, layer, provenance, legacy_origin, duty_role,
           effective_state, plan_revision, created_at, import_id, change_id
    FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND TO_CHAR(date, 'YYYY-MM-DD') = ANY(${dates})
  `;
  const auditChanges = await sql`
    SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, after_state, created_at
    FROM calendar_changes
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND TO_CHAR(date, 'YYYY-MM-DD') = ANY(${dates})
    ORDER BY created_at ASC
  `;
  const rowsWithAudit = attachAuditCurrentEvidence(rows, auditChanges);
  const byDate = new Map(dates.map((date) => [date, []]));
  for (const row of rowsWithAudit) byDate.get(row.date)?.push(row);
  const unwrap = (date) => byDate.get(date) ?? [];
  const label = (row) => {
    const normalized = normalizeCalendarRow(row);
    return { type: classifyKind(normalized).type, startTime: normalized.startTime, endTime: normalized.endTime };
  };
  const items = dates.map((date) => {
    const provenance = buildDayProvenance(unwrap(date));
    const resolution = resolvedByDate.get(date);
    const isPending = pendingDates.has(date);
    const provisional = isPending ? resolveProvisionalReviewRows(unwrap(date)) : null;
    const effectiveRows = isPending
      ? (provisional?.counted ? provisional.rows.map(label) : [])
      : provenance.effective.map(label);
    const reasonCode = isPending ? provisional?.reason ?? 'PENDING_REVIEW' : 'PENDING_REVIEW';
    return {
      date,
      status: isPending ? 'PENDING' : 'RESOLVED',
      current: effectiveRows,
      proposed: isPending ? unwrap(date).filter((row) => row.effectiveState === 'REQUIRES_REVIEW' && !provisional?.rows.some((current) => current.id === row.id)).map(label) : [],
      reasonCode,
      resolvedAt: !isPending && resolution ? resolution.created_at : null,
      resolvedReason: !isPending && resolution ? resolution.reason : null,
      selfChange: !isPending && resolution ? Boolean(resolution.self_change) : null,
    };
  });
  return {
    employeeId: targetEmployeeId,
    year: numericYear,
    pendingCount: items.filter((item) => item.status === 'PENDING').length,
    resolvedCount: items.filter((item) => item.status === 'RESOLVED').length,
    items,
  };
}

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
import { evaluateWorktimeTarget, resolveWorktimeTargets, validateWorktimeTarget } from '../../src/lib/worktime-targets.js';
import { getOperationalDate, shiftOperationalDate } from './operational-date.js';
import { assertTimedTypeHasTimes } from './shift-compatibility.js';
import {
  applyEmployeeStatisticsPolicy,
  DEFAULT_OBJECTIVE_SHIFT_TYPES,
  employeeTargetMinutes,
} from '../../src/lib/employee-statistics.js';

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
  const dateOnly = (value, fallback) => value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? fallback).slice(0, 10);
  const periodStart = dateOnly(row.period_start, `${row.year}-01-01`);
  const year = Number(periodStart.slice(0, 4));
  const minimum = row.minimum_minutes ?? row.minimum_annual_minutes;
  const maximum = row.maximum_minutes ?? row.maximum_annual_minutes;
  const includedWorkBuckets = Array.isArray(row.included_work_buckets) && row.included_work_buckets.length
    ? row.included_work_buckets
    : Array.isArray(row.included_shift_types) && row.included_shift_types.length
      ? row.included_shift_types : DEFAULT_OBJECTIVE_SHIFT_TYPES;
  return {
    id: row.id,
    employeeId: row.employee_id,
    organizationId: row.organization_id,
    year,
    targetKind: row.target_kind ?? 'CONTRACTUAL',
    periodType: row.period_type ?? 'ANNUAL',
    periodStart,
    periodEnd: dateOnly(row.period_end, `${row.year}-12-31`),
    minimumMinutes: minimum,
    targetMinutes: row.target_minutes ?? null,
    maximumMinutes: maximum,
    effectiveFrom: dateOnly(row.effective_from ?? row.created_at, `${row.year}-01-01`),
    revision: Number(row.revision ?? 1),
    includedWorkBuckets,
    minimumAnnualMinutes: minimum,
    maximumAnnualMinutes: maximum,
    includedShiftTypes: includedWorkBuckets,
    // Derived, never stored twice.
    marginMinutes: maximum - minimum,
    notes: row.notes ?? '',
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.created_at ?? row.updated_at,
    updatedByUserId: row.created_by_user_id ?? row.updated_by_user_id ?? null,
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
    SELECT id, organization_id, employee_id, target_kind, period_type,
      TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start, TO_CHAR(period_end, 'YYYY-MM-DD') AS period_end,
      minimum_minutes, target_minutes, maximum_minutes,
      TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from, revision, source, notes,
      included_work_buckets, created_by_user_id, created_at
    FROM employee_worktime_targets
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND target_kind = 'CONTRACTUAL' AND period_type = 'ANNUAL'
    ORDER BY period_start DESC, effective_from DESC, revision DESC, created_at DESC
  `;
  const targets = rows.map(mapTargetRow);
  const today = getOperationalDate();
  const periods = [...new Set(targets.map((target) => `${target.periodStart}|${target.periodEnd}`))];
  return periods.flatMap((period) => {
    const [periodStart, periodEnd] = period.split('|');
    const asOf = today < periodStart ? periodStart : today > periodEnd ? periodEnd : today;
    return resolveWorktimeTargets(targets, { asOf, employeeId: targetEmployeeId })
      .filter((target) => target.targetKind === 'CONTRACTUAL' && target.periodType === 'ANNUAL'
        && target.periodStart === periodStart && target.periodEnd === periodEnd);
  }).sort((a, b) => b.year - a.year);
}

function assertMinutes(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ANNUAL_MINUTES) {
    throw badRequest(`${label} must be an integer number of minutes between 0 and ${MAX_ANNUAL_MINUTES}`, 'INVALID_ANNUAL_TARGET');
  }
}

/** Adds one immutable worktime target revision. OWNER/ADMIN only, tenant scoped and audited. */
export async function createWorktimeTargetVersion(sql, ctx, input) {
  if (!can(actorFromContext(ctx), ACTIONS.MANAGE_ANNUAL_TARGET, {})) {
    throw new HttpError(403, 'Only an owner or administrator can configure worktime targets');
  }
  const employeeId = String(input?.employeeId ?? '').trim();
  if (!employeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  let target;
  try {
    target = validateWorktimeTarget({
      ...input,
      targetKind: input?.targetKind ?? 'CONTRACTUAL',
      periodType: input?.periodType ?? 'ANNUAL',
      periodStart: input?.periodStart ?? `${Number(input?.year)}-01-01`,
      periodEnd: input?.periodEnd ?? `${Number(input?.year)}-12-31`,
      effectiveFrom: input?.effectiveFrom ?? getOperationalDate(),
      minimumMinutes: input?.minimumMinutes ?? input?.minimumAnnualMinutes,
      maximumMinutes: input?.maximumMinutes ?? input?.maximumAnnualMinutes,
      targetMinutes: input?.targetMinutes,
      includedWorkBuckets: input?.includedWorkBuckets ?? input?.includedShiftTypes ?? DEFAULT_OBJECTIVE_SHIFT_TYPES,
    });
  } catch (error) {
    throw badRequest(error.message, 'INVALID_WORKTIME_TARGET');
  }
  if (Number(target.periodStart.slice(0, 4)) < 2000 || Number(target.periodStart.slice(0, 4)) > 2200) {
    throw badRequest('period year is invalid', 'INVALID_WORKTIME_TARGET');
  }
  const notes = String(input?.notes ?? '').trim().slice(0, 2000);
  await assertEmployeeInScope(sql, ctx, employeeId);
  const lockKey = `${ctx.organizationId}:${employeeId}:${target.targetKind}`;
  const savedRows = await sql`
    WITH lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    ),
    conflicts AS MATERIALIZED (
      SELECT id, minimum_minutes, target_minutes, maximum_minutes, effective_from, revision
      FROM employee_worktime_targets, lock
      WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
        AND target_kind = ${target.targetKind}
        AND daterange(period_start, period_end, '[]') && daterange(${target.periodStart}::date, ${target.periodEnd}::date, '[]')
        AND (period_start, period_end) <> (${target.periodStart}::date, ${target.periodEnd}::date)
      LIMIT 1
    ),
    previous AS MATERIALIZED (
      SELECT id, minimum_minutes, target_minutes, maximum_minutes, effective_from, revision
      FROM employee_worktime_targets, lock
      WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
        AND target_kind = ${target.targetKind} AND period_start = ${target.periodStart}::date AND period_end = ${target.periodEnd}::date
      ORDER BY revision DESC, effective_from DESC, created_at DESC LIMIT 1
    ),
    next_revision AS MATERIALIZED (
      SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM employee_worktime_targets, lock
      WHERE organization_id = ${ctx.organizationId} AND employee_id = ${employeeId}
        AND target_kind = ${target.targetKind} AND period_start = ${target.periodStart}::date AND period_end = ${target.periodEnd}::date
    ),
    inserted AS (
      INSERT INTO employee_worktime_targets (
        organization_id, employee_id, target_kind, period_type, period_start, period_end,
        minimum_minutes, target_minutes, maximum_minutes, effective_from, revision, source,
        notes, included_work_buckets, created_by_user_id
      )
      SELECT ${ctx.organizationId}, ${employeeId}, ${target.targetKind}, ${target.periodType},
        ${target.periodStart}::date, ${target.periodEnd}::date, ${target.minimumMinutes}, ${target.targetMinutes},
        ${target.maximumMinutes}, ${target.effectiveFrom}::date, next_revision.revision, 'ADMIN_UI', ${notes},
        ${target.includedWorkBuckets}::text[], ${ctx.user.id}
      FROM next_revision, lock WHERE NOT EXISTS (SELECT 1 FROM conflicts)
      RETURNING *
    )
    SELECT inserted.*, (SELECT id FROM previous) AS previous_version_id,
           (SELECT minimum_minutes FROM previous) AS previous_minimum_minutes,
           (SELECT target_minutes FROM previous) AS previous_target_minutes,
           (SELECT maximum_minutes FROM previous) AS previous_maximum_minutes,
           (SELECT effective_from FROM previous) AS previous_effective_from,
           (SELECT revision FROM previous) AS previous_revision,
           EXISTS (SELECT 1 FROM conflicts) AS conflicting_series
    FROM (SELECT 1) AS anchor LEFT JOIN inserted ON TRUE
  `;
  const saved = savedRows[0];
  if (saved?.conflicting_series) throw badRequest('This target overlaps another series of the same kind', 'OVERLAPPING_WORKTIME_TARGET');
  if (!saved?.id) throw new HttpError(409, 'A concurrent target version could not be assigned safely');
  const savedTarget = mapTargetRow(saved);
  await recordAuditEvent(sql, ctx, {
    eventType: 'EMPLOYEE_WORKTIME_TARGET_VERSION_CREATED',
    targetType: 'EMPLOYEE',
    targetId: employeeId,
    metadata: {
      targetId: savedTarget.id,
      kind: savedTarget.targetKind,
      period: { type: savedTarget.periodType, start: savedTarget.periodStart, end: savedTarget.periodEnd },
      effectiveFrom: savedTarget.effectiveFrom,
      revision: savedTarget.revision,
      previousVersionId: saved.previous_version_id ?? null,
      before: saved.previous_version_id ? {
        minimumMinutes: saved.previous_minimum_minutes,
        targetMinutes: saved.previous_target_minutes,
        maximumMinutes: saved.previous_maximum_minutes,
        effectiveFrom: saved.previous_effective_from,
        revision: saved.previous_revision,
      } : null,
      after: { minimumMinutes: savedTarget.minimumMinutes, targetMinutes: savedTarget.targetMinutes,
        maximumMinutes: savedTarget.maximumMinutes, includedWorkBuckets: savedTarget.includedWorkBuckets },
    },
  });
  return savedTarget;
}

/** Compatibility adapter: annual target writes append a revision in the new authority. */
export async function setAnnualTarget(sql, ctx, input) {
  const year = Number(input?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw badRequest('year is invalid', 'INVALID_YEAR');
  return createWorktimeTargetVersion(sql, ctx, {
    ...input,
    targetKind: 'CONTRACTUAL', periodType: 'ANNUAL',
    periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`,
    minimumMinutes: input?.minimumAnnualMinutes, maximumMinutes: input?.maximumAnnualMinutes,
    includedWorkBuckets: input?.includedShiftTypes ?? DEFAULT_OBJECTIVE_SHIFT_TYPES,
  });
}

export async function listWorktimeTargets(sql, ctx, employeeId, { asOf = getOperationalDate(), history = true } = {}) {
  const targetEmployeeId = ctx.role === 'EMPLOYEE' ? ctx.employeeId : employeeId;
  if (!targetEmployeeId) throw badRequest('employeeId is required', 'EMPLOYEE_REQUIRED');
  await assertEmployeeInScope(sql, ctx, targetEmployeeId);
  const areaId = await loadEmployeeArea(sql, ctx, targetEmployeeId);
  if (!can(actorFromContext(ctx), ACTIONS.VIEW_ANNUAL_TARGET, { employeeId: targetEmployeeId, areaId })) {
    throw new HttpError(403, 'Not allowed to view worktime targets for this employee');
  }
  const rows = await sql`
    SELECT id, organization_id, employee_id, target_kind, period_type,
      TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start, TO_CHAR(period_end, 'YYYY-MM-DD') AS period_end,
      minimum_minutes, target_minutes, maximum_minutes,
      TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from, revision, source, notes,
      included_work_buckets, created_by_user_id, created_at
    FROM employee_worktime_targets
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
    ORDER BY period_start DESC, target_kind, effective_from DESC, revision DESC, created_at DESC
  `;
  const targets = rows.map(mapTargetRow);
  if (history) return targets;
  const active = resolveWorktimeTargets(targets, { asOf, employeeId: targetEmployeeId });
  return active;
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
  const targetRows = await sql`
    SELECT id, organization_id, employee_id, target_kind, period_type,
      TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start, TO_CHAR(period_end, 'YYYY-MM-DD') AS period_end,
      minimum_minutes, target_minutes, maximum_minutes, TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from,
      revision, source, notes, included_work_buckets, created_by_user_id, created_at
    FROM employee_worktime_targets
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
    ORDER BY period_start DESC, effective_from DESC, revision DESC, created_at DESC
  `;
  const allTargets = targetRows.map(mapTargetRow);
  const yearStart = `${numericYear}-01-01`;
  const yearEnd = `${numericYear}-12-31`;
  const asOfInYear = today < yearStart ? yearStart : today > yearEnd ? yearEnd : today;
  const yearTargets = resolveWorktimeTargets(allTargets, { asOf: asOfInYear, employeeId: targetEmployeeId });
  const target = yearTargets.find((item) => item.targetKind === 'CONTRACTUAL'
    && item.periodType === 'ANNUAL' && item.periodStart === yearStart && item.periodEnd === yearEnd) ?? null;
  const activeOperationalTarget = resolveWorktimeTargets(allTargets, { asOf: today, employeeId: targetEmployeeId })
    .find((item) => item.targetKind === 'OPERATIONAL') ?? null;
  const from = `${numericYear}-01-01`;
  const to = `${numericYear}-12-31`;
  const dataFrom = activeOperationalTarget && activeOperationalTarget.periodStart < from ? activeOperationalTarget.periodStart : from;
  const dataTo = activeOperationalTarget && activeOperationalTarget.periodEnd > to ? activeOperationalTarget.periodEnd : to;
  const rows = await sql`
    SELECT id, TO_CHAR(date, 'YYYY-MM-DD') AS date, start_time, end_time, shift_type, location,
           counts_as_work, layer, provenance, legacy_origin, duty_role, effective_state, plan_revision,
           created_at, import_id, change_id
    FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${targetEmployeeId}
      AND date BETWEEN ${dataFrom} AND ${dataTo}
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
      AND date BETWEEN ${dataFrom} AND ${dataTo}
    ORDER BY created_at ASC
  `;
  const rowsWithAudit = attachAuditCurrentEvidence(rows, auditChanges);
  const rawStats = computeEffectiveStats(rowsWithAudit, { from, to, today });
  const stats = {
    ...rawStats,
    total: applyEmployeeStatisticsPolicy(rawStats.total, target?.includedShiftTypes),
    realized: applyEmployeeStatisticsPolicy(rawStats.realized, target?.includedShiftTypes),
    planned: applyEmployeeStatisticsPolicy(rawStats.planned, target?.includedShiftTypes),
  };
  const monthNumber = month === undefined || month === null || month === '' ? null : Number(month);
  if (monthNumber !== null && (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12)) {
    throw badRequest('month is invalid', 'INVALID_MONTH');
  }
  const monthPrefix = monthNumber === null ? null : `${numericYear}-${String(monthNumber).padStart(2, '0')}`;
  const monthStats = monthPrefix
    ? (() => {
      const options = { from: `${monthPrefix}-01`, to: `${monthPrefix}-31` };
      const rawCurrent = computeEffectiveStats(rowsWithAudit, { ...options, today });
      const current = {
        ...rawCurrent,
        total: applyEmployeeStatisticsPolicy(rawCurrent.total, target?.includedShiftTypes),
        realized: applyEmployeeStatisticsPolicy(rawCurrent.realized, target?.includedShiftTypes),
        planned: applyEmployeeStatisticsPolicy(rawCurrent.planned, target?.includedShiftTypes),
      };
      // “Planned future (rest of month)” excludes today while realized hours
      // and annual projections keep the shared effective-calendar boundary.
      const rawFuture = computeEffectiveStats(rowsWithAudit, { ...options, today: shiftOperationalDate(today, 1) });
      const future = {
        ...rawFuture,
        total: applyEmployeeStatisticsPolicy(rawFuture.total, target?.includedShiftTypes),
        realized: applyEmployeeStatisticsPolicy(rawFuture.realized, target?.includedShiftTypes),
        planned: applyEmployeeStatisticsPolicy(rawFuture.planned, target?.includedShiftTypes),
      };
      return {
        ...current,
        planned: future.planned,
        plannedProvisionalReviewDays: future.plannedProvisionalReviewDays,
        plannedProvisionalReviewMinutes: future.plannedProvisionalReviewMinutes,
      };
    })()
    : null;
  const summary = { ...stats };
  delete summary.days;
  let monthSummary = null;
  if (monthStats) {
    monthSummary = { month: monthNumber, ...monthStats };
    delete monthSummary.days;
  }
  const rawSummary = { ...rawStats };
  delete rawSummary.days;
  const creditedSummary = { ...stats };
  delete creditedSummary.days;
  return {
    employeeId: targetEmployeeId,
    year: numericYear,
    today,
    ...summary,
    monthStats: monthSummary,
    target,
    contract: evaluateAnnualTarget(employeeTargetMinutes(stats.realized, target?.includedWorkBuckets), target, { calendarRows: stats.calendarRows }),
    projection: {
      realizedMinutes: employeeTargetMinutes(stats.realized, target?.includedWorkBuckets),
      plannedMinutes: employeeTargetMinutes(stats.planned, target?.includedWorkBuckets),
      projectedMinutes: employeeTargetMinutes(stats.realized, target?.includedWorkBuckets)
        + employeeTargetMinutes(stats.planned, target?.includedWorkBuckets),
      contract: evaluateAnnualTarget(employeeTargetMinutes(stats.realized, target?.includedWorkBuckets)
        + employeeTargetMinutes(stats.planned, target?.includedWorkBuckets), target, { calendarRows: stats.calendarRows }),
    },
    primaryTarget: target,
    activeOperationalTarget,
    rawStats: rawSummary,
    creditedStats: creditedSummary,
    balance: evaluateWorktimeTarget({
      target,
      realizedMinutes: employeeTargetMinutes(stats.realized, target?.includedWorkBuckets),
      plannedMinutes: employeeTargetMinutes(stats.planned, target?.includedWorkBuckets),
      asOf: today,
      calendarRows: stats.calendarRows,
    }),
    operationalBalance: activeOperationalTarget ? (() => {
      const opRaw = computeEffectiveStats(rowsWithAudit, {
        from: activeOperationalTarget.periodStart, to: activeOperationalTarget.periodEnd, today,
      });
      return evaluateWorktimeTarget({
        target: activeOperationalTarget,
        realizedMinutes: employeeTargetMinutes(opRaw.realized, activeOperationalTarget.includedWorkBuckets),
        plannedMinutes: employeeTargetMinutes(opRaw.planned, activeOperationalTarget.includedWorkBuckets),
        asOf: today,
        calendarRows: opRaw.calendarRows,
      });
    })() : null,
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

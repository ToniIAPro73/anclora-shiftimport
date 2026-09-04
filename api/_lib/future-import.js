import { createHash, randomUUID } from 'node:crypto';
import {
  importContextFingerprint,
  mapImportRow,
  normalizeShiftInput,
} from './data.js';
import { HttpError, requireRole, resolveAccessScope } from './auth.js';
import { canUseFeature, requireFeature } from './plans.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function requestError(status, message, code) {
  const error = new HttpError(status, message);
  if (code) error.code = code;
  return error;
}

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function classifyImportDates(rawShifts, now = new Date()) {
  const cutoff = todayIso(now);
  const shifts = rawShifts.map((raw) => {
    const shift = normalizeShiftInput(raw);
    if (!ISO_DATE_RE.test(shift.date)) throw requestError(400, 'Every imported shift needs a valid ISO date');
    const temporalClass = shift.date > cutoff ? 'FUTURE' : 'HISTORICAL';
    if (temporalClass === 'FUTURE' && (!TIME_RE.test(shift.startTime) || !TIME_RE.test(shift.endTime))) {
      throw requestError(400, 'Every imported shift needs valid HH:mm times');
    }
    return { ...shift, temporalClass };
  });
  const hasHistorical = shifts.some((shift) => shift.temporalClass === 'HISTORICAL');
  const hasFuture = shifts.some((shift) => shift.temporalClass === 'FUTURE');
  return {
    classification: hasHistorical && hasFuture ? 'MIXED' : hasFuture ? 'FUTURE' : 'HISTORICAL',
    shifts,
    historical: shifts.filter((shift) => shift.temporalClass === 'HISTORICAL'),
    future: shifts.filter((shift) => shift.temporalClass === 'FUTURE'),
    cutoff,
  };
}

function mondayOf(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const day = value.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function distinct(values) {
  return [...new Set(values)].sort();
}

function importLookup(sql, {
  organizationId, employeeId, fileFingerprint, contextFingerprint,
}) {
  return sql`
    SELECT id, deleted_at
    FROM imports
    WHERE organization_id = ${organizationId}
      AND employee_id = ${employeeId}
      AND file_fingerprint = ${fileFingerprint}
      AND context_fingerprint = ${contextFingerprint}
    ORDER BY created_at ASC
    LIMIT 1
  `;
}

function assignmentIdentity(shift) {
  return [shift.employeeId, shift.date, shift.startTime, shift.endTime, shift.location].join('\u001f');
}

function semanticFingerprint(shift) {
  return createHash('sha256').update(assignmentIdentity(shift)).digest('hex');
}

function validateUuid(value, field) {
  if (!UUID_RE.test(value)) throw requestError(400, `${field} must be a valid UUID`);
}

/**
 * Confirm a FUTURE or MIXED import as one database transaction. Historical
 * imports continue through the established /api/shifts path. All reads and
 * authorization checks happen before the transaction; every mutation below
 * is a single Neon transaction, so a later constraint/error rolls back the
 * import, history rows, drafts and assignments together.
 */
export async function confirmFutureImport(sql, ctx, input = {}) {
  const rawShifts = Array.isArray(input.shifts) ? input.shifts : [];
  if (rawShifts.length === 0) throw requestError(400, 'At least one imported shift is required');
  const fileFingerprint = String(input.fileFingerprint ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fileFingerprint)) {
    throw requestError(400, 'A SHA-256 fileFingerprint is required');
  }

  const defaultEmployeeId = String(input.employeeId ?? '').trim();
  const dated = classifyImportDates(rawShifts.map((raw) => ({ ...raw, employeeId: raw.employeeId || defaultEmployeeId })));
  if (dated.classification === 'HISTORICAL') {
    throw requestError(409, 'Historical imports must use the Safe Import confirmation path', 'HISTORICAL_IMPORT_USE_SAFE_PATH');
  }

  // This is the canonical R2 capability mapping. It intentionally asks the
  // effective authorization model for the minimum PLANNER capability rather
  // than checking role === 'PLANNER'; OWNER/ADMIN behavior therefore remains
  // exactly whatever R2's requireRole contract defines.
  try {
    requireRole(ctx, 'PLANNER');
  } catch {
    throw requestError(
      403,
      'This file contains future planning data, but your account cannot create schedule drafts in this scope',
      'FUTURE_IMPORT_REQUIRES_PLANNING',
    );
  }

  const scope = resolveAccessScope(ctx);
  const requestedAreaId = String(input.areaId ?? '').trim() || null;
  if (requestedAreaId) validateUuid(requestedAreaId, 'areaId');
  if (scope.type === 'AREA' && requestedAreaId && requestedAreaId !== scope.areaId) {
    throw requestError(403, 'Future assignments are outside your assigned area', 'SCOPE_FORBIDDEN');
  }

  let areaNameSnapshot = null;
  if (requestedAreaId) {
    const areaRows = await sql`
      SELECT id, name FROM areas
      WHERE id = ${requestedAreaId} AND organization_id = ${ctx.organizationId} AND active = TRUE
    `;
    if (areaRows.length === 0) throw requestError(403, 'Area does not belong to the organization', 'SCOPE_FORBIDDEN');
    areaNameSnapshot = areaRows[0].name;
  }

  const employeeIds = distinct(dated.shifts.map((shift) => shift.employeeId));
  for (const employeeId of employeeIds) validateUuid(employeeId, 'employeeId');
  if (employeeIds.length === 0) throw requestError(400, 'Every imported shift needs an employeeId');

  const employees = new Map();
  for (const employeeId of employeeIds) {
    const rows = await sql`
      SELECT id, status, area_id
      FROM employees
      WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
    `;
    if (rows.length === 0) throw requestError(403, 'Employee does not belong to the organization', 'TENANT_FORBIDDEN');
    if (rows[0].status !== 'active') throw requestError(409, 'Cannot import future shifts for an employee that is not active yet', 'EMPLOYEE_NOT_ACTIVE');
    if (scope.type === 'SELF' && employeeId !== scope.employeeId) {
      throw requestError(403, 'Future assignments are outside your employee scope', 'SCOPE_FORBIDDEN');
    }
    if (scope.type === 'AREA' && rows[0].area_id !== scope.areaId) {
      throw requestError(403, 'Future assignments are outside your assigned area', 'SCOPE_FORBIDDEN');
    }
    if (requestedAreaId && rows[0].area_id !== requestedAreaId) {
      throw requestError(403, 'The import contains an employee outside its selected area', 'SCOPE_FORBIDDEN');
    }
    employees.set(employeeId, rows[0]);
  }

  if (employeeIds.length > 1 && !canUseFeature(ctx.plan, 'multiEmployeeImport')) {
    requireFeature(ctx.plan, 'multiEmployeeImport', 'This plan cannot import future shifts for multiple employees');
  }

  const normalized = dated.shifts.map((shift) => ({
    ...shift,
    employeeId: shift.employeeId,
    areaId: requestedAreaId ?? employees.get(shift.employeeId)?.area_id ?? null,
  }));
  const future = normalized.filter((shift) => shift.temporalClass === 'FUTURE');
  const historical = normalized.filter((shift) => shift.temporalClass === 'HISTORICAL');
  const effectiveImportEmployeeId = employeeIds[0];
  const importMode = input.importMode === 'team' ? 'team' : 'individual';
  const periodKind = input.periodKind === 'multi' ? 'multi' : 'single';
  const contextFingerprint = importContextFingerprint({
    sourceFormat: String(input.sourceFormat ?? ''),
    periodYear: input.periodYear ?? null,
    periodMonth: input.periodMonth ?? null,
    importMode,
    periodKind,
    areaId: requestedAreaId,
    employeeIds,
  });
  const existingImport = await importLookup(sql, {
    organizationId: ctx.organizationId,
    employeeId: effectiveImportEmployeeId,
    fileFingerprint,
    contextFingerprint,
  });
  if (existingImport[0]?.deleted_at) {
    throw requestError(409, 'This import was already deleted and cannot be replayed', 'IMPORT_ALREADY_DELETED');
  }

  const deleteIds = distinct((Array.isArray(input.deleteIds) ? input.deleteIds : []).map((id) => String(id ?? '').trim()).filter(Boolean));
  for (const id of deleteIds) validateUuid(id, 'deleteIds');
  if (deleteIds.length > 0) {
    const existingDeletes = await sql`
      SELECT id, date
      FROM shifts
      WHERE organization_id = ${ctx.organizationId} AND id = ANY(${deleteIds}::uuid[])
    `;
    if (existingDeletes.some((row) => String(row.date).slice(0, 10) > dated.cutoff)) {
      throw requestError(409, 'Future historical rows cannot be deleted through import confirmation', 'FUTURE_DELETE_FORBIDDEN');
    }
  }

  const groups = new Map();
  for (const shift of future) {
    const periodStart = mondayOf(shift.date);
    const key = `${periodStart}:${shift.areaId ?? 'global'}`;
    if (!groups.has(key)) groups.set(key, { periodStart, areaId: shift.areaId ?? null, shifts: [] });
    groups.get(key).shifts.push(shift);
  }

  const importInput = {
    organizationId: ctx.organizationId,
    employeeId: effectiveImportEmployeeId,
    fileName: String(input.fileName ?? ''),
    sourceFormat: String(input.sourceFormat ?? ''),
    periodYear: input.periodYear ?? null,
    periodMonth: input.periodMonth ?? null,
    importMode,
    periodKind,
    periodLabel: String(input.periodLabel ?? '').trim(),
    scopeType: requestedAreaId ? 'area' : 'global',
    areaNameSnapshot,
    employeeCount: employeeIds.length,
    shiftCount: normalized.length,
    fileFingerprint,
    contextFingerprint,
  };
  const importId = randomUUID();
  const groupList = [...groups.values()];
  const scheduleIds = new Map();
  for (const group of groupList) {
    scheduleIds.set(`${group.periodStart}:${group.areaId ?? 'global'}`, {
      scheduleId: randomUUID(),
      versionId: randomUUID(),
    });
  }

  const labels = [];
  const queries = [];
  labels.push('import');
  queries.push((txn) => txn`
    WITH inserted AS (
      INSERT INTO imports (
        id, organization_id, imported_by_user_id, employee_id, file_name, source_format,
        period_year, period_month, status, area_id, import_mode, period_kind,
        period_label, scope_type, area_name_snapshot, employee_count, shift_count,
        created_shift_count, existing_shift_count, file_fingerprint, context_fingerprint
      ) VALUES (
        ${importId}, ${importInput.organizationId}, ${ctx.user.id}, ${importInput.employeeId},
        ${importInput.fileName}, ${importInput.sourceFormat}, ${importInput.periodYear},
        ${importInput.periodMonth}, 'completed', ${requestedAreaId}, ${importInput.importMode},
        ${importInput.periodKind}, ${importInput.periodLabel}, ${importInput.scopeType},
        ${importInput.areaNameSnapshot}, ${importInput.employeeCount}, ${importInput.shiftCount},
        0, 0, ${importInput.fileFingerprint}, ${importInput.contextFingerprint}
      )
      ON CONFLICT (organization_id, employee_id, file_fingerprint, context_fingerprint)
      WHERE employee_id IS NOT NULL AND file_fingerprint IS NOT NULL AND context_fingerprint IS NOT NULL
      DO NOTHING
      RETURNING id, TRUE AS inserted
    )
    SELECT id, inserted FROM inserted
    UNION ALL
    SELECT id, FALSE FROM imports
    WHERE organization_id = ${importInput.organizationId}
      AND employee_id = ${importInput.employeeId}
      AND file_fingerprint = ${importInput.fileFingerprint}
      AND context_fingerprint = ${importInput.contextFingerprint}
      AND NOT EXISTS (SELECT 1 FROM inserted)
    ORDER BY inserted DESC
    LIMIT 1
  `);

  for (const group of groupList) {
    const ids = scheduleIds.get(`${group.periodStart}:${group.areaId ?? 'global'}`);
    labels.push(`schedule-create:${group.periodStart}:${group.areaId ?? 'global'}`);
    queries.push((txn) => txn`
      INSERT INTO schedules (id, organization_id, area_id, period_start, period_end, created_by_user_id)
      VALUES (${ids.scheduleId}, ${ctx.organizationId}, ${group.areaId}, ${group.periodStart}, ${addDays(group.periodStart, 6)}, ${ctx.user.id})
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    labels.push(`schedule-draft:${group.periodStart}:${group.areaId ?? 'global'}`);
    queries.push((txn) => txn`
      WITH target_schedule AS MATERIALIZED (
        SELECT s.id, s.area_id
        FROM schedules s
        WHERE s.organization_id = ${ctx.organizationId}
          AND s.area_id IS NOT DISTINCT FROM ${group.areaId}
          AND s.period_start = ${group.periodStart}
        FOR UPDATE
      ), existing_draft AS MATERIALIZED (
        SELECT sv.id, sv.schedule_id, sv.version_number
        FROM schedule_versions sv
        JOIN target_schedule ts ON ts.id = sv.schedule_id
        WHERE sv.status = 'DRAFT'
        LIMIT 1
      ), created_draft AS (
        INSERT INTO schedule_versions (id, schedule_id, version_number, status, created_by_user_id)
        SELECT ${ids.versionId}, ts.id,
               COALESCE((SELECT MAX(version_number) FROM schedule_versions WHERE schedule_id = ts.id), 0) + 1,
               'DRAFT', ${ctx.user.id}
        FROM target_schedule ts
        WHERE NOT EXISTS (SELECT 1 FROM existing_draft)
        ON CONFLICT DO NOTHING
        RETURNING id, schedule_id, version_number
      )
      SELECT ts.id AS schedule_id,
             COALESCE(cd.id, ed.id) AS version_id,
             COALESCE(cd.version_number, ed.version_number) AS version_number,
             (cd.id IS NOT NULL) AS created
      FROM target_schedule ts
      LEFT JOIN existing_draft ed ON ed.schedule_id = ts.id
      LEFT JOIN created_draft cd ON cd.schedule_id = ts.id
    `);
  }

  const importIdSql = {
    organizationId: importInput.organizationId,
    employeeId: importInput.employeeId,
    fileFingerprint: importInput.fileFingerprint,
    contextFingerprint: importInput.contextFingerprint,
  };
  for (const shift of historical) {
    const id = UUID_RE.test(shift.id ?? '') ? shift.id : randomUUID();
    labels.push(`historical:${assignmentIdentity(shift)}`);
    queries.push((txn) => txn`
      INSERT INTO shifts (
        id, organization_id, employee_id, import_id, area_id, date,
        start_time, end_time, location, origin, semantic_fingerprint, updated_at
      )
      SELECT ${id}, ${ctx.organizationId}, ${shift.employeeId},
             (SELECT id FROM imports WHERE organization_id = ${importIdSql.organizationId}
               AND employee_id = ${importIdSql.employeeId}
               AND file_fingerprint = ${importIdSql.fileFingerprint}
               AND context_fingerprint = ${importIdSql.contextFingerprint}
               ORDER BY created_at ASC LIMIT 1),
             ${shift.areaId}, ${shift.date}, ${shift.startTime}, ${shift.endTime}, ${shift.location}, 'IMP',
             ${semanticFingerprint(shift)}, NOW()
      ON CONFLICT (organization_id, employee_id, semantic_fingerprint)
      WHERE semantic_fingerprint IS NOT NULL
      DO UPDATE SET updated_at = NOW()
      RETURNING id
    `);
  }

  for (const id of deleteIds) {
    labels.push(`delete:${id}`);
    queries.push((txn) => txn`
      DELETE FROM shifts
      WHERE id = ${id} AND organization_id = ${ctx.organizationId} AND date <= CURRENT_DATE
      RETURNING id
    `);
  }

  for (const group of groupList) {
    const ids = scheduleIds.get(`${group.periodStart}:${group.areaId ?? 'global'}`);
    for (const shift of group.shifts) {
      labels.push(`future:${assignmentIdentity(shift)}`);
      queries.push((txn) => txn`
        INSERT INTO shift_assignments (
          schedule_version_id, import_id, employee_id, date, start_time, end_time, location, updated_at
        )
        SELECT sv.id,
               (SELECT id FROM imports WHERE organization_id = ${importIdSql.organizationId}
                 AND employee_id = ${importIdSql.employeeId}
                 AND file_fingerprint = ${importIdSql.fileFingerprint}
                 AND context_fingerprint = ${importIdSql.contextFingerprint}
                 ORDER BY created_at ASC LIMIT 1),
               ${shift.employeeId}, ${shift.date}, ${shift.startTime}::time, ${shift.endTime}::time, ${shift.location}, NOW()
        FROM schedule_versions sv
        JOIN schedules s ON s.id = sv.schedule_id
        WHERE sv.id = COALESCE(
          (SELECT id FROM schedule_versions WHERE id = ${ids.versionId} AND status = 'DRAFT'),
          (SELECT sv2.id FROM schedule_versions sv2
           JOIN schedules s2 ON s2.id = sv2.schedule_id
           WHERE s2.organization_id = ${ctx.organizationId}
             AND s2.area_id IS NOT DISTINCT FROM ${group.areaId}
             AND s2.period_start = ${group.periodStart}
             AND sv2.status = 'DRAFT'
           ORDER BY sv2.version_number ASC LIMIT 1)
        )
          AND s.organization_id = ${ctx.organizationId}
          AND sv.status = 'DRAFT'
        AND NOT EXISTS (
          SELECT 1 FROM shift_assignments existing
          WHERE existing.schedule_version_id = sv.id
            AND existing.employee_id = ${shift.employeeId}
            AND existing.date = ${shift.date}
            AND existing.start_time = ${shift.startTime}::time
            AND existing.end_time = ${shift.endTime}::time
            AND existing.location IS NOT DISTINCT FROM ${shift.location}
        )
        RETURNING id, schedule_version_id
      `);
    }
  }

  labels.push('import-metadata');
  queries.push((txn) => txn`
    UPDATE imports i
    SET employee_count = ${employeeIds.length},
        shift_count = ${normalized.length},
        created_shift_count = (
          SELECT COUNT(*)::integer FROM shifts s WHERE s.import_id = i.id
        ) + (
          SELECT COUNT(*)::integer FROM shift_assignments sa WHERE sa.import_id = i.id
        ),
        existing_shift_count = GREATEST(0, ${normalized.length} - (
          SELECT COUNT(*)::integer FROM shifts s WHERE s.import_id = i.id
        ) - (
          SELECT COUNT(*)::integer FROM shift_assignments sa WHERE sa.import_id = i.id
        )),
        updated_at = NOW()
    WHERE i.organization_id = ${ctx.organizationId}
      AND i.employee_id = ${importInput.employeeId}
      AND i.file_fingerprint = ${importInput.fileFingerprint}
      AND i.context_fingerprint = ${importInput.contextFingerprint}
    RETURNING *
  `);

  const transactionResult = await sql.transaction((txn) => queries.map((query) => query(txn)));
  const importRow = transactionResult[0]?.[0];
  if (!importRow?.id) throw requestError(500, 'Import transaction did not return an import id');
  const deduplicated = importRow.inserted === false;
  const scheduleOffset = 1;
  const draftResults = groupList.map((_, index) => transactionResult[scheduleOffset + index * 2 + 1] ?? []);
  const historicalOffset = scheduleOffset + groupList.length * 2;
  const historicalResults = transactionResult.slice(historicalOffset, historicalOffset + historical.length);
  const deleteOffset = historicalOffset + historical.length;
  const deletedCount = transactionResult.slice(deleteOffset, deleteOffset + deleteIds.length)
    .reduce((count, rows) => count + rows.length, 0);
  const futureOffset = deleteOffset + deleteIds.length;
  const futureResults = transactionResult.slice(futureOffset, futureOffset + future.length);
  const assignmentCount = futureResults.reduce((count, rows) => count + rows.length, 0);
  const createdDrafts = draftResults.filter((rows) => rows[0]?.created).length;
  const updatedImport = transactionResult[transactionResult.length - 1]?.[0];
  return {
    classification: dated.classification,
    cutoff: dated.cutoff,
    importId: importRow.id,
    deduplicated,
    historical: {
      submittedCount: historical.length,
      persistedCount: historicalResults.reduce((count, rows) => count + rows.length, 0),
      deletedCount,
    },
    future: {
      submittedCount: future.length,
      createdAssignmentCount: assignmentCount,
      existingAssignmentCount: future.length - assignmentCount,
      draftCount: groups.size,
      createdDraftCount: createdDrafts,
    drafts: draftResults.map((rows, index) => rows[0] ? { ...rows[0], group: groupList[index] } : null).filter(Boolean).map(({ schedule_id: scheduleId, version_id: scheduleVersionId, version_number: versionNumber, group }) => ({
        scheduleId,
        scheduleVersionId,
        versionNumber: Number(versionNumber),
        periodStart: group.periodStart,
        periodEnd: addDays(group.periodStart, 6),
        areaId: group.areaId,
      })),
    },
    import: updatedImport ? mapImportRow(updatedImport) : { id: importRow.id },
    transactionQueryCount: labels.length,
  };
}

import { randomUUID } from 'node:crypto';
import {
  importContextFingerprint,
  mapImportRow,
  normalizeShiftInput,
  assertShiftTimeSemantics,
} from './data.js';
import { HttpError, requireRole, resolveEffectiveAccessScope } from './auth.js';
import { canUseFeature, requireFeature } from './plans.js';
import { getOperationalDate } from './operational-date.js';
import { createNewDraftFromVersionTx } from './scheduling.js';
import { normalizeAnnotationItems } from './annotations.js';
import { assertSourceIdentifierTarget } from './employee-identifiers.js';
import { documentFingerprint, planFingerprint } from './import-fingerprints.js';
import {
  IMPORT_DECISION,
  RECONCILIATION_OUTCOME as OUTCOME,
  WRITES_TO_PLAN,
  classifyDocument,
  employeeBusinessKey,
  normalizeImportDecision,
  normalizePlanRow,
  reconcileThreeWay,
  resolveBaseline,
  sameDay,
  summarizeOutcomes,
} from '../../src/lib/company-plan.js';

/**
 * The company plan changed iff some PLAN day differs from the baseline plan (or there is no baseline yet). Days that are
 * merely awaiting a human decision (already pending, or a local override) are NOT a plan change: re-importing an
 * unchanged document must stay idempotent however many reconciliations are open.
 */
const planDiffersFromBaseline = (outcomes, hasExistingPlan) =>
  !hasExistingPlan || outcomes.some((item) => !item.evidence && (!item.baseline || !sameDay(item.baseline, item.next)));

const SOURCE_KINDS = new Set(['EMPLOYEE_CALENDAR_EXPORT', 'PUBLISHED_CALENDAR_EXPORT', 'TEAM_SCHEDULE_EXPORT', 'UNKNOWN']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function requestError(status, message, code) {
  const error = new HttpError(status, message);
  if (code) error.code = code;
  return error;
}

/**
 * Same frontier as classifyImportDates: `date >= cutoff` is FUTURE, `date < cutoff` is HISTORICAL. Dates are ISO
 * `YYYY-MM-DD` strings, so the lexical comparison is the calendar comparison.
 */
export function deleteTouchesFuture(rows, cutoff) {
  return rows.some((row) => {
    const date = String(row.date ?? '');
    if (!ISO_DATE_RE.test(date)) throw requestError(400, 'Invalid shift date in deleteIds target');
    return date >= cutoff;
  });
}

export function classifyImportDates(rawShifts, now = new Date()) {
  const cutoff = getOperationalDate(now);
  const shifts = rawShifts.map((raw) => {
    const shift = normalizeShiftInput(raw);
    if (!ISO_DATE_RE.test(shift.date)) throw requestError(400, 'Every imported shift needs a valid ISO date');
    const temporalClass = shift.date >= cutoff ? 'FUTURE' : 'HISTORICAL';
    try {
      assertShiftTimeSemantics(shift);
    } catch (error) {
      throw requestError(400, error.message, error.code);
    }
    if (temporalClass === 'FUTURE' && shift.startTime && !TIME_RE.test(shift.startTime)) {
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

function startOfSchedulingWeek(date, weekStart) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const day = value.getUTCDay();
  const offset = weekStart === 'sunday' ? -day : (day === 0 ? -6 : 1 - day);
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

const assignmentIdentity = (shift) => [shift.employeeId, shift.date, shift.shiftType ?? '', shift.countsAsWork ?? '', shift.startTime, shift.endTime, shift.location].join('\u001f');

function validateUuid(value, field) {
  if (!UUID_RE.test(value)) throw requestError(400, `${field} must be a valid UUID`);
}

const toPlanRow = (shift) => ({
  date: shift.date,
  shiftType: shift.shiftType ?? shift.location,
  startTime: shift.startTime || null,
  endTime: shift.endTime || null,
  countsAsWork: shift.countsAsWork,
  dutyRole: shift.dutyRole ?? null,
});

function fromStoredRow(stored) {
  return { date: stored.d, shiftType: stored.t, startTime: stored.s || null, endTime: stored.e || null, dutyRole: stored.duty || null };
}

function toStoredRow(row) {
  const n = normalizePlanRow(row);
  return { d: n.date, t: n.type, s: n.start, e: n.end, duty: n.duty };
}

/**
 * Everything that must be validated and resolved BEFORE any write: role, tenant, scope, employees,
 * temporal split. Shared by the read-only preview and the confirmation.
 */
async function prepareImport(sql, ctx, input, { requireDecision = true } = {}) {
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

  if (ctx.role === 'EMPLOYEE') {
    throw requestError(
      403,
      'Employees cannot create or update planning through self-import',
      'SELF_IMPORT_FUTURE_FORBIDDEN',
    );
  }

  // "publish" is the pre-rename wire value; both mean: include the future rows in the PLAN (drafts).
  const decision = normalizeImportDecision(input.futureConsent ?? input.importDecision);
  if (requireDecision && decision !== IMPORT_DECISION.HISTORICAL_AND_PLAN) {
    throw requestError(
      409,
      'Future rows need the explicit decision to create or update the planning',
      'FUTURE_IMPORT_CONSENT_REQUIRED',
    );
  }
  const weekStart = input.weekStart === 'sunday' ? 'sunday' : 'monday';

  // Canonical R2 capability mapping: ask the effective authorization model for the minimum PLANNER
  // capability instead of checking role === 'PLANNER'.
  try {
    requireRole(ctx, 'PLANNER');
  } catch {
    throw requestError(
      403,
      'This file contains future planning data, but your account cannot create or update the planning in this scope',
      'FUTURE_IMPORT_REQUIRES_PLANNING',
    );
  }

  const scope = await resolveEffectiveAccessScope(sql, ctx);
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
      SELECT id, status, area_id, external_employee_id, name
      FROM employees
      WHERE id = ${employeeId} AND organization_id = ${ctx.organizationId}
    `;
    if (rows.length === 0) throw requestError(403, 'Employee does not belong to the organization', 'TENANT_FORBIDDEN');
    if (rows[0].status !== 'active') throw requestError(409, 'Cannot import future shifts for an employee that is not active yet', 'EMPLOYEE_NOT_ACTIVE');
    if (scope.type === 'SELF' && employeeId !== scope.employeeId) {
      throw requestError(403, 'Future assignments are outside your employee scope', 'SCOPE_FORBIDDEN');
    }
    if (scope.type === 'AREAS' && !scope.areaIds.includes(rows[0].area_id)) {
      throw requestError(403, 'Future assignments are outside your assigned areas', 'SCOPE_FORBIDDEN');
    }
    if (scope.type === 'EMPLOYEES' && !scope.employeeIds.includes(employeeId)) {
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

  // SOURCE KIND is a third, independent dimension (what produced the document). An employee-calendar export is
  // effective-calendar EVIDENCE for its past dates; published calendars / team schedules / unknown sources are the PLAN.
  const importMode = input.importMode === 'team' ? 'team' : 'individual';
  const sourceKind = SOURCE_KINDS.has(input.sourceKind) ? input.sourceKind : (importMode === 'team' ? 'TEAM_SCHEDULE_EXPORT' : 'UNKNOWN');
  const normalized = dated.shifts.map((shift, index) => ({
    ...shift,
    employeeId: shift.employeeId,
    areaId: requestedAreaId ?? employees.get(shift.employeeId)?.area_id ?? null,
    employeeKey: employeeBusinessKey({ externalEmployeeId: employees.get(shift.employeeId)?.external_employee_id, name: employees.get(shift.employeeId)?.name }) ?? `uuid:${shift.employeeId}`,
    role: sourceKind === 'EMPLOYEE_CALENDAR_EXPORT' && shift.temporalClass === 'HISTORICAL' ? 'EVIDENCE' : 'PLAN',
    annotations: Array.isArray(rawShifts[index]?.annotations) ? rawShifts[index].annotations : [],
  }));
  // Informational annotations (DCF, observations) that came with the rows; validated, never interpreted as hours.
  const annotationItems = [];
  for (const shift of normalized) {
    for (const annotation of shift.annotations) annotationItems.push({ employeeId: shift.employeeId, ...annotation, date: shift.date });
  }
  // Top-level list: annotations of EVERY row of the document, including rows already in the calendar.
  for (const annotation of Array.isArray(input.annotations) ? input.annotations : []) {
    annotationItems.push({ ...annotation, employeeId: annotation.employeeId || defaultEmployeeId });
  }
  const annotationsByEmployee = new Map();
  for (const employeeId of employeeIds) {
    const own = annotationItems.filter((item) => item.employeeId === employeeId);
    if (own.length) annotationsByEmployee.set(employeeId, normalizeAnnotationItems(own));
  }

  return {
    dated, decision, weekStart, scope, requestedAreaId, areaNameSnapshot, employeeIds, employees,
    normalized, fileFingerprint, sourceKind, annotationsByEmployee,
    future: normalized.filter((shift) => shift.temporalClass === 'FUTURE'),
    historical: normalized.filter((shift) => shift.temporalClass === 'HISTORICAL'),
    importMode,
    periodKind: input.periodKind === 'multi' ? 'multi' : 'single',
  };
}

/** Baseline (previous company plan revisions), effective state and the three-way outcomes. Read-only. */
async function evaluatePlan(sql, ctx, prepared, deleteIds) {
  const { normalized, requestedAreaId, employeeIds, dated } = prepared;
  const scopeKey = requestedAreaId ?? 'global';
  const dates = normalized.map((shift) => shift.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  const revisionRows = await sql`
    SELECT revision_number, TO_CHAR(coverage_from, 'YYYY-MM-DD') AS coverage_from,
           TO_CHAR(coverage_to, 'YYYY-MM-DD') AS coverage_to, rows
    FROM company_plan_revisions
    WHERE organization_id = ${ctx.organizationId} AND scope_key = ${scopeKey} AND reverted_at IS NULL
      AND coverage_to >= ${from} AND coverage_from <= ${to}
    ORDER BY revision_number DESC
  `;
  const latest = await sql`
    SELECT COALESCE(MAX(revision_number), 0)::integer AS latest
    FROM company_plan_revisions WHERE organization_id = ${ctx.organizationId} AND scope_key = ${scopeKey}
  `;
  const revisions = revisionRows.map((revision) => ({
    revisionNumber: revision.revision_number,
    coverageFrom: revision.coverage_from,
    coverageTo: revision.coverage_to,
    rows: (Array.isArray(revision.rows) ? revision.rows : []).map((stored) => ({ employeeKey: stored.k, row: fromStoredRow(stored) })),
  }));
  const baseline = resolveBaseline(revisions, { from, to });
  const planNormalized = normalized.filter((shift) => shift.role === 'PLAN');

  // Effective = what the operation currently has: draft assignments (incl. planner edits) win over published shifts.
  const keyByEmployee = new Map(normalized.map((shift) => [shift.employeeId, shift.employeeKey]));
  const shiftRows = await sql`
    SELECT id, employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, start_time, end_time, shift_type, location, counts_as_work, duty_role, layer, provenance
    FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ANY(${employeeIds}::uuid[])
      AND date BETWEEN ${from} AND ${to} AND effective_state = 'EFFECTIVE'
      AND NOT (id = ANY(${deleteIds}::uuid[]))
  `;
  const draftRows = await sql`
    SELECT sa.employee_id, TO_CHAR(sa.date, 'YYYY-MM-DD') AS date, sa.start_time, sa.end_time, sa.shift_type, sa.location, sa.counts_as_work
    FROM shift_assignments sa
    JOIN schedule_versions sv ON sv.id = sa.schedule_version_id AND sv.status = 'DRAFT'
    JOIN schedules s ON s.id = sv.schedule_id
    WHERE s.organization_id = ${ctx.organizationId} AND sa.employee_id = ANY(${employeeIds}::uuid[])
      AND sa.date BETWEEN ${from} AND ${to}
  `;
  const effectiveByDay = new Map();
  const put = (map, employeeId, date, row) => {
    const key = `${employeeId}|${date}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  };
  const draftByDay = new Map();
  for (const row of draftRows) put(draftByDay, row.employee_id, row.date, toPlanRow({ ...row, shiftType: row.shift_type, startTime: row.start_time, endTime: row.end_time, countsAsWork: row.counts_as_work }));
  for (const row of shiftRows) put(effectiveByDay, row.employee_id, row.date, toPlanRow({ ...row, shiftType: row.shift_type, startTime: row.start_time, endTime: row.end_time, countsAsWork: row.counts_as_work, dutyRole: row.duty_role }));
  const effective = [];
  for (const [key, rows] of new Map([...effectiveByDay, ...draftByDay])) {
    const [employeeId] = key.split('|');
    for (const row of rows) effective.push({ employeeKey: keyByEmployee.get(employeeId), row });
  }

  const next = normalized.map((shift) => ({ employeeKey: shift.employeeKey, row: toPlanRow(shift), evidence: shift.role === 'EVIDENCE', annotations: shift.annotations }));
  // A day whose effective rows are ALL plain company-plan rows (no admin/employee change, no history from another
  // system) can be superseded by employee-calendar evidence without a human decision; anything else needs review.
  const planOnlyDays = new Set();
  const effectiveRowIdsByDay = new Map();
  const dayInfo = new Map();
  for (const row of shiftRows) {
    const key = `${keyByEmployee.get(row.employee_id)}\u001f${row.date}`;
    if (!dayInfo.has(key)) dayInfo.set(key, { all: true, ids: [] });
    const info = dayInfo.get(key);
    info.ids.push(row.id);
    if (!(row.layer === 'COMPANY_PLAN' && (row.provenance === null || row.provenance === 'COMPANY_IMPORT' || row.provenance === 'SCHEDULE_PUBLICATION'))) info.all = false;
  }
  for (const [key, info] of dayInfo) { if (info.all) planOnlyDays.add(key); effectiveRowIdsByDay.set(key, info.ids); }
  // Days already awaiting reconciliation are never resolved by an import.
  const pending = await sql`
    SELECT DISTINCT employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date
    FROM shifts
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ANY(${employeeIds}::uuid[])
      AND date BETWEEN ${from} AND ${to} AND effective_state = 'REQUIRES_REVIEW'
  `;
  const reviewDays = new Set(pending.map((row) => `${keyByEmployee.get(row.employee_id)}\u001f${row.date}`));
  const outcomes = reconcileThreeWay({ baseline, next, effective, today: dated.cutoff, reviewDays, planOnlyDays });
  const summary = summarizeOutcomes(outcomes);
  // PLAN rows only: employee-calendar evidence never becomes a company-plan revision.
  const nextPlanEntries = planNormalized.map((shift) => ({ employeeKey: shift.employeeKey, row: toPlanRow(shift) }));
  return {
    scopeKey, from, to, revisions, baseline, outcomes, summary, planEntryCount: nextPlanEntries.length, effectiveRowIdsByDay,
    planFrom: planNormalized.length ? planNormalized.map((shift) => shift.date).sort()[0] : null,
    planTo: planNormalized.length ? planNormalized.map((shift) => shift.date).sort().at(-1) : null,
    latestRevision: latest[0]?.latest ?? 0,
    hasExistingPlan: baseline.length > 0,
    planFingerprint: planFingerprint(nextPlanEntries),
    documentFingerprint: documentFingerprint(next, { importMode: prepared.importMode, periodKind: prepared.periodKind, periodYear: null, periodMonth: null }),
  };
}

const BASELINE_SOURCES = new Set(['PUBLISHED_CALENDAR_EXPORT', 'TEAM_SCHEDULE_EXPORT']);

/** Plain-language-ready counts for the "create the initial Plan Empresa" action (no ids, no revision numbers). */
function planBaselineSummary(evaluation, prepared) {
  const planOutcomes = evaluation.outcomes.filter((item) => !item.evidence);
  const count = (...kinds) => planOutcomes.filter((item) => kinds.includes(item.outcome)).length;
  const missing = !evaluation.hasExistingPlan;
  return {
    status: missing ? 'MISSING' : 'EXISTS',
    canCreate: missing && evaluation.planEntryCount > 0 && BASELINE_SOURCES.has(prepared.sourceKind),
    existingEquivalentRows: count(OUTCOME.UNCHANGED),
    newRows: count(OUTCOME.NEW),
    modifiedRows: count(OUTCOME.MODIFIED, OUTCOME.COMPANY_ADOPTED_LOCAL),
    reviewRows: count(OUTCOME.REQUIRES_REVIEW, OUTCOME.KEPT_LOCAL),
    sourceKind: prepared.sourceKind,
  };
}

const outcomeCounts = (summary) => ({
  new: summary.new, unchanged: summary.unchanged, modified: summary.modified,
  keptLocal: summary.keptLocal, companyAdoptedLocal: summary.companyAdoptedLocal, requiresReview: summary.requiresReview,
  evidenceApplied: summary.evidenceApplied,
});

/**
 * Read-only preview of what confirming this document would do: classification, counts and the
 * company-plan reconciliation. Performs ZERO writes.
 */
export async function previewFutureImport(sql, ctx, input = {}) {
  const prepared = await prepareImport(sql, ctx, input, { requireDecision: false });
  const deleteIds = distinct((Array.isArray(input.deleteIds) ? input.deleteIds : []).map((id) => String(id ?? '').trim()).filter(Boolean));
  for (const id of deleteIds) validateUuid(id, 'deleteIds');
  const evaluation = await evaluatePlan(sql, ctx, prepared, deleteIds);
  const document = classifyDocument({
    temporal: prepared.dated.classification, employeeCount: prepared.employeeIds.length,
    hasExistingPlan: evaluation.hasExistingPlan, rowCount: prepared.normalized.length,
  });
  const weeks = distinct(prepared.future.map((shift) => startOfSchedulingWeek(shift.date, prepared.weekStart)));
  return {
    classification: prepared.dated.classification,
    cutoff: prepared.dated.cutoff,
    document,
    historicalCount: prepared.historical.length,
    futureCount: prepared.future.length,
    employeeCount: prepared.employeeIds.length,
    // Legacy bootstrap: data already exists in the calendar but no versioned Plan Empresa was ever recorded. Only
    // company-plan sources (published calendar, team schedule) may establish the first baseline; an employee calendar never does.
    planBaseline: planBaselineSummary(evaluation, prepared),
    plan: {
      baselineRevision: evaluation.latestRevision || null,
      changes: outcomeCounts(evaluation.summary),
      wouldCreateRevision: planDiffersFromBaseline(evaluation.outcomes, evaluation.hasExistingPlan),
      weeksAffected: weeks,
    },
    autoPublish: false,
  };
}

function isUniqueViolation(error) {
  return error?.code === '23505' || /company_plan_revisions_unique|duplicate key/i.test(String(error?.message ?? ''));
}

/**
 * Confirm a FUTURE or MIXED import that includes the planning decision, as one database transaction.
 *
 * - Creates / updates the PLAN: schedule DRAFT versions + assignments. It NEVER publishes; publication is
 *   an explicit, separate Scheduling action.
 * - The company plan is a versioned baseline (company_plan_revisions): a new revision is recorded only when the
 *   plan really changed, and previous revisions are never rewritten.
 * - Rows are reconciled three-way (baseline / new plan / effective): safe rows are applied, ambiguous ones
 *   become REQUIRES_REVIEW; one discrepancy never blocks the rest of the document.
 * - Idempotency of the EFFECT: the same file with a DIFFERENT decision still applies what is pending.
 */
export async function confirmFutureImport(sql, ctx, input = {}, attempt = 0) {
  const prepared = await prepareImport(sql, ctx, input);
  const {
    dated, decision, weekStart, scope, requestedAreaId, areaNameSnapshot, employeeIds, normalized, future, historical, fileFingerprint,
    importMode, periodKind,
  } = prepared;

  const effectiveImportEmployeeId = employeeIds[0];
  if (importMode !== 'team' && input.sourceSystem && input.sourceIdentifier) {
    await assertSourceIdentifierTarget(sql, ctx, { sourceSystem: input.sourceSystem, sourceIdentifier: input.sourceIdentifier, employeeId: effectiveImportEmployeeId });
  }
  const contextFingerprint = importContextFingerprint({
    sourceFormat: String(input.sourceFormat ?? ''),
    periodYear: input.periodYear ?? null,
    periodMonth: input.periodMonth ?? null,
    importMode,
    periodKind,
    areaId: requestedAreaId,
    employeeIds,
  });
  const existingImport = (await sql`
    SELECT id, deleted_at, import_decision
    FROM imports
    WHERE organization_id = ${ctx.organizationId}
      AND employee_id = ${effectiveImportEmployeeId}
      AND file_fingerprint = ${fileFingerprint}
      AND context_fingerprint = ${contextFingerprint}
    ORDER BY created_at ASC LIMIT 1
  `)[0] ?? null;
  if (existingImport?.deleted_at) {
    throw requestError(409, 'This import was already deleted and cannot be replayed', 'IMPORT_ALREADY_DELETED');
  }

  const deleteIds = distinct((Array.isArray(input.deleteIds) ? input.deleteIds : []).map((id) => String(id ?? '').trim()).filter(Boolean));
  for (const id of deleteIds) validateUuid(id, 'deleteIds');
  if (deleteIds.length > 0) {
    // ISO text straight from PostgreSQL (never a runtime Date/stringified value), compared with the product's frontier.
    const existingDeletes = await sql`
      SELECT id, TO_CHAR(date, 'YYYY-MM-DD') AS date FROM shifts
      WHERE organization_id = ${ctx.organizationId} AND id = ANY(${deleteIds}::uuid[])
    `;
    if (deleteTouchesFuture(existingDeletes, dated.cutoff)) {
      throw requestError(409, 'Future historical rows cannot be deleted through import confirmation', 'FUTURE_DELETE_FORBIDDEN');
    }
  }

  const evaluation = await evaluatePlan(sql, ctx, prepared, deleteIds);
  const document = classifyDocument({
    temporal: dated.classification, employeeCount: employeeIds.length, hasExistingPlan: evaluation.hasExistingPlan, rowCount: normalized.length,
  });

  // --- idempotency of the EFFECT (never of the file alone) -------------------------------------------------
  const planApplied = existingImport
    ? Number((await sql`SELECT COUNT(*)::integer AS n FROM company_plan_revisions WHERE import_id = ${existingImport.id}`)[0]?.n ?? 0) > 0
      || Number((await sql`SELECT COUNT(*)::integer AS n FROM shift_assignments WHERE import_id = ${existingImport.id}`)[0]?.n ?? 0) > 0
    : false;
  // The exact same file may have been imported before with another effect (e.g. historical-only through the
  // Safe Import path, which uses a different context key): that must never block the plan decision.
  const priorSameFile = existingImport ?? (await sql`
    SELECT id, import_decision FROM imports
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${effectiveImportEmployeeId}
      AND file_fingerprint = ${fileFingerprint} AND deleted_at IS NULL AND reverted_at IS NULL
    ORDER BY created_at ASC LIMIT 1
  `)[0] ?? null;
  const sameFileDifferentDecision = Boolean(priorSameFile) && !planApplied && priorSameFile.import_decision !== IMPORT_DECISION.HISTORICAL_AND_PLAN;
  // Only PLAN rows decide whether the company plan changed (employee-calendar evidence never does).
  const planOutcomes = evaluation.outcomes.filter((item) => !item.evidence);
  const hasPlanRows = evaluation.planEntryCount > 0;
  const planChanged = hasPlanRows && planDiffersFromBaseline(planOutcomes, evaluation.hasExistingPlan);
  let duplicateKind = null;
  if (existingImport && planApplied) duplicateKind = 'DUPLICATE_FILE';
  else if (hasPlanRows && !planChanged) {
    const sameDocument = (await sql`
      SELECT 1 AS found FROM imports
      WHERE organization_id = ${ctx.organizationId} AND document_fingerprint = ${evaluation.documentFingerprint}
        AND import_decision = ${IMPORT_DECISION.HISTORICAL_AND_PLAN} AND deleted_at IS NULL AND reverted_at IS NULL LIMIT 1
    `).length > 0;
    duplicateKind = sameDocument ? 'DUPLICATE_DOCUMENT' : 'DUPLICATE_PLAN';
  }
  const createsRevision = hasPlanRows && !duplicateKind;
  const revisionNumber = createsRevision ? evaluation.latestRevision + 1 : null;

  const weeks = new Map();
  for (const shift of future) {
    const periodStart = startOfSchedulingWeek(shift.date, weekStart);
    const key = `${periodStart}:${shift.areaId ?? 'global'}`;
    if (!weeks.has(key)) weeks.set(key, { periodStart, areaId: shift.areaId ?? null });
  }

  // Which rows are written: only the safe outcomes become plan / effective rows.
  const outcomeByDay = new Map(evaluation.outcomes.map((item) => [`${item.employeeKey}\u001f${item.date}`, item.outcome]));
  const outcomeOf = (shift) => outcomeByDay.get(`${shift.employeeKey}\u001f${shift.date}`);
  const futureToDraft = duplicateKind === 'DUPLICATE_FILE' ? [] : future.filter((shift) => WRITES_TO_PLAN.has(outcomeOf(shift)));
  const replaceDays = duplicateKind === 'DUPLICATE_FILE' ? [] : evaluation.outcomes.filter((item) => item.outcome === OUTCOME.MODIFIED || item.outcome === OUTCOME.COMPANY_ADOPTED_LOCAL);
  const reviewRows = duplicateKind === 'DUPLICATE_FILE' ? [] : normalized.filter((shift) => outcomeOf(shift) === OUTCOME.REQUIRES_REVIEW);
  const historicalToWrite = duplicateKind === 'DUPLICATE_FILE' ? [] : historical.filter((shift) => outcomeOf(shift) === OUTCOME.NEW);
  // Employee-calendar evidence that contradicts a plain company-plan day: the plan rows are SUPERSEDED (kept as history),
  // the evidence becomes the effective day, and a calendar change records why. The plan itself is not touched.
  const evidenceDaysApplied = duplicateKind === 'DUPLICATE_FILE' ? [] : evaluation.outcomes.filter((item) => item.outcome === OUTCOME.EVIDENCE_APPLIED);

  const groupsToWrite = new Map();
  for (const shift of futureToDraft) {
    const periodStart = startOfSchedulingWeek(shift.date, weekStart);
    const key = `${periodStart}:${shift.areaId ?? 'global'}`;
    if (!groupsToWrite.has(key)) groupsToWrite.set(key, { periodStart, areaId: shift.areaId ?? null, shifts: [] });
    groupsToWrite.get(key).shifts.push(shift);
  }
  const groupList = [...groupsToWrite.values()];
  const scheduleIds = new Map();
  for (const group of groupList) {
    const key = `${group.periodStart}:${group.areaId ?? 'global'}`;
    const current = await sql`
      SELECT s.id AS schedule_id, sv.id AS version_id, sv.status
      FROM schedules s
      LEFT JOIN schedule_versions sv ON sv.schedule_id = s.id AND sv.status IN ('DRAFT', 'PUBLISHED', 'LOCKED', 'COMPLETED')
      WHERE s.organization_id = ${ctx.organizationId} AND s.area_id IS NOT DISTINCT FROM ${group.areaId}
        AND s.period_start = ${group.periodStart}
      ORDER BY (sv.status = 'DRAFT') DESC NULLS LAST, sv.version_number DESC NULLS LAST LIMIT 1
    `;
    const row = current[0];
    scheduleIds.set(key, {
      scheduleId: row?.schedule_id ?? randomUUID(),
      // An existing DRAFT is updated in place (the previous company revision is preserved in company_plan_revisions).
      versionId: row?.status === 'DRAFT' ? row.version_id : randomUUID(),
      existingDraft: row?.status === 'DRAFT',
      sourceVersionId: row && row.status !== 'DRAFT' ? row.version_id : null,
    });
  }

  const importId = randomUUID();
  const importDecisionToStore = IMPORT_DECISION.HISTORICAL_AND_PLAN;
  const labels = [];
  const queries = [];
  labels.push('import');
  queries.push((txn) => txn`
    WITH inserted AS (
      INSERT INTO imports (
        id, organization_id, imported_by_user_id, employee_id, file_name, source_format,
        period_year, period_month, status, area_id, import_mode, period_kind,
        period_label, scope_type, area_name_snapshot, employee_count, shift_count,
        created_shift_count, existing_shift_count, file_fingerprint, context_fingerprint,
        document_fingerprint, plan_fingerprint, import_decision, document_class, temporal_class, duplicate_kind
      ) VALUES (
        ${importId}, ${ctx.organizationId}, ${ctx.user.id}, ${effectiveImportEmployeeId},
        ${String(input.fileName ?? '')}, ${String(input.sourceFormat ?? '')}, ${input.periodYear ?? null},
        ${input.periodMonth ?? null}, 'completed', ${requestedAreaId}, ${importMode},
        ${periodKind}, ${String(input.periodLabel ?? '').trim()}, ${requestedAreaId ? 'area' : 'global'},
        ${areaNameSnapshot}, ${employeeIds.length}, ${normalized.length},
        0, 0, ${fileFingerprint}, ${contextFingerprint},
        ${evaluation.documentFingerprint}, ${evaluation.planFingerprint}, ${importDecisionToStore},
        ${document.documentClass}, ${dated.classification}, ${duplicateKind === 'DUPLICATE_FILE' ? null : duplicateKind}
      )
      ON CONFLICT (organization_id, employee_id, file_fingerprint, context_fingerprint)
      WHERE employee_id IS NOT NULL AND file_fingerprint IS NOT NULL AND context_fingerprint IS NOT NULL
      DO NOTHING
      RETURNING id, TRUE AS inserted
    )
    SELECT id, inserted FROM inserted
    UNION ALL
    SELECT id, FALSE FROM imports
    WHERE organization_id = ${ctx.organizationId}
      AND employee_id = ${effectiveImportEmployeeId}
      AND file_fingerprint = ${fileFingerprint}
      AND context_fingerprint = ${contextFingerprint}
      AND NOT EXISTS (SELECT 1 FROM inserted)
    ORDER BY inserted DESC
    LIMIT 1
  `);
  // From here on every row this transaction writes is attributed to the import by the effect-ledger triggers (BEFORE/AFTER in the
  // SAME transaction), and the organization's ledger writers are serialized with reversions.
  labels.push('ledger-lock');
  queries.push((txn) => txn`SELECT pg_advisory_xact_lock(hashtextextended(${`import-ledger:${ctx.organizationId}`}, 0))`);
  labels.push('ledger-context');
  queries.push((txn) => txn`
    SELECT set_config('app.import_id', (
      SELECT id::text FROM imports
      WHERE organization_id = ${ctx.organizationId} AND employee_id = ${effectiveImportEmployeeId}
        AND file_fingerprint = ${fileFingerprint} AND context_fingerprint = ${contextFingerprint}
      ORDER BY created_at ASC LIMIT 1), true)
  `);

  // DCF / observations travel with the document: persisted in the same transaction, linked to this import.
  let annotationStatementCount = 0;
  for (const [annotationEmployeeId, items] of prepared.annotationsByEmployee) {
    for (const item of items) {
      annotationStatementCount += 1;
      labels.push(`annotation:${item.kind}:${item.date}`);
      queries.push((txn) => txn`
        INSERT INTO calendar_annotations (
          organization_id, employee_id, date, kind, body, start_time, end_time, completeness, origin, source_kind, import_id,
          created_by_user_id, updated_by_user_id
        ) VALUES (
          ${ctx.organizationId}, ${annotationEmployeeId}, ${item.date}, ${item.kind}, ${item.body}, ${item.startTime}, ${item.endTime},
          ${item.completeness}, 'IMPORT', ${prepared.sourceKind},
          (SELECT id FROM imports WHERE organization_id = ${ctx.organizationId} AND employee_id = ${effectiveImportEmployeeId}
            AND file_fingerprint = ${fileFingerprint} AND context_fingerprint = ${contextFingerprint} ORDER BY created_at ASC LIMIT 1),
          ${ctx.user.id}, ${ctx.user.id}
        )
        ON CONFLICT (organization_id, employee_id, date, kind, origin) DO UPDATE SET
          body = EXCLUDED.body,
          start_time = CASE WHEN calendar_annotations.completeness = 'HOURS_KNOWN' AND EXCLUDED.completeness = 'HOURS_UNKNOWN' THEN calendar_annotations.start_time ELSE EXCLUDED.start_time END,
          end_time = CASE WHEN calendar_annotations.completeness = 'HOURS_KNOWN' AND EXCLUDED.completeness = 'HOURS_UNKNOWN' THEN calendar_annotations.end_time ELSE EXCLUDED.end_time END,
          completeness = CASE WHEN calendar_annotations.completeness = 'HOURS_KNOWN' AND EXCLUDED.completeness = 'HOURS_UNKNOWN' THEN calendar_annotations.completeness ELSE EXCLUDED.completeness END,
          source_kind = EXCLUDED.source_kind, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()
        RETURNING id
      `);
    }
  }
  const annotationOffset = queries.length - annotationStatementCount;
  void annotationOffset;

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
    if (ids.sourceVersionId) {
      queries.push((txn) => createNewDraftFromVersionTx(
        txn, ctx, ids.scheduleId, ids.sourceVersionId, ids.versionId, scope.type === 'AREA', scope.type === 'AREA' ? scope.areaId : null,
      ));
    } else queries.push((txn) => txn`
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

  // HISTORICAL rows: only genuinely new days become effective shifts (existing ones are already the truth).
  const historicalOffset = queries.length;
  for (const shift of historicalToWrite) {
    const id = UUID_RE.test(shift.id ?? '') ? shift.id : randomUUID();
    labels.push(`historical:${assignmentIdentity(shift)}`);
    queries.push((txn) => txn`
      INSERT INTO shifts (
        id, organization_id, employee_id, import_id, area_id, date,
        start_time, end_time, location, origin, shift_type, counts_as_work,
        semantic_fingerprint, layer, provenance, updated_at
      )
      SELECT ${id}, ${ctx.organizationId}, ${shift.employeeId},
             (SELECT id FROM imports WHERE organization_id = ${ctx.organizationId}
               AND employee_id = ${effectiveImportEmployeeId}
               AND file_fingerprint = ${fileFingerprint}
               AND context_fingerprint = ${contextFingerprint}
               ORDER BY created_at ASC LIMIT 1),
             ${shift.areaId}, ${shift.date}, ${shift.startTime || null}, ${shift.endTime || null}, ${shift.location}, 'IMP',
             ${shift.shiftType}, ${shift.countsAsWork},
             ${[shift.employeeKey, shift.date, shift.shiftType ?? '', shift.startTime, shift.endTime].join('\u001f')},
             ${shift.role === 'EVIDENCE' ? 'CHANGE' : 'COMPANY_PLAN'}, ${shift.role === 'EVIDENCE' ? 'SYSTEM' : 'COMPANY_IMPORT'}, NOW()
      ON CONFLICT (organization_id, employee_id, semantic_fingerprint)
      WHERE semantic_fingerprint IS NOT NULL
      DO UPDATE SET updated_at = NOW()
      RETURNING id
    `);
  }

  const deleteOffset = queries.length;
  for (const id of deleteIds) {
    labels.push(`delete:${id}`);
    queries.push((txn) => txn`
      DELETE FROM shifts
      WHERE id = ${id} AND organization_id = ${ctx.organizationId} AND date < ${dated.cutoff}
      RETURNING id
    `);
  }

  // Draft plan: replace the days whose company plan changed, then insert the new content.
  const replaceByGroup = new Map();
  for (const day of replaceDays) {
    const sample = future.find((shift) => shift.employeeKey === day.employeeKey && shift.date === day.date);
    if (!sample) continue;
    const key = `${startOfSchedulingWeek(day.date, weekStart)}:${sample.areaId ?? 'global'}`;
    if (!replaceByGroup.has(key)) replaceByGroup.set(key, []);
    replaceByGroup.get(key).push({ employeeId: sample.employeeId, date: day.date });
  }
  for (const [key, days] of replaceByGroup) {
    const ids = scheduleIds.get(key);
    if (!ids) continue;
    for (const day of days) {
      labels.push(`plan-replace:${day.employeeId}:${day.date}`);
      queries.push((txn) => txn`
        DELETE FROM shift_assignments
        WHERE schedule_version_id = ${ids.versionId} AND employee_id = ${day.employeeId} AND date = ${day.date}
          AND EXISTS (SELECT 1 FROM schedule_versions sv WHERE sv.id = ${ids.versionId} AND sv.status = 'DRAFT')
        RETURNING id
      `);
    }
  }

  const futureOffset = queries.length;
  for (const group of groupList) {
    const ids = scheduleIds.get(`${group.periodStart}:${group.areaId ?? 'global'}`);
    for (const shift of group.shifts) {
      labels.push(`future:${assignmentIdentity(shift)}`);
      queries.push((txn) => txn`
        INSERT INTO shift_assignments (
          schedule_version_id, import_id, employee_id, date, start_time, end_time, location,
          shift_type, counts_as_work, updated_at
        )
        SELECT sv.id,
               (SELECT id FROM imports WHERE organization_id = ${ctx.organizationId}
                 AND employee_id = ${effectiveImportEmployeeId}
                 AND file_fingerprint = ${fileFingerprint}
                 AND context_fingerprint = ${contextFingerprint}
                 ORDER BY created_at ASC LIMIT 1),
               ${shift.employeeId}, ${shift.date}, ${shift.startTime}, ${shift.endTime}, ${shift.location},
               ${shift.shiftType}, ${shift.countsAsWork}, NOW()
        FROM schedule_versions sv
        JOIN schedules s ON s.id = sv.schedule_id
        WHERE sv.id = ${ids.versionId}
          AND s.organization_id = ${ctx.organizationId}
          AND sv.status = 'DRAFT'
        AND NOT EXISTS (
          SELECT 1 FROM shift_assignments existing
          WHERE existing.schedule_version_id = sv.id
            AND existing.employee_id = ${shift.employeeId}
            AND existing.date = ${shift.date}
            AND existing.start_time IS NOT DISTINCT FROM ${shift.startTime}
            AND existing.end_time IS NOT DISTINCT FROM ${shift.endTime}
            AND existing.shift_type IS NOT DISTINCT FROM ${shift.shiftType}
            AND existing.counts_as_work IS NOT DISTINCT FROM ${shift.countsAsWork}
            AND existing.location IS NOT DISTINCT FROM ${shift.location}
        )
        RETURNING id, schedule_version_id
      `);
    }
  }

  // Evidence applied over a plain plan day: record the change, supersede the plan rows (kept), insert the evidence.
  const evidenceOffset = queries.length;
  const evidenceChangeIds = [];
  for (const day of evidenceDaysApplied) {
    const dayRows = normalized.filter((shift) => shift.employeeKey === day.employeeKey && shift.date === day.date);
    const supersedeIds = evaluation.effectiveRowIdsByDay.get(`${day.employeeKey}\u001f${day.date}`) ?? [];
    const sample = dayRows[0];
    if (!sample || supersedeIds.length === 0) continue;
    const changeId = randomUUID();
    evidenceChangeIds.push(changeId);
    const snap = (rows) => rows.map((row) => { const n = normalizePlanRow(row); return { shiftType: n.type, startTime: n.start || null, endTime: n.end || null }; });
    labels.push(`evidence-change:${day.date}`);
    queries.push((txn) => txn`
      INSERT INTO calendar_changes (
        id, organization_id, employee_id, date, change_type, actor_user_id, actor_role, self_change, source, reason,
        before_state, after_state, approval_status
      ) VALUES (
        ${changeId}, ${ctx.organizationId}, ${sample.employeeId}, ${day.date}, 'REPLACE_DAY', ${ctx.user.id}, ${ctx.role}, FALSE, 'SYSTEM',
        'Employee calendar export shows a different day than the company plan; the plan is preserved',
        ${JSON.stringify(snap(day.effective ?? []))}::jsonb, ${JSON.stringify(snap(dayRows.map(toPlanRow)))}::jsonb, 'APPLIED'
      )
      RETURNING id
    `);
    labels.push(`evidence-supersede:${day.date}`);
    queries.push((txn) => txn`
      UPDATE shifts SET effective_state = 'SUPERSEDED', superseded_at = NOW(), change_id = ${changeId}, updated_at = NOW()
      WHERE organization_id = ${ctx.organizationId} AND employee_id = ${sample.employeeId} AND id = ANY(${supersedeIds}::uuid[])
        AND effective_state = 'EFFECTIVE'
      RETURNING id
    `);
    for (const row of dayRows) {
      labels.push(`evidence-insert:${assignmentIdentity(row)}`);
      queries.push((txn) => txn`
        INSERT INTO shifts (
          id, organization_id, employee_id, import_id, area_id, date, start_time, end_time, location, origin,
          shift_type, counts_as_work, layer, provenance, effective_state, plan_revision, change_id, updated_at
        )
        SELECT ${randomUUID()}, ${ctx.organizationId}, ${row.employeeId},
               (SELECT id FROM imports WHERE organization_id = ${ctx.organizationId}
                 AND employee_id = ${effectiveImportEmployeeId}
                 AND file_fingerprint = ${fileFingerprint} AND context_fingerprint = ${contextFingerprint}
                 ORDER BY created_at ASC LIMIT 1),
               ${row.areaId}, ${row.date}, ${row.startTime || null}, ${row.endTime || null}, ${row.location}, 'IMP',
               ${row.shiftType}, ${row.countsAsWork}, 'CHANGE', 'SYSTEM', 'EFFECTIVE', 1, ${changeId}, NOW()
        RETURNING id
      `);
    }
  }
  const evidenceCount = evidenceChangeIds.length;
  void evidenceOffset;

  // Discrepancies become company-plan rows awaiting review (they never overwrite the effective calendar).
  for (const shift of reviewRows) {
    labels.push(`review:${assignmentIdentity(shift)}`);
    queries.push((txn) => txn`
      INSERT INTO shifts (
        id, organization_id, employee_id, import_id, area_id, date, start_time, end_time, location, origin,
        shift_type, counts_as_work, layer, provenance, effective_state, plan_revision, updated_at
      )
      SELECT ${randomUUID()}, ${ctx.organizationId}, ${shift.employeeId},
             (SELECT id FROM imports WHERE organization_id = ${ctx.organizationId}
               AND employee_id = ${effectiveImportEmployeeId}
               AND file_fingerprint = ${fileFingerprint}
               AND context_fingerprint = ${contextFingerprint}
               ORDER BY created_at ASC LIMIT 1),
             ${shift.areaId}, ${shift.date}, ${shift.startTime || null}, ${shift.endTime || null}, ${shift.location}, 'IMP',
             ${shift.shiftType}, ${shift.countsAsWork}, ${shift.role === 'EVIDENCE' ? 'CHANGE' : 'COMPANY_PLAN'}, ${shift.role === 'EVIDENCE' ? 'SYSTEM' : 'COMPANY_IMPORT'}, 'REQUIRES_REVIEW',
             ${revisionNumber ?? Math.max(1, evaluation.latestRevision)}, NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM shifts r
        WHERE r.organization_id = ${ctx.organizationId} AND r.employee_id = ${shift.employeeId} AND r.date = ${shift.date}
          AND r.effective_state = 'REQUIRES_REVIEW' AND r.start_time IS NOT DISTINCT FROM ${shift.startTime || null}
          AND r.end_time IS NOT DISTINCT FROM ${shift.endTime || null} AND r.shift_type IS NOT DISTINCT FROM ${shift.shiftType}
      )
      RETURNING id
    `);
  }

  // Versioned company plan: one new revision only when the plan really changed.
  const revisionOffset = queries.length;
  if (createsRevision) {
    const rows = normalized.filter((shift) => shift.role === 'PLAN').map((shift) => ({ k: shift.employeeKey, ...toStoredRow(toPlanRow(shift)) }));
    const summaryJson = JSON.stringify({
      baselineRevision: evaluation.latestRevision || null,
      // audit: who/what established this revision (user and import are columns; the source kind lives here)
      sourceKind: prepared.sourceKind,
      initialBaseline: !evaluation.hasExistingPlan,
      changes: outcomeCounts(evaluation.summary),
      days: evaluation.outcomes.filter((item) => item.outcome !== OUTCOME.UNCHANGED).map((item) => ({ k: item.employeeKey, d: item.date, o: item.outcome })),
    });
    labels.push('plan-revision');
    queries.push((txn) => txn`
      INSERT INTO company_plan_revisions (
        organization_id, scope_key, revision_number, import_id, plan_fingerprint, document_fingerprint, document_class,
        coverage_from, coverage_to, row_count, rows, summary, created_by_user_id
      ) VALUES (
        ${ctx.organizationId}, ${evaluation.scopeKey}, ${revisionNumber},
        (SELECT id FROM imports WHERE organization_id = ${ctx.organizationId}
          AND employee_id = ${effectiveImportEmployeeId}
          AND file_fingerprint = ${fileFingerprint} AND context_fingerprint = ${contextFingerprint}
          ORDER BY created_at ASC LIMIT 1),
        ${evaluation.planFingerprint}, ${evaluation.documentFingerprint}, ${document.documentClass},
        ${evaluation.planFrom}, ${evaluation.planTo}, ${rows.length}, ${JSON.stringify(rows)}::jsonb, ${summaryJson}::jsonb, ${ctx.user.id}
      )
      RETURNING id, revision_number
    `);
  }

  labels.push('import-metadata');
  const metadataOffset = queries.length;
  queries.push((txn) => txn`
    UPDATE imports i
    SET employee_count = ${employeeIds.length},
        shift_count = ${normalized.length},
        import_decision = ${importDecisionToStore},
        plan_fingerprint = ${evaluation.planFingerprint},
        document_fingerprint = ${evaluation.documentFingerprint},
        document_class = ${document.documentClass},
        temporal_class = ${dated.classification},
        duplicate_kind = ${duplicateKind === 'DUPLICATE_FILE' ? null : duplicateKind},
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
      AND i.employee_id = ${effectiveImportEmployeeId}
      AND i.file_fingerprint = ${fileFingerprint}
      AND i.context_fingerprint = ${contextFingerprint}
    RETURNING *
  `);

  let transactionResult;
  try {
    transactionResult = await sql.transaction((txn) => queries.map((query) => query(txn)));
  } catch (error) {
    // Two confirmations raced from the same baseline: the loser re-evaluates and becomes a duplicate.
    if (createsRevision && attempt === 0 && isUniqueViolation(error)) return confirmFutureImport(sql, ctx, input, attempt + 1);
    throw error;
  }
  const importRow = transactionResult[0]?.[0];
  if (!importRow?.id) throw requestError(500, 'Import transaction did not return an import id');
  const slice = (offset, length) => transactionResult.slice(offset, offset + length);
  const historicalResults = slice(historicalOffset, historicalToWrite.length);
  const deletedCount = slice(deleteOffset, deleteIds.length).reduce((count, rows) => count + rows.length, 0);
  const futureResults = slice(futureOffset, futureToDraft.length);
  const assignmentCount = futureResults.reduce((count, rows) => count + rows.length, 0);
  const updatedImport = transactionResult[metadataOffset]?.[0];
  const revisionResult = createsRevision ? transactionResult[revisionOffset]?.[0] : null;

  return {
    classification: dated.classification,
    cutoff: dated.cutoff,
    decision,
    sourceKind: prepared.sourceKind,
    importId: importRow.id,
    deduplicated: duplicateKind === 'DUPLICATE_FILE',
    duplicate: duplicateKind,
    sameFileDifferentDecision,
    document,
    historical: {
      submittedCount: historical.length,
      persistedCount: historicalResults.reduce((count, rows) => count + rows.length, 0),
      deletedCount,
      requiresReviewDays: evaluation.outcomes.filter((item) => item.retrospective && item.outcome === OUTCOME.REQUIRES_REVIEW).length,
    },
    future: {
      submittedCount: future.length,
      createdAssignmentCount: assignmentCount,
      existingAssignmentCount: Math.max(0, future.length - assignmentCount),
      affectedWeekCount: weeks.size,
      draftWeekCount: groupList.length,
      // Import never publishes. The keys below are kept (always 0) for older clients.
      publishedWeekCount: 0,
      publishedShiftCount: 0,
      publicationResults: [],
    },
    plan: {
      autoPublished: false,
      revisionNumber: revisionResult?.revision_number ?? null,
      baselineRevision: evaluation.latestRevision || null,
      revisionCreated: Boolean(revisionResult),
      changes: outcomeCounts(evaluation.summary),
      evidenceDaysApplied: evidenceCount,
    },
    annotations: { submitted: annotationStatementCount },
    import: updatedImport ? mapImportRow(updatedImport) : { id: importRow.id },
    transactionQueryCount: labels.length,
  };
}

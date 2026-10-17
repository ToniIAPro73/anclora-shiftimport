import { randomUUID } from 'node:crypto';
import { HttpError, requireRole } from './auth.js';
import {
  BLOCKER, classifyLegacyImport, dependencyGraph, emptyImpact, planHashOf, planInverse, reverseDependencyOrder,
} from './import-reversion-planner.js';

/**
 * Import Reversion Engine (server).
 *
 *   preview  READ-ONLY: validates scope, closes the dependency set, orders the execution, simulates the inverse against the CURRENT
 *            state and returns the plan (+ blockers). Zero writes.
 *   confirm  re-computes the plan (never trusts the client's order or set), refuses a stale plan (409 REVERSION_PLAN_STALE) and
 *            executes ALL inverse operations plus the ledger bookkeeping in ONE transaction (all or nothing), guarded row by row.
 *
 * The user chooses WHAT to revert, never the order: the order comes from the effect ledger (dependents first).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUESTED = 50;
const MAX_EFFECTIVE = 200;
const LEGACY_EDIT_SLACK_SECONDS = 5;

const conflict = (status, message, code, extra = {}) => Object.assign(new HttpError(status, message), { code, ...extra });

function normalizeIds(raw) {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
  if (ids.length === 0) throw new HttpError(400, 'importIds is required');
  if (ids.length > MAX_REQUESTED) throw new HttpError(400, `At most ${MAX_REQUESTED} imports can be reverted at once`);
  for (const id of ids) if (!UUID_RE.test(id)) throw new HttpError(400, 'importIds must be UUIDs');
  return ids;
}

const dayKey = (row) => `day:${row.employee_id}:${row.date}`;

// ------------------------------------------------------------------------------------------------------------------ data access

async function loadImports(sql, organizationId, ids) {
  return sql`
    SELECT i.id, i.employee_id, i.file_name, i.source_format, i.status, i.import_mode, i.import_decision, i.document_class,
           i.created_at, i.deleted_at, i.reverted_at, i.imported_by_user_id, u.display_name AS imported_by_name
    FROM imports i LEFT JOIN users u ON u.id = i.imported_by_user_id
    WHERE i.organization_id = ${organizationId} AND i.id = ANY(${ids}::uuid[])
  `;
}

const effectOf = (row) => ({
  id: Number(row.id), import_id: row.import_id, effect_kind: row.effect_kind, resource_type: row.resource_type,
  resource_key: row.resource_key, resource_id: row.resource_id, before_state: row.before_state, after_state: row.after_state,
  at: new Date(row.created_at).getTime(),
});

async function loadActiveEffects(sql, organizationId, importIds) {
  if (importIds.length === 0) return [];
  const rows = await sql`
    SELECT id, import_id, effect_kind, resource_type, resource_key, resource_id, before_state, after_state, created_at
    FROM import_effects
    WHERE organization_id = ${organizationId} AND import_id = ANY(${importIds}::uuid[]) AND reverted_at IS NULL
    ORDER BY id
  `;
  return rows.map(effectOf);
}

/** Legacy imports (no ledger): what the database can prove about them. */
async function inspectLegacy(sql, organizationId, imports) {
  const ids = imports.map((row) => row.id);
  if (ids.length === 0) return new Map();
  const shifts = await sql`
    SELECT to_jsonb(s) AS row, (s.updated_at > s.created_at + make_interval(secs => ${LEGACY_EDIT_SLACK_SECONDS})) AS edited
    FROM shifts s WHERE s.organization_id = ${organizationId} AND s.import_id = ANY(${ids}::uuid[])
  `;
  const counts = await sql`
    SELECT i.id,
      (SELECT COUNT(*)::int FROM shift_assignments a WHERE a.import_id = i.id) AS assignments,
      (SELECT COUNT(*)::int FROM calendar_annotations n WHERE n.import_id = i.id) AS annotations,
      (SELECT COUNT(*)::int FROM company_plan_revisions r WHERE r.import_id = i.id) AS plan_revisions,
      (SELECT COUNT(*)::int FROM calendar_changes c
        WHERE c.organization_id = i.organization_id AND c.change_type <> 'RECONCILIATION' AND c.created_at >= i.created_at
          AND c.source IN ('COMPANY_IMPORT', 'SYSTEM')
          AND EXISTS (SELECT 1 FROM shifts s2 WHERE s2.import_id = i.id AND s2.employee_id = c.employee_id AND s2.date = c.date)) AS related_changes
    FROM imports i WHERE i.id = ANY(${ids}::uuid[])
  `;
  const byImport = new Map(ids.map((id) => [id, { shifts: [], edited: 0 }]));
  for (const row of shifts) {
    const slot = byImport.get(row.row.import_id);
    slot.shifts.push(row.row);
    if (row.edited) slot.edited += 1;
  }
  const result = new Map();
  for (const count of counts) {
    const slot = byImport.get(count.id);
    result.set(count.id, {
      ...classifyLegacyImport({
        shifts: slot.shifts, assignments: count.assignments, annotations: count.annotations,
        planRevisions: count.plan_revisions, laterShiftEdits: slot.edited, relatedChanges: count.related_changes,
      }),
      shiftRows: slot.shifts,
    });
  }
  return result;
}

/** Synthesized ledger for a provably-safe legacy import: its own shifts, "inserted" at import time. */
function syntheticEffects(importRow, legacy) {
  const at = new Date(importRow.created_at).getTime();
  return legacy.shiftRows.map((row, index) => ({
    id: 0 - index, import_id: importRow.id, effect_kind: 'SHIFT_INSERT', resource_type: 'shifts', resource_key: dayKey(row),
    resource_id: row.id, before_state: null, after_state: row, at, synthetic: true,
  }));
}

const TABLE_QUERIES = {
  shifts: (sql, ids) => sql`SELECT to_jsonb(t) AS row FROM shifts t WHERE t.id = ANY(${ids}::uuid[])`,
  shift_assignments: (sql, ids) => sql`SELECT to_jsonb(t) AS row FROM shift_assignments t WHERE t.id = ANY(${ids}::uuid[])`,
  schedules: (sql, ids) => sql`SELECT to_jsonb(t) AS row FROM schedules t WHERE t.id = ANY(${ids}::uuid[])`,
  schedule_versions: (sql, ids) => sql`SELECT to_jsonb(t) AS row FROM schedule_versions t WHERE t.id = ANY(${ids}::uuid[])`,
  company_plan_revisions: (sql, ids) => sql`SELECT to_jsonb(t) AS row FROM company_plan_revisions t WHERE t.id = ANY(${ids}::uuid[])`,
  calendar_annotations: (sql, ids) => sql`SELECT to_jsonb(t) AS row FROM calendar_annotations t WHERE t.id = ANY(${ids}::uuid[])`,
  calendar_changes: (sql, ids) => sql`SELECT to_jsonb(t) AS row FROM calendar_changes t WHERE t.id = ANY(${ids}::uuid[])`,
};

/** Current state of every physical row the effects refer to, plus the lookups the planner needs. */
async function loadCurrentState(sql, organizationId, effects) {
  const idsByTable = new Map();
  for (const effect of effects) {
    if (!effect.resource_id || !TABLE_QUERIES[effect.resource_type]) continue;
    if (!idsByTable.has(effect.resource_type)) idsByTable.set(effect.resource_type, new Set());
    idsByTable.get(effect.resource_type).add(effect.resource_id);
  }
  const rows = new Map();
  for (const [table, ids] of idsByTable) {
    for (const found of await TABLE_QUERIES[table](sql, [...ids])) rows.set(`${table}:${found.row.id}`, found.row);
  }
  for (const [table, ids] of idsByTable) for (const id of ids) if (!rows.has(`${table}:${id}`)) rows.set(`${table}:${id}`, null);

  // shifts that still point at a calendar change an import created (a change cannot be removed while referenced)
  const changeIds = [...(idsByTable.get('calendar_changes') ?? [])];
  if (changeIds.length) {
    for (const found of await sql`SELECT to_jsonb(s) AS row FROM shifts s WHERE s.organization_id = ${organizationId} AND s.change_id = ANY(${changeIds}::uuid[])`) {
      rows.set(`shifts:${found.row.id}`, found.row);
    }
  }

  const versionIds = new Set((effects.filter((e) => e.resource_type === 'schedule_versions').map((e) => e.resource_id)));
  const assignmentVersionIds = new Set(effects.filter((e) => e.resource_type === 'shift_assignments').map((e) => (e.after_state ?? e.before_state)?.schedule_version_id).filter(Boolean));
  const allVersionIds = [...new Set([...versionIds, ...assignmentVersionIds])];
  const versions = new Map();
  const assignmentsByVersion = new Map();
  if (allVersionIds.length) {
    for (const row of await sql`SELECT id, schedule_id, status FROM schedule_versions WHERE id = ANY(${allVersionIds}::uuid[])`) versions.set(row.id, row);
    for (const row of await sql`SELECT id, schedule_version_id FROM shift_assignments WHERE schedule_version_id = ANY(${[...versionIds]}::uuid[])`) {
      if (!assignmentsByVersion.has(row.schedule_version_id)) assignmentsByVersion.set(row.schedule_version_id, new Set());
      assignmentsByVersion.get(row.schedule_version_id).add(row.id);
    }
  }
  const scheduleIds = [...(idsByTable.get('schedules') ?? [])];
  const versionsBySchedule = new Map();
  if (scheduleIds.length) {
    for (const row of await sql`SELECT id, schedule_id FROM schedule_versions WHERE schedule_id = ANY(${scheduleIds}::uuid[])`) {
      if (!versionsBySchedule.has(row.schedule_id)) versionsBySchedule.set(row.schedule_id, new Set());
      versionsBySchedule.get(row.schedule_id).add(row.id);
    }
  }

  const annotationEffects = effects.filter((e) => e.resource_type === 'calendar_annotations');
  const manualAnnotationKeys = new Set();
  if (annotationEffects.length) {
    const employeeIds = [...new Set(annotationEffects.map((e) => (e.after_state ?? e.before_state).employee_id))];
    const dates = [...new Set(annotationEffects.map((e) => (e.after_state ?? e.before_state).date))];
    for (const row of await sql`
      SELECT employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, kind FROM calendar_annotations
      WHERE organization_id = ${organizationId} AND origin = 'MANUAL' AND employee_id = ANY(${employeeIds}::uuid[]) AND date = ANY(${dates}::date[])
    `) manualAnnotationKeys.add(`ann:${row.employee_id}:${row.date}:${row.kind}:MANUAL`);
  }
  return { rows, versions, assignmentsByVersion, versionsBySchedule, manualAnnotationKeys };
}

/** Imports (not yet in the set) that touched, LATER, a resource the set touched: they depend on it and must go first. */
async function findDependents(sql, organizationId, setIds, setEffects) {
  const firstAt = new Map(); // resource_key -> earliest effect (at, id) inside the set
  for (const effect of setEffects) {
    const known = firstAt.get(effect.resource_key);
    if (!known || effect.at < known.at || (effect.at === known.at && effect.id < known.id)) firstAt.set(effect.resource_key, effect);
  }
  const keys = [...firstAt.keys()];
  if (keys.length === 0) return [];
  const found = new Set();
  const ledgered = await sql`
    SELECT e.import_id, e.resource_key, MAX(e.id) AS last_id, MAX(e.created_at) AS last_at
    FROM import_effects e JOIN imports i ON i.id = e.import_id
    WHERE e.organization_id = ${organizationId} AND e.resource_key = ANY(${keys}::text[]) AND e.reverted_at IS NULL
      AND i.reverted_at IS NULL AND i.deleted_at IS NULL AND e.import_id <> ALL(${setIds}::uuid[])
    GROUP BY e.import_id, e.resource_key
  `;
  for (const row of ledgered) {
    const first = firstAt.get(row.resource_key);
    const at = new Date(row.last_at).getTime();
    if (at > first.at || (at === first.at && Number(row.last_id) > first.id)) found.add(row.import_id);
  }
  // legacy dependents (no ledger) are found through the day keys of their shifts
  const dayKeys = keys.filter((key) => key.startsWith('day:'));
  if (dayKeys.length) {
    const legacy = await sql`
      SELECT DISTINCT i.id AS import_id, 'day:' || s.employee_id || ':' || TO_CHAR(s.date, 'YYYY-MM-DD') AS resource_key, i.created_at
      FROM shifts s JOIN imports i ON i.id = s.import_id
      WHERE s.organization_id = ${organizationId} AND i.reverted_at IS NULL AND i.deleted_at IS NULL AND i.id <> ALL(${setIds}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM import_effects e WHERE e.import_id = i.id)
        AND 'day:' || s.employee_id || ':' || TO_CHAR(s.date, 'YYYY-MM-DD') = ANY(${dayKeys}::text[])
    `;
    for (const row of legacy) {
      if (new Date(row.created_at).getTime() > firstAt.get(row.resource_key).at) found.add(row.import_id);
    }
  }
  return [...found];
}

// ------------------------------------------------------------------------------------------------------------------ planning

/**
 * Builds the full reversion plan. READ-ONLY.
 * Returns { status, planHash, requestedIds, imports[], order[], impact, blockers[], warnings[], ops[] (internal) }.
 */
export async function computeReversionPlan(sql, ctx, rawIds) {
  const requestedIds = normalizeIds(rawIds);
  const requestedRows = await loadImports(sql, ctx.organizationId, requestedIds);
  if (requestedRows.length !== requestedIds.length) throw new HttpError(404, 'Import not found'); // cross-tenant ids look exactly like unknown ids

  const blockers = [];
  for (const row of requestedRows) {
    if (row.reverted_at || row.deleted_at) blockers.push({ code: BLOCKER.ALREADY_REVERTED, importId: row.id });
  }
  const blockedPlan = (extra = {}) => ({
    status: 'BLOCKED', planHash: planHashOf({ order: [], ops: [], blockers }), requestedIds, imports: requestedRows.map((r) => describeImport(r, { requested: true })),
    order: [], impact: emptyImpact(), blockers, warnings: [], ops: [], ...extra,
  });
  if (blockers.length) return blockedPlan();

  const importsById = new Map(requestedRows.map((row) => [row.id, row]));
  const requestedSet = new Set(requestedIds);
  const effectsByImport = new Map();
  const legacyInfo = new Map();

  const absorb = async (rows) => {
    const loaded = await loadActiveEffects(sql, ctx.organizationId, rows.map((r) => r.id));
    const withLedger = new Set(loaded.map((e) => e.import_id));
    for (const row of rows) effectsByImport.set(row.id, loaded.filter((e) => e.import_id === row.id));
    const legacy = await inspectLegacy(sql, ctx.organizationId, rows.filter((r) => !withLedger.has(r.id)));
    for (const row of rows.filter((r) => !withLedger.has(r.id))) {
      const info = legacy.get(row.id);
      legacyInfo.set(row.id, info);
      if (info.state === 'LEGACY_SAFE_SHIFT_ONLY') effectsByImport.set(row.id, syntheticEffects(row, info));
      else blockers.push({ code: info.state === 'NO_EFFECTS' ? BLOCKER.NO_REVERSIBLE_EFFECTS : BLOCKER.LEGACY_PROVENANCE_INSUFFICIENT, importId: row.id, reason: info.reason });
    }
  };
  await absorb(requestedRows);

  // ---- dependency closure: add every later import that touched the same resources --------------------------------------------
  const effectiveIds = new Set(requestedIds);
  for (let round = 0; round < 20; round += 1) {
    const setIds = [...effectiveIds];
    const setEffects = setIds.flatMap((id) => effectsByImport.get(id) ?? []);
    const dependents = (await findDependents(sql, ctx.organizationId, setIds, setEffects)).filter((id) => !effectiveIds.has(id));
    if (dependents.length === 0) break;
    const rows = await loadImports(sql, ctx.organizationId, dependents);
    for (const row of rows) { importsById.set(row.id, row); effectiveIds.add(row.id); }
    await absorb(rows);
    if (effectiveIds.size > MAX_EFFECTIVE) throw conflict(422, 'The reversion would include too many related imports', 'REVERSION_TOO_LARGE');
  }

  const ids = [...effectiveIds];
  const allEffects = ids.flatMap((id) => effectsByImport.get(id) ?? []);
  const deps = dependencyGraph(allEffects.map((e) => ({ id: e.id, importId: e.import_id, resourceKey: e.resource_key, at: e.at })));
  const { order, cycle } = reverseDependencyOrder(ids, deps);
  if (cycle) blockers.push({ code: BLOCKER.REVERSION_DEPENDENCY_CYCLE });

  const imports = [...importsById.values()];
  const base = {
    requestedIds, imports: ids.map((id) => describeImport(importsById.get(id), { requested: requestedSet.has(id), order: order.indexOf(id) + 1, legacy: legacyInfo.has(id) })),
  };
  if (blockers.length) {
    return { ...base, status: 'BLOCKED', planHash: planHashOf({ order: cycle ? [] : order, ops: [], blockers }), order: cycle ? [] : order, impact: emptyImpact(), blockers, warnings: [], ops: [], imports: base.imports.sort(byOrder) };
  }

  const state = await loadCurrentState(sql, ctx.organizationId, allEffects);
  const plan = planInverse({
    order, effectsByImport, rows: state.rows, versions: state.versions, assignmentsByVersion: state.assignmentsByVersion,
    versionsBySchedule: state.versionsBySchedule, manualAnnotationKeys: state.manualAnnotationKeys,
  });
  const allBlockers = [...blockers, ...plan.blockers];
  void imports;
  return {
    ...base,
    imports: base.imports.sort(byOrder),
    status: allBlockers.length ? 'BLOCKED' : 'READY',
    planHash: planHashOf({ order, ops: plan.ops, blockers: allBlockers }),
    order, impact: plan.impact, blockers: summarizeBlockers(allBlockers), warnings: plan.warnings, ops: plan.ops, perImport: plan.perImport,
  };
}

const byOrder = (a, b) => (a.executionOrder ?? 0) - (b.executionOrder ?? 0);

function summarizeBlockers(list) {
  const grouped = new Map();
  for (const blocker of list) {
    const key = `${blocker.code}|${blocker.importId ?? ''}`;
    const slot = grouped.get(key) ?? { code: blocker.code, importId: blocker.importId ?? null, count: 0 };
    slot.count += 1;
    grouped.set(key, slot);
  }
  return [...grouped.values()];
}

function describeImport(row, { requested = false, order = null, legacy = false } = {}) {
  return {
    id: row.id, fileName: row.file_name, sourceFormat: row.source_format, importMode: row.import_mode, createdAt: row.created_at,
    importedByName: row.imported_by_name ?? null, requestedByUser: requested, autoIncluded: !requested, executionOrder: order, legacy,
  };
}

/** The shape the client sees (no internal operations). */
function publicPlan(plan) {
  const { ops, perImport, ...rest } = plan;
  void ops; void perImport;
  return rest;
}

export async function previewImportReversion(sql, ctx, input = {}) {
  requireRole(ctx, 'ADMIN');
  return publicPlan(await computeReversionPlan(sql, ctx, input.importIds));
}

// ------------------------------------------------------------------------------------------------------------------ execution

async function existingReversion(sql, organizationId, planHash) {
  const rows = await sql`SELECT id, summary, requested_import_count, effective_import_count FROM import_reversions WHERE organization_id = ${organizationId} AND plan_hash = ${planHash}`;
  return rows[0] ?? null;
}

const idempotentResult = (row) => ({
  reversionId: row.id, status: 'completed', idempotent: true, requestedImportCount: row.requested_import_count,
  effectiveImportCount: row.effective_import_count, impact: row.summary?.impact ?? null, executionOrder: row.summary?.order ?? [],
});

export async function confirmImportReversion(sql, ctx, input = {}) {
  requireRole(ctx, 'ADMIN');
  const planHash = String(input.planHash ?? '').trim();
  if (!/^[0-9a-f]{64}$/.test(planHash)) throw new HttpError(400, 'planHash is required');
  const reason = String(input.reason ?? '').trim().slice(0, 2000) || null;

  // Replay of an already executed confirmation (double click / retry): same operation, no second effect.
  const already = await existingReversion(sql, ctx.organizationId, planHash);
  if (already) return idempotentResult(already);

  const plan = await computeReversionPlan(sql, ctx, input.importIds);
  if (plan.status === 'BLOCKED' || plan.planHash !== planHash) {
    // A racing identical confirmation may have completed between the first lookup and the recomputation (the imports are then
    // "already reverted"): that operation IS the answer, not an error.
    const raced = await existingReversion(sql, ctx.organizationId, planHash);
    if (raced) return idempotentResult(raced);
    if (plan.status === 'BLOCKED') throw conflict(409, 'The reversion is blocked', 'REVERSION_BLOCKED', { blockers: plan.blockers });
    throw conflict(409, 'The state changed since the preview', 'REVERSION_PLAN_STALE');
  }

  const reversionId = randomUUID();
  const org = ctx.organizationId;
  const order = plan.order;
  const requested = new Set(plan.requestedIds);
  const summary = { impact: plan.impact, order, warnings: plan.warnings };

  const statements = [];
  statements.push((txn) => txn`SELECT pg_advisory_xact_lock(hashtextextended(${`import-ledger:${org}`}, 0))`);
  statements.push((txn) => txn`
    SELECT import_reversion_assert(
      (SELECT COUNT(*) FROM imports WHERE organization_id = ${org} AND id = ANY(${order}::uuid[]) AND reverted_at IS NULL AND deleted_at IS NULL) = ${order.length},
      'imports-state')
  `);
  statements.push((txn) => txn`
    INSERT INTO import_reversions (id, organization_id, requested_by_user_id, reason, requested_import_count, effective_import_count, plan_hash, summary)
    VALUES (${reversionId}, ${org}, ${ctx.user.id}, ${reason}, ${plan.requestedIds.length}, ${order.length}, ${planHash}, ${JSON.stringify(summary)}::jsonb)
  `);
  for (const op of plan.ops) {
    const payload = op.op === 'MARK_REVERTED' ? { reversion_id: reversionId } : (op.payload ?? {});
    statements.push((txn) => txn`
      SELECT import_reversion_apply(${op.op}, ${op.table}, ${op.id}::uuid, ${org}::uuid, ${JSON.stringify(op.expected ?? null)}::jsonb, ${JSON.stringify(payload)}::jsonb)
    `);
  }
  statements.push((txn) => txn`
    UPDATE import_effects SET reverted_at = NOW(), reversion_id = ${reversionId}
    WHERE organization_id = ${org} AND import_id = ANY(${order}::uuid[]) AND reverted_at IS NULL
  `);
  statements.push((txn) => txn`
    WITH changed AS (
      UPDATE imports SET reverted_at = NOW(), reverted_by_user_id = ${ctx.user.id}, reversion_id = ${reversionId},
             reverted_context_fingerprint = context_fingerprint,
             context_fingerprint = CASE WHEN context_fingerprint IS NULL THEN NULL ELSE context_fingerprint || ${`#reverted:${reversionId}`} END,
             updated_at = NOW()
      WHERE organization_id = ${org} AND id = ANY(${order}::uuid[]) AND reverted_at IS NULL AND deleted_at IS NULL
      RETURNING 1
    )
    SELECT import_reversion_assert((SELECT COUNT(*) FROM changed) = ${order.length}, 'imports-reverted')
  `);
  order.forEach((importId, index) => {
    statements.push((txn) => txn`
      INSERT INTO import_reversion_items (reversion_id, organization_id, import_id, requested_by_user, auto_included_dependency, execution_order, effect_count, detail)
      VALUES (${reversionId}, ${org}, ${importId}, ${requested.has(importId)}, ${!requested.has(importId)}, ${index + 1}, ${plan.perImport?.get(importId)?.ops ?? 0}, '{}'::jsonb)
    `);
  });

  try {
    await sql.transaction((txn) => statements.map((build) => build(txn)));
  } catch (error) {
    const message = String(error?.message ?? '');
    // a concurrent identical confirmation already completed: that is the answer
    const raced = await existingReversion(sql, org, planHash);
    if (raced) return idempotentResult(raced);
    if (message.includes('REVERSION_PLAN_STALE') || message.includes('REVERSION_TABLE_NOT_ALLOWED')) {
      throw conflict(409, 'The state changed since the preview', 'REVERSION_PLAN_STALE');
    }
    throw error;
  }

  return {
    reversionId, status: 'completed', idempotent: false, requestedImportCount: plan.requestedIds.length,
    effectiveImportCount: order.length, impact: plan.impact, executionOrder: order,
  };
}

// ------------------------------------------------------------------------------------------------------------------ history helpers

/**
 * Light, bulk reversibility of the imports shown in the history list (the authoritative answer is the preview).
 * REVERSIBLE (ledger) | LEGACY_SAFE_CANDIDATE | BLOCKED_LEGACY | NO_EFFECTS | REVERTED | DELETED
 */
export async function importReversibility(sql, organizationId, rows) {
  const out = new Map();
  const candidates = [];
  for (const row of rows) {
    if (row.deleted_at) out.set(row.id, { state: 'DELETED' });
    else if (row.reverted_at) out.set(row.id, { state: 'REVERTED' });
    else candidates.push(row.id);
  }
  if (candidates.length === 0) return out;
  const stats = await sql`
    SELECT i.id,
      (SELECT COUNT(*)::int FROM import_effects e WHERE e.import_id = i.id AND e.reverted_at IS NULL) AS effects,
      (SELECT COUNT(*)::int FROM shifts s WHERE s.import_id = i.id) AS shifts,
      (SELECT COUNT(*)::int FROM shift_assignments a WHERE a.import_id = i.id) AS assignments,
      (SELECT COUNT(*)::int FROM calendar_annotations n WHERE n.import_id = i.id) AS annotations,
      (SELECT COUNT(*)::int FROM company_plan_revisions r WHERE r.import_id = i.id) AS plan_revisions
    FROM imports i WHERE i.organization_id = ${organizationId} AND i.id = ANY(${candidates}::uuid[])
  `;
  for (const row of stats) {
    if (row.effects > 0) out.set(row.id, { state: 'REVERSIBLE' });
    else if (row.assignments + row.annotations + row.plan_revisions > 0) out.set(row.id, { state: 'BLOCKED_LEGACY' });
    else if (row.shifts > 0) out.set(row.id, { state: 'LEGACY_SAFE_CANDIDATE' });
    else out.set(row.id, { state: 'NO_EFFECTS' });
  }
  return out;
}

export async function getImportReversionDetail(sql, ctx, rawImportId) {
  requireRole(ctx, 'ADMIN');
  const id = String(rawImportId ?? '').trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new HttpError(400, 'Import id is required');
  const rows = await sql`
    SELECT r.id, r.reason, r.created_at, r.requested_import_count, r.effective_import_count, r.summary,
           u.display_name AS requested_by_name
    FROM import_reversion_items it
    JOIN import_reversions r ON r.id = it.reversion_id
    LEFT JOIN users u ON u.id = r.requested_by_user_id
    WHERE it.import_id = ${id} AND it.organization_id = ${ctx.organizationId}
    ORDER BY r.created_at DESC LIMIT 1
  `;
  if (!rows[0]) throw new HttpError(404, 'Reversion not found');
  const items = await sql`
    SELECT it.import_id, it.requested_by_user, it.auto_included_dependency, it.execution_order, it.effect_count, i.file_name
    FROM import_reversion_items it JOIN imports i ON i.id = it.import_id
    WHERE it.reversion_id = ${rows[0].id} ORDER BY it.execution_order
  `;
  return {
    id: rows[0].id, reason: rows[0].reason, createdAt: rows[0].created_at, requestedByName: rows[0].requested_by_name ?? null,
    impact: rows[0].summary?.impact ?? null,
    items: items.map((item) => ({
      importId: item.import_id, fileName: item.file_name, requestedByUser: item.requested_by_user,
      autoIncludedDependency: item.auto_included_dependency, executionOrder: item.execution_order, effectCount: item.effect_count,
    })),
  };
}

/**
 * Legacy `DELETE /api/imports`: a single import goes through the SAME engine. Anything that would need related imports, or that is
 * blocked, is refused with USE_REVERSION_API instead of being half-deleted.
 */
export async function revertSingleImport(sql, ctx, rawImportId) {
  requireRole(ctx, 'ADMIN');
  const id = String(rawImportId ?? '').trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new HttpError(400, 'Import id is required');
  const plan = await computeReversionPlan(sql, ctx, [id]);
  const alreadyDone = plan.blockers.find((b) => b.code === BLOCKER.ALREADY_REVERTED);
  if (alreadyDone) throw conflict(409, 'Import already deleted', 'ALREADY_REVERTED');
  if (plan.status === 'BLOCKED' || plan.order.length !== 1) {
    throw conflict(409, 'This import must be reverted through the reversion API', 'USE_REVERSION_API', { blockers: plan.blockers, relatedImports: plan.order.length - 1 });
  }
  const result = await confirmImportReversion(sql, ctx, { importIds: [id], planHash: plan.planHash });
  return { deleted: true, reverted: true, importId: id, deletedShiftCount: plan.impact.shiftsRemoved, reversionId: result.reversionId };
}

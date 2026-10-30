import { createHash } from 'node:crypto';

/**
 * Import Reversion — pure planning (no I/O).
 *
 * Inputs are plain data loaded by import-reversion.js; the outputs are deterministic, so the same state always yields the same
 * plan and the same planHash (that hash is what a confirmation must present: a changed state is a stale plan).
 *
 *   effects      active ledger rows (import_effects) — BEFORE/AFTER of every mutation, strictly ordered by id
 *   dependencies two imports are related when they touched the same logical resource_key; the LATER one depends on the earlier one
 *   order        dependents first (C -> B -> A), computed here, never supplied by the user
 *   inverse      every effect is undone against the CURRENT state; anything a human changed since is never overwritten (blocker)
 */

export const BLOCKER = Object.freeze({
  LATER_MANUAL_CHANGE_UNSAFE: 'LATER_MANUAL_CHANGE_UNSAFE',
  PUBLISHED_DEPENDENCY: 'PUBLISHED_DEPENDENCY',
  PUBLISHED_SHIFT_HAS_DEPENDENTS: 'PUBLISHED_SHIFT_HAS_DEPENDENTS',
  LEGACY_PROVENANCE_INSUFFICIENT: 'LEGACY_PROVENANCE_INSUFFICIENT',
  ALREADY_REVERTED: 'ALREADY_REVERTED',
  NO_REVERSIBLE_EFFECTS: 'NO_REVERSIBLE_EFFECTS',
  REVERSION_DEPENDENCY_CYCLE: 'REVERSION_DEPENDENCY_CYCLE',
});

const NOISE = new Set(['created_at', 'updated_at']);
const ANNOTATION_ENRICHMENT = new Set(['start_time', 'end_time', 'completeness', 'updated_by_user_id', 'source_kind']);

/** Row content without volatile timestamps, with stable key order, so two states can be compared. */
export function stateOf(row) {
  if (row === null || row === undefined) return null;
  const out = {};
  for (const key of Object.keys(row).sort()) if (!NOISE.has(key)) out[key] = row[key];
  return out;
}

export const sameState = (a, b) => JSON.stringify(stateOf(a)) === JSON.stringify(stateOf(b));

const effectOrder = (a, b) => (Number(a.at) - Number(b.at)) || (Number(a.id) - Number(b.id));

/**
 * Dependency edges from the ledger: for each logical resource, every import that touched it AFTER another import depends on it.
 * `effects`: [{ id, importId, resourceKey, at }] (legacy imports contribute synthesized effects with id 0 and at = import time).
 * Returns Map(importId -> Set(importIds it depends on)).
 */
export function dependencyGraph(effects) {
  const byKey = new Map();
  for (const effect of effects) {
    if (!byKey.has(effect.resourceKey)) byKey.set(effect.resourceKey, []);
    byKey.get(effect.resourceKey).push(effect);
  }
  const deps = new Map();
  const ensure = (id) => { if (!deps.has(id)) deps.set(id, new Set()); return deps.get(id); };
  for (const list of byKey.values()) {
    list.sort(effectOrder);
    const seen = new Set();
    for (const effect of list) {
      const own = ensure(effect.importId);
      for (const earlier of seen) if (earlier !== effect.importId) own.add(earlier);
      seen.add(effect.importId);
    }
  }
  return deps;
}

/**
 * Execution order: dependents BEFORE the imports they depend on (reverse dependency order).
 * `ids` is the effective set; edges outside the set are ignored. Returns { order, cycle }.
 */
export function reverseDependencyOrder(ids, deps) {
  const inSet = new Set(ids);
  const dependents = new Map(ids.map((id) => [id, new Set()]));
  for (const id of ids) {
    for (const dep of deps.get(id) ?? []) if (inSet.has(dep)) dependents.get(dep).add(id);
  }
  // an import can be reverted once every import that depends on it is already reverted
  const remaining = new Map(ids.map((id) => [id, dependents.get(id).size]));
  const ready = ids.filter((id) => remaining.get(id) === 0).sort();
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const dep of [...(deps.get(id) ?? [])].filter((d) => inSet.has(d)).sort()) {
      remaining.set(dep, remaining.get(dep) - 1);
      if (remaining.get(dep) === 0) ready.push(dep);
    }
  }
  return { order, cycle: order.length !== ids.length };
}

const isManualEnrichment = (current, after) => {
  if (!current || !after || current.kind !== 'DCF' || current.completeness !== 'HOURS_KNOWN') return false;
  const strip = (row) => { const copy = { ...row }; for (const key of ANNOTATION_ENRICHMENT) delete copy[key]; return copy; };
  return sameState(strip(current), strip(after));
};

const TABLE_STATS = {
  shifts: { removed: 'shiftsRemoved', restored: 'shiftsRestored' },
  shift_assignments: { removed: 'assignmentsRemoved', restored: 'assignmentsRestored' },
  schedule_versions: { removed: 'draftVersionsRemoved', restored: 'draftVersionsRestored' },
  schedules: { removed: 'schedulesRemoved', restored: 'schedulesRestored' },
  calendar_changes: { removed: 'changesRemoved', restored: 'changesRestored' },
};

export const emptyImpact = () => ({
  shiftsRemoved: 0, shiftsRestored: 0, reviewCleared: 0,
  planRevisionsReverted: 0,
  assignmentsRemoved: 0, assignmentsRestored: 0, draftVersionsRemoved: 0, draftVersionsRestored: 0, schedulesRemoved: 0, schedulesRestored: 0,
  dcfRemoved: 0, dcfPreserved: 0, commentsRemoved: 0,
  changesRemoved: 0, changesRestored: 0,
  employeesAffected: 0, alreadyAbsent: 0,
});

/**
 * Inverse plan, simulated import by import in execution order, effect by effect in reverse ledger order.
 *
 * @param {object} input
 * @param {string[]} input.order                 import ids, dependents first
 * @param {Map<string, object[]>} input.effectsByImport  ordered ledger effects per import
 * @param {Map<string, object|null>} input.rows  CURRENT rows keyed `${table}:${id}` (absent/null = the row does not exist now)
 * @param {Map<string, {status:string}>} input.versions        schedule_versions by id (status)
 * @param {Map<string, Set<string>>} input.assignmentsByVersion  current assignment ids per version
 * @param {Map<string, Set<string>>} input.versionsBySchedule    current version ids per schedule
 * @param {Set<string>} input.manualAnnotationKeys  `ann:employee:date:kind:MANUAL` rows that exist now
 * @param {Map<string, number>} input.shiftDependents  published shifts that change requests, acknowledgements or comments reference (shiftId -> count)
 * @returns {{ ops: object[], blockers: object[], warnings: object[], impact: object, perImport: Map<string, object> }}
 */
export function planInverse({ order, effectsByImport, rows, versions = new Map(), assignmentsByVersion = new Map(), versionsBySchedule = new Map(), manualAnnotationKeys = new Set(), shiftDependents = new Map() }) {
  const sim = new Map(rows);
  // Version status as the simulation advances: undoing a publication (RESTORE of the version) makes its assignments deletable again.
  const simVersionStatus = new Map([...versions].map(([id, version]) => [id, version.status]));
  const statusOfVersion = (id) => simVersionStatus.get(id) ?? 'DRAFT';
  const simAssignments = new Map([...assignmentsByVersion].map(([k, v]) => [k, new Set(v)]));
  const simVersions = new Map([...versionsBySchedule].map(([k, v]) => [k, new Set(v)]));
  const ops = [];
  const blockers = [];
  const warnings = new Map();
  const impact = emptyImpact();
  const employees = new Set();
  const perImport = new Map();
  const warn = (code) => warnings.set(code, (warnings.get(code) ?? 0) + 1);
  const blockerKey = new Set();
  const block = (code, importId, effect, detail = {}) => {
    const key = `${code}|${importId}|${effect.resource_key ?? effect.resourceKey}`;
    if (blockerKey.has(key)) return;
    blockerKey.add(key);
    blockers.push({ code, importId, resourceType: effect.resource_type ?? effect.resourceType, resourceKey: effect.resource_key ?? effect.resourceKey, ...detail });
  };

  const rowKey = (table, id) => `${table}:${id}`;
  const current = (table, id) => sim.get(rowKey(table, id)) ?? null;
  const setCurrent = (table, id, row) => sim.set(rowKey(table, id), row);

  for (const importId of order) {
    const effects = [...(effectsByImport.get(importId) ?? [])].sort((a, b) => Number(b.id) - Number(a.id)); // reverse ledger order
    const stat = { ops: 0 };
    perImport.set(importId, stat);
    const push = (op, extra = {}) => { ops.push({ importId, ...op, ...extra }); stat.ops += 1; };

    for (const effect of effects) {
      const table = effect.resource_type;
      const id = effect.resource_id;
      const before = effect.before_state ?? null;
      const after = effect.after_state ?? null;
      const kind = effect.effect_kind;
      const owner = (after ?? before)?.employee_id;
      if (owner) employees.add(owner);
      if (kind === 'PLAN_COVERAGE') continue;
      const stats = TABLE_STATS[table];

      // ---- plan revisions: marked reverted (history is kept, never renumbered) -------------------------------------------------
      if (kind === 'PLAN_REVISION_INSERT') {
        const now = current(table, id);
        if (!now) { warn('ALREADY_ABSENT'); impact.alreadyAbsent += 1; continue; }
        if (now.reverted_at) continue;
        push({ op: 'MARK_REVERTED', table, id, expected: now, payload: {} });
        impact.planRevisionsReverted += 1;
        setCurrent(table, id, { ...now, reverted_at: 'reverted' });
        continue;
      }

      // ---- annotations: imported content disappears, human completion survives ------------------------------------------------
      if (kind === 'ANNOTATION_INSERT' || kind === 'ANNOTATION_UPDATE') {
        const now = current(table, id);
        const isDcf = after?.kind === 'DCF';
        const count = (removed) => {
          if (isDcf) { if (removed) impact.dcfRemoved += 1; } else if (removed) impact.commentsRemoved += 1;
        };
        if (!now) { warn('ALREADY_ABSENT'); impact.alreadyAbsent += 1; continue; }
        if (sameState(now, after)) {
          if (kind === 'ANNOTATION_INSERT') { push({ op: 'DELETE', table, id, expected: now }); count(true); setCurrent(table, id, null); } else {
            push({ op: 'RESTORE', table, id, expected: now, payload: before }); setCurrent(table, id, before);
          }
          continue;
        }
        if (isManualEnrichment(now, after)) {
          if (kind === 'ANNOTATION_INSERT') {
            const manualKey = `ann:${now.employee_id}:${now.date}:${now.kind}:MANUAL`;
            if (manualAnnotationKeys.has(manualKey)) { block(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE, importId, effect); continue; }
            push({ op: 'DETACH_MANUAL', table, id, expected: now, payload: {} });
            impact.dcfPreserved += 1;
            setCurrent(table, id, { ...now, origin: 'MANUAL', import_id: null, source_kind: null });
          } else {
            impact.dcfPreserved += 1; // the earlier import that still justifies the annotation keeps it; the human completion stays
          }
          continue;
        }
        block(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE, importId, effect);
        continue;
      }

      // ---- everything else: strict row-level inverse --------------------------------------------------------------------------
      const now = current(table, id);

      if (kind.endsWith('_INSERT')) {
        if (!now) { warn('ALREADY_ABSENT'); impact.alreadyAbsent += 1; continue; }
        if (!sameState(now, after)) {
          const published = (table === 'schedule_versions' && now.status !== 'DRAFT')
            || (table === 'shift_assignments' && statusOfVersion(now.schedule_version_id) !== 'DRAFT');
          block(published ? BLOCKER.PUBLISHED_DEPENDENCY : BLOCKER.LATER_MANUAL_CHANGE_UNSAFE, importId, effect);
          continue;
        }
        if (table === 'shift_assignments' && statusOfVersion(now.schedule_version_id) !== 'DRAFT') {
          block(BLOCKER.PUBLISHED_DEPENDENCY, importId, effect);
          continue;
        }
        // A shift materialised by a publication that something still points at (change request, acknowledgement, comment) is never
        // deleted: the whole reversal is BLOCKED, never partial (FKs would otherwise cascade-delete the dependents).
        if (table === 'shifts' && now.schedule_version_id && (shiftDependents.get(id) ?? 0) > 0) {
          block(BLOCKER.PUBLISHED_SHIFT_HAS_DEPENDENTS, importId, effect, { dependents: shiftDependents.get(id) });
          continue;
        }
        if (table === 'schedule_versions') {
          if (now.status !== 'DRAFT') { block(BLOCKER.PUBLISHED_DEPENDENCY, importId, effect); continue; }
          if ((simAssignments.get(id)?.size ?? 0) > 0) { block(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE, importId, effect, { reason: 'ASSIGNMENTS_REMAIN' }); continue; }
        }
        if (table === 'schedules' && (simVersions.get(id)?.size ?? 0) > 0) {
          warn('SHARED_SCHEDULE_KEPT'); // other versions live in this week: the container stays
          continue;
        }
        if (table === 'calendar_changes') {
          const referenced = [...sim.entries()].some(([key, row]) => key.startsWith('shifts:') && row && row.change_id === id);
          if (referenced) { block(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE, importId, effect, { reason: 'CHANGE_STILL_REFERENCED' }); continue; }
        }
        push({ op: 'DELETE', table, id, expected: now });
        if (stats) impact[stats.removed] += 1;
        if (table === 'shifts' && now.effective_state === 'REQUIRES_REVIEW') impact.reviewCleared += 1;
        setCurrent(table, id, null);
        if (table === 'shift_assignments') simAssignments.get(now.schedule_version_id)?.delete(id);
        if (table === 'schedule_versions') { simVersions.get(now.schedule_id)?.delete(id); simVersionStatus.delete(id); }
        continue;
      }

      if (kind.endsWith('_UPDATE') || kind === 'SHIFT_STATE_TRANSITION') {
        if (!now) { warn('ALREADY_ABSENT'); impact.alreadyAbsent += 1; continue; }
        if (!sameState(now, after)) { block(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE, importId, effect); continue; }
        if (table === 'schedule_versions' && before?.status === 'DRAFT' && now.status !== 'DRAFT') {
          // Undoing a publication: only one DRAFT per schedule may exist, so a draft created since (by anyone) blocks the reversal.
          const laterDraft = [...(simVersions.get(now.schedule_id) ?? [])].some((other) => other !== id && statusOfVersion(other) === 'DRAFT');
          if (laterDraft) { block(BLOCKER.PUBLISHED_DEPENDENCY, importId, effect, { reason: 'LATER_DRAFT_EXISTS' }); continue; }
        }
        push({ op: 'RESTORE', table, id, expected: now, payload: before });
        if (stats) impact[stats.restored] += 1;
        setCurrent(table, id, before);
        if (table === 'schedule_versions' && before?.status) simVersionStatus.set(id, before.status);
        continue;
      }

      if (kind.endsWith('_DELETE')) {
        if (now) {
          if (sameState(now, before)) continue; // already back
          block(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE, importId, effect);
          continue;
        }
        push({ op: 'INSERT', table, id, expected: null, payload: before });
        if (stats) impact[stats.restored] += 1;
        setCurrent(table, id, before);
        if (table === 'shift_assignments') simAssignments.get(before.schedule_version_id)?.add(id);
      }
    }
  }

  impact.employeesAffected = employees.size;
  return { ops, blockers, warnings: [...warnings].map(([code, count]) => ({ code, count })), impact, perImport };
}

/** Deterministic fingerprint of a plan: imports in execution order + every operation (with the state it expects) + blockers. */
export function planHashOf({ order, ops, blockers }) {
  const digest = (value) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
  return createHash('sha256').update(JSON.stringify({
    order,
    ops: ops.map((op) => [op.importId, op.op, op.table, op.id, digest(stateOf(op.expected)), digest(op.payload ? stateOf(op.payload) : null)]),
    blockers: blockers.map((b) => [b.code, b.importId, b.resourceKey]),
  })).digest('hex');
}

/**
 * Legacy imports (written before the ledger existed) have no BEFORE state: they are reversible only when the evidence proves they
 * did nothing but create their own plain shifts, untouched since. Anything else is blocked — never a partial rollback.
 */
export function classifyLegacyImport({ shifts, assignments = 0, annotations = 0, planRevisions = 0, laterShiftEdits = 0, relatedChanges = 0 }) {
  if (assignments > 0 || annotations > 0 || planRevisions > 0 || relatedChanges > 0) return { state: 'BLOCKED_INSUFFICIENT_PROVENANCE', reason: 'COMPLEX_EFFECTS' };
  if (shifts.length === 0) return { state: 'NO_EFFECTS', reason: 'NO_ROWS' };
  const plain = shifts.every((row) => (row.effective_state ?? 'EFFECTIVE') === 'EFFECTIVE' && (row.layer ?? 'COMPANY_PLAN') === 'COMPANY_PLAN' && !row.change_id);
  if (!plain) return { state: 'BLOCKED_INSUFFICIENT_PROVENANCE', reason: 'STATE_TRANSITIONS' };
  if (laterShiftEdits > 0) return { state: 'BLOCKED_INSUFFICIENT_PROVENANCE', reason: 'EDITED_AFTER_IMPORT' };
  return { state: 'LEGACY_SAFE_SHIFT_ONLY', reason: null };
}

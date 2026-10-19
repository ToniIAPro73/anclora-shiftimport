import { describe, expect, it } from 'vitest';
import {
  BLOCKER, classifyLegacyImport, dependencyGraph, planHashOf, planInverse, reverseDependencyOrder, sameState,
} from './import-reversion-planner.js';

const effect = (id, importId, resourceKey, at = id) => ({ id, importId, resourceKey, at });

describe('dependency graph and execution order (the user never orders imports)', () => {
  it('independent imports on different resources do not depend on each other, however late they are', () => {
    const deps = dependencyGraph([effect(1, 'A', 'day:sebastian:2026-03-03'), effect(2, 'B', 'day:maria:2026-07-08')]);
    expect([...(deps.get('B') ?? [])]).toEqual([]);
    expect([...(deps.get('A') ?? [])]).toEqual([]);
  });

  it('A -> B -> C on one resource: C is reverted first, then B, then A (any selection order)', () => {
    const deps = dependencyGraph([effect(1, 'A', 'k'), effect(2, 'B', 'k'), effect(3, 'C', 'k')]);
    for (const ids of [['A', 'B', 'C'], ['C', 'A', 'B'], ['B', 'C', 'A']]) {
      expect(reverseDependencyOrder(ids, deps)).toEqual({ order: ['C', 'B', 'A'], cycle: false });
    }
  });

  it('diamond: A -> B -> D and A -> C -> D reverts D first, then B and C, A last', () => {
    // build the diamond explicitly with per-key chronology: A<B<D on key x, A<C<D on key y
    const diamond = dependencyGraph([
      effect(1, 'A', 'x'), effect(2, 'B', 'x'), effect(3, 'D', 'x'),
      effect(4, 'A', 'y'), effect(5, 'C', 'y'), effect(6, 'D', 'y'),
    ]);
    const { order, cycle } = reverseDependencyOrder(['A', 'B', 'C', 'D'], diamond);
    expect(cycle).toBe(false);
    expect(order[0]).toBe('D');
    expect(order[3]).toBe('A');
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('A'));
  });

  it('a cycle (A before B on one resource, B before A on another) is reported, never ordered', () => {
    const deps = dependencyGraph([effect(1, 'A', 'x'), effect(2, 'B', 'x'), effect(3, 'B', 'y'), effect(4, 'A', 'y')]);
    expect(reverseDependencyOrder(['A', 'B'], deps).cycle).toBe(true);
  });
});

const shift = (id, over = {}) => ({ id, organization_id: 'o', employee_id: 'e', date: '2026-03-03', start_time: '10:00', end_time: '18:00', effective_state: 'EFFECTIVE', layer: 'COMPANY_PLAN', change_id: null, updated_at: 'x', ...over });
const fx = (id, importId, kind, type, rid, before, after, key = 'day:e:2026-03-03') => ({
  id, import_id: importId, effect_kind: kind, resource_type: type, resource_key: key, resource_id: rid, before_state: before, after_state: after,
});
const plan = (order, effects, rows, extra = {}) => planInverse({
  order, effectsByImport: new Map(order.map((id) => [id, effects.filter((e) => e.import_id === id)])), rows: new Map(Object.entries(rows)), ...extra,
});

describe('inverse planning', () => {
  it('an inserted shift still as imported is removed; the ledger keeps the audit', () => {
    const after = shift('s1');
    const result = plan(['A'], [fx(1, 'A', 'SHIFT_INSERT', 'shifts', 's1', null, after)], { 'shifts:s1': after });
    expect(result.blockers).toEqual([]);
    expect(result.ops.map((o) => [o.op, o.table, o.id])).toEqual([['DELETE', 'shifts', 's1']]);
    expect(result.impact.shiftsRemoved).toBe(1);
  });

  it('LATER MANUAL CHANGE: an admin edited the imported shift -> BLOCKED, never deleted', () => {
    const after = shift('s1');
    const edited = shift('s1', { start_time: '11:00', end_time: '19:00' });
    const result = plan(['A'], [fx(1, 'A', 'SHIFT_INSERT', 'shifts', 's1', null, after)], { 'shifts:s1': edited });
    expect(result.ops).toEqual([]);
    expect(result.blockers[0].code).toBe(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE);
  });

  it('a modified existing shift is RESTORED to its BEFORE state, not deleted', () => {
    const before = shift('s1', { start_time: '11:00', end_time: '19:00' });
    const after = shift('s1');
    const result = plan(['A'], [fx(1, 'A', 'SHIFT_UPDATE', 'shifts', 's1', before, after)], { 'shifts:s1': after });
    expect(result.ops[0]).toMatchObject({ op: 'RESTORE', table: 'shifts', id: 's1' });
    expect(result.ops[0].payload.start_time).toBe('11:00');
    expect(result.impact.shiftsRestored).toBe(1);
  });

  it('legacy import effects superseded by Baja reverse in ledger order and restore the historical row', () => {
    const plan1422 = shift('p', { start_time: '14:00', end_time: '22:00' });
    const planSuperseded = { ...plan1422, effective_state: 'SUPERSEDED', change_id: 'c1' };
    const baja = shift('b', { start_time: null, end_time: null, shift_type: 'Baja', layer: 'CHANGE', change_id: 'c1' });
    const change = { id: 'c1', organization_id: 'o', employee_id: 'e', date: '2026-03-03', change_type: 'REPLACE_DAY', created_at: 'x' };
    const effects = [
      fx(1, 'A', 'CALENDAR_CHANGE_INSERT', 'calendar_changes', 'c1', null, change),
      fx(2, 'A', 'SHIFT_STATE_TRANSITION', 'shifts', 'p', plan1422, planSuperseded),
      fx(3, 'A', 'SHIFT_INSERT', 'shifts', 'b', null, baja),
    ];
    const result = plan(['A'], effects, { 'shifts:p': planSuperseded, 'shifts:b': baja, 'calendar_changes:c1': change });
    expect(result.blockers).toEqual([]);
    expect(result.ops.map((o) => [o.op, o.table, o.id])).toEqual([['DELETE', 'shifts', 'b'], ['RESTORE', 'shifts', 'p'], ['DELETE', 'calendar_changes', 'c1']]);
    expect(result.ops[1].payload.effective_state).toBe('EFFECTIVE');
  });

  it('a calendar change still referenced by a shift that stays cannot be removed', () => {
    const change = { id: 'c1', organization_id: 'o', employee_id: 'e', date: 'd', change_type: 'REPLACE_DAY' };
    const keeper = shift('k', { change_id: 'c1' });
    const result = plan(['A'], [fx(1, 'A', 'CALENDAR_CHANGE_INSERT', 'calendar_changes', 'c1', null, change)], { 'calendar_changes:c1': change, 'shifts:k': keeper });
    expect(result.blockers[0].code).toBe(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE);
  });

  it('plan revisions are MARKED reverted (history kept), and a legacy-replaced shift (DELETE effect) is re-inserted', () => {
    const revision = { id: 'r1', organization_id: 'o', scope_key: 'global', revision_number: 2, reverted_at: null };
    const old = shift('old');
    const result = plan(['A'], [
      fx(1, 'A', 'SHIFT_DELETE', 'shifts', 'old', old, null),
      fx(2, 'A', 'PLAN_REVISION_INSERT', 'company_plan_revisions', 'r1', null, revision, 'planrev:global:2'),
    ], { 'shifts:old': null, 'company_plan_revisions:r1': revision });
    expect(result.ops.map((o) => o.op)).toEqual(['MARK_REVERTED', 'INSERT']);
    expect(result.impact.planRevisionsReverted).toBe(1);
  });

  it('multiple imports are inverted in the computed order against the simulated state: C -> B -> A leaves the original', () => {
    const v0 = shift('s', { start_time: '08:00' });
    const v1 = shift('s', { start_time: '09:00' });
    const v2 = shift('s', { start_time: '10:00' });
    const effects = [
      fx(1, 'A', 'SHIFT_UPDATE', 'shifts', 's', v0, v1),
      fx(2, 'B', 'SHIFT_UPDATE', 'shifts', 's', v1, v2),
    ];
    const result = plan(['B', 'A'], effects, { 'shifts:s': v2 });
    expect(result.blockers).toEqual([]);
    expect(result.ops.map((o) => o.importId)).toEqual(['B', 'A']);
    expect(result.ops[1].payload.start_time).toBe('08:00');
  });

  describe('DCF / comments', () => {
    const ann = (over = {}) => ({ id: 'n1', organization_id: 'o', employee_id: 'e', date: '2026-03-23', kind: 'DCF', body: null, start_time: null, end_time: null, completeness: 'HOURS_UNKNOWN', origin: 'IMPORT', import_id: 'A', source_kind: 'EMPLOYEE_CALENDAR_EXPORT', updated_by_user_id: 'u', ...over });
    const key = 'ann:e:2026-03-23:DCF:IMPORT';

    it('DCF 1: an imported DCF nobody touched disappears', () => {
      const created = ann();
      const result = plan(['A'], [fx(1, 'A', 'ANNOTATION_INSERT', 'calendar_annotations', 'n1', null, created, key)], { 'calendar_annotations:n1': created });
      expect(result.ops[0].op).toBe('DELETE');
      expect(result.impact.dcfRemoved).toBe(1);
    });

    it('DCF 2: hours completed by a human survive as an independent manual annotation (never silently deleted)', () => {
      const created = ann();
      const enriched = ann({ completeness: 'HOURS_KNOWN', start_time: '22:30:00', end_time: '01:00:00', updated_by_user_id: 'admin' });
      const result = plan(['A'], [fx(1, 'A', 'ANNOTATION_INSERT', 'calendar_annotations', 'n1', null, created, key)], { 'calendar_annotations:n1': enriched });
      expect(result.blockers).toEqual([]);
      expect(result.ops[0].op).toBe('DETACH_MANUAL');
      expect(result.impact.dcfPreserved).toBe(1);
      expect(result.impact.dcfRemoved).toBe(0);
    });

    it('DCF 2b: if a MANUAL annotation for that day already exists the detach is blocked (no overwrite)', () => {
      const created = ann();
      const enriched = ann({ completeness: 'HOURS_KNOWN', start_time: '22:30:00', end_time: '01:00:00' });
      const result = plan(['A'], [fx(1, 'A', 'ANNOTATION_INSERT', 'calendar_annotations', 'n1', null, created, key)], { 'calendar_annotations:n1': enriched }, { manualAnnotationKeys: new Set(['ann:e:2026-03-23:DCF:MANUAL']) });
      expect(result.blockers[0].code).toBe(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE);
    });

    it('DCF 3/4: B re-affirmed the DCF; reverting B alone restores A\'s annotation; reverting B + A removes it', () => {
      const a1 = ann();
      const b1 = ann({ import_id: 'B', updated_by_user_id: 'u2' });
      const effects = [
        fx(1, 'A', 'ANNOTATION_INSERT', 'calendar_annotations', 'n1', null, a1, key),
        fx(2, 'B', 'ANNOTATION_UPDATE', 'calendar_annotations', 'n1', a1, b1, key),
      ];
      const onlyB = plan(['B'], effects, { 'calendar_annotations:n1': b1 });
      expect(onlyB.ops[0]).toMatchObject({ op: 'RESTORE' });
      expect(onlyB.impact.dcfRemoved).toBe(0); // the DCF is still active through A
      const both = plan(['B', 'A'], effects, { 'calendar_annotations:n1': b1 });
      expect(both.ops.map((o) => o.op)).toEqual(['RESTORE', 'DELETE']);
      expect(both.impact.dcfRemoved).toBe(1);
    });

    it('comments: imported text disappears; a changed comment is never guessed', () => {
      const c = ann({ kind: 'COMMENT', body: 'cambio', completeness: null });
      const ok = plan(['A'], [fx(1, 'A', 'ANNOTATION_INSERT', 'calendar_annotations', 'n1', null, c, 'ann:e:d:COMMENT:IMPORT')], { 'calendar_annotations:n1': c });
      expect(ok.impact.commentsRemoved).toBe(1);
      const changed = plan(['A'], [fx(1, 'A', 'ANNOTATION_INSERT', 'calendar_annotations', 'n1', null, c, 'ann:e:d:COMMENT:IMPORT')], { 'calendar_annotations:n1': { ...c, body: 'otro' } });
      expect(changed.blockers[0].code).toBe(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE);
    });
  });

  describe('planning (drafts / published)', () => {
    const version = (status = 'DRAFT') => ({ id: 'v1', schedule_id: 's1', status, version_number: 1 });
    const asg = (id) => ({ id, schedule_version_id: 'v1', employee_id: 'e', date: '2026-10-20', start_time: '13:00', end_time: '21:00' });

    it('draft assignments and the draft version an import created are removed (assignments first)', () => {
      const effects = [
        fx(1, 'A', 'SCHEDULE_VERSION_INSERT', 'schedule_versions', 'v1', null, version(), 'sch:s1'),
        fx(2, 'A', 'ASSIGNMENT_INSERT', 'shift_assignments', 'a1', null, asg('a1'), 'asg:s1:e:2026-10-20'),
      ];
      const result = plan(['A'], effects, { 'schedule_versions:v1': version(), 'shift_assignments:a1': asg('a1') }, {
        versions: new Map([['v1', { status: 'DRAFT' }]]), assignmentsByVersion: new Map([['v1', new Set(['a1'])]]),
      });
      expect(result.blockers).toEqual([]);
      expect(result.ops.map((o) => [o.op, o.table])).toEqual([['DELETE', 'shift_assignments'], ['DELETE', 'schedule_versions']]);
    });

    it('PUBLISHED: a version that is no longer a draft is never rewritten -> PUBLISHED_DEPENDENCY', () => {
      const effects = [fx(1, 'A', 'ASSIGNMENT_INSERT', 'shift_assignments', 'a1', null, asg('a1'), 'asg:s1:e:2026-10-20')];
      const result = plan(['A'], effects, { 'shift_assignments:a1': asg('a1') }, { versions: new Map([['v1', { status: 'PUBLISHED' }]]) });
      expect(result.ops).toEqual([]);
      expect(result.blockers[0].code).toBe(BLOCKER.PUBLISHED_DEPENDENCY);
    });

    it('assignments of someone else left in a draft version stop the version from being deleted', () => {
      const effects = [fx(1, 'A', 'SCHEDULE_VERSION_INSERT', 'schedule_versions', 'v1', null, version(), 'sch:s1')];
      const result = plan(['A'], effects, { 'schedule_versions:v1': version() }, { versions: new Map([['v1', { status: 'DRAFT' }]]), assignmentsByVersion: new Map([['v1', new Set(['other'])]]) });
      expect(result.blockers[0].code).toBe(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE);
    });
  });

  it('REQUIRES_REVIEW rows created by the import are cleared; a human-resolved day (state changed) blocks', () => {
    const review = shift('r1', { effective_state: 'REQUIRES_REVIEW' });
    const cleared = plan(['A'], [fx(1, 'A', 'SHIFT_INSERT', 'shifts', 'r1', null, review)], { 'shifts:r1': review });
    expect(cleared.impact.reviewCleared).toBe(1);
    const resolved = plan(['A'], [fx(1, 'A', 'SHIFT_INSERT', 'shifts', 'r1', null, review)], { 'shifts:r1': { ...review, effective_state: 'EFFECTIVE' } });
    expect(resolved.blockers[0].code).toBe(BLOCKER.LATER_MANUAL_CHANGE_UNSAFE);
  });
});

describe('plan hash (stale detection) and legacy classification', () => {
  it('the same state gives the same hash; any difference in what an operation expects changes it', () => {
    const op = { importId: 'A', op: 'DELETE', table: 'shifts', id: 's1', expected: shift('s1'), payload: null };
    const base = { order: ['A'], ops: [op], blockers: [] };
    expect(planHashOf(base)).toBe(planHashOf({ ...base, ops: [{ ...op }] }));
    expect(planHashOf(base)).not.toBe(planHashOf({ ...base, ops: [{ ...op, expected: shift('s1', { start_time: '09:00' }) }] }));
    expect(sameState(shift('s1', { updated_at: 'a' }), shift('s1', { updated_at: 'b' }))).toBe(true); // volatile timestamps are ignored
  });

  it('legacy: only plain, untouched shifts are reversible; anything richer is blocked (never a partial rollback)', () => {
    const plain = [shift('1'), shift('2')];
    expect(classifyLegacyImport({ shifts: plain }).state).toBe('LEGACY_SAFE_SHIFT_ONLY');
    expect(classifyLegacyImport({ shifts: plain, assignments: 2 }).state).toBe('BLOCKED_INSUFFICIENT_PROVENANCE');
    expect(classifyLegacyImport({ shifts: plain, planRevisions: 1 }).state).toBe('BLOCKED_INSUFFICIENT_PROVENANCE');
    expect(classifyLegacyImport({ shifts: plain, annotations: 1 }).state).toBe('BLOCKED_INSUFFICIENT_PROVENANCE');
    expect(classifyLegacyImport({ shifts: [shift('1', { effective_state: 'SUPERSEDED' })] }).reason).toBe('STATE_TRANSITIONS');
    expect(classifyLegacyImport({ shifts: plain, laterShiftEdits: 1 }).reason).toBe('EDITED_AFTER_IMPORT');
    expect(classifyLegacyImport({ shifts: plain, relatedChanges: 1 }).state).toBe('BLOCKED_INSUFFICIENT_PROVENANCE');
    expect(classifyLegacyImport({ shifts: [] }).state).toBe('NO_EFFECTS');
  });
});

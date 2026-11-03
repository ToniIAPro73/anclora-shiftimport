import type { ShiftAssignment } from './remote';

/**
 * Header counters of a planner version (F4-FIX-01). An assignment is planning evidence; a shift is operational truth, so a published
 * version never reports "N shifts" for what it merely holds: it separates what its publication materialized from what it excluded.
 *
 * `excludedFromPublication` is derived by the server from the shifts the publication really created, so `published` is not
 * `total - stale` (an assignment can also be left out for another reason, and a stale flag can outlive a successful publication).
 */
export type PlannerCounts =
  | { mode: 'draft'; planned: number; stale: number }
  | { mode: 'published'; published: number; excluded: number };

export function plannerCounts(status: string, assignments: Array<Pick<ShiftAssignment, 'staleAgainstCalendar' | 'excludedFromPublication'>>): PlannerCounts {
  if (status === 'DRAFT') {
    return { mode: 'draft', planned: assignments.length, stale: assignments.filter((assignment) => assignment.staleAgainstCalendar).length };
  }
  const excluded = assignments.filter((assignment) => assignment.excludedFromPublication).length;
  return { mode: 'published', published: assignments.length - excluded, excluded };
}

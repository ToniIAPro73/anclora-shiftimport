/**
 * Approval eligibility for time-off requests (spec §4.3.0, INV-13).
 *
 * Authorisation is the canonical chain `resolveEffectiveAccessScope` (caller, into the actor) → `isTargetInScope` → `can(...)`,
 * then the organisation's `approval_policy` narrows WHO among the in-scope actors decides. It never reads `scoped_area_id` on its
 * own (legacy anomaly V-07, registered as D-01 and deliberately not copied) and never trusts a client-supplied employee/org id.
 *
 * Pure: the caller loads tenant-validated candidates; this module decides.
 */
import { ACTIONS, can, isTargetInScope } from './authorization.js';

export const CANNOT_DECIDE = Object.freeze({
  SELF_REQUEST: 'SELF_REQUEST',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  POLICY: 'POLICY',
});

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN', 'PLANNER']);

/** PLANNER scope as used by the rest of the authorisation layer (same defaulting as `isTargetInScope`). */
export function plannerScopeTypeOf(actor) {
  if (actor?.role !== 'PLANNER') return null;
  return actor.plannerScopeType
    || ((actor.scopedAreaIds?.length ?? 0) > 0 || actor.scopedAreaId ? 'AREAS' : 'ORGANIZATION');
}

const isOrganizationLevel = (actor) =>
  actor.role === 'OWNER' || actor.role === 'ADMIN' || (actor.role === 'PLANNER' && plannerScopeTypeOf(actor) === 'ORGANIZATION');

function isAreaLevel(actor, target, areaResponsibleUserIds) {
  if (actor.role === 'ADMIN') return Boolean(target.areaId) && areaResponsibleUserIds.includes(actor.userId);
  if (actor.role === 'PLANNER') return plannerScopeTypeOf(actor) === 'AREAS' || plannerScopeTypeOf(actor) === 'EMPLOYEES';
  return false;
}

/**
 * The actors entitled to decide a request, among `candidates`.
 *
 * - `ORGANIZATION_ADMIN` / `NO_APPROVAL` (a request still needs a human decision): OWNER, ADMIN and organisation-wide PLANNERs.
 * - `AREA_RESPONSIBLE`: the area's responsible admins and the PLANNERs whose scope (AREAS/EMPLOYEES) covers the employee; when
 *   there are none, it falls back to the organisation level (same rule as `resolveApprovers`).
 * Every candidate must first pass scope + anti-self-approval (`can(..., APPROVE_REQUEST, target)`), by `userId` AND `employeeId`.
 *
 * @param {{ employeeId: string, areaId?: string|null, requesterUserId?: string|null }} target
 */
export function resolveTimeOffApprovers({ policy, target, candidates = [], areaResponsibleUserIds = [] }) {
  const inScope = candidates.filter((actor) =>
    MANAGER_ROLES.has(actor?.role) && isTargetInScope(actor, target) && can(actor, ACTIONS.APPROVE_REQUEST, target));
  if (policy !== 'AREA_RESPONSIBLE') return inScope.filter(isOrganizationLevel);
  const areaLevel = inScope.filter((actor) => isAreaLevel(actor, target, areaResponsibleUserIds));
  return areaLevel.length > 0 ? areaLevel : inScope.filter(isOrganizationLevel);
}

/**
 * Decision for ONE actor (drives `canDecide` / `cannotDecideReason` on request cards and the approve/reject endpoints).
 * `candidates` is the tenant-validated pool of managers (the actor is added when missing, so the area fallback is computed
 * against the real pool).
 */
export function evaluateApprovalEligibility({ actor, policy, target, candidates = [], areaResponsibleUserIds = [] }) {
  const isSelf = Boolean(
    (target.requesterUserId && target.requesterUserId === actor?.userId)
    || (actor?.employeeId && target.employeeId && target.employeeId === actor.employeeId),
  );
  if (isSelf) return { canDecide: false, cannotDecideReason: CANNOT_DECIDE.SELF_REQUEST };
  if (!actor || !MANAGER_ROLES.has(actor.role) || !isTargetInScope(actor, target) || !can(actor, ACTIONS.APPROVE_REQUEST, target)) {
    return { canDecide: false, cannotDecideReason: CANNOT_DECIDE.OUT_OF_SCOPE };
  }
  const pool = candidates.some((candidate) => candidate.userId === actor.userId) ? candidates : [...candidates, actor];
  const approvers = resolveTimeOffApprovers({ policy, target, candidates: pool, areaResponsibleUserIds });
  return approvers.some((approver) => approver.userId === actor.userId)
    ? { canDecide: true, cannotDecideReason: null }
    : { canDecide: false, cannotDecideReason: CANNOT_DECIDE.POLICY };
}

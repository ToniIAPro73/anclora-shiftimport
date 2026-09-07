/**
 * Canonical Authorization Service (P5.7)
 * Implements can(actor, action, target) strictly according to docs/product/RBAC_SCOPE_MATRIX.md.
 */

export const ACTIONS = Object.freeze({
  VIEW_TEAM: 'VIEW_TEAM',
  MANAGE_USERS: 'MANAGE_USERS',
  CREATE_ADMIN: 'CREATE_ADMIN',
  CREATE_PLANNER: 'CREATE_PLANNER',
  CREATE_EMPLOYEE: 'CREATE_EMPLOYEE',
  MANAGE_AREA: 'MANAGE_AREA',
  ASSIGN_EMPLOYEE: 'ASSIGN_EMPLOYEE',
  ASSIGN_PLANNER: 'ASSIGN_PLANNER',
  PLAN: 'PLAN',
  PUBLISH: 'PUBLISH',
  IMPORT_SELF: 'IMPORT_SELF',
  IMPORT_TEAM: 'IMPORT_TEAM',
  VIEW_SELF_SHIFT: 'VIEW_SELF_SHIFT',
  EDIT_SHIFT: 'EDIT_SHIFT',
  CREATE_REQUEST: 'CREATE_REQUEST',
  VIEW_REQUEST: 'VIEW_REQUEST',
  APPROVE_REQUEST: 'APPROVE_REQUEST',
  REJECT_REQUEST: 'REJECT_REQUEST',
  TRANSFER_OWNERSHIP: 'TRANSFER_OWNERSHIP',
});

/**
 * Checks if a target entity falls within the actor's operational scope.
 */
export function isTargetInScope(actor, target = {}) {
  if (!actor || !actor.role) return false;
  if (actor.role === 'OWNER' || actor.role === 'ADMIN') return true;

  if (actor.role === 'PLANNER') {
    const scopeType = actor.plannerScopeType || (actor.scopedAreaIds?.length > 0 ? 'AREAS' : (actor.scopedAreaId ? 'AREAS' : 'ORGANIZATION'));

    if (scopeType === 'ORGANIZATION') {
      return true;
    }

    if (scopeType === 'AREAS') {
      const allowedAreas = new Set([
        ...(actor.scopedAreaIds || []),
        ...(actor.scopedAreaId ? [actor.scopedAreaId] : []),
      ]);
      const targetAreaId = target.areaId || target.employeeAreaId;
      return Boolean(targetAreaId && allowedAreas.has(targetAreaId));
    }

    if (scopeType === 'EMPLOYEES') {
      const allowedEmployees = new Set(actor.scopedEmployeeIds || []);
      const targetEmpId = target.employeeId || target.id;
      return Boolean(targetEmpId && allowedEmployees.has(targetEmpId));
    }

    return false;
  }

  if (actor.role === 'EMPLOYEE') {
    const actorEmpId = actor.employeeId;
    if (!actorEmpId) return false;
    const targetEmpId = target.employeeId || (target.type === 'EMPLOYEE' ? target.id : null);
    return Boolean(targetEmpId && targetEmpId === actorEmpId);
  }

  return false;
}

/**
 * Canonical authorization check: can(actor, action, target)
 *
 * @param {Object} actor
 * @param {string} actor.userId
 * @param {'OWNER'|'ADMIN'|'PLANNER'|'EMPLOYEE'} actor.role
 * @param {string|null} [actor.employeeId]
 * @param {'ORGANIZATION'|'AREAS'|'EMPLOYEES'|null} [actor.plannerScopeType]
 * @param {string[]} [actor.scopedAreaIds]
 * @param {string|null} [actor.scopedAreaId]
 * @param {string[]} [actor.scopedEmployeeIds]
 *
 * @param {string} action One of ACTIONS
 * @param {Object} [target]
 *
 * @returns {boolean}
 */
export function can(actor, action, target = {}) {
  if (!actor || !actor.role) return false;

  const role = actor.role;

  switch (action) {
    case ACTIONS.VIEW_TEAM:
      if (role === 'OWNER' || role === 'ADMIN') return true;
      if (role === 'PLANNER') return true; // read-only visibility within assigned scope
      return false;

    case ACTIONS.MANAGE_USERS:
      if (role === 'OWNER') return true;
      if (role === 'ADMIN') {
        // Admin cannot demote/edit owner or transfer ownership
        if (target.role === 'OWNER' || target.isOwner) return false;
        return true;
      }
      return false;

    case ACTIONS.CREATE_ADMIN:
    case ACTIONS.CREATE_PLANNER:
    case ACTIONS.CREATE_EMPLOYEE:
    case ACTIONS.MANAGE_AREA:
    case ACTIONS.ASSIGN_EMPLOYEE:
    case ACTIONS.ASSIGN_PLANNER:
      return role === 'OWNER' || role === 'ADMIN';

    case ACTIONS.TRANSFER_OWNERSHIP:
      // Only the sole active OWNER can initiate ownership transfer
      return role === 'OWNER' && Boolean(target.targetUserId && target.targetUserId !== actor.userId);

    case ACTIONS.PLAN:
    case ACTIONS.PUBLISH:
    case ACTIONS.IMPORT_TEAM:
      if (role === 'OWNER' || role === 'ADMIN') return true;
      if (role === 'PLANNER') return isTargetInScope(actor, target);
      return false;

    case ACTIONS.EDIT_SHIFT:
      if (role === 'OWNER' || role === 'ADMIN') return true;
      if (role === 'PLANNER') return isTargetInScope(actor, target);
      // EMPLOYEE cannot directly edit existing official shifts
      return false;

    case ACTIONS.IMPORT_SELF:
    case ACTIONS.VIEW_SELF_SHIFT:
      // Requires an associated employee
      if (!actor.employeeId) return false;
      if (target.employeeId && target.employeeId !== actor.employeeId) return false;
      return true;

    case ACTIONS.CREATE_REQUEST:
      if (!actor.employeeId) return false;
      if (target.employeeId && target.employeeId !== actor.employeeId) return false;
      return true;

    case ACTIONS.VIEW_REQUEST:
      if (role === 'OWNER' || role === 'ADMIN') return true;
      if (role === 'PLANNER') return isTargetInScope(actor, target);
      if (role === 'EMPLOYEE') {
        return Boolean(
          (actor.employeeId && target.employeeId === actor.employeeId) ||
          (actor.userId && target.requesterUserId === actor.userId)
        );
      }
      return false;

    case ACTIONS.APPROVE_REQUEST:
    case ACTIONS.REJECT_REQUEST: {
      // ANTI-SELF-APPROVAL / REJECTION CONTRACT
      const isSelfRequest = (target.requesterUserId && target.requesterUserId === actor.userId) ||
        (actor.employeeId && target.employeeId && target.employeeId === actor.employeeId);
      if (isSelfRequest) {
        return false; // Forbidden: Manager cannot approve/reject own request
      }

      if (role === 'OWNER' || role === 'ADMIN') return true;
      if (role === 'PLANNER') return isTargetInScope(actor, target);
      return false;
    }

    default:
      return false;
  }
}

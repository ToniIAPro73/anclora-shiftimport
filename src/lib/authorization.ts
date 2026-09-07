/**
 * Canonical Authorization Service (P5.7) — Frontend
 * Implements can(actor, action, target) strictly according to docs/product/RBAC_SCOPE_MATRIX.md.
 */

import type { Role } from './session';

export const ACTIONS = {
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
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

export interface Actor {
  userId?: string | null;
  role?: Role | null;
  employeeId?: string | null;
  plannerScopeType?: 'ORGANIZATION' | 'AREAS' | 'EMPLOYEES' | null;
  scopedAreaIds?: string[];
  scopedAreaId?: string | null;
  scopedEmployeeIds?: string[];
}

export interface Target {
  type?: string;
  id?: string;
  organizationId?: string;
  role?: Role | string;
  isOwner?: boolean;
  targetUserId?: string;
  userId?: string;
  employeeId?: string;
  areaId?: string;
  employeeAreaId?: string;
  requesterUserId?: string;
}

/**
 * Checks if a target entity falls within the actor's operational scope.
 */
export function isTargetInScope(actor: Actor | null | undefined, target: Target = {}): boolean {
  if (!actor || !actor.role) return false;
  if (actor.role === 'OWNER' || actor.role === 'ADMIN') return true;

  if (actor.role === 'PLANNER') {
    const scopeType =
      actor.plannerScopeType ||
      ((actor.scopedAreaIds && actor.scopedAreaIds.length > 0) || actor.scopedAreaId
        ? 'AREAS'
        : 'ORGANIZATION');

    if (scopeType === 'ORGANIZATION') {
      return true;
    }

    if (scopeType === 'AREAS') {
      const allowedAreas = new Set<string>([
        ...(actor.scopedAreaIds || []),
        ...(actor.scopedAreaId ? [actor.scopedAreaId] : []),
      ]);
      const targetAreaId = target.areaId || target.employeeAreaId;
      return Boolean(targetAreaId && allowedAreas.has(targetAreaId));
    }

    if (scopeType === 'EMPLOYEES') {
      const allowedEmployees = new Set<string>(actor.scopedEmployeeIds || []);
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
 */
export function can(actor: Actor | null | undefined, action: Action, target: Target = {}): boolean {
  if (!actor || !actor.role) return false;

  const role = actor.role;

  switch (action) {
    case ACTIONS.VIEW_TEAM:
      if (role === 'OWNER' || role === 'ADMIN') return true;
      if (role === 'PLANNER') return true; // read-only visibility in scope
      return false;

    case ACTIONS.MANAGE_USERS:
      if (role === 'OWNER') return true;
      if (role === 'ADMIN') {
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
      return false;

    case ACTIONS.IMPORT_SELF:
    case ACTIONS.VIEW_SELF_SHIFT:
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
      const isSelfRequest =
        Boolean(target.requesterUserId && target.requesterUserId === actor.userId) ||
        Boolean(actor.employeeId && target.employeeId && target.employeeId === actor.employeeId);
      if (isSelfRequest) {
        return false;
      }

      if (role === 'OWNER' || role === 'ADMIN') return true;
      if (role === 'PLANNER') return isTargetInScope(actor, target);
      return false;
    }

    default:
      return false;
  }
}

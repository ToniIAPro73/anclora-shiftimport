import { describe, expect, it } from 'vitest';
import { ACTIONS, can } from './authorization';
import type { Actor } from './authorization';

describe('Frontend Canonical Authorization Service (can)', () => {
  const owner: Actor = { userId: 'u-owner', role: 'OWNER', employeeId: null };
  const ownerWithEmp: Actor = { userId: 'u-owner-emp', role: 'OWNER', employeeId: 'emp-owner' };
  const admin: Actor = { userId: 'u-admin', role: 'ADMIN', employeeId: null };
  const adminWithEmp: Actor = { userId: 'u-admin-emp', role: 'ADMIN', employeeId: 'emp-admin' };

  const areaPlanner: Actor = {
    userId: 'u-planner-area',
    role: 'PLANNER',
    plannerScopeType: 'AREAS',
    scopedAreaIds: ['area-1', 'area-2'],
    employeeId: null,
  };
  const employeePlanner: Actor = {
    userId: 'u-planner-emp',
    role: 'PLANNER',
    plannerScopeType: 'EMPLOYEES',
    scopedEmployeeIds: ['emp-1', 'emp-2'],
    employeeId: null,
  };

  const employee: Actor = {
    userId: 'u-emp',
    role: 'EMPLOYEE',
    employeeId: 'emp-regular',
  };

  describe('VIEW_TEAM', () => {
    it('allows OWNER, ADMIN, PLANNER; denies EMPLOYEE', () => {
      expect(can(owner, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(admin, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(areaPlanner, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(employee, ACTIONS.VIEW_TEAM)).toBe(false);
    });
  });

  describe('MANAGE_USERS & TRANSFER_OWNERSHIP', () => {
    it('allows OWNER to manage users and transfer ownership to another user', () => {
      expect(can(owner, ACTIONS.MANAGE_USERS, { role: 'ADMIN' })).toBe(true);
      expect(can(owner, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-admin' })).toBe(true);
      expect(can(owner, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-owner' })).toBe(false);
    });

    it('allows ADMIN to manage users except OWNER; denies TRANSFER_OWNERSHIP', () => {
      expect(can(admin, ACTIONS.MANAGE_USERS, { role: 'EMPLOYEE' })).toBe(true);
      expect(can(admin, ACTIONS.MANAGE_USERS, { role: 'OWNER' })).toBe(false);
      expect(can(admin, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-other' })).toBe(false);
    });
  });

  describe('Shift editing contract', () => {
    it('allows OWNER and ADMIN; denies EMPLOYEE', () => {
      expect(can(owner, ACTIONS.EDIT_SHIFT)).toBe(true);
      expect(can(admin, ACTIONS.EDIT_SHIFT)).toBe(true);
      expect(can(employee, ACTIONS.EDIT_SHIFT)).toBe(false);
    });

    it('restricts PLANNER by area or employee scope', () => {
      expect(can(areaPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-1' })).toBe(true);
      expect(can(areaPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-9' })).toBe(false);
      expect(can(employeePlanner, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-1' })).toBe(true);
      expect(can(employeePlanner, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-9' })).toBe(false);
    });
  });

  describe('Anti-self-approval rule', () => {
    const adminSelfRequest = {
      requesterUserId: 'u-admin-emp',
      employeeId: 'emp-admin',
    };

    it('blocks self-approval and self-rejection even for ADMIN/OWNER', () => {
      expect(can(adminWithEmp, ACTIONS.APPROVE_REQUEST, adminSelfRequest)).toBe(false);
      expect(can(adminWithEmp, ACTIONS.REJECT_REQUEST, adminSelfRequest)).toBe(false);
      const ownerSelf = { requesterUserId: 'u-owner-emp', employeeId: 'emp-owner' };
      expect(can(ownerWithEmp, ACTIONS.APPROVE_REQUEST, ownerSelf)).toBe(false);
    });

    it('permits approving other employees requests', () => {
      const otherRequest = { requesterUserId: 'u-emp', employeeId: 'emp-regular' };
      expect(can(adminWithEmp, ACTIONS.APPROVE_REQUEST, otherRequest)).toBe(true);
    });
  });
});

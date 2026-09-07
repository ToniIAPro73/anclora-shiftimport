import { describe, expect, it } from 'vitest';
import { ACTIONS, can, isTargetInScope } from './authorization.js';

describe('Canonical Authorization Service (can)', () => {
  const owner = { userId: 'u-owner', role: 'OWNER', employeeId: null };
  const ownerWithEmp = { userId: 'u-owner-emp', role: 'OWNER', employeeId: 'emp-owner' };
  const admin = { userId: 'u-admin', role: 'ADMIN', employeeId: null };
  const adminWithEmp = { userId: 'u-admin-emp', role: 'ADMIN', employeeId: 'emp-admin' };

  const globalPlanner = {
    userId: 'u-planner-global',
    role: 'PLANNER',
    plannerScopeType: 'ORGANIZATION',
    employeeId: null,
  };
  const areaPlanner = {
    userId: 'u-planner-area',
    role: 'PLANNER',
    plannerScopeType: 'AREAS',
    scopedAreaIds: ['area-1', 'area-2'],
    employeeId: null,
  };
  const employeePlanner = {
    userId: 'u-planner-emp',
    role: 'PLANNER',
    plannerScopeType: 'EMPLOYEES',
    scopedEmployeeIds: ['emp-1', 'emp-2'],
    employeeId: null,
  };

  const employee = {
    userId: 'u-emp',
    role: 'EMPLOYEE',
    employeeId: 'emp-regular',
  };

  describe('VIEW_TEAM', () => {
    it('allows OWNER, ADMIN, and PLANNER; denies EMPLOYEE', () => {
      expect(can(owner, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(admin, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(globalPlanner, ACTIONS.VIEW_TEAM)).toBe(true);
      expect(can(employee, ACTIONS.VIEW_TEAM)).toBe(false);
    });
  });

  describe('MANAGE_USERS', () => {
    it('allows OWNER full control over users', () => {
      expect(can(owner, ACTIONS.MANAGE_USERS, { role: 'ADMIN' })).toBe(true);
      expect(can(owner, ACTIONS.MANAGE_USERS, { role: 'OWNER' })).toBe(true);
    });

    it('allows ADMIN to manage non-owner users; denies managing OWNER', () => {
      expect(can(admin, ACTIONS.MANAGE_USERS, { role: 'PLANNER' })).toBe(true);
      expect(can(admin, ACTIONS.MANAGE_USERS, { role: 'EMPLOYEE' })).toBe(true);
      expect(can(admin, ACTIONS.MANAGE_USERS, { role: 'OWNER' })).toBe(false);
      expect(can(admin, ACTIONS.MANAGE_USERS, { isOwner: true })).toBe(false);
    });

    it('denies PLANNER and EMPLOYEE', () => {
      expect(can(globalPlanner, ACTIONS.MANAGE_USERS, { role: 'EMPLOYEE' })).toBe(false);
      expect(can(employee, ACTIONS.MANAGE_USERS, { role: 'EMPLOYEE' })).toBe(false);
    });
  });

  describe('Administrative Actions (CREATE_*, MANAGE_AREA, ASSIGN_*)', () => {
    const adminActions = [
      ACTIONS.CREATE_ADMIN,
      ACTIONS.CREATE_PLANNER,
      ACTIONS.CREATE_EMPLOYEE,
      ACTIONS.MANAGE_AREA,
      ACTIONS.ASSIGN_EMPLOYEE,
      ACTIONS.ASSIGN_PLANNER,
    ];

    adminActions.forEach((action) => {
      it(`allows OWNER and ADMIN for ${action}; denies PLANNER and EMPLOYEE`, () => {
        expect(can(owner, action)).toBe(true);
        expect(can(admin, action)).toBe(true);
        expect(can(globalPlanner, action)).toBe(false);
        expect(can(employee, action)).toBe(false);
      });
    });
  });

  describe('TRANSFER_OWNERSHIP', () => {
    it('allows OWNER when target user is different; denies self or missing target', () => {
      expect(can(owner, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-admin' })).toBe(true);
      expect(can(owner, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-owner' })).toBe(false);
      expect(can(owner, ACTIONS.TRANSFER_OWNERSHIP, {})).toBe(false);
    });

    it('denies ADMIN, PLANNER, and EMPLOYEE unconditionally', () => {
      expect(can(admin, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-other' })).toBe(false);
      expect(can(globalPlanner, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-other' })).toBe(false);
      expect(can(employee, ACTIONS.TRANSFER_OWNERSHIP, { targetUserId: 'u-other' })).toBe(false);
    });
  });

  describe('PLAN and PUBLISH scopes', () => {
    it('allows OWNER and ADMIN across the organization', () => {
      expect(can(owner, ACTIONS.PLAN, { areaId: 'area-99' })).toBe(true);
      expect(can(admin, ACTIONS.PUBLISH, { areaId: 'area-99' })).toBe(true);
    });

    it('enforces area scope on area-scoped PLANNER', () => {
      expect(can(areaPlanner, ACTIONS.PLAN, { areaId: 'area-1' })).toBe(true);
      expect(can(areaPlanner, ACTIONS.PLAN, { areaId: 'area-2' })).toBe(true);
      expect(can(areaPlanner, ACTIONS.PLAN, { areaId: 'area-3' })).toBe(false);
    });

    it('enforces employee scope on employee-scoped PLANNER', () => {
      expect(can(employeePlanner, ACTIONS.PLAN, { employeeId: 'emp-1' })).toBe(true);
      expect(can(employeePlanner, ACTIONS.PLAN, { employeeId: 'emp-2' })).toBe(true);
      expect(can(employeePlanner, ACTIONS.PLAN, { employeeId: 'emp-3' })).toBe(false);
    });

    it('denies EMPLOYEE from planning or publishing', () => {
      expect(can(employee, ACTIONS.PLAN)).toBe(false);
      expect(can(employee, ACTIONS.PUBLISH)).toBe(false);
    });
  });

  describe('EDIT_SHIFT vs EMPLOYEE Direct Edit Contract', () => {
    it('allows OWNER, ADMIN, and in-scope PLANNER to edit shifts', () => {
      expect(can(owner, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-1' })).toBe(true);
      expect(can(admin, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-1' })).toBe(true);
      expect(can(areaPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-1' })).toBe(true);
      expect(can(areaPlanner, ACTIONS.EDIT_SHIFT, { areaId: 'area-99' })).toBe(false);
    });

    it('STRICT CONTRACT: denies EMPLOYEE from directly editing existing shifts', () => {
      expect(can(employee, ACTIONS.EDIT_SHIFT, { employeeId: 'emp-regular' })).toBe(false);
    });
  });

  describe('IMPORT_SELF and VIEW_SELF_SHIFT', () => {
    it('allows any user with an associated employee for their own shift', () => {
      expect(can(employee, ACTIONS.VIEW_SELF_SHIFT, { employeeId: 'emp-regular' })).toBe(true);
      expect(can(adminWithEmp, ACTIONS.VIEW_SELF_SHIFT, { employeeId: 'emp-admin' })).toBe(true);
      expect(can(ownerWithEmp, ACTIONS.IMPORT_SELF, { employeeId: 'emp-owner' })).toBe(true);
    });

    it('denies if actor has no employeeId or targets another employee', () => {
      expect(can(admin, ACTIONS.VIEW_SELF_SHIFT, { employeeId: 'emp-1' })).toBe(false);
      expect(can(employee, ACTIONS.VIEW_SELF_SHIFT, { employeeId: 'emp-other' })).toBe(false);
    });
  });

  describe('ANTI-SELF-APPROVAL / REJECTION (Critical Manager + Employee Invariant)', () => {
    const adminSelfRequest = {
      requesterUserId: 'u-admin-emp',
      employeeId: 'emp-admin',
    };
    const regularEmpRequest = {
      requesterUserId: 'u-emp',
      employeeId: 'emp-regular',
      areaId: 'area-1',
    };

    it('prevents ADMIN from self-approving or self-rejecting their own request', () => {
      expect(can(adminWithEmp, ACTIONS.APPROVE_REQUEST, adminSelfRequest)).toBe(false);
      expect(can(adminWithEmp, ACTIONS.REJECT_REQUEST, adminSelfRequest)).toBe(false);
    });

    it('prevents OWNER from self-approving their own request', () => {
      const ownerSelfRequest = { requesterUserId: 'u-owner-emp', employeeId: 'emp-owner' };
      expect(can(ownerWithEmp, ACTIONS.APPROVE_REQUEST, ownerSelfRequest)).toBe(false);
      expect(can(ownerWithEmp, ACTIONS.REJECT_REQUEST, ownerSelfRequest)).toBe(false);
    });

    it('allows ADMIN to approve other employee requests', () => {
      expect(can(adminWithEmp, ACTIONS.APPROVE_REQUEST, regularEmpRequest)).toBe(true);
      expect(can(adminWithEmp, ACTIONS.REJECT_REQUEST, regularEmpRequest)).toBe(true);
    });

    it('allows PLANNER to approve in-scope requests and denies out-of-scope requests', () => {
      expect(can(areaPlanner, ACTIONS.APPROVE_REQUEST, regularEmpRequest)).toBe(true);
      expect(can(areaPlanner, ACTIONS.APPROVE_REQUEST, { ...regularEmpRequest, areaId: 'area-99' })).toBe(false);
    });

    it('denies EMPLOYEE from approving or rejecting any request', () => {
      expect(can(employee, ACTIONS.APPROVE_REQUEST, regularEmpRequest)).toBe(false);
      expect(can(employee, ACTIONS.REJECT_REQUEST, regularEmpRequest)).toBe(false);
    });
  });
});

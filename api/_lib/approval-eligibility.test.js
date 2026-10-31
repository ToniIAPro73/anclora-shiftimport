import { describe, expect, it } from 'vitest';
import { CANNOT_DECIDE, evaluateApprovalEligibility, resolveTimeOffApprovers } from './approval-eligibility.js';

const AREA_A = 'area-a';
const AREA_B = 'area-b';
const target = (patch = {}) => ({ employeeId: 'emp-target', areaId: AREA_A, requesterUserId: 'user-target', ...patch });

const owner = { userId: 'u-owner', role: 'OWNER' };
const admin = { userId: 'u-admin', role: 'ADMIN' };
const plannerOrg = { userId: 'u-p-org', role: 'PLANNER', plannerScopeType: 'ORGANIZATION' };
const plannerAreaA = { userId: 'u-p-a', role: 'PLANNER', plannerScopeType: 'AREAS', scopedAreaIds: [AREA_A] };
const plannerAreaB = { userId: 'u-p-b', role: 'PLANNER', plannerScopeType: 'AREAS', scopedAreaIds: [AREA_B] };
const plannerEmp = { userId: 'u-p-e', role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: ['emp-target'] };
const plannerOtherEmp = { userId: 'u-p-oe', role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: ['emp-someone-else'] };
const plannerLegacy = { userId: 'u-p-legacy', role: 'PLANNER', scopedAreaId: AREA_A }; // no plannerScopeType: defaults to AREAS
const employee = { userId: 'u-emp', role: 'EMPLOYEE', employeeId: 'emp-x' };
const POOL = [owner, admin, plannerOrg, plannerAreaA, plannerAreaB, plannerEmp, plannerOtherEmp, plannerLegacy];
const ids = (list) => list.map((a) => a.userId).sort();

describe('resolveTimeOffApprovers — policy ORGANIZATION_ADMIN / NO_APPROVAL', () => {
  it.each(['ORGANIZATION_ADMIN', 'NO_APPROVAL'])('%s: only organisation-level actors decide (OWNER, ADMIN, org-wide PLANNER)', (policy) => {
    expect(ids(resolveTimeOffApprovers({ policy, target: target(), candidates: POOL }))).toEqual(['u-admin', 'u-owner', 'u-p-org']);
  });
});

describe('resolveTimeOffApprovers — policy AREA_RESPONSIBLE', () => {
  it('area responsible admins + planners whose AREAS/EMPLOYEES scope covers the employee (and nobody out of scope)', () => {
    const approvers = resolveTimeOffApprovers({ policy: 'AREA_RESPONSIBLE', target: target(), candidates: POOL, areaResponsibleUserIds: ['u-admin'] });
    expect(ids(approvers)).toEqual(['u-admin', 'u-p-a', 'u-p-e', 'u-p-legacy']);
    expect(ids(approvers)).not.toContain('u-p-b'); // other area
    expect(ids(approvers)).not.toContain('u-p-oe'); // other employees
  });

  it('falls back to the organisation level when no area-bound approver exists (same rule as resolveApprovers)', () => {
    const approvers = resolveTimeOffApprovers({ policy: 'AREA_RESPONSIBLE', target: target(), candidates: [owner, admin, plannerAreaB, plannerOtherEmp], areaResponsibleUserIds: [] });
    expect(ids(approvers)).toEqual(['u-admin', 'u-owner']);
  });

  it('an employee without area has no area-level approver: organisation level decides', () => {
    const approvers = resolveTimeOffApprovers({ policy: 'AREA_RESPONSIBLE', target: target({ areaId: null }), candidates: [owner, plannerAreaA], areaResponsibleUserIds: ['u-admin'] });
    expect(ids(approvers)).toEqual(['u-owner']);
  });
});

describe('anti-self-approval (userId AND employeeId)', () => {
  it('excludes the requester by userId even when they are OWNER', () => {
    const approvers = resolveTimeOffApprovers({ policy: 'ORGANIZATION_ADMIN', target: target({ requesterUserId: 'u-owner' }), candidates: [owner, admin] });
    expect(ids(approvers)).toEqual(['u-admin']);
  });

  it('excludes the requester by employeeId even when the userId differs (second account / linked employee)', () => {
    const sameEmployee = { ...admin, userId: 'u-admin-2', employeeId: 'emp-target' };
    const approvers = resolveTimeOffApprovers({ policy: 'ORGANIZATION_ADMIN', target: target(), candidates: [sameEmployee, owner] });
    expect(ids(approvers)).toEqual(['u-owner']);
  });

  it('evaluate reports SELF_REQUEST for the requester, whatever their role', () => {
    for (const actor of [owner, { ...admin, employeeId: 'emp-target' }, plannerOrg]) {
      const result = evaluateApprovalEligibility({ actor: { ...actor, userId: actor.userId }, policy: 'ORGANIZATION_ADMIN', target: target({ requesterUserId: actor.userId }), candidates: POOL });
      expect(result).toEqual({ canDecide: false, cannotDecideReason: CANNOT_DECIDE.SELF_REQUEST });
    }
  });
});

describe('evaluateApprovalEligibility — scope (ORGANIZATION / AREAS / EMPLOYEES / SELF)', () => {
  const decide = (actor, policy = 'ORGANIZATION_ADMIN', t = target(), extra = {}) => evaluateApprovalEligibility({ actor, policy, target: t, candidates: POOL, ...extra });

  it('OWNER, ADMIN and organisation-wide PLANNER can decide under ORGANIZATION_ADMIN', () => {
    for (const actor of [owner, admin, plannerOrg]) expect(decide(actor)).toEqual({ canDecide: true, cannotDecideReason: null });
  });

  it('PLANNER with AREAS: only their areas; other area ⇒ OUT_OF_SCOPE', () => {
    expect(decide(plannerAreaA, 'AREA_RESPONSIBLE').canDecide).toBe(true);
    expect(decide(plannerAreaB, 'AREA_RESPONSIBLE')).toEqual({ canDecide: false, cannotDecideReason: CANNOT_DECIDE.OUT_OF_SCOPE });
  });

  it('PLANNER with EMPLOYEES: only those employees; others ⇒ OUT_OF_SCOPE', () => {
    expect(decide(plannerEmp, 'AREA_RESPONSIBLE').canDecide).toBe(true);
    expect(decide(plannerOtherEmp, 'AREA_RESPONSIBLE')).toEqual({ canDecide: false, cannotDecideReason: CANNOT_DECIDE.OUT_OF_SCOPE });
  });

  it('a scoped PLANNER is in scope but not entitled by POLICY under ORGANIZATION_ADMIN', () => {
    expect(decide(plannerAreaA, 'ORGANIZATION_ADMIN')).toEqual({ canDecide: false, cannotDecideReason: CANNOT_DECIDE.POLICY });
    expect(decide(plannerEmp, 'NO_APPROVAL')).toEqual({ canDecide: false, cannotDecideReason: CANNOT_DECIDE.POLICY });
  });

  it('ADMIN under AREA_RESPONSIBLE: decides only if responsible for the area or when there is no area-level approver', () => {
    expect(decide(admin, 'AREA_RESPONSIBLE', target(), { areaResponsibleUserIds: ['u-admin'] }).canDecide).toBe(true);
    // another responsible exists for the area ⇒ this admin is not entitled by policy
    expect(decide(admin, 'AREA_RESPONSIBLE', target(), { areaResponsibleUserIds: ['someone-else'] })).toEqual({ canDecide: false, cannotDecideReason: CANNOT_DECIDE.POLICY });
    // pool with no area-level approver ⇒ fallback to organisation level
    const lonely = evaluateApprovalEligibility({ actor: admin, policy: 'AREA_RESPONSIBLE', target: target(), candidates: [owner, admin] });
    expect(lonely.canDecide).toBe(true);
  });

  it('an EMPLOYEE (SELF scope) can never decide, not even a request that is "theirs by scope"', () => {
    expect(decide(employee)).toEqual({ canDecide: false, cannotDecideReason: CANNOT_DECIDE.OUT_OF_SCOPE });
    expect(decide(employee, 'ORGANIZATION_ADMIN', target({ employeeId: 'emp-x' }))).toMatchObject({ canDecide: false });
  });

  it('no actor / unknown role ⇒ OUT_OF_SCOPE (fail closed)', () => {
    expect(decide(null).canDecide).toBe(false);
    expect(decide({ userId: 'x', role: 'GUEST' }).canDecide).toBe(false);
  });

  it('never authorises by a bare scoped_area_id: it only counts through the effective planner scope (V-07 not copied)', () => {
    const bare = { userId: 'u-bare', role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedAreaId: AREA_A, scopedEmployeeIds: [] };
    expect(decide(bare, 'AREA_RESPONSIBLE').canDecide).toBe(false);
  });

  it('a client-supplied employee/area on the target cannot widen a scope (target comes from the DB row)', () => {
    expect(decide(plannerAreaB, 'AREA_RESPONSIBLE', target({ areaId: AREA_A })).canDecide).toBe(false);
  });
});

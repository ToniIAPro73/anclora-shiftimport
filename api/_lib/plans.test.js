import { describe, expect, it } from 'vitest';
import {
  PLAN_IDS,
  PLANS,
  PlanLimitError,
  canUseFeature,
  checkLimit,
  getPlanDefinition,
  requireFeature,
  requireWithinLimit,
} from './plans.js';

describe('plan model (Fase 1.2G)', () => {
  it('defines exactly the three initial plans', () => {
    expect(PLAN_IDS).toEqual(['free', 'personal', 'team']);
    expect(Object.keys(PLANS).sort()).toEqual(['free', 'personal', 'team']);
  });

  it('unknown/missing plan id safely defaults to free — never grants more', () => {
    expect(getPlanDefinition('nonexistent')).toBe(PLANS.free);
    expect(getPlanDefinition(undefined)).toBe(PLANS.free);
    expect(getPlanDefinition(null)).toBe(PLANS.free);
  });

  it('free and personal are both capped at 1 employee; team is unlimited', () => {
    expect(PLANS.free.limits.maxEmployees).toBe(1);
    expect(PLANS.personal.limits.maxEmployees).toBe(1);
    expect(PLANS.team.limits.maxEmployees).toBeNull();
  });

  it('only team has multiEmployeeImport and teamManagement', () => {
    expect(canUseFeature('free', 'multiEmployeeImport')).toBe(false);
    expect(canUseFeature('personal', 'multiEmployeeImport')).toBe(false);
    expect(canUseFeature('team', 'multiEmployeeImport')).toBe(true);

    expect(canUseFeature('free', 'teamManagement')).toBe(false);
    expect(canUseFeature('personal', 'teamManagement')).toBe(false);
    expect(canUseFeature('team', 'teamManagement')).toBe(true);
  });

  it('fullHistory: free is limited, personal and team are not', () => {
    expect(canUseFeature('free', 'fullHistory')).toBe(false);
    expect(canUseFeature('personal', 'fullHistory')).toBe(true);
    expect(canUseFeature('team', 'fullHistory')).toBe(true);
  });

  describe('checkLimit', () => {
    it('allows while under the limit, blocks at/over it', () => {
      expect(checkLimit('free', 'maxEmployees', 0)).toBe(true);
      expect(checkLimit('free', 'maxEmployees', 1)).toBe(false);
      expect(checkLimit('free', 'maxEmployees', 5)).toBe(false);
    });

    it('null limit (unlimited) is always true regardless of count', () => {
      expect(checkLimit('team', 'maxEmployees', 0)).toBe(true);
      expect(checkLimit('team', 'maxEmployees', 10_000)).toBe(true);
    });
  });

  describe('requireFeature / requireWithinLimit', () => {
    it('requireFeature throws PlanLimitError (403) when the plan lacks the feature', () => {
      expect(() => requireFeature('free', 'teamManagement')).toThrow(PlanLimitError);
      try {
        requireFeature('free', 'teamManagement');
      } catch (error) {
        expect(error.status).toBe(403);
        expect(error.code).toBe('PLAN_LIMIT');
      }
    });

    it('requireFeature does not throw when the plan has the feature', () => {
      expect(() => requireFeature('team', 'teamManagement')).not.toThrow();
    });

    it('requireWithinLimit throws once the limit is reached', () => {
      expect(() => requireWithinLimit('free', 'maxEmployees', 1)).toThrow(PlanLimitError);
      expect(() => requireWithinLimit('free', 'maxEmployees', 0)).not.toThrow();
    });
  });

  it('role and plan are orthogonal: this module has no concept of ADMIN/MANAGER/EMPLOYEE at all', () => {
    // Plan functions take a plan id only — role never enters the decision,
    // so "ADMIN on a free org" can never accidentally unlock Team features
    // by virtue of the role check happening in a different layer (auth.js
    // requireRole) that plans.js does not call or depend on.
    expect(canUseFeature.length).toBe(2); // (planId, feature) — no role param
    expect(checkLimit.length).toBe(3); // (planId, limitKey, currentCount) — no role param
  });
});

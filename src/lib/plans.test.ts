import { describe, expect, it } from 'vitest';
import { PLAN_IDS, PLANS, canUseFeature, checkLimit, getPlanDefinition } from './plans';

describe('frontend plan model (Fase 1.2G, mirrors api/_lib/plans.js)', () => {
  it('defines exactly the three initial plans, same ids as the backend', () => {
    expect(PLAN_IDS).toEqual(['free', 'personal', 'team']);
    expect(Object.keys(PLANS).sort()).toEqual(['free', 'personal', 'team']);
  });

  it('unknown/null plan defaults to free', () => {
    expect(getPlanDefinition(null)).toBe(PLANS.free);
    expect(getPlanDefinition(undefined)).toBe(PLANS.free);
  });

  it('limits/features match the backend exactly', () => {
    expect(PLANS.free.limits).toEqual({ maxEmployees: 1, maxMonthlyImports: 5 });
    expect(PLANS.personal.limits).toEqual({ maxEmployees: 1, maxMonthlyImports: null });
    expect(PLANS.team.limits).toEqual({ maxEmployees: null, maxMonthlyImports: null });

    expect(canUseFeature('free', 'multiEmployeeImport')).toBe(false);
    expect(canUseFeature('personal', 'multiEmployeeImport')).toBe(false);
    expect(canUseFeature('team', 'multiEmployeeImport')).toBe(true);
  });

  it('only Team is marked recommended', () => {
    expect(PLANS.free.recommended).toBeFalsy();
    expect(PLANS.personal.recommended).toBeFalsy();
    expect(PLANS.team.recommended).toBe(true);
  });

  it('checkLimit respects unlimited (null) limits', () => {
    expect(checkLimit('team', 'maxEmployees', 9999)).toBe(true);
    expect(checkLimit('free', 'maxEmployees', 1)).toBe(false);
  });

  it('price hypotheses match the documented commercial hypothesis, not a computed value', () => {
    expect(PLANS.free.price).toEqual({ amount: null, currency: 'EUR', interval: 'month', fromPrefix: false });
    expect(PLANS.personal.price).toEqual({ amount: 4.99, currency: 'EUR', interval: 'month', fromPrefix: false });
    expect(PLANS.team.price).toEqual({ amount: 19, currency: 'EUR', interval: 'month', fromPrefix: true });
  });

  it('UXR-F1-M03 (CX-F09): only Team carries the "from" prefix — Free and Personal render a flat amount', () => {
    expect(PLANS.free.price.fromPrefix).toBe(false);
    expect(PLANS.personal.price.fromPrefix).toBe(false);
    expect(PLANS.team.price.fromPrefix).toBe(true);
  });
});

/**
 * Fase 1.2G: commercial plan model — the single backend authority for what
 * an organization's plan allows. Never trust a client-sent plan value;
 * enforcement always reads the plan from the organization row itself
 * (see resolveContext in auth.js), never from a request body/header.
 *
 * Pre-Stripe: this module only answers "is X allowed" and "how many Y can
 * this org have" — it has no concept of billing, subscriptions, trials,
 * or payment. See docs/pricing-hypothesis.md for what's commercial
 * hypothesis (prices, limits) vs decided architecture (this module's shape).
 */

export const PLAN_IDS = ['free', 'personal', 'team'];

/**
 * limits: null means unlimited. features: boolean capability flags, read
 * by canUseFeature — add a new capability here, never as an inline
 * `plan === 'team'` check scattered in a route handler.
 */
export const PLANS = {
  free: {
    id: 'free',
    limits: {
      maxEmployees: 1,
      maxMonthlyImports: 5,
    },
    features: {
      multiEmployeeImport: false,
      teamManagement: false,
      fullHistory: false,
    },
  },
  personal: {
    id: 'personal',
    limits: {
      maxEmployees: 1,
      maxMonthlyImports: null,
    },
    features: {
      multiEmployeeImport: false,
      teamManagement: false,
      fullHistory: true,
    },
  },
  team: {
    id: 'team',
    limits: {
      maxEmployees: null,
      maxMonthlyImports: null,
    },
    features: {
      multiEmployeeImport: true,
      teamManagement: true,
      fullHistory: true,
    },
  },
};

/** Unknown/missing plan id always resolves to 'free' — never silently
 * grants more than the safest plan. */
export function getPlanDefinition(planId) {
  return PLANS[planId] ?? PLANS.free;
}

export function canUseFeature(planId, feature) {
  return Boolean(getPlanDefinition(planId).features[feature]);
}

/** True when currentCount is still under the plan's limit (so a NEW item
 * may be created). null limit = unlimited = always true. */
export function checkLimit(planId, limitKey, currentCount) {
  const max = getPlanDefinition(planId).limits[limitKey];
  if (max === null || max === undefined) {
    return true;
  }
  return currentCount < max;
}

export class PlanLimitError extends Error {
  constructor(message, { feature, limitKey } = {}) {
    super(message);
    this.status = 403;
    this.code = 'PLAN_LIMIT';
    this.feature = feature;
    this.limitKey = limitKey;
  }
}

/** Throws PlanLimitError when the org's plan doesn't include `feature`. */
export function requireFeature(planId, feature, message) {
  if (!canUseFeature(planId, feature)) {
    throw new PlanLimitError(message ?? `This feature requires a plan with "${feature}".`, { feature });
  }
}

/** Throws PlanLimitError when creating one more of `limitKey` would exceed
 * the org's plan limit. */
export function requireWithinLimit(planId, limitKey, currentCount, message) {
  if (!checkLimit(planId, limitKey, currentCount)) {
    throw new PlanLimitError(message ?? `This plan's "${limitKey}" limit has been reached.`, { limitKey });
  }
}
/**
 * Fase 1.2G: frontend plan model. Mirrors api/_lib/plans.js's limits/
 * features shape exactly (kept in sync deliberately — see that file's
 * comment) plus display-only marketing content that has no backend
 * equivalent (labels, price hypothesis, feature-comparison copy).
 *
 * This is NOT the enforcement authority: canUseFeature/checkLimit here are
 * for UI decisions only (show/hide a button, decide which upgrade prompt to
 * render) — the backend re-validates every entitlement-sensitive request
 * independently (api/_lib/plans.js), because a client can always lie.
 *
 * Price hypothesis: see docs/pricing-hypothesis.md. €4.99/mo (Personal) and
 * "from €19/mo" (Team) are commercial hypotheses pending market validation,
 * not decided pricing.
 */
export type PlanId = 'free' | 'personal' | 'team';

export interface PlanLimits {
  maxEmployees: number | null;
  maxMonthlyImports: number | null;
}

export interface PlanFeatures {
  multiEmployeeImport: boolean;
  teamManagement: boolean;
  fullHistory: boolean;
}

/**
 * Structured marketing price (UXR-F1-M03 / CX-F09) — replaces the former
 * `priceHypothesis: string`, which baked language-specific words ("Desde",
 * "/mes") into the value itself and produced mixed-language output like
 * "Desde 19 €/mes/mo" once the locale-aware interval suffix was appended on
 * top in `PricingPage.tsx`. The numeric value is unchanged, see hypothesis
 * doc; `fromPrefix`/`interval` are rendered through i18n, never concatenated
 * onto an already-composed string.
 */
export interface PlanPrice {
  /** null for the Free plan — no numeric amount to render. */
  amount: number | null;
  currency: 'EUR';
  interval: 'month';
  /** true renders the localized "From"/"Desde" prefix (Team plan). */
  fromPrefix: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  label: string;
  tagline: string;
  price: PlanPrice;
  ctaKey: string;
  limits: PlanLimits;
  features: PlanFeatures;
  recommended?: boolean;
}

export const PLAN_IDS: PlanId[] = ['free', 'personal', 'team'];

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    label: 'Free',
    tagline: 'Prueba ShiftImport',
    price: { amount: null, currency: 'EUR', interval: 'month', fromPrefix: false },
    ctaKey: 'pricing.cta.free',
    limits: { maxEmployees: 1, maxMonthlyImports: 5 },
    features: { multiEmployeeImport: false, teamManagement: false, fullHistory: false },
  },
  personal: {
    id: 'personal',
    label: 'Personal',
    tagline: 'Tus turnos, siempre organizados',
    price: { amount: 4.99, currency: 'EUR', interval: 'month', fromPrefix: false },
    ctaKey: 'pricing.cta.personal',
    limits: { maxEmployees: 1, maxMonthlyImports: null },
    features: { multiEmployeeImport: false, teamManagement: false, fullHistory: true },
  },
  team: {
    id: 'team',
    label: 'Team',
    tagline: 'Cuadrantes y equipos completos',
    price: { amount: 19, currency: 'EUR', interval: 'month', fromPrefix: true },
    ctaKey: 'pricing.cta.team',
    limits: { maxEmployees: null, maxMonthlyImports: null },
    features: { multiEmployeeImport: true, teamManagement: true, fullHistory: true },
    recommended: true,
  },
};

export function getPlanDefinition(planId: PlanId | null | undefined): PlanDefinition {
  return (planId && PLANS[planId]) || PLANS.free;
}

export function canUseFeature(planId: PlanId | null | undefined, feature: keyof PlanFeatures): boolean {
  return Boolean(getPlanDefinition(planId).features[feature]);
}

/**
 * Fase 1.2G.5: reads the commercial intent carried from the pricing page
 * (/signup?plan=team) — UX convenience only. The onboarding endpoints
 * independently validate/whitelist this value server-side; a query param
 * is never trusted as authorization (see api/onboarding/personal.js).
 */
export function getPlanIntentFromUrl(): PlanId | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get('plan');
  return value === 'free' || value === 'personal' || value === 'team' ? value : null;
}

export function checkLimit(
  planId: PlanId | null | undefined,
  limitKey: keyof PlanLimits,
  currentCount: number,
): boolean {
  const max = getPlanDefinition(planId).limits[limitKey];
  if (max === null) {
    return true;
  }
  return currentCount < max;
}

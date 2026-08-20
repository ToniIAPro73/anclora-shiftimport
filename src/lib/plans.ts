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
import { PlanId } from './session';

export interface PlanLimits {
  maxEmployees: number | null;
  maxMonthlyImports: number | null;
}

export interface PlanFeatures {
  multiEmployeeImport: boolean;
  teamManagement: boolean;
  fullHistory: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  label: string;
  tagline: string;
  /** Marketing display string — not a computed/localized price, see hypothesis doc. */
  priceHypothesis: string;
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
    priceHypothesis: '0 €',
    ctaKey: 'pricing.cta.free',
    limits: { maxEmployees: 1, maxMonthlyImports: 5 },
    features: { multiEmployeeImport: false, teamManagement: false, fullHistory: false },
  },
  personal: {
    id: 'personal',
    label: 'Personal',
    tagline: 'Tus turnos, siempre organizados',
    priceHypothesis: '4,99 €/mes',
    ctaKey: 'pricing.cta.personal',
    limits: { maxEmployees: 1, maxMonthlyImports: null },
    features: { multiEmployeeImport: false, teamManagement: false, fullHistory: true },
  },
  team: {
    id: 'team',
    label: 'Team',
    tagline: 'Cuadrantes y equipos completos',
    priceHypothesis: 'Desde 19 €/mes',
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

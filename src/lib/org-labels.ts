import { SessionMembership } from './session';
import { getPlanDefinition } from './plans';

/**
 * Shared "{{type}} · {{plan}}" label (e.g. "Personal · Free",
 * "Empresa · Team") used everywhere an organization's context must be
 * unambiguous — org selector, org-select options, UpgradePrompt. Plan words
 * (Free/Personal/Team) stay in their brand form in both locales; only the
 * org-type word is translated.
 */
export function formatOrgContext(
  t: (key: string) => string,
  membership: Pick<SessionMembership, 'organizationType' | 'organizationPlan'>,
): string {
  const typeLabel = t(membership.organizationType === 'company' ? 'orgSelector.typeCompany' : 'orgSelector.typePersonal');
  const planLabel = getPlanDefinition(membership.organizationPlan).label;
  return `${typeLabel} · ${planLabel}`;
}

import { SessionMembership } from './session';

/**
 * Shared organization label (just the name) used everywhere an organization's
 * context must be unambiguous — org selector, org-select options.
 * Organization type/plan distinction removed — all orgs are now equal.
 */
export function formatOrgContext(
  _t: (key: string) => string,
  membership: Pick<SessionMembership, 'organizationName'>,
): string {
  return membership.organizationName;
}
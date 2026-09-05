export const APPROVAL_POLICIES = Object.freeze([
  'NO_APPROVAL',
  'AREA_RESPONSIBLE',
  'ORGANIZATION_ADMIN',
]);

/**
 * Pure MVP resolver. The caller supplies already tenant-validated candidates
 * so this function stays reusable by routing and easy to test without a DB.
 * AREA_RESPONSIBLE deliberately falls back to organization admins when the
 * area has no mapping (or the request has no area).
 */
export function resolveApprovers(changeRequest, policy, {
  areaResponsibleUserIds = [],
  organizationAdminUserIds = [],
} = {}) {
  if (policy === 'NO_APPROVAL') return [];

  const unique = (ids) => [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  const admins = unique(organizationAdminUserIds);

  if (policy === 'ORGANIZATION_ADMIN') {
    return admins;
  }

  if (policy === 'AREA_RESPONSIBLE') {
    const areaIds = unique(areaResponsibleUserIds);
    return changeRequest?.areaId && areaIds.length > 0 ? areaIds : admins;
  }

  return [];
}

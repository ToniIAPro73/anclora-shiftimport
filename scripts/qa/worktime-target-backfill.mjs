/** Pure conversion for legacy annual rows. Mutations are kept in the guarded CLI below. */
export function legacyAnnualTargetVersion(legacy, { organizationId, employeeId = legacy.employee_id, id, legacyAnnualTargetId = legacy.id, effectiveFrom = null, createdByUserId = legacy.created_by_user_id ?? null } = {}) {
  const year = Number(legacy.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new TypeError('Legacy annual target has an invalid year');
  const createdAt = legacy.created_at ?? new Date(`${year}-01-01T00:00:00.000Z`).toISOString();
  const date = effectiveFrom ?? (legacy.created_at ? new Date(legacy.created_at).toISOString().slice(0, 10) : `${year}-01-01`);
  return {
    id,
    organization_id: organizationId,
    employee_id: employeeId,
    target_kind: 'CONTRACTUAL',
    period_type: 'ANNUAL',
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    minimum_minutes: Number(legacy.minimum_annual_minutes),
    target_minutes: null,
    maximum_minutes: Number(legacy.maximum_annual_minutes),
    effective_from: date.startsWith(`${year}-`) ? date : `${year}-01-01`,
    revision: 1,
    source: legacy.source ?? 'MIGRATION',
    notes: legacy.notes ?? '',
    included_work_buckets: legacy.included_shift_types?.length ? legacy.included_shift_types : ['Regular'],
    legacy_annual_target_id: legacyAnnualTargetId,
    created_by_user_id: createdByUserId,
    created_at: createdAt,
  };
}

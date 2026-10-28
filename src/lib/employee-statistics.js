/**
 * Employee-specific working-time accounting exceptions.
 * Sebastian Pozo Mendoza's extras remain visible as a separate metric, but do
 * not count toward his headline totals or annual target.
 */
const REGULAR_ONLY_EXTERNAL_EMPLOYEE_IDS = new Set(['84881']);
const SHIFTIMPORT_ORGANIZATION_IDS = new Set([
  'a4cf0768-f08d-49e6-bb81-0d3635d58028', // Production ShiftImport
  'a908c138-495a-4e1c-9449-867a1f4cd984', // Isolated ShiftImport QA mirror
]);

export function usesRegularOnlyStatistics(externalEmployeeId, organizationId) {
  return REGULAR_ONLY_EXTERNAL_EMPLOYEE_IDS.has(String(externalEmployeeId ?? '').trim())
    && SHIFTIMPORT_ORGANIZATION_IDS.has(String(organizationId ?? '').trim());
}

export function applyEmployeeStatisticsPolicy(bucket, externalEmployeeId, organizationId) {
  if (!bucket || !usesRegularOnlyStatistics(externalEmployeeId, organizationId)) return bucket;
  return { ...bucket, effectiveMinutes: bucket.regularMinutes };
}

export function employeeTargetMinutes(bucket, externalEmployeeId, organizationId) {
  if (!bucket) return 0;
  return usesRegularOnlyStatistics(externalEmployeeId, organizationId) ? bucket.regularMinutes : bucket.effectiveMinutes;
}

export const DEFAULT_OBJECTIVE_SHIFT_TYPES = ['Regular'];

/** Sum only the work categories selected on an employee's annual target. */
export function employeeTargetMinutes(bucket, includedShiftTypes = null) {
  if (!bucket) return 0;
  if (!Array.isArray(includedShiftTypes)) return bucket.effectiveMinutes;
  const selected = [...new Set(includedShiftTypes.map((type) => String(type).trim()).filter(Boolean))];
  if (selected.length === 0) return 0;
  const byType = bucket.byType ?? {};
  return selected.reduce((sum, type) => sum + (Number(byType[type]) || 0), 0);
}

/** Apply the annual target's selected shift types to the headline total. */
export function applyEmployeeStatisticsPolicy(bucket, includedShiftTypes = null) {
  if (!bucket || !Array.isArray(includedShiftTypes)) return bucket;
  return { ...bucket, effectiveMinutes: employeeTargetMinutes(bucket, includedShiftTypes) };
}

export function usesRegularOnlyStatistics(includedShiftTypes = null) {
  return Array.isArray(includedShiftTypes)
    && includedShiftTypes.length === 1
    && includedShiftTypes[0] === 'Regular';
}

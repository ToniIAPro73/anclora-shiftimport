import type { StatsBucket } from './effective-calendar.js';

export const DEFAULT_OBJECTIVE_SHIFT_TYPES: string[];
export function usesRegularOnlyStatistics(includedShiftTypes?: string[] | null): boolean;
export function applyEmployeeStatisticsPolicy(bucket: StatsBucket, includedShiftTypes?: string[] | null): StatsBucket;
export function employeeTargetMinutes(bucket: StatsBucket, includedShiftTypes?: string[] | null): number;

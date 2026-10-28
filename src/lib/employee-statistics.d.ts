import type { StatsBucket } from './effective-calendar.js';

export function usesRegularOnlyStatistics(externalEmployeeId?: string | null, organizationId?: string | null): boolean;
export function applyEmployeeStatisticsPolicy(bucket: StatsBucket, externalEmployeeId?: string | null, organizationId?: string | null): StatsBucket;
export function employeeTargetMinutes(bucket: StatsBucket, externalEmployeeId?: string | null, organizationId?: string | null): number;

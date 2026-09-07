import { OrganizationOnboardingInput } from './session';

export type StructureOption = 'none' | 'areas' | 'planners' | 'later';

export interface OnboardingSummaryCounts {
  organizationName: string;
  ownerName: string;
  ownerIsEmployee: boolean;
  adminCount: number;
  plannerCount: number;
  areaCount: number;
  employeeCount: number;
}

export function computeOnboardingSummary(input: Partial<OrganizationOnboardingInput>): OnboardingSummaryCounts {
  const adminCount = input.admins?.length ?? (input.admin ? 1 : 0);
  const plannerCount = input.planners?.length ?? 0;
  const areaCount = input.areas?.length ?? 0;
  
  // Total employees: standalone employees + owner if employee + admins if employee + planners if employee
  let employeeCount = input.employees?.length ?? 0;
  if (input.owner?.isEmployee) {
    employeeCount += 1;
  }
  if (input.admins) {
    employeeCount += input.admins.filter((a) => a.isEmployee).length;
  } else if (input.admin?.isEmployee) {
    employeeCount += 1;
  }
  if (input.planners) {
    employeeCount += input.planners.filter((p) => p.isEmployee).length;
  }

  return {
    organizationName: input.organization?.name?.trim() || '',
    ownerName: input.owner?.employeeName?.trim() || 'Owner',
    ownerIsEmployee: input.owner?.isEmployee === true,
    adminCount,
    plannerCount,
    areaCount,
    employeeCount,
  };
}

export function buildDefaultAreas(): Array<{ name: string; ref: string }> {
  return [
    { ref: 'area-0', name: 'Operaciones' },
    { ref: 'area-1', name: 'Rampa' },
    { ref: 'area-2', name: 'Pasaje' },
  ];
}

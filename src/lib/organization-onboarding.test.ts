import { describe, expect, it } from 'vitest';
import { computeOnboardingSummary } from './organization-onboarding';

describe('organization-onboarding domain utilities', () => {
  it('computes summary for minimal organization (Scenario A)', () => {
    const summary = computeOnboardingSummary({
      organization: { name: 'Acme Minimal' },
      owner: { isEmployee: false },
      areas: [],
    });
    expect(summary).toEqual({
      organizationName: 'Acme Minimal',
      ownerName: 'Owner',
      ownerIsEmployee: false,
      adminCount: 0,
      plannerCount: 0,
      areaCount: 0,
      employeeCount: 0,
    });
  });

  it('computes summary for structured multi-area organization (Scenario D)', () => {
    const summary = computeOnboardingSummary({
      organization: { name: 'Acme Corp' },
      owner: { isEmployee: true, employeeName: 'Toni Owner' },
      areas: [{ name: 'Operaciones', ref: 'area-0' }, { name: 'Rampa', ref: 'area-1' }],
      admins: [{ name: 'Admin Alice', email: 'alice@example.com', isEmployee: false }],
      planners: [{ name: 'Planner Bob', email: 'bob@example.com', isEmployee: true, employeeName: 'Bob Ops' }],
      employees: [{ name: 'Worker Charlie' }, { name: 'Worker David' }],
    });
    expect(summary).toEqual({
      organizationName: 'Acme Corp',
      ownerName: 'Toni Owner',
      ownerIsEmployee: true,
      adminCount: 1,
      plannerCount: 1,
      areaCount: 2,
      employeeCount: 4, // 1 owner + 1 planner (isEmployee) + 2 standalone
    });
  });
});

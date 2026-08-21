import { describe, expect, it } from 'vitest';
import { formatOrgContext } from './org-labels';

const t = (key: string) => ({
  'orgSelector.typePersonal': 'Personal',
  'orgSelector.typeCompany': 'Empresa',
}[key] ?? key);

describe('formatOrgContext', () => {
  it('formats a personal/free org as "Personal · Free"', () => {
    expect(formatOrgContext(t, { organizationType: 'personal', organizationPlan: 'free' })).toBe('Personal · Free');
  });

  it('formats a company/team org as "Empresa · Team"', () => {
    expect(formatOrgContext(t, { organizationType: 'company', organizationPlan: 'team' })).toBe('Empresa · Team');
  });
});

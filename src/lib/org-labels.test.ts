import { describe, expect, it } from 'vitest';
import { formatOrgContext } from './org-labels';

const t = (key: string): string => {
  const map: Record<string, string> = {
    'orgSelector.typePersonal': 'Personal',
    'orgSelector.typeCompany': 'Empresa',
  };
  return map[key] ?? key;
};

describe('formatOrgContext', () => {
  it('returns just the organization name', () => {
    expect(formatOrgContext(t, { organizationName: 'Mi Empresa' })).toBe('Mi Empresa');
    expect(formatOrgContext(t, { organizationName: 'Acme Corp' })).toBe('Acme Corp');
  });
});
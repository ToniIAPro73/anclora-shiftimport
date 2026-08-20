import { beforeEach, describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  getActiveOrganizationId,
  resolveActiveOrganization,
  setActiveOrganizationId,
  SessionMembership,
} from './session';

setupLocalStorageMock();

const membership = (organizationId: string): SessionMembership => ({
  organizationId,
  organizationName: `Org ${organizationId}`,
  organizationType: 'company',
  organizationPlan: 'team',
  role: 'EMPLOYEE',
});

beforeEach(() => {
  localStorage.clear();
});

describe('resolveActiveOrganization (multi-org, no silent fallback)', () => {
  it('single membership activates automatically', () => {
    expect(resolveActiveOrganization('u1', [membership('org-1')])).toBe('org-1');
  });

  it('multiple memberships without stored choice → null (explicit selection required)', () => {
    expect(resolveActiveOrganization('u1', [membership('org-1'), membership('org-2')])).toBeNull();
  });

  it('stored choice is honored only if the user still belongs', () => {
    setActiveOrganizationId('u1', 'org-2');
    expect(resolveActiveOrganization('u1', [membership('org-1'), membership('org-2')])).toBe('org-2');
    // Membership revoked: stored id no longer valid → explicit choice again.
    expect(resolveActiveOrganization('u1', [membership('org-1')])).toBe('org-1');
    setActiveOrganizationId('u1', 'org-foreign');
    expect(resolveActiveOrganization('u1', [membership('org-1'), membership('org-2')])).toBeNull();
  });

  it('clearing the choice forces explicit selection again', () => {
    setActiveOrganizationId('u1', 'org-1');
    expect(getActiveOrganizationId('u1')).toBe('org-1');
    setActiveOrganizationId('u1', null);
    expect(resolveActiveOrganization('u1', [membership('org-1'), membership('org-2')])).toBeNull();
  });
});

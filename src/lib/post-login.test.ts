import { describe, expect, it } from 'vitest';
import { resolvePostLoginDestination } from './post-login';
import { SessionInfo } from './session';

function makeSession(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    user: { id: 'u1', email: 'u1@example.com', displayName: 'U1' },
    organizationId: 'org-1',
    role: 'EMPLOYEE',
    employeeId: 'emp-1',
    memberships: [{ organizationId: 'org-1', organizationName: 'Org', organizationType: 'company', role: 'EMPLOYEE' }],
    ...overrides,
  };
}

describe('resolvePostLoginDestination', () => {
  it('sends EMPLOYEE to my-shifts', () => {
    expect(resolvePostLoginDestination(makeSession({ role: 'EMPLOYEE' }), false)).toBe('my-shifts');
  });

  it('sends MANAGER to team', () => {
    expect(resolvePostLoginDestination(makeSession({ role: 'MANAGER' }), false)).toBe('team');
  });

  it('sends ADMIN to team', () => {
    expect(resolvePostLoginDestination(makeSession({ role: 'ADMIN' }), false)).toBe('team');
  });

  it('sends a multi-org session with no active org to the org selector, regardless of role', () => {
    expect(resolvePostLoginDestination(makeSession({ role: 'ADMIN', organizationId: null }), true)).toBe('org-selector');
  });

  it('honors needsOrgChoice even if organizationId happens to be set', () => {
    expect(resolvePostLoginDestination(makeSession({ role: 'EMPLOYEE' }), true)).toBe('org-selector');
  });
});

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { consumeInvitationToken } from '../lib/invitation-link';

describe('invitation link consumption', () => {
  it('reads a fragment token and clears the address bar before validation', () => {
    window.history.replaceState({}, '', '/accept-invitation#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    const token = consumeInvitationToken();
    expect(token).toBe('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    expect(window.location.pathname).toBe('/accept-invitation');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('clears legacy query links while keeping compatibility', () => {
    window.history.replaceState({}, '', '/accept-invitation?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    expect(consumeInvitationToken()).toBe('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    expect(window.location.href).toMatch(/\/accept-invitation$/);
  });

  it('does not expose a token in a generated validation URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'VALID',
      invitationId: 'invitation-id',
      organizationName: 'Synthetic Org',
      role: 'EMPLOYEE',
      employeeName: null,
      email: 'person@example.test',
      expiresAt: '2026-09-19T00:00:00.000Z',
      acceptanceMode: 'CREATE_ACCOUNT',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { validateRemoteAccessInvitation } = await import('../lib/remote');
    await validateRemoteAccessInvitation('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    expect(fetchSpy).toHaveBeenCalledWith('/api/invitations/validate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ token: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO' }),
    }));
    expect(fetchSpy.mock.calls[0][0]).not.toContain('?token=');
    fetchSpy.mockRestore();
  });
});

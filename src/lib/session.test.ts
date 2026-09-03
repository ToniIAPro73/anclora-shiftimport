import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  apiFetch,
  ApiError,
  fetchSession,
  getActiveOrganizationId,
  logout,
  resolveActiveOrganization,
  setActiveOrganizationId,
  SessionMembership,
  setRequestOrganizationId,
  setUnauthorizedHandler,
} from './session';

setupLocalStorageMock();

const membership = (organizationId: string): SessionMembership => ({
  organizationId,
  organizationName: `Org ${organizationId}`,
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

/**
 * Session invalidation wiring: an authenticated call answering 401 must
 * notify the app so it transitions to unauthenticated, while auth endpoints
 * and /api/session/* keep their 401 as a normal guest/credentials signal.
 */
const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiFetch — 401 handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    setRequestOrganizationId(null);
  });

  afterEach(() => {
    // Note: no vi.unstubAllGlobals() here — it would also remove the
    // localStorage stub installed by setupLocalStorageMock.
    setUnauthorizedHandler(null);
    setRequestOrganizationId(null);
  });

  it('notifies the unauthorized handler on a 401 from a data endpoint', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    await expect(apiFetch('/api/shifts')).rejects.toThrow(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not notify on /api/session/me (401 there just means guest)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    await expect(apiFetch('/api/session/me')).rejects.toThrow(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not notify on auth endpoints (401 there means bad credentials)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { error: 'Invalid credentials' }));

    await expect(apiFetch('/api/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not notify on non-401 errors', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { error: 'boom' }));

    await expect(apiFetch('/api/shifts')).rejects.toThrow(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not turn network failures into guest mode', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network down'));

    await expect(fetchSession()).rejects.toThrow('network down');
  });
});

describe('logout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    setRequestOrganizationId(null);
  });

  afterEach(() => {
    setRequestOrganizationId(null);
  });

  it('clears the organization header even when the server call fails', async () => {
    setRequestOrganizationId('org-1');
    vi.mocked(fetch).mockRejectedValue(new TypeError('network down'));

    await expect(logout()).rejects.toThrow('network down');

    // The next request must not carry the stale org header.
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('/api/session/me');
    const headers = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers as Record<string, string>;
    expect(headers['x-organization-id']).toBeUndefined();
  });

  it('clears the organization header on success', async () => {
    setRequestOrganizationId('org-1');
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true }));

    await logout();

    await apiFetch('/api/session/me');
    const headers = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.headers as Record<string, string>;
    expect(headers['x-organization-id']).toBeUndefined();
  });
});

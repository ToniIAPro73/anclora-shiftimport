/**
 * Authenticated session against the multi-tenant backend (Fase 1).
 * The app remains local-first for guests: when there is no session the
 * existing localStorage flow is untouched.
 */

export type Role = 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE';

export function isAdminRole(role: Role | null | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export interface SessionMembership {
  organizationId: string;
  organizationName: string;
  role: Role;
  scopedAreaId?: string | null;
}

export interface SessionInfo {
  user: { id: string; email: string; displayName: string };
  /** Null when the user has several orgs and none selected yet. */
  organizationId: string | null;
  role: Role | null;
  /** Employee linked to this user in the active organization (if any). */
  employeeId: string | null;
  memberships: SessionMembership[];
}

export class ApiError extends Error {
  status: number;
  /** Machine-readable reason (e.g. 'PLAN_LIMIT') — see api/_lib/http.js. */
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Active organization per user (Fase 1.1). Never trusted by the backend —
 * it always re-validates membership. Multi-org users must pick explicitly;
 * there is no silent first-membership fallback.
 */
const ACTIVE_ORG_KEY = 'anclora_shiftimport_active_org_v1';

const readActiveOrgMap = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_ORG_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

export function getActiveOrganizationId(userId: string): string | null {
  return readActiveOrgMap()[userId] ?? null;
}

export function setActiveOrganizationId(userId: string, organizationId: string | null): void {
  const map = readActiveOrgMap();
  if (organizationId) {
    map[userId] = organizationId;
  } else {
    delete map[userId];
  }
  localStorage.setItem(ACTIVE_ORG_KEY, JSON.stringify(map));
}

/** Picks the active org after login/me: explicit stored choice if valid,
 * the single membership when there is exactly one, otherwise null (the UI
 * must show the organization selector). */
export function resolveActiveOrganization(
  userId: string,
  memberships: SessionMembership[],
): string | null {
  if (memberships.length === 1) {
    return memberships[0].organizationId;
  }
  const stored = getActiveOrganizationId(userId);
  return memberships.some((m) => m.organizationId === stored) ? stored : null;
}

let requestOrgId: string | null = null;

/** Sets the org header for subsequent API calls in this tab. */
export function setRequestOrganizationId(organizationId: string | null): void {
  requestOrgId = organizationId;
}

/**
 * Invoked when an authenticated API call answers 401: the session is gone
 * server-side (expired, invalidated in another tab/device) and the app must
 * transition to unauthenticated instead of rendering a partial-auth shell.
 * Auth endpoints and /api/session/me are excluded — their 401 is the normal
 * guest/bad-credentials signal, not a session invalidation.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestOrgId ? { 'x-organization-id': requestOrgId } : {}),
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/') && !path.startsWith('/api/session/')) {
      unauthorizedHandler?.();
    }
    const body = payload as { error?: string; code?: string };
    throw new ApiError(response.status, String(body.error ?? `HTTP ${response.status}`), body.code);
  }
  return payload as T;
}

/** Returns null when there is no valid session (guest mode). */
export async function fetchSession(): Promise<SessionInfo | null> {
  try {
    return await apiFetch<SessionInfo>('/api/session/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Only an explicit server-side 401 establishes guest mode. Network,
      // URL and 5xx failures leave authentication unknown and must reach the
      // caller so it can keep the operational UI unavailable.
      return null;
    }
    throw error;
  }
}

export interface ResolvedSession {
  session: SessionInfo;
  /** True when the user has several orgs and none is active yet: the UI
   * must block on an explicit organization choice. */
  needsOrgChoice: boolean;
}

/**
 * Session bootstrap: loads /me, resolves the active organization (single
 * membership or previously chosen), and re-resolves the context against it
 * so role/employeeId match the active org.
 */
export async function fetchResolvedSession(): Promise<ResolvedSession | null> {
  const initial = await fetchSession();
  if (!initial) {
    return null;
  }
  const activeOrg = resolveActiveOrganization(initial.user.id, initial.memberships);
  if (!activeOrg) {
    // Backend returns organizationId null for multi-org without selection.
    return { session: initial, needsOrgChoice: true };
  }
  setRequestOrganizationId(activeOrg);
  if (activeOrg === initial.organizationId) {
    return { session: initial, needsOrgChoice: false };
  }
  const resolved = await fetchSession();
  if (!resolved || !resolved.organizationId) {
    return { session: initial, needsOrgChoice: true };
  }
  return { session: resolved, needsOrgChoice: false };
}

/** Explicit org switch: persists the choice and reloads the context. */
export async function switchOrganization(organizationId: string): Promise<SessionInfo | null> {
  const current = await fetchSession();
  if (!current) {
    return null;
  }
  if (!current.memberships.some((m) => m.organizationId === organizationId)) {
    return null;
  }
  setActiveOrganizationId(current.user.id, organizationId);
  setRequestOrganizationId(organizationId);
  return fetchSession();
}

export async function login(email: string, password: string): Promise<SessionInfo> {
  await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const session = await fetchSession();
  if (!session) {
    throw new ApiError(401, 'Login failed');
  }
  setRequestOrganizationId(resolveActiveOrganization(session.user.id, session.memberships));
  return session;
}

export async function register(email: string, password: string, displayName: string): Promise<SessionInfo> {
  await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
  const session = await fetchSession();
  if (!session) {
    throw new ApiError(401, 'Register failed');
  }
  setRequestOrganizationId(resolveActiveOrganization(session.user.id, session.memberships));
  return session;
}

/**
 * Onboarding: creates the organization for the current (freshly registered, zero-membership) user
 * and re-resolves the session so the caller lands with an active organization.
 */
export async function completeOnboarding(organizationName: string, adminName?: string): Promise<SessionInfo> {
  await apiFetch('/api/onboarding', {
    method: 'POST',
    body: JSON.stringify({ organizationName, adminName }),
  });
  const session = await fetchSession();
  if (!session) {
    throw new ApiError(401, 'Onboarding failed');
  }
  setRequestOrganizationId(resolveActiveOrganization(session.user.id, session.memberships));
  return session;
}

/**
 * Fase 1.2D.2: always resolves (backend responds 200 regardless of whether
 * the email exists) — the caller should show a generic confirmation
 * unconditionally, never branch on the result.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch('/api/auth/request-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Fase 1.2D.3: throws with a user-facing message when the token is
 * invalid/expired/already used. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    // The org header is tab-local auth context: it must be dropped even when
    // the server call fails, or subsequent guest-mode calls would keep
    // sending a stale organization id.
    setRequestOrganizationId(null);
  }
}

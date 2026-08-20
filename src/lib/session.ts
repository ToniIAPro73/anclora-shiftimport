/**
 * Authenticated session against the multi-tenant backend (Fase 1).
 * The app remains local-first for guests: when there is no session the
 * existing localStorage flow is untouched.
 */

export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface SessionMembership {
  organizationId: string;
  organizationName: string;
  organizationType: 'personal' | 'company';
  role: Role;
}

export interface SessionInfo {
  user: { id: string; email: string; displayName: string };
  organizationId: string;
  role: Role;
  /** Employee linked to this user in the active organization (if any). */
  employeeId: string | null;
  memberships: SessionMembership[];
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, String((payload as { error?: string }).error ?? `HTTP ${response.status}`));
  }
  return payload as T;
}

/** Returns null when there is no valid session (guest mode). */
export async function fetchSession(): Promise<SessionInfo | null> {
  try {
    return await apiFetch<SessionInfo>('/api/session/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    // Network/URL failure (offline, tests, no backend): stay in guest mode.
    return null;
  }
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
  return session;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

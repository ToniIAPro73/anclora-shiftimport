// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from './test-utils/local-storage';
import { I18nProvider } from './lib/i18n-react';
import { ThemeProvider } from './lib/theme-react';
import * as session from './lib/session';
import * as remote from './lib/remote';
import { SessionInfo } from './lib/session';
import { RemoteEmployee } from './lib/remote';
import App from './App';

vi.mock('./lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/session')>();
  return {
    ...actual,
    fetchResolvedSession: vi.fn(),
    fetchSession: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };
});

vi.mock('./lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/remote')>();
  return { ...actual, listRemoteEmployees: vi.fn(), loadRemoteShifts: vi.fn(), listRemoteAreas: vi.fn() };
});

const mockedFetchResolvedSession = vi.mocked(session.fetchResolvedSession);
const mockedFetchSession = vi.mocked(session.fetchSession);
const mockedLogin = vi.mocked(session.login);
const mockedLogout = vi.mocked(session.logout);
const mockedListRemoteEmployees = vi.mocked(remote.listRemoteEmployees);
const mockedLoadRemoteShifts = vi.mocked(remote.loadRemoteShifts);
const mockedListRemoteAreas = vi.mocked(remote.listRemoteAreas);

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  mockedLogout.mockResolvedValue(undefined);
  mockedListRemoteAreas.mockResolvedValue([]);
});

const adminSession: SessionInfo = {
  user: { id: 'user-admin', email: 'admin@test.com', displayName: 'Admin' },
  organizationId: 'org-1',
  role: 'ADMIN',
  employeeId: null,
  memberships: [{ organizationId: 'org-1', organizationName: 'Org', role: 'ADMIN' }],
};

const employees: RemoteEmployee[] = [
  { id: 'emp-a', organizationId: 'org-1', externalEmployeeId: '1001', name: 'Employee A', userId: null, status: 'active' },
];

function renderApp(route = '/app') {
  window.history.pushState({}, '', route);
  return render(
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('App — deterministic logout', () => {
  it('clears every auth-scoped state and lands on the login screen', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Empleado:' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));

    // Login screen, and none of the authenticated chrome survives.
    await waitFor(() => expect(document.querySelector('#auth-email')).toBeTruthy());
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('button', { name: 'Salir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Empleado:' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Usuarios de la organización' })).toBeNull();
    expect(document.querySelector('.team-bar')).toBeNull();
    expect(mockedLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps the local transition even when the server logout call fails', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockResolvedValue([]);
    mockedLogout.mockRejectedValue(new Error('network down'));

    renderApp();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salir' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));

    await waitFor(() => expect(document.querySelector('#auth-email')).toBeTruthy());
    expect(document.querySelector('.team-bar')).toBeNull();
  });

  it('discards post-login hydration that lands after logout (no stale org data in guest view)', async () => {
    // Guest bootstrap first (no session), then a login whose hydration is
    // still in flight when the user hits "Salir".
    mockedFetchResolvedSession.mockResolvedValue(null);
    let releaseRoster: (value: RemoteEmployee[]) => void = () => {};
    mockedListRemoteEmployees.mockImplementation(
      () => new Promise<RemoteEmployee[]>((resolve) => { releaseRoster = resolve; }),
    );
    mockedLoadRemoteShifts.mockResolvedValue([
      { id: 's-remote', date: '2026-01-05', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ]);
    mockedLogin.mockResolvedValue(adminSession);

    renderApp();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy());

    // Login through the real AuthScreen → handleAuthenticated → hydration pending.
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    fireEvent.change(document.querySelector('#auth-email') as Element, { target: { value: 'admin@test.com' } });
    fireEvent.change(document.querySelector('#auth-password') as Element, { target: { value: 'x' } });
    fireEvent.submit(document.querySelector('#auth-email')!.closest('form') as Element);

    // Authenticated chrome appears while the roster request is still pending.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salir' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(document.querySelector('#auth-email')).toBeTruthy());

    // The in-flight roster resolves AFTER the logout — it must be discarded.
    await act(async () => {
      releaseRoster(employees);
    });

    // Continue as guest: the guest calendar must NOT show the remote shifts
    // that arrived after the logout.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sin cuenta' }));
    await waitFor(() => expect(window.location.pathname).toBe('/app'));
    expect(document.querySelectorAll('.month-shift-badge')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Empleado:' })).toBeNull();
  });

  it('a 401 from an authenticated API call transitions to the login screen', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Empleado:' })).toBeTruthy());

    // Session dies server-side (expired / invalidated in another tab): the
    // next data call answers 401 and the app must leave the partial-auth UI.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    ));
    await act(async () => {
      await session.apiFetch('/api/shifts').catch(() => {});
    });

    await waitFor(() => expect(document.querySelector('#auth-email')).toBeTruthy());
    expect(window.location.pathname).toBe('/login');
    expect(document.querySelector('.team-bar')).toBeNull();
  });

  it('a bfcache restore with a dead session re-validates and leaves the app', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Empleado:' })).toBeTruthy());

    // Browser restores the page from bfcache after the cookie was invalidated.
    mockedFetchSession.mockResolvedValue(null);
    const pageShow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(pageShow, 'persisted', { value: true });
    await act(async () => {
      window.dispatchEvent(pageShow);
    });

    await waitFor(() => expect(document.querySelector('#auth-email')).toBeTruthy());
    expect(document.querySelector('.team-bar')).toBeNull();
  });

  it('does not render the app shell while the first session resolution is in flight', async () => {
    let releaseSession: (value: null) => void = () => {};
    mockedFetchResolvedSession.mockImplementation(
      () => new Promise<null>((resolve) => { releaseSession = resolve; }),
    );

    renderApp();

    // Indeterminate auth: neither the guest chrome nor an authenticated shell.
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).toBeNull();
    expect(document.querySelector('.calendar-stage')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => {
      releaseSession(null);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy());
  });
});

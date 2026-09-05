// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from './test-utils/local-storage';
import { I18nProvider } from './lib/i18n-react';
import { ThemeProvider } from './lib/theme-react';
import * as session from './lib/session';
import * as remote from './lib/remote';
import { SessionInfo } from './lib/session';
import { RemoteArea, RemoteEmployee } from './lib/remote';
import App from './App';

vi.mock('./lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/session')>();
  return { ...actual, fetchResolvedSession: vi.fn(), fetchSession: vi.fn() };
});

vi.mock('./lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/remote')>();
  return { ...actual, listRemoteEmployees: vi.fn(), loadRemoteShifts: vi.fn(), loadRemoteTodayShifts: vi.fn(), listRemoteAreas: vi.fn() };
});

const mockedFetchResolvedSession = vi.mocked(session.fetchResolvedSession);
const mockedListRemoteEmployees = vi.mocked(remote.listRemoteEmployees);
const mockedLoadRemoteShifts = vi.mocked(remote.loadRemoteShifts);
const mockedLoadRemoteTodayShifts = vi.mocked(remote.loadRemoteTodayShifts);
const mockedListRemoteAreas = vi.mocked(remote.listRemoteAreas);

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadRemoteTodayShifts.mockResolvedValue([]);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

const adminSession: SessionInfo = {
  user: { id: 'user-admin', email: 'admin@test.com', displayName: 'Admin' },
  organizationId: 'org-1',
  role: 'ADMIN',
  employeeId: null,
  memberships: [{ organizationId: 'org-1', organizationName: 'Org', role: 'ADMIN' }],
};

const area = (over: Partial<RemoteArea> = {}): RemoteArea => ({
  id: 'area-n',
  name: 'Norte',
  code: null,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const employees: RemoteEmployee[] = [
  { id: 'emp-a', organizationId: 'org-1', externalEmployeeId: null, name: 'Employee A', userId: null, areaId: 'area-n', status: 'active' },
  { id: 'emp-b', organizationId: 'org-1', externalEmployeeId: null, name: 'Employee B', userId: null, areaId: 'area-s', status: 'active' },
  { id: 'emp-c', organizationId: 'org-1', externalEmployeeId: null, name: 'Employee C', userId: null, areaId: null, status: 'active' },
];

function renderApp() {
  window.history.pushState({}, '', '/app');
  return render(
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('App — area context (dashboard)', () => {
  it('0 areas: no area selector nor context, everything organization-scoped', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedListRemoteAreas.mockResolvedValue([]);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Empleado:' })).toBeTruthy());
    expect(screen.queryByText('Área')).toBeNull();
    // The employee selector still lists the full org roster.
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Employee A', 'Employee B', 'Employee C']);
  });

  it('1 area: the area name is shown as context text, never a dropdown, and the roster is narrowed to it', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedListRemoteAreas.mockResolvedValue([area()]);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();

    await waitFor(() => expect(screen.getByText('Norte')).toBeTruthy());
    expect(screen.getByText('Área')).toBeTruthy();
    // No area dropdown — the only combobox trigger is the employee selector.
    expect(screen.queryByRole('button', { name: 'Área' })).toBeNull();

    // Only the area's employees are offered (Employee B/C are out of scope).
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Employee A']);
  });

  it('2+ areas: selector with "Toda la empresa" default; filtering by area A only shows A', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedListRemoteAreas.mockResolvedValue([area(), area({ id: 'area-s', name: 'Sur' })]);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Área' })).toBeTruthy());
    // Default: whole company (null aggregates everything).
    expect(screen.getByRole('button', { name: 'Área' }).textContent).toContain('Toda la empresa');

    // Filter to area A ("Norte").
    fireEvent.click(screen.getByRole('button', { name: 'Área' }));
    fireEvent.click(screen.getByRole('option', { name: 'Norte' }));

    // The working employee is re-resolved inside the area, never kept from
    // another area silently.
    await waitFor(() => expect(mockedLoadRemoteShifts).toHaveBeenCalledWith('emp-a'));

    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Employee A']);
  });

  it('2+ areas: "Toda la empresa" aggregates the full roster again', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedListRemoteAreas.mockResolvedValue([area(), area({ id: 'area-s', name: 'Sur' })]);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Área' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Área' }));
    fireEvent.click(screen.getByRole('option', { name: 'Norte' }));
    await waitFor(() => expect(mockedLoadRemoteShifts).toHaveBeenCalledWith('emp-a'));

    fireEvent.click(screen.getByRole('button', { name: 'Área' }));
    fireEvent.click(screen.getByRole('option', { name: 'Toda la empresa' }));

    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Employee A', 'Employee B', 'Employee C']);
  });

  it('EMPLOYEE role: enters the portal without an area selector or team context', async () => {
    mockedFetchResolvedSession.mockResolvedValue({
      session: { ...adminSession, role: 'EMPLOYEE', employeeId: 'emp-a', memberships: [{ ...adminSession.memberships[0], role: 'EMPLOYEE' }] },
      needsOrgChoice: false,
    });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedListRemoteAreas.mockResolvedValue([area(), area({ id: 'area-s', name: 'Sur' })]);
    mockedLoadRemoteShifts.mockResolvedValue([]);

    renderApp();

    await waitFor(() => expect(screen.getByTestId('employee-portal')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Área' })).toBeNull();
    expect(screen.queryByText('Norte')).toBeNull();
  });
});

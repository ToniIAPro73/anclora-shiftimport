// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  return { ...actual, fetchResolvedSession: vi.fn(), fetchSession: vi.fn() };
});

vi.mock('./lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/remote')>();
  return { ...actual, listRemoteEmployees: vi.fn(), loadRemoteShifts: vi.fn(), listRemoteAreas: vi.fn() };
});

const mockedFetchResolvedSession = vi.mocked(session.fetchResolvedSession);
const mockedListRemoteEmployees = vi.mocked(remote.listRemoteEmployees);
const mockedLoadRemoteShifts = vi.mocked(remote.loadRemoteShifts);
const mockedListRemoteAreas = vi.mocked(remote.listRemoteAreas);

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  mockedListRemoteAreas.mockResolvedValue([]);
});

const now = new Date();
const dateThisMonth = (day: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const adminSession: SessionInfo = {
  user: { id: 'user-admin', email: 'admin@test.com', displayName: 'Admin' },
  organizationId: 'org-1',
  role: 'ADMIN',
  employeeId: null,
  memberships: [{ organizationId: 'org-1', organizationName: 'Org', role: 'ADMIN' }],
};

const employees: RemoteEmployee[] = [
  { id: 'emp-a', organizationId: 'org-1', externalEmployeeId: '1001', name: 'Employee A', userId: null, status: 'active' },
  { id: 'emp-b', organizationId: 'org-1', externalEmployeeId: '1002', name: 'Employee B', userId: null, status: 'active' },
  { id: 'emp-c', organizationId: 'org-1', externalEmployeeId: '1003', name: 'Employee C', userId: null, status: 'active' },
];

function shiftsFor(employeeId: string) {
  const byEmployee: Record<string, { id: string; date: string; startTime: string; endTime: string; location: string; origin: 'MAN' | 'IMP' }[]> = {
    'emp-a': [{ id: 's-a1', date: dateThisMonth(3), startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' }],
    'emp-b': [
      { id: 's-b1', date: dateThisMonth(5), startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
      { id: 's-b2', date: dateThisMonth(6), startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ],
    'emp-c': [],
  };
  return Promise.resolve(byEmployee[employeeId] ?? []);
}

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

describe('App — Employee calendar selector (ADMIN)', () => {
  it('selecting a different Employee updates the calendar to that Employee\'s own shifts', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockImplementation(shiftsFor);

    renderApp();

    await waitFor(() => expect(screen.getAllByText('Employee A · ID 1001').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('.month-shift-badge')).toHaveLength(1); // Employee A: 1 shift

    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.click(screen.getByText('Employee B · ID 1002'));

    await waitFor(() => expect(document.querySelectorAll('.month-shift-badge')).toHaveLength(2)); // Employee B: 2 shifts
    expect(mockedLoadRemoteShifts).toHaveBeenCalledWith('emp-b');

    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.click(screen.getByText('Employee C · ID 1003'));

    await waitFor(() => expect(screen.getByText(new RegExp(`No hay turnos registrados`))).toBeTruthy());
    expect(document.querySelectorAll('.month-shift-badge')).toHaveLength(0);
  });

  it('never mixes shifts between employees — each switch fetches only that employee\'s own scope', async () => {
    mockedFetchResolvedSession.mockResolvedValue({ session: adminSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockImplementation(shiftsFor);

    renderApp();
    await waitFor(() => expect(document.querySelectorAll('.month-shift-badge')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.click(screen.getByText('Employee B · ID 1002'));
    await waitFor(() => expect(document.querySelectorAll('.month-shift-badge')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.click(screen.getByText('Employee C · ID 1003'));
    await waitFor(() => expect(document.querySelectorAll('.month-shift-badge')).toHaveLength(0));

    // Every fetch after the initial load was scoped to exactly the employee
    // just selected — organization_id + employee_id, never a mix.
    const idsRequested = mockedLoadRemoteShifts.mock.calls.map((call) => call[0]);
    expect(idsRequested).toContain('emp-b');
    expect(idsRequested).toContain('emp-c');
  });

  it('the employee selector never renders for role EMPLOYEE', async () => {
    mockedFetchResolvedSession.mockResolvedValue({
      session: { ...adminSession, role: 'EMPLOYEE', employeeId: 'emp-a', memberships: [{ ...adminSession.memberships[0], role: 'EMPLOYEE' }] },
      needsOrgChoice: false,
    });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockImplementation(shiftsFor);

    renderApp();
    await waitFor(() => expect(screen.getByTestId('employee-portal')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Empleado:' })).toBeNull();
  });

  it('renders the active organization name once in the organization header', async () => {
    const organizationSession: SessionInfo = {
      ...adminSession,
      memberships: [{ organizationId: 'org-1', organizationName: 'Anclora Group', role: 'ADMIN' }],
    };
    mockedFetchResolvedSession.mockResolvedValue({ session: organizationSession, needsOrgChoice: false });
    mockedListRemoteEmployees.mockResolvedValue(employees);
    mockedLoadRemoteShifts.mockImplementation(shiftsFor);

    renderApp();

    await waitFor(() => expect(document.querySelector('.team-bar')).toBeTruthy());
    const teamBar = document.querySelector('.team-bar');
    expect(teamBar?.textContent).toContain('OrganizaciónAnclora Group');
    expect(teamBar?.textContent).not.toContain('Anclora Group — Anclora Group');
  });
});

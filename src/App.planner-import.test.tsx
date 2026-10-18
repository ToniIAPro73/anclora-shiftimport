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
  return {
    ...actual, listRemoteEmployees: vi.fn(), loadRemoteShifts: vi.fn(), loadRemoteTodayShifts: vi.fn(), listRemoteAreas: vi.fn(),
    listRemoteScheduleVersions: vi.fn(), createRemoteEmployee: vi.fn(), createRemoteImport: vi.fn(), confirmRemoteFutureImport: vi.fn(),
  };
});
// The team surface is irrelevant here: the test only needs its "a single employee was detected" handoff.
vi.mock('./components/shift-dashboard/TeamImportModal', () => ({
  TeamImportModal: ({ isOpen, onSingleEmployeeDetected }: { isOpen: boolean; onSingleEmployeeDetected?: (file: File, employee: unknown) => void }) => (isOpen ? (
    <button type="button" onClick={() => onSingleEmployeeDetected?.(new File(['x'], 'doc.csv'), { key: 'k', name: 'Empleado QA 003', externalEmployeeId: '89622', shifts: [] })}>mock-single-employee</button>
  ) : null),
}));
vi.mock('./components/shift-dashboard/ImportModal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/shift-dashboard/ImportModal')>();
  return { ...actual, ImportModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="individual-import-modal" /> : null) };
});

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.mocked(remote.loadRemoteTodayShifts).mockResolvedValue([]);
  vi.mocked(remote.listRemoteAreas).mockResolvedValue([]);
  vi.mocked(remote.listRemoteScheduleVersions).mockResolvedValue([]);
  vi.mocked(remote.loadRemoteShifts).mockResolvedValue([]);
});

const inScope: RemoteEmployee = { id: 'emp-2', organizationId: 'org-1', externalEmployeeId: '85919', name: 'Empleado QA 002', userId: null, status: 'active' };
const sessionOf = (role: 'PLANNER' | 'ADMIN' | 'OWNER'): SessionInfo => ({
  user: { id: 'u', email: 'u@test.com', displayName: 'U' }, organizationId: 'org-1', role, employeeId: null,
  memberships: [{ organizationId: 'org-1', organizationName: 'Org', role }],
});

async function openImportAndDetectSingle(role: 'PLANNER' | 'ADMIN' | 'OWNER') {
  vi.mocked(session.fetchResolvedSession).mockResolvedValue({ session: sessionOf(role), needsOrgChoice: false });
  vi.mocked(remote.listRemoteEmployees).mockResolvedValue([inScope]); // the server roster never includes QA 003 for the planner
  window.history.pushState({}, '', '/app');
  render(<ThemeProvider><I18nProvider><App /></I18nProvider></ThemeProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Importar turnos' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Importar turnos' }));
  fireEvent.click(await screen.findByText('mock-single-employee'));
}

describe('App — individual document whose employee is not resolvable', () => {
  it('T1/T2/ZERO WRITES: a PLANNER is stopped with the neutral message, no alta CTA, no employee, no import record', async () => {
    await openImportAndDetectSingle('PLANNER');
    expect(await screen.findByText('Este empleado no está disponible en tu ámbito de trabajo. No puedes continuar con esta importación.')).toBeTruthy();
    expect(screen.queryByTestId('individual-import-modal')).toBeNull();
    expect(screen.queryByText(/Dar de alta/)).toBeNull();
    expect(remote.createRemoteEmployee).not.toHaveBeenCalled();
    expect(remote.createRemoteImport).not.toHaveBeenCalled();
    expect(remote.confirmRemoteFutureImport).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'OWNER'] as const)('T3/T4: %s keeps the administrative individual flow (handoff to the individual import)', async (role) => {
    await openImportAndDetectSingle(role);
    expect(await screen.findByTestId('individual-import-modal')).toBeTruthy();
    expect(screen.queryByText(/no está disponible en tu ámbito/)).toBeNull();
  });
});

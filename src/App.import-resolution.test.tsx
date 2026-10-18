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
    listRemoteScheduleVersions: vi.fn(), matchRemoteEmployee: vi.fn(), createRemoteEmployee: vi.fn(), createRemoteImport: vi.fn(),
    updateRemoteImportOutcome: vi.fn(), confirmRemoteFutureImport: vi.fn(), syncRemoteShifts: vi.fn(),
  };
});
// Team surface: only the "a single employee was detected" handoff matters. Individual surface: only the confirm callback.
let handoffEmployee = { key: 'k', name: 'Empleado QA 003', externalEmployeeId: '89622', shifts: [] as unknown[] };
vi.mock('./components/shift-dashboard/TeamImportModal', () => ({
  TeamImportModal: ({ isOpen, onSingleEmployeeDetected }: { isOpen: boolean; onSingleEmployeeDetected?: (file: File, employee: unknown) => void }) => (isOpen ? (
    <button type="button" onClick={() => onSingleEmployeeDetected?.(new File(['x'], 'doc.csv'), handoffEmployee)}>mock-single-employee</button>
  ) : null),
}));
vi.mock('./components/shift-dashboard/ImportModal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/shift-dashboard/ImportModal')>();
  return {
    ...actual,
    ImportModal: ({ isOpen, onConfirmImport }: { isOpen: boolean; onConfirmImport: (...args: unknown[]) => Promise<boolean> }) => (isOpen ? (
      <button
        type="button"
        onClick={() => void onConfirmImport(
          [{ id: 's1', date: '2026-11-25', startTime: '14:00', endTime: '22:00', location: 'Regular', origin: 'IMP', shiftType: 'Regular' }],
          { year: 2026, month: 10 },
          { name: handoffEmployee.name, externalId: handoffEmployee.externalEmployeeId },
          null, 'doc.csv', 'a'.repeat(64), undefined, 'historical-and-plan',
        )}
      >mock-confirm</button>
    ) : null),
  };
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
  vi.mocked(remote.matchRemoteEmployee).mockResolvedValue({ kind: 'new', employees: [] });
  vi.mocked(remote.createRemoteImport).mockResolvedValue({ import: { id: 'imp-1' } } as never);
  vi.mocked(remote.updateRemoteImportOutcome).mockResolvedValue({} as never);
});

const inScope: RemoteEmployee = { id: 'emp-2', organizationId: 'org-1', externalEmployeeId: '85919', name: 'Empleado QA 002', userId: null, status: 'active' };
const sessionOf = (role: 'PLANNER' | 'ADMIN' | 'OWNER'): SessionInfo => ({
  user: { id: 'u', email: 'u@test.com', displayName: 'U' }, organizationId: 'org-1', role, employeeId: null,
  memberships: [{ organizationId: 'org-1', organizationName: 'Org', role }],
});

async function openIndividualImport(role: 'PLANNER' | 'ADMIN' | 'OWNER', employee: typeof handoffEmployee) {
  handoffEmployee = employee;
  vi.mocked(session.fetchResolvedSession).mockResolvedValue({ session: sessionOf(role), needsOrgChoice: false });
  vi.mocked(remote.listRemoteEmployees).mockResolvedValue([inScope]);
  window.history.pushState({}, '', '/app');
  render(<ThemeProvider><I18nProvider><App /></I18nProvider></ThemeProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Importar turnos' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Importar turnos' }));
  fireEvent.click(await screen.findByText('mock-single-employee'));
}

const noImportOrPlanningWrites = () => {
  expect(remote.createRemoteImport).not.toHaveBeenCalled();
  expect(remote.confirmRemoteFutureImport).not.toHaveBeenCalled();
  expect(remote.syncRemoteShifts).not.toHaveBeenCalled();
};

describe('resolveImportEmployee — real "Dar de alta y detener" flow (ADMIN / OWNER)', () => {
  it.each(['ADMIN', 'OWNER'] as const)('%s: an unknown individual employee offers the alta, creates it, and the import stops', async (role) => {
    vi.mocked(remote.createRemoteEmployee).mockResolvedValue({ id: 'emp-new', organizationId: 'org-1', externalEmployeeId: '89622', name: 'Empleado QA 003', userId: null, status: 'pending_access' } as RemoteEmployee);
    await openIndividualImport(role, { key: 'k', name: 'Empleado QA 003', externalEmployeeId: '89622', shifts: [] });
    fireEvent.click(await screen.findByText('mock-confirm'));

    const action = await screen.findByRole('button', { name: 'Dar de alta y detener' });
    fireEvent.click(action);
    await waitFor(() => expect(remote.createRemoteEmployee).toHaveBeenCalledTimes(1));
    expect(remote.createRemoteEmployee).toHaveBeenCalledWith(expect.objectContaining({ name: 'Empleado QA 003', externalEmployeeId: '89622' }));
    // the import stops after the alta: nothing is imported or planned
    expect(remote.confirmRemoteFutureImport).not.toHaveBeenCalled();
    expect(remote.syncRemoteShifts).not.toHaveBeenCalled();
    expect(screen.queryByText(/no está disponible en tu ámbito/)).toBeNull();
  });
});

describe('resolveImportEmployee — PLANNER defence (match = new / not resolvable in scope)', () => {
  it('returns null with the neutral message: no alta, no employee, no import record, no planning write', async () => {
    // The planner reaches the individual surface with an in-scope employee, then the identity can no longer be resolved
    // (stale roster) and the matcher answers "new": the administrative flow must stay closed.
    await openIndividualImport('PLANNER', { key: 'k', name: 'Empleado QA 002', externalEmployeeId: '85919', shifts: [] });
    vi.mocked(remote.listRemoteEmployees).mockResolvedValue([]);
    fireEvent.click(await screen.findByText('mock-confirm'));

    expect(await screen.findByText('Este empleado no está disponible en tu ámbito de trabajo. No puedes continuar con esta importación.')).toBeTruthy();
    expect(screen.queryByText(/Dar de alta/)).toBeNull();
    expect(remote.matchRemoteEmployee).toHaveBeenCalled();
    expect(remote.createRemoteEmployee).not.toHaveBeenCalled();
    noImportOrPlanningWrites();
  });
});

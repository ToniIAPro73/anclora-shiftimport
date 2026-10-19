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
  return { ...actual, listRemoteEmployees: vi.fn(), loadRemoteShifts: vi.fn(), loadRemoteTodayShifts: vi.fn(), listRemoteAreas: vi.fn(), listRemoteScheduleVersions: vi.fn(), resolveSourceIdentity: vi.fn() };
});
// The document is a TRYP individual export: source system + alias 6888 + the name printed in it.
vi.mock('./ingestion/adapters/tryp-calendar-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ingestion/adapters/tryp-calendar-export')>()),
    parseTrypCalendarExport: vi.fn(async () => ({ sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', sourceIdentifier: '6888', employeeName: 'Sebastian Pozo Mendoza' })),
}));
vi.mock('./components/shift-dashboard/TeamImportModal', () => ({
  TeamImportModal: ({ isOpen, onSingleEmployeeDetected }: { isOpen: boolean; onSingleEmployeeDetected?: (file: File, employee: unknown) => void }) => (isOpen ? (
    <button type="button" onClick={() => onSingleEmployeeDetected?.(new File(['x'], 'doc.xlsx'), { key: 'k', name: 'Sebastian Pozo Mendoza', externalEmployeeId: '', shifts: [] })}>mock-single-employee</button>
  ) : null),
}));
vi.mock('./components/shift-dashboard/ImportModal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/shift-dashboard/ImportModal')>();
  return {
    ...actual,
    ImportModal: ({ isOpen, employeePreset, employeeTargetFixed }: { isOpen: boolean; employeePreset?: { name: string; externalId: string } | null; employeeTargetFixed?: boolean }) => (isOpen ? (
      <div data-testid="individual-import" data-name={employeePreset?.name ?? ''} data-external-id={employeePreset?.externalId ?? ''} data-target-fixed={String(Boolean(employeeTargetFixed))} />
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
});

const seb: RemoteEmployee = { id: 'uuid-seb', organizationId: 'org-1', externalEmployeeId: '84881', name: 'Pozo Mendoza, Sebastian', userId: null, status: 'active' };
const owner: SessionInfo = { user: { id: 'u', email: 'u@test.com', displayName: 'U' }, organizationId: 'org-1', role: 'OWNER', employeeId: null, memberships: [{ organizationId: 'org-1', organizationName: 'CIF Import', role: 'OWNER' }] };

async function detectSingle(directory: RemoteEmployee[]) {
  vi.mocked(session.fetchResolvedSession).mockResolvedValue({ session: owner, needsOrgChoice: false });
  vi.mocked(remote.listRemoteEmployees).mockResolvedValue(directory);
  vi.mocked(remote.resolveSourceIdentity).mockResolvedValue({ status: 'CANDIDATE', employee: { id: 'uuid-seb', name: 'Pozo Mendoza, Sebastian', externalEmployeeId: '84881', status: 'active' }, candidates: [] } as never);
  window.history.pushState({}, '', '/app');
  render(<ThemeProvider><I18nProvider><App /></I18nProvider></ThemeProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Importar turnos' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Importar turnos' }));
  fireEvent.click(await screen.findByText('mock-single-employee'));
  return screen.findByTestId('individual-import');
}

describe('single-employee handoff of a TRYP export with an unmapped alias', () => {
  it('C: a unique CANDIDATE is imported as the canonical employee (directory name + id 84881), never an empty id nor the alias', async () => {
    const modal = await detectSingle([seb]);
    expect(modal.getAttribute('data-name')).toBe('Pozo Mendoza, Sebastian');
    expect(modal.getAttribute('data-external-id')).toBe('84881');
    expect(modal.getAttribute('data-target-fixed')).toBe('true');
    expect(modal.getAttribute('data-external-id')).not.toBe('6888');
    expect(remote.resolveSourceIdentity).toHaveBeenCalledWith({ sourceSystem: 'TRYP_EMPLOYEE_CALENDAR', externalIdentifier: '6888', documentName: 'Sebastian Pozo Mendoza' });
  });

  it('C: the server verdict is authoritative even if the loaded directory does not contain the row yet', async () => {
    const modal = await detectSingle([]);
    expect(modal.getAttribute('data-name')).toBe('Pozo Mendoza, Sebastian');
    expect(modal.getAttribute('data-external-id')).toBe('84881');
    expect(modal.getAttribute('data-target-fixed')).toBe('true');
  });
});

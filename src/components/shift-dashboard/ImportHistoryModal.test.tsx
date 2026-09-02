// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { ImportHistoryPage, RemoteImport } from '../../lib/remote';
import { SessionInfo } from '../../lib/session';
import { ImportHistoryModal } from './ImportHistoryModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteImports: vi.fn(),
    deleteRemoteImport: vi.fn(),
  };
});

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedListRemoteImports = vi.mocked(remote.listRemoteImports);
const mockedDeleteRemoteImport = vi.mocked(remote.deleteRemoteImport);

const importRow = (over: Partial<RemoteImport> = {}): RemoteImport => ({
  id: 'import-1',
  fileName: '',
  sourceFormat: 'xlsx',
  periodYear: 2026,
  periodMonth: 0,
  periodKind: 'multi',
  periodLabel: 'Enero–Septiembre 2026',
  importMode: 'individual',
  status: 'completed',
  scopeType: 'global',
  areaId: null,
  areaNameSnapshot: null,
  importedByUserId: 'user-1',
  importedByUserName: 'Toni',
  employeeCount: 1,
  shiftCount: 246,
  createdShiftCount: 246,
  existingShiftCount: 0,
  createdAt: '2026-09-01T23:18:00.000Z',
  deletedAt: null,
  ...over,
});

const page = (imports: RemoteImport[], over: Partial<ImportHistoryPage> = {}): ImportHistoryPage => ({
  imports,
  total: imports.length,
  page: 1,
  pageSize: 5,
  ...over,
});

const adminSession = (): SessionInfo => ({
  user: { id: 'user-1', email: 'admin@example.com', displayName: 'Toni' },
  organizationId: 'org-1',
  role: 'ADMIN',
  employeeId: null,
  memberships: [{ organizationId: 'org-1', organizationName: 'Anclora', role: 'ADMIN' }],
});

const employeeSession = (): SessionInfo => ({
  ...adminSession(),
  role: 'EMPLOYEE',
});

function renderModal(session: SessionInfo | null = adminSession(), onDeleted: () => void = () => {}) {
  return render(
    <I18nProvider>
      <ImportHistoryModal isOpen onClose={() => {}} session={session} onDeleted={onDeleted} />
    </I18nProvider>,
  );
}

describe('ImportHistoryModal', () => {
  it('requests a smaller page size on narrow (mobile) viewports', async () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 480px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaMock);
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    renderModal();

    await waitFor(() => expect(mockedListRemoteImports).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 })));
  });


  it('shows a loading state while the history is being fetched', async () => {
    let resolvePromise: (value: ImportHistoryPage) => void = () => {};
    mockedListRemoteImports.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));
    renderModal();

    expect(screen.getByText('Cargando historial…')).toBeTruthy();
    resolvePromise(page([]));
    await waitFor(() => expect(screen.queryByText('Cargando historial…')).toBeNull());
  });

  it('shows the empty state when there are no imports', async () => {
    mockedListRemoteImports.mockResolvedValue(page([]));
    renderModal();
    await waitFor(() => expect(screen.getByText('No hay importaciones registradas.')).toBeTruthy());
  });

  it('renders the required fields for each import', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    renderModal();

    await waitFor(() => expect(screen.getByText(/Toni/)).toBeTruthy());
    expect(screen.getByText(/Empleados: 1/)).toBeTruthy();
    expect(screen.getByText(/Turnos del archivo: 246/)).toBeTruthy();
    expect(screen.getByText(/Turnos nuevos: 246/)).toBeTruthy();
    expect(screen.getByText(/Ya existentes: 0/)).toBeTruthy();
    expect(screen.getByText(/Período: Enero–Septiembre 2026/)).toBeTruthy();
    expect(screen.getByText(/Tipo: Individual/)).toBeTruthy();
    expect(screen.getByText(/Formato: XLSX/)).toBeTruthy();
    expect(screen.getByText(/Ámbito: Global/)).toBeTruthy();
    expect(screen.getByText('Completada', { selector: '.status-badge' })).toBeTruthy();
  });

  it('shows the area name for an area-scoped import', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow({ scopeType: 'area', areaNameSnapshot: 'Operaciones' })]));
    renderModal();
    await waitFor(() => expect(screen.getByText(/Ámbito: Área: Operaciones/)).toBeTruthy());
  });

  it('ADMIN sees a delete action; EMPLOYEE sees a read-only notice and no delete action', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    const { unmount } = renderModal(adminSession());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar importación' })).toBeTruthy());
    unmount();

    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    renderModal(employeeSession());
    await waitFor(() => expect(screen.getByText(/Solo puedes consultar el historial/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Eliminar importación' })).toBeNull();
  });

  it('deletes an import after confirmation and reports it via onDeleted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleted = vi.fn();
    mockedListRemoteImports.mockResolvedValueOnce(page([importRow()]));
    mockedDeleteRemoteImport.mockResolvedValue({ deleted: true, importId: 'import-1', deletedShiftCount: 246 });
    mockedListRemoteImports.mockResolvedValueOnce(page([]));
    renderModal(adminSession(), onDeleted);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar importación' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar importación' }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockedDeleteRemoteImport).toHaveBeenCalledWith('import-1'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('import-1'));
    confirmSpy.mockRestore();
  });

  it('does not call the delete endpoint when the confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    renderModal(adminSession());

    await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar importación' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar importación' }));

    expect(mockedDeleteRemoteImport).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an error message and never claims success when the delete request fails', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    mockedDeleteRemoteImport.mockRejectedValue(new Error('boom'));
    const onDeleted = vi.fn();
    renderModal(adminSession(), onDeleted);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar importación' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar importación' }));

    await waitFor(() => expect(screen.getByText('Error al eliminar la importación.')).toBeTruthy());
    expect(onDeleted).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('disables pagination controls appropriately and requests the next page', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow()], { total: 25, page: 1, pageSize: 10 }));
    renderModal();

    await waitFor(() => expect(screen.getByLabelText('Página siguiente')).toBeTruthy());
    expect(screen.getByLabelText('Página anterior')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Página siguiente')).toHaveProperty('disabled', false);
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();

    mockedListRemoteImports.mockResolvedValueOnce(page([importRow({ id: 'import-2' })], { total: 25, page: 2, pageSize: 10 }));
    fireEvent.click(screen.getByLabelText('Página siguiente'));
    await waitFor(() => expect(mockedListRemoteImports).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });
});

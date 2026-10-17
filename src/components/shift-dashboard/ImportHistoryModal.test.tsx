// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { ImportHistoryPage, RemoteImport } from '../../lib/remote';
import { ApiError, SessionInfo } from '../../lib/session';
import { ImportHistoryModal } from './ImportHistoryModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteImports: vi.fn(),
    previewImportReversion: vi.fn(),
    confirmImportReversion: vi.fn(),
    loadReversionDetail: vi.fn(),
  };
});

afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedListRemoteImports = vi.mocked(remote.listRemoteImports);
const mockedPreview = vi.mocked(remote.previewImportReversion);
const mockedConfirm = vi.mocked(remote.confirmImportReversion);
const mockedDetail = vi.mocked(remote.loadReversionDetail);

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
  reversibility: 'REVERSIBLE',
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

function renderModal(session: SessionInfo | null = adminSession(), onReverted: (ids: string[]) => void = () => {}) {
  return render(
    <I18nProvider>
      <ImportHistoryModal isOpen onClose={() => {}} session={session} onReverted={onReverted} />
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

  const impact = (over: Partial<remote.ReversionImpact> = {}): remote.ReversionImpact => ({
    shiftsRemoved: 246, shiftsRestored: 0, reviewCleared: 0, planRevisionsReverted: 0, assignmentsRemoved: 0, assignmentsRestored: 0,
    draftVersionsRemoved: 0, draftVersionsRestored: 0, schedulesRemoved: 0, schedulesRestored: 0, dcfRemoved: 0, dcfPreserved: 0,
    commentsRemoved: 0, changesRemoved: 0, changesRestored: 0, employeesAffected: 1, alreadyAbsent: 0, ...over,
  });
  const readyPlan = (over: Partial<remote.ReversionPlan> = {}): remote.ReversionPlan => ({
    status: 'READY', planHash: 'a'.repeat(64), requestedIds: ['import-1'], order: ['import-1'], blockers: [], warnings: [], impact: impact(),
    imports: [{ id: 'import-1', fileName: 'a.xlsx', sourceFormat: 'xlsx', createdAt: '2026-09-01T23:18:00.000Z', importedByName: 'Toni', requestedByUser: true, autoIncluded: false, executionOrder: 1, legacy: false }],
    ...over,
  });

  it('ADMIN sees "Revertir" (never "Eliminar"); EMPLOYEE sees a read-only notice and no action or selection', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    const { unmount } = renderModal(adminSession());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revertir importación' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull();
    unmount();

    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    renderModal(employeeSession());
    await waitFor(() => expect(screen.getByText(/Solo puedes consultar el historial/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Revertir importación' })).toBeNull();
    expect(screen.queryByTestId('import-select-import-1')).toBeNull();
  });

  it('a single import is reverted from its own button: preview first (read-only), then confirmation, then onReverted', async () => {
    const onReverted = vi.fn();
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    mockedPreview.mockResolvedValue(readyPlan());
    mockedConfirm.mockResolvedValue({ reversionId: 'r1', status: 'completed', idempotent: false, requestedImportCount: 1, effectiveImportCount: 1, impact: impact(), executionOrder: ['import-1'] });
    renderModal(adminSession(), onReverted);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Revertir importación' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Revertir importación' }));
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledWith(['import-1']));
    expect(mockedConfirm).not.toHaveBeenCalled(); // the preview never writes
    expect(screen.getByText('ShiftImport ha calculado automáticamente el orden seguro.')).toBeTruthy();

    fireEvent.click(await screen.findByTestId('reversion-confirm'));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith({ importIds: ['import-1'], planHash: 'a'.repeat(64), reason: undefined }));
    await waitFor(() => expect(onReverted).toHaveBeenCalledWith(['import-1']));
  });

  it('several imports: the user selects WHAT, the server orders; auto-included dependencies are shown as such and the order is only a detail', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow({ id: 'import-1' }), importRow({ id: 'import-2', createdAt: '2026-09-02T10:00:00.000Z' })]));
    mockedPreview.mockResolvedValue(readyPlan({
      requestedIds: ['import-1'], order: ['import-3', 'import-2', 'import-1'],
      imports: [
        { id: 'import-1', fileName: 'a.xlsx', sourceFormat: 'xlsx', createdAt: '2026-09-01T10:00:00.000Z', importedByName: 'Toni', requestedByUser: true, autoIncluded: false, executionOrder: 3, legacy: false },
        { id: 'import-2', fileName: 'b.xlsx', sourceFormat: 'xlsx', createdAt: '2026-09-02T10:00:00.000Z', importedByName: 'Toni', requestedByUser: false, autoIncluded: true, executionOrder: 2, legacy: false },
        { id: 'import-3', fileName: 'c.xlsx', sourceFormat: 'xlsx', createdAt: '2026-09-03T10:00:00.000Z', importedByName: 'Toni', requestedByUser: false, autoIncluded: true, executionOrder: 1, legacy: false },
      ],
    }));
    renderModal();
    await waitFor(() => expect(screen.getByTestId('import-select-import-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('import-select-import-1'));
    fireEvent.click(screen.getByTestId('import-select-import-2'));
    fireEvent.click(screen.getByTestId('import-revert-selected'));
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledWith(['import-1', 'import-2']));
    const related = await screen.findByTestId('reversion-related');
    expect(related.textContent).toContain('incluye 2 importación(es)');
    expect(related.textContent).toContain('b.xlsx');
    expect(screen.queryByText(/subir|bajar|ordenar/i)).toBeNull(); // no manual ordering controls
    expect(screen.getByTestId('reversion-order').textContent).toBe('c.xlsx → b.xlsx → a.xlsx'); // informational, dependents first
  });

  it('a BLOCKED plan explains why in plain language and offers no confirmation', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    mockedPreview.mockResolvedValue(readyPlan({ status: 'BLOCKED', blockers: [{ code: 'LATER_MANUAL_CHANGE_UNSAFE', importId: 'import-1', count: 3 }] }));
    renderModal();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revertir importación' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Revertir importación' }));
    const blocked = await screen.findByTestId('reversion-blocked');
    expect(blocked.textContent).toContain('cambios posteriores');
    expect(blocked.textContent).not.toMatch(/LATER_MANUAL_CHANGE_UNSAFE/);
    expect((screen.getByTestId('reversion-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a stale plan (409 REVERSION_PLAN_STALE) is never executed: the preview is recomputed', async () => {
    mockedListRemoteImports.mockResolvedValue(page([importRow()]));
    mockedPreview.mockResolvedValue(readyPlan());
    mockedConfirm.mockRejectedValueOnce(new ApiError(409, 'stale', 'REVERSION_PLAN_STALE'));
    renderModal();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revertir importación' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Revertir importación' }));
    fireEvent.click(await screen.findByTestId('reversion-confirm'));
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('reversion-stale')).toBeTruthy();
  });

  it('a reverted import stays in the history as "Revertida" (who/when) and offers no new reversion; legacy-blocked imports explain why', async () => {
    mockedListRemoteImports.mockResolvedValue(page([
      importRow({ id: 'reverted-1', status: 'reverted', reversibility: 'REVERTED', revertedAt: '2026-10-01T10:00:00.000Z', revertedByUserName: 'Ana' }),
      importRow({ id: 'legacy-1', reversibility: 'BLOCKED_LEGACY' }),
    ]));
    mockedDetail.mockResolvedValue({ id: 'r1', reason: 'duplicado', createdAt: '2026-10-01T10:00:00.000Z', requestedByName: 'Ana', impact: null, items: [{ importId: 'reverted-1', fileName: 'a.xlsx', requestedByUser: true, autoIncludedDependency: false, executionOrder: 1, effectCount: 3 }] });
    renderModal();
    await waitFor(() => expect(screen.getByTestId('import-reverted-note')).toBeTruthy());
    expect(screen.getByTestId('import-reverted-note').textContent).toContain('Ana');
    expect(screen.queryByTestId('import-revert-reverted-1')).toBeNull();
    expect(screen.queryByTestId('import-select-reverted-1')).toBeNull();
    expect((screen.getByTestId('import-select-legacy-1') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('import-legacy-note').textContent).toContain('Anterior al sistema de reversión completa');
    fireEvent.click(screen.getByTestId('import-reversion-details-reverted-1'));
    await waitFor(() => expect(screen.getByTestId('import-reversion-detail').textContent).toContain('duplicado'));
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

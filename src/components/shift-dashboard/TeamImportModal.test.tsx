// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { detectTeamRoster } from '../../ingestion/team-roster';
import * as remote from '../../lib/remote';
import { RemoteArea, RemoteEmployee } from '../../lib/remote';
import { TeamImportModal } from './TeamImportModal';

// Node has no DOM Worker: point PDF.js at the legacy worker module resolved
// from disk, same setup as src/ingestion/parsers/pdf.integration.test.ts.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

vi.mock('../../ingestion/team-roster', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/team-roster')>();
  return { ...actual, detectTeamRoster: vi.fn() };
});

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    matchRemoteEmployee: vi.fn(),
    createRemoteEmployee: vi.fn(),
    updateRemoteEmployee: vi.fn(),
    bulkCreateRemoteEmployees: vi.fn(),
    createRemoteImport: vi.fn(),
    syncRemoteShifts: vi.fn(),
    loadRemoteShifts: vi.fn(),
  };
});

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedDetectTeamRoster = vi.mocked(detectTeamRoster);
const mockedMatchRemoteEmployee = vi.mocked(remote.matchRemoteEmployee);
const mockedCreateRemoteEmployee = vi.mocked(remote.createRemoteEmployee);
const mockedUpdateRemoteEmployee = vi.mocked(remote.updateRemoteEmployee);
const mockedBulkCreateRemoteEmployees = vi.mocked(remote.bulkCreateRemoteEmployees);
const mockedCreateRemoteImport = vi.mocked(remote.createRemoteImport);
const mockedSyncRemoteShifts = vi.mocked(remote.syncRemoteShifts);
const mockedLoadRemoteShifts = vi.mocked(remote.loadRemoteShifts);

function renderTeamImportModal(
  onImported: () => void = () => {},
  sessionRole: 'ADMIN' | 'EMPLOYEE' = 'ADMIN',
  options: { areas?: RemoteArea[]; currentAreaId?: string | null; allowAreaChoice?: boolean } = {},
) {
  return render(
    <I18nProvider>
      <TeamImportModal
        isOpen
        onClose={() => {}}
        onImported={onImported}
        sessionRole={sessionRole}
        areas={options.areas ?? []}
        currentAreaId={options.currentAreaId ?? null}
        allowAreaChoice={options.allowAreaChoice ?? false}
      />
    </I18nProvider>,
  );
}

const csvFile = () => new File(['name,date,start,end\nAna,2026-03-04,08:00,16:00'], 'equipo.csv', { type: 'text/csv' });

const remoteEmployee = (over: Partial<RemoteEmployee> = {}): RemoteEmployee => ({
  id: 'emp-x',
  organizationId: 'org-1',
  externalEmployeeId: null,
  name: 'X',
  userId: null,
  status: 'active',
  ...over,
});

const remoteArea = (over: Partial<RemoteArea> = {}): RemoteArea => ({
  id: 'area-n',
  name: 'Norte',
  code: 'N',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const rosterShift = (date: string) => ({
  date,
  startTime: '08:00',
  endTime: '16:00',
  origin: 'IMP' as const,
  isValid: true,
  confidence: 1,
  rawText: '08:00-16:00',
  shiftType: 'Regular',
  notes: null,
  color: null,
});

describe('TeamImportModal (role-aware: ADMIN/MANAGER multi-employee import)', () => {
  it('recognized/new/ambiguous rows render with the right per-status controls', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [
        { key: 'e1', externalEmployeeId: '1001', name: 'Ana Martinez', shifts: [rosterShift('2026-03-04')] },
        { key: 'e2', externalEmployeeId: '', name: 'Nuevo Empleado', shifts: [rosterShift('2026-03-05')] },
        { key: 'e3', externalEmployeeId: '', name: 'Nombre Duplicado', shifts: [rosterShift('2026-03-06')] },
      ],
    });
    mockedMatchRemoteEmployee.mockImplementation(async ({ name }) => {
      if (name === 'Ana Martinez') {
        return { kind: 'recognized' as const, employees: [remoteEmployee({ id: 'emp-ana', name: 'Ana Martinez', externalEmployeeId: '1001' })] };
      }
      if (name === 'Nombre Duplicado') {
        return {
          kind: 'ambiguous' as const,
          employees: [
            remoteEmployee({ id: 'emp-dup1', name: 'Nombre Duplicado' }),
            remoteEmployee({ id: 'emp-dup2', name: 'Nombre Duplicado' }),
          ],
        };
      }
      return { kind: 'new' as const, employees: [] };
    });

    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Reconocido')).toBeTruthy());
    expect(screen.getByText('Nuevo')).toBeTruthy();
    expect(screen.getByText('Ambiguo')).toBeTruthy();
    expect(screen.getByText('Crear')).toBeTruthy();
    expect(screen.getByText('Crear como nuevo')).toBeTruthy();
  });

  it('select recognized → preview → confirm writes shifts for that employee only', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [
        { key: 'e1', externalEmployeeId: '1001', name: 'Ana Martinez', shifts: [rosterShift('2026-03-04')] },
      ],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({
      kind: 'recognized',
      employees: [remoteEmployee({ id: 'emp-ana', name: 'Ana Martinez', externalEmployeeId: '1001' })],
    });
    mockedLoadRemoteShifts.mockResolvedValue([]);
    mockedCreateRemoteImport.mockResolvedValue({ id: 'import-1', fileName: '', sourceFormat: 'csv', periodYear: 2026, periodMonth: 2, status: 'completed' });
    mockedSyncRemoteShifts.mockResolvedValue({ saved: [], deleted: 0 });
    const onImported = vi.fn();

    renderTeamImportModal(onImported);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByLabelText('Ana Martinez')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Ana Martinez'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(screen.getByText('Resumen antes de importar')).toBeTruthy());
    fireEvent.click(screen.getByText('Importar'));

    await waitFor(() => expect(mockedSyncRemoteShifts).toHaveBeenCalledTimes(1));
    expect(mockedSyncRemoteShifts.mock.calls[0][0]).toBe('emp-ana');
    await waitFor(() => expect(screen.getByText('Importación completada')).toBeTruthy());
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('inline "new" employee creation resolves PLAN_LIMIT into the upgrade prompt, not a crash', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [{ key: 'e1', externalEmployeeId: '', name: 'Nuevo Empleado', shifts: [rosterShift('2026-03-04')] }],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
    const { ApiError } = await import('../../lib/session');
    mockedCreateRemoteEmployee.mockRejectedValue(new ApiError(403, 'Plan limit reached', 'PLAN_LIMIT'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Crear')).toBeTruthy());
    fireEvent.click(screen.getByText('Crear'));

    await waitFor(() => expect(screen.getByText('Esta función está disponible en Team')).toBeTruthy());
  });
});

describe('TeamImportModal (Select-All feedback, not a silent no-op)', () => {
  it('all-new roster: Select All selects 0, shows the count and the resolve-first guidance — never silent', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [
        { key: 'e1', externalEmployeeId: 'A1', name: 'Alguien Uno', shifts: [rosterShift('2026-03-04')] },
        { key: 'e2', externalEmployeeId: 'A2', name: 'Alguien Dos', shifts: [rosterShift('2026-03-05')] },
      ],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });

    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('2 detectados · 0 reconocidos · 0 inactivos · 2 nuevos · 0 ambiguos')).toBeTruthy());
    expect(screen.getByText('0 seleccionados de 2')).toBeTruthy();
    expect(screen.getByText('Resuelve los empleados nuevos antes de seleccionarlos.')).toBeTruthy();

    fireEvent.click(screen.getByText('Seleccionar todos'));
    // Still 0 — the button is a legitimate no-op here (nothing eligible),
    // but the state is never silent: count + guidance stay visible.
    expect(screen.getByText('0 seleccionados de 2')).toBeTruthy();
    expect(screen.getByText('Resuelve los empleados nuevos antes de seleccionarlos.')).toBeTruthy();
  });

  it('mixed roster: Select All selects only recognized rows and reports the correct count', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [
        { key: 'e1', externalEmployeeId: '1001', name: 'Ana Martinez', shifts: [rosterShift('2026-03-04')] },
        { key: 'e2', externalEmployeeId: '', name: 'Nuevo Empleado', shifts: [rosterShift('2026-03-05')] },
      ],
    });
    mockedMatchRemoteEmployee.mockImplementation(async ({ name }) => (
      name === 'Ana Martinez'
        ? { kind: 'recognized' as const, employees: [remoteEmployee({ id: 'emp-ana', name: 'Ana Martinez', externalEmployeeId: '1001' })] }
        : { kind: 'new' as const, employees: [] }
    ));

    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('2 detectados · 1 reconocidos · 0 inactivos · 1 nuevos · 0 ambiguos')).toBeTruthy());
    fireEvent.click(screen.getByText('Seleccionar todos'));

    expect(screen.getByText('1 seleccionados de 2')).toBeTruthy();
    // Not "none eligible" — a recognized row exists, so no guidance banner.
    expect(screen.queryByText('Resuelve los empleados nuevos antes de seleccionarlos.')).toBeNull();
  });
});

describe('TeamImportModal ("Crear todos los nuevos" bulk create)', () => {
  const rosterOf = (names: string[]) => ({
    employees: names.map((name, index) => ({
      key: `e${index}`,
      externalEmployeeId: `EXT${index}`,
      name,
      shifts: [rosterShift('2026-03-04')],
    })),
  });

  it('bulk-create button is hidden when there are 0 new rows', async () => {
    mockedDetectTeamRoster.mockReturnValue(rosterOf(['Ana Martinez']));
    mockedMatchRemoteEmployee.mockResolvedValue({
      kind: 'recognized',
      employees: [remoteEmployee({ id: 'emp-ana', name: 'Ana Martinez', externalEmployeeId: 'EXT0' })],
    });
    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Seleccionar todos')).toBeTruthy());
    expect(screen.queryByText(/Crear \d+ empleados nuevos/)).toBeNull();
  });

  it('shows the exact new-employee count, and the confirm panel lists rows with issues flagged', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [
        { key: 'e0', externalEmployeeId: 'EXT0', name: 'Ana Nueva', shifts: [rosterShift('2026-03-04')] },
        { key: 'e1', externalEmployeeId: 'EXT1', name: 'Beto Nuevo', shifts: [rosterShift('2026-03-05')] },
        { key: 'e2', externalEmployeeId: '', name: '', shifts: [rosterShift('2026-03-06')] },
      ],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Crear 3 empleados nuevos')).toBeTruthy());
    fireEvent.click(screen.getByText('Crear 3 empleados nuevos'));

    expect(screen.getByText('Crear 2 empleados nuevos')).toBeTruthy(); // confirm title excludes the invalid row
    expect(screen.getByText('Fila sin nombre — se excluye')).toBeTruthy();
    expect(screen.getByText('Crear 2 empleados')).toBeTruthy(); // confirm button count
  });

  it('confirm sends one bulk request, flips created/existing rows to recognized+selected, shows aggregated result', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [
        { key: 'e0', externalEmployeeId: 'EXT0', name: 'Ana Nueva', shifts: [rosterShift('2026-03-04')] },
        { key: 'e1', externalEmployeeId: 'EXT1', name: 'Beto Nuevo', shifts: [rosterShift('2026-03-05')] },
      ],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
    mockedBulkCreateRemoteEmployees.mockResolvedValue([
      { key: 'e0', status: 'created', employee: remoteEmployee({ id: 'emp-e0', name: 'Ana Nueva', externalEmployeeId: 'EXT0' }) },
      { key: 'e1', status: 'existing', employee: remoteEmployee({ id: 'emp-e1', name: 'Beto Nuevo', externalEmployeeId: 'EXT1' }) },
    ]);
    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Crear 2 empleados nuevos')).toBeTruthy());
    fireEvent.click(screen.getByText('Crear 2 empleados nuevos'));
    fireEvent.click(screen.getByText('Crear 2 empleados'));

    await waitFor(() => expect(mockedBulkCreateRemoteEmployees).toHaveBeenCalledTimes(1));
    expect(mockedBulkCreateRemoteEmployees).toHaveBeenCalledWith([
      { key: 'e0', name: 'Ana Nueva', externalEmployeeId: 'EXT0' },
      { key: 'e1', name: 'Beto Nuevo', externalEmployeeId: 'EXT1' },
    ]);

    await waitFor(() => expect(screen.getByText('1 creados · 1 ya existentes · 0 errores')).toBeTruthy());
    // Both rows are now recognized+selected — no manual refresh needed.
    expect(screen.getByText('2 detectados · 2 reconocidos · 0 inactivos · 0 nuevos · 0 ambiguos')).toBeTruthy();
    expect(screen.getByText('2 seleccionados de 2')).toBeTruthy();
  });

  it('a plan_limit failure result opens the upgrade prompt', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [{ key: 'e0', externalEmployeeId: 'EXT0', name: 'Ana Nueva', shifts: [rosterShift('2026-03-04')] }],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
    mockedBulkCreateRemoteEmployees.mockResolvedValue([
      { key: 'e0', status: 'failed', reason: 'plan_limit' },
    ]);
    renderTeamImportModal();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Crear 1 empleados nuevos')).toBeTruthy());
    fireEvent.click(screen.getByText('Crear 1 empleados nuevos'));
    fireEvent.click(screen.getByText('Crear 1 empleados'));

    await waitFor(() => expect(screen.getByText('Esta función está disponible en Team')).toBeTruthy());
  });

  it('2+ areas: bulk-create new employees inherits the selected import areaId', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [{ key: 'e0', externalEmployeeId: 'EXT0', name: 'Ana Nueva', shifts: [rosterShift('2026-03-04')] }],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
    mockedBulkCreateRemoteEmployees.mockResolvedValue([
      { key: 'e0', status: 'created', employee: remoteEmployee({ id: 'emp-e0', name: 'Ana Nueva', externalEmployeeId: 'EXT0', areaId: 'area-s' }) },
    ]);
    renderTeamImportModal(() => {}, 'ADMIN', {
      areas: [remoteArea(), remoteArea({ id: 'area-s', name: 'Sur', code: null })],
      allowAreaChoice: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Área de la importación' }));
    fireEvent.click(screen.getByRole('option', { name: 'Sur' }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Crear 1 empleados nuevos')).toBeTruthy());
    fireEvent.click(screen.getByText('Crear 1 empleados nuevos'));
    fireEvent.click(screen.getByText('Crear 1 empleados'));

    await waitFor(() => expect(mockedBulkCreateRemoteEmployees).toHaveBeenCalledWith([
      { key: 'e0', name: 'Ana Nueva', externalEmployeeId: 'EXT0', areaId: 'area-s' },
    ]));
  });

  it('area-scoped team import stores areaId on the import record', async () => {
    mockedDetectTeamRoster.mockReturnValue({
      employees: [{ key: 'e1', externalEmployeeId: '1001', name: 'Ana Martinez', shifts: [rosterShift('2026-03-04')] }],
    });
    mockedMatchRemoteEmployee.mockResolvedValue({
      kind: 'recognized',
      employees: [remoteEmployee({ id: 'emp-ana', name: 'Ana Martinez', externalEmployeeId: '1001', areaId: 'area-s' })],
    });
    mockedLoadRemoteShifts.mockResolvedValue([]);
    mockedCreateRemoteImport.mockResolvedValue({ id: 'import-1', fileName: '', sourceFormat: 'csv', periodYear: 2026, periodMonth: 2, status: 'completed', areaId: 'area-s' });
    mockedSyncRemoteShifts.mockResolvedValue({ saved: [], deleted: 0 });
    renderTeamImportModal(() => {}, 'ADMIN', {
      areas: [remoteArea(), remoteArea({ id: 'area-s', name: 'Sur', code: null })],
      currentAreaId: 'area-s',
      allowAreaChoice: true,
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByLabelText('Ana Martinez')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Ana Martinez'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByText('Resumen antes de importar')).toBeTruthy());
    fireEvent.click(screen.getByText('Importar'));

    await waitFor(() => expect(mockedCreateRemoteImport).toHaveBeenCalledWith({
      fileName: 'equipo.csv',
      sourceFormat: 'csv',
      fileFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      employeeId: 'emp-ana',
      periodYear: 2026,
      periodMonth: 2,
      areaId: 'area-s',
      importMode: 'team',
      periodKind: 'single',
      periodLabel: 'Marzo 2026',
      employeeCount: 1,
      shiftCount: 1,
      createdShiftCount: 1,
      existingShiftCount: 0,
    }));
  });
});

describe('TeamImportModal — inactive employee awareness (Bloque E)', () => {
  const inactiveRoster = () => ({
    employees: [
      { key: 'e1', externalEmployeeId: '1001', name: 'Ana Inactiva', shifts: [rosterShift('2026-03-04')] },
    ],
  });
  const inactiveMatch = () => ({
    kind: 'recognized_inactive' as const,
    employees: [remoteEmployee({ id: 'emp-ana', name: 'Ana Inactiva', externalEmployeeId: '1001', status: 'inactive' })],
  });

  const uploadRoster = async () => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });
    await waitFor(() => expect(screen.getByText('Existente — Inactivo')).toBeTruthy());
  };

  it('ADMIN: recognized_inactive row shows the state and a Reactivar action that PATCHes and selects the row', async () => {
    mockedDetectTeamRoster.mockReturnValue(inactiveRoster());
    mockedMatchRemoteEmployee.mockResolvedValue(inactiveMatch());
    mockedUpdateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'emp-ana', status: 'active' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderTeamImportModal(() => {}, 'ADMIN');
    await uploadRoster();

    // Not importable while inactive: checkbox stays disabled.
    expect((screen.getByLabelText('Ana Inactiva') as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({ id: 'emp-ana', status: 'active' }));
    await waitFor(() => expect(screen.getByText('Reconocido')).toBeTruthy());
    expect(screen.getByText('1 seleccionados de 1')).toBeTruthy();
    // Never duplicated: no employee creation call.
    expect(mockedCreateRemoteEmployee).not.toHaveBeenCalled();
    expect(mockedBulkCreateRemoteEmployees).not.toHaveBeenCalled();
  });

  it('non-ADMIN: the state is shown but there is no Reactivar action and the row is not importable', async () => {
    mockedDetectTeamRoster.mockReturnValue(inactiveRoster());
    mockedMatchRemoteEmployee.mockResolvedValue(inactiveMatch());

    renderTeamImportModal(() => {}, 'EMPLOYEE');
    await uploadRoster();

    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
    expect((screen.getByLabelText('Ana Inactiva') as HTMLInputElement).disabled).toBe(true);
    expect(mockedUpdateRemoteEmployee).not.toHaveBeenCalled();
  });

  it('bulk result existing_inactive flips the row to the inactive state (never duplicated)', async () => {
    mockedDetectTeamRoster.mockReturnValue(inactiveRoster());
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
    mockedBulkCreateRemoteEmployees.mockResolvedValue([
      { key: 'e1', status: 'existing_inactive', employee: remoteEmployee({ id: 'emp-ana', name: 'Ana Inactiva', externalEmployeeId: '1001', status: 'inactive' }) },
    ]);

    renderTeamImportModal(() => {}, 'ADMIN');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [csvFile()] } });

    await waitFor(() => expect(screen.getByText('Crear 1 empleados nuevos')).toBeTruthy());
    fireEvent.click(screen.getByText('Crear 1 empleados nuevos'));
    fireEvent.click(screen.getByText('Crear 1 empleados'));

    await waitFor(() => expect(screen.getByText('Existente — Inactivo')).toBeTruthy());
    expect(screen.getByText('0 creados · 1 ya existentes · 0 errores')).toBeTruthy();
    expect((screen.getByLabelText('Ana Inactiva') as HTMLInputElement).disabled).toBe(true);
  });
});

/**
 * Regression for the 2026-09-04 reopened ingestion audit: manual UI testing
 * against six real state-contract fixtures found TeamImportModal collapsing
 * NEEDS_USER_INPUT (02), BLOCKED (04) and FAILED (06) into one identical
 * generic `teamImport.uploadError` string — a second, disconnected
 * taxonomy that never consulted ImportDiagnosis. These tests exercise the
 * REAL fixture files (test-data/fixtures/manual-qa-state-contract/, copied
 * verbatim from the manually-tested files) through the real, unmocked
 * detection + analyzeDocumentFile/buildImportDiagnosis pipeline — no
 * diagnosis mocks.
 *
 * Known gap (see FILES_CHANGED/REMAINING_GAPS in the remediation report):
 * without a live `/api/ingestion/vlm` backend, the VLM visual fallback
 * cannot run in this test environment, so 02 and 04 both resolve to the
 * deterministic UNSUPPORTED diagnosis here rather than the
 * NEEDS_USER_INPUT / BLOCKED-recoverable split their filenames name — that
 * split is gated on VLM actually succeeding, only observable in a real
 * authenticated session. What IS fully provable here, and is the concrete
 * regression this covers: none of them show the old generic string, and 06
 * (a genuine parse failure, not a layout the VLM could rescue) always
 * reaches diagnosisFromError -> FAILED, which reads distinctly from both.
 */
describe('TeamImportModal — real fixture diagnosis fallback (state-contract re-audit)', () => {
  const FIXTURES_DIR = `${__dirname}/../../../test-data/fixtures/manual-qa-state-contract`;

  function realPdfFixture(name: string): File {
    return new File([readFileSync(`${FIXTURES_DIR}/${name}`)], name, { type: 'application/pdf' });
  }

  beforeEach(() => {
    // These tests exercise the real detectPdfTeamRoster/analyzeDocumentFile
    // pipeline (unmocked) — matchRemoteEmployee is only reachable from the
    // README/roster-row-construction branches, not the diagnosis-only ones
    // below, but is stubbed defensively so a future branch change never
    // hangs on an unmocked network call.
    mockedMatchRemoteEmployee.mockResolvedValue({ kind: 'new', employees: [] });
  });

  it('02_NEEDS_USER_INPUT (real PDF, unregistered layout): never shows the old generic "not a team template" string', async () => {
    renderTeamImportModal(() => {}, 'ADMIN');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [realPdfFixture('02_NEEDS_USER_INPUT_unknown_codes.pdf')] } });

    const panel = await waitFor(() => screen.getByTestId('team-import-fallback-diagnosis'), { timeout: 10000 });
    expect(panel.textContent).not.toContain('No se ha podido reconocer este archivo como una plantilla de equipo');
    // Deterministic (no live VLM in this test env): honest UNSUPPORTED_LAYOUT
    // diagnosis instead of the old false "not a team template" claim.
    expect(screen.getByTestId('team-import-fallback-state').textContent).toBe('No soportado');
  });

  it('04_BLOCKED_RECOVERABLE (real PDF, freeform single-employee layout): never shows the old generic string, and is not silently treated as importable', async () => {
    renderTeamImportModal(() => {}, 'ADMIN');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [realPdfFixture('04_BLOCKED_RECOVERABLE_freeform.pdf')] } });

    const panel = await waitFor(() => screen.getByTestId('team-import-fallback-diagnosis'), { timeout: 10000 });
    expect(panel.textContent).not.toContain('No se ha podido reconocer este archivo como una plantilla de equipo');
    expect(screen.getByTestId('team-import-fallback-state').textContent).toBe('No soportado');
  });

  it('06_FAILED_TECHNICAL (real corrupt PDF): resolves to FAILED via diagnosisFromError, with a message distinct from 02/04, no stack trace', async () => {
    renderTeamImportModal(() => {}, 'ADMIN');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [realPdfFixture('06_FAILED_TECHNICAL_corrupt.pdf')] } });

    const panel = await waitFor(() => screen.getByTestId('team-import-fallback-diagnosis'), { timeout: 10000 });
    expect(screen.getByTestId('team-import-fallback-state').textContent).toBe('Error');
    expect(panel.textContent).not.toContain('No se ha podido reconocer este archivo como una plantilla de equipo');
    // Distinct from the 02/04 (UNSUPPORTED) message.
    expect(panel.textContent).not.toContain('estructura de este documento');
    // No internal detail (parser name, stack trace) leaked to the user.
    expect(panel.textContent?.toLowerCase()).not.toContain('pdf.js');
    expect(panel.textContent?.toLowerCase()).not.toContain('invalid pdf structure');
  });

  it('05_UNSUPPORTED (.txt): still rejected at the file-picker boundary, never reaches the detection pipeline', () => {
    renderTeamImportModal(() => {}, 'ADMIN');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).not.toContain('text/plain');
    expect(input.accept.split(',').map((entry) => entry.trim())).not.toContain('.txt');
  });
});

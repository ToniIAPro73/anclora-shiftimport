// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { detectTeamRoster } from '../../ingestion/team-roster';
import * as remote from '../../lib/remote';
import { RemoteEmployee } from '../../lib/remote';
import { TeamImportModal } from './TeamImportModal';

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
const mockedBulkCreateRemoteEmployees = vi.mocked(remote.bulkCreateRemoteEmployees);
const mockedCreateRemoteImport = vi.mocked(remote.createRemoteImport);
const mockedSyncRemoteShifts = vi.mocked(remote.syncRemoteShifts);
const mockedLoadRemoteShifts = vi.mocked(remote.loadRemoteShifts);

function renderTeamImportModal(onImported: () => void = () => {}) {
  return render(
    <I18nProvider>
      <TeamImportModal isOpen onClose={() => {}} onImported={onImported} />
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

    await waitFor(() => expect(screen.getByText('2 detectados · 0 reconocidos · 2 nuevos · 0 ambiguos')).toBeTruthy());
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

    await waitFor(() => expect(screen.getByText('2 detectados · 1 reconocidos · 1 nuevos · 0 ambiguos')).toBeTruthy());
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
    expect(screen.getByText('2 detectados · 2 reconocidos · 0 nuevos · 0 ambiguos')).toBeTruthy();
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
});

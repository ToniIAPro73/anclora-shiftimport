// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ApiError } from '../../lib/session';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import * as remote from '../../lib/remote';
import { ScheduleSnapshot, ScheduleVersion, ShiftAssignment } from '../../lib/remote';
import { WeeklyPlanner } from './WeeklyPlanner';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteScheduleVersions: vi.fn(),
    loadRemoteScheduleSnapshot: vi.fn(),
    createRemoteScheduleDraft: vi.fn(),
    createRemoteScheduleDraftFromVersion: vi.fn(),
    createRemoteAssignment: vi.fn(),
    updateRemoteAssignment: vi.fn(),
    deleteRemoteAssignment: vi.fn(),
    listRemoteScheduleVersionHistory: vi.fn(),
    publishRemoteScheduleVersion: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
});
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

const version = (overrides: Partial<ScheduleVersion> = {}): ScheduleVersion => ({
  id: 'version-1',
  scheduleId: 'schedule-1',
  areaId: 'area-1',
  versionNumber: 1,
  status: 'DRAFT',
  periodStart: '2026-09-28',
  periodEnd: '2026-10-04',
  ...overrides,
});

const assignment = (overrides: Partial<ShiftAssignment> = {}): ShiftAssignment => ({
  id: 'assignment-1',
  scheduleVersionId: 'version-1',
  employeeId: 'employee-1',
  date: '2026-09-28',
  startTime: '09:00',
  endTime: '17:00',
  location: 'Front desk',
  ...overrides,
});

const snapshot = (overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot => ({
  version: version(),
  employees: [{ id: 'employee-1', name: 'Ana Planner', externalEmployeeId: 'E001', areaId: 'area-1' }],
  assignments: [assignment()],
  ...overrides,
});

function renderPlanner() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <WeeklyPlanner areaId="area-1" canEdit initialPeriodStart="2026-09-28" onBack={() => {}} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

const mockedList = vi.mocked(remote.listRemoteScheduleVersions);
const mockedLoad = vi.mocked(remote.loadRemoteScheduleSnapshot);

describe('WeeklyPlanner', () => {
  it('exposes a stable loading state while the snapshot is pending', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    renderPlanner();

    expect(screen.getByTestId('weekly-planner')).toHaveAttribute('data-state', 'loading');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando planificación');
  });

  it('shows the empty draft state and creates a weekly draft', async () => {
    mockedList.mockResolvedValue([]);
    mockedLoad.mockResolvedValue(snapshot({ assignments: [] }));
    vi.mocked(remote.createRemoteScheduleDraft).mockResolvedValue(version());
    renderPlanner();

    await waitFor(() => expect(screen.getByTestId('weekly-planner')).toHaveAttribute('data-state', 'empty'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador semanal' }));

    await waitFor(() => expect(remote.createRemoteScheduleDraft).toHaveBeenCalledWith({
      periodStart: expect.any(String), areaId: 'area-1',
    }));
    await waitFor(() => expect(screen.getByRole('row', { name: /Ana Planner/ })).toBeTruthy());
  });

  it('shows a recoverable error state when the snapshot fails', async () => {
    mockedList.mockRejectedValue(new ApiError(500, 'broken'));
    renderPlanner();

    await waitFor(() => expect(screen.getByTestId('weekly-planner')).toHaveAttribute('data-state', 'error'));
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el planificador');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('renders a disabled published version without edit controls', async () => {
    mockedList.mockResolvedValue([version({ status: 'PUBLISHED' })]);
    mockedLoad.mockResolvedValue(snapshot({ version: version({ status: 'PUBLISHED' }) }));
    renderPlanner();

    await waitFor(() => expect(screen.getByTestId('weekly-planner')).toHaveAttribute('data-state', 'disabled'));
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear nueva versión' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Añadir turno para/ })).toBeNull();
    expect(screen.getByRole('button', { name: /09:00/ })).toBeDisabled();
  });

  it('opens an assignment from the grid and saves the edited value', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot());
    vi.mocked(remote.updateRemoteAssignment).mockResolvedValue(assignment({ location: 'Lobby' }));
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: /09:00/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /09:00/ }));
    fireEvent.change(screen.getByDisplayValue('Front desk'), { target: { value: 'Lobby' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(remote.updateRemoteAssignment).toHaveBeenCalledWith(
      'schedule-1', 'version-1', 'assignment-1', expect.objectContaining({ location: 'Lobby' }),
    ));
  });

  it('switches to the semantic table and persists that presentation choice', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot());
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Tabla accesible' })).toHaveAttribute('aria-pressed', 'false'));
    fireEvent.click(screen.getByRole('button', { name: 'Tabla accesible' }));

    await waitFor(() => expect(screen.getByRole('table')).toHaveClass('weekly-planner__table'));
    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar turno de Ana Planner/ })).toBeInTheDocument();
    expect(window.localStorage.getItem('anclora_shiftimport_planner_view_v1')).toBe('table');

    cleanup();
    renderPlanner();
    await waitFor(() => expect(screen.getByRole('table')).toHaveClass('weekly-planner__table'));
    expect(screen.getByRole('button', { name: 'Tabla accesible' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps table actions native and focusable for keyboard users', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot({ assignments: [] }));
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Tabla accesible' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Tabla accesible' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const addButton = screen.getAllByRole('button', { name: /Añadir turno para Ana Planner/ })[0];
    addButton.focus();
    expect(document.activeElement).toBe(addButton);
    fireEvent.keyDown(addButton, { key: 'Enter', code: 'Enter' });
    fireEvent.click(addButton);
    expect(screen.getByRole('form', { name: 'Añadir turno' })).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: 'Añadir turno' })).getByLabelText('Empleado')).toHaveFocus();
  });

  it('keeps global theme and language controls out of the planner and exposes week start', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot());
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Inicio de semana' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Cambiar tema/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cambiar idioma/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Inicio de semana' })).toHaveTextContent('Lunes');
  });

  it('changes the displayed week range when switching to Sunday start', async () => {
    const sundayVersion = version({ id: 'version-sunday', periodStart: '2026-09-27', periodEnd: '2026-10-03' });
    mockedList.mockResolvedValue([version(), sundayVersion]);
    mockedLoad.mockImplementation(async (_scheduleId, versionId) => snapshot({
      version: versionId === sundayVersion.id ? sundayVersion : version(),
    }));
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Inicio de semana' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Inicio de semana' }));
    fireEvent.click(screen.getByRole('option', { name: 'Domingo' }));

    await waitFor(() => expect(screen.getByText('dom, 27 sept – sáb, 3 oct')).toBeInTheDocument());
    expect(window.localStorage.getItem('anclora_shiftimport_planner_week_start_v1')).toBe('sunday');
    expect(remote.loadRemoteScheduleSnapshot).toHaveBeenLastCalledWith('schedule-1', 'version-sunday');

    fireEvent.click(screen.getByRole('button', { name: 'Inicio de semana' }));
    fireEvent.click(screen.getByRole('option', { name: 'Lunes' }));
    await waitFor(() => expect(screen.getByText('lun, 28 sept – dom, 4 oct')).toBeInTheDocument());
  });

  it('changes the active grid day without changing week, filter, or editor state', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot({
      assignments: [],
      employees: [
        { id: 'employee-1', name: 'Ana Planner', externalEmployeeId: 'E001', areaId: 'area-1' },
        { id: 'employee-2', name: 'Luis Planner', externalEmployeeId: 'E002', areaId: 'area-1' },
      ],
    }));
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'mar, 29 sept' })).toBeInTheDocument());
    const filter = screen.getByRole('button', { name: 'Empleado' });
    fireEvent.click(filter);
    fireEvent.click(screen.getAllByRole('option', { name: 'Luis Planner' }).find((option) => option.tagName === 'BUTTON')!);
    const editorForm = screen.getByRole('form', { name: 'Añadir turno' });
    const editorEmployee = within(editorForm).getByLabelText('Empleado');
    fireEvent.change(editorEmployee, { target: { value: 'employee-2' } });

    fireEvent.click(screen.getByRole('button', { name: 'mar, 29 sept' }));

    expect(screen.getByRole('button', { name: 'mar, 29 sept' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('columnheader', { name: 'mar, 29 sept' })).toHaveAttribute('data-active-day', 'true');
    expect(screen.getByRole('row', { name: /Luis Planner/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Ana Planner/ })).toBeNull();
    expect(editorEmployee).toHaveValue('employee-2');
  });

  it('filters the grid by employee and restores all rows', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot({
      assignments: [],
      employees: [
        { id: 'employee-1', name: 'Ana Planner', externalEmployeeId: 'E001', areaId: 'area-1' },
        { id: 'employee-2', name: 'Luis Planner', externalEmployeeId: 'E002', areaId: 'area-1' },
      ],
    }));
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('row', { name: /Luis Planner/ })).toBeInTheDocument());
    const filter = screen.getByRole('button', { name: 'Empleado' });
    fireEvent.click(filter);
    fireEvent.click(screen.getAllByRole('option', { name: 'Luis Planner' }).find((option) => option.tagName === 'BUTTON')!);

    expect(screen.queryByRole('row', { name: /Ana Planner/ })).toBeNull();
    expect(screen.getByRole('row', { name: /Luis Planner/ })).toBeInTheDocument();

    fireEvent.click(filter);
    fireEvent.click(screen.getAllByRole('option', { name: 'Todos los empleados' }).find((option) => option.tagName === 'BUTTON')!);
    expect(screen.getByRole('row', { name: /Ana Planner/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Luis Planner/ })).toBeInTheDocument();
  });

  it('prefills the stable editor from a grid cell without scrolling the document', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot({
      assignments: [],
      employees: [
        { id: 'employee-1', name: 'Ana Planner', externalEmployeeId: 'E001', areaId: 'area-1' },
        { id: 'employee-2', name: 'Luis Planner', externalEmployeeId: 'E002', areaId: 'area-1' },
      ],
    }));
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Añadir turno para Luis Planner el 2026-09-29' })).toBeInTheDocument());
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const addButton = screen.getByRole('button', { name: 'Añadir turno para Luis Planner el 2026-09-29' });
    fireEvent.click(addButton);

    const editorForm = screen.getByRole('form', { name: 'Añadir turno' });
    expect(within(editorForm).getByLabelText('Empleado')).toHaveValue('employee-2');
    expect(within(editorForm).getByLabelText('Fecha')).toHaveValue('2026-09-29');
    expect(addButton.closest('td')).toHaveAttribute('data-selected', 'true');
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(within(editorForm).getByRole('button', { name: 'Cancelar' }));
    expect(addButton.closest('td')).not.toHaveAttribute('data-selected', 'true');
    scrollTo.mockRestore();
  });

  it('requires explicit confirmation before publishing the draft', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snapshot());
    vi.mocked(remote.publishRemoteScheduleVersion).mockResolvedValue({
      status: 'PUBLISHED',
      publishedAt: '2026-09-04T10:00:00.000Z',
      createdShiftCount: 1,
      excludedAssignments: [],
      excludedAssignmentCount: 0,
    });
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(screen.getByRole('dialog', { name: 'Publicar planificación' })).toBeInTheDocument();
    expect(screen.getByText('1 turnos se materializarán')).toBeInTheDocument();
    expect(remote.publishRemoteScheduleVersion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar publicación' }));
    await waitFor(() => expect(remote.publishRemoteScheduleVersion).toHaveBeenCalledWith('schedule-1', 'version-1'));
  });

  it('creates a new draft from a published version and hides the action once the draft is active', async () => {
    const published = version({ status: 'PUBLISHED' });
    const draft = version({ id: 'version-2', versionNumber: 2, status: 'DRAFT' });
    mockedList.mockResolvedValueOnce([published]).mockResolvedValueOnce([draft]);
    mockedLoad.mockResolvedValueOnce(snapshot({ version: published })).mockResolvedValueOnce(snapshot({ version: draft }));
    vi.mocked(remote.createRemoteScheduleDraftFromVersion).mockResolvedValue({
      newVersionId: 'version-2', scheduleId: 'schedule-1', versionNumber: 2, copiedAssignmentCount: 1,
    });
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear nueva versión' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Crear nueva versión' }));
    await waitFor(() => expect(remote.createRemoteScheduleDraftFromVersion).toHaveBeenCalledWith('schedule-1', 'version-1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Crear nueva versión' })).toBeNull());
    expect(screen.getByText('Borrador editable')).toBeInTheDocument();
  });

  it('opens version history and loads a selected version read-only', async () => {
    const current = version({ status: 'PUBLISHED' });
    const previous = version({ id: 'version-0', versionNumber: 0, status: 'PUBLISHED' });
    mockedList.mockResolvedValue([current]);
    mockedLoad.mockResolvedValueOnce(snapshot({ version: current })).mockResolvedValueOnce(snapshot({ version: previous }));
    vi.mocked(remote.listRemoteScheduleVersionHistory).mockResolvedValue([
      {
        id: 'version-1', scheduleId: 'schedule-1', versionNumber: 1, status: 'PUBLISHED',
        createdByUserId: 'user-1', createdByUserName: 'Planner', createdAt: '2026-09-01T10:00:00.000Z',
        publishedByUserId: 'user-1', publishedByUserName: 'Planner', publishedAt: '2026-09-02T10:00:00.000Z',
      },
      {
        id: 'version-0', scheduleId: 'schedule-1', versionNumber: 0, status: 'PUBLISHED',
        createdByUserId: 'user-1', createdAt: '2026-08-25T10:00:00.000Z',
      },
    ]);
    renderPlanner();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Historial de versiones' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Historial de versiones' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Historial de versiones de la planificación' })).toBeInTheDocument());
    expect(screen.getByText('Versión 1')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver versión' })[1]);
    await waitFor(() => expect(remote.loadRemoteScheduleSnapshot).toHaveBeenCalledWith('schedule-1', 'version-0'));
    expect(screen.getByText('Volver a la versión actual')).toBeInTheDocument();
    expect(screen.getByText('Solo lectura')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    createRemoteAssignment: vi.fn(),
    updateRemoteAssignment: vi.fn(),
    deleteRemoteAssignment: vi.fn(),
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
    await waitFor(() => expect(screen.getByText('Ana Planner')).toBeTruthy());
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

    fireEvent.click(screen.getByRole('button', { name: 'Tabla accesible' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const addButton = screen.getAllByRole('button', { name: /Añadir turno para Ana Planner/ })[0];
    addButton.focus();
    expect(document.activeElement).toBe(addButton);
    fireEvent.keyDown(addButton, { key: 'Enter', code: 'Enter' });
    fireEvent.click(addButton);
    expect(screen.getByRole('form', { name: 'Añadir turno' })).toBeInTheDocument();
    expect(screen.getByLabelText('Empleado')).toHaveFocus();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import { ScheduleSnapshot, ShiftAssignment } from '../../lib/remote';
import { AccessibleScheduleTable } from './AccessibleScheduleTable';

afterEach(cleanup);

const mockDays = [
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
];

const mockAssignment: ShiftAssignment = {
  id: 'assignment-1',
  scheduleVersionId: 'version-1',
  employeeId: 'employee-1',
  date: '2026-09-28',
  startTime: '08:00',
  endTime: '16:00',
  location: 'Edificio Central',
};

const mockSnapshot: ScheduleSnapshot = {
  version: {
    id: 'version-1',
    scheduleId: 'schedule-1',
    areaId: 'area-1',
    versionNumber: 1,
    status: 'DRAFT',
    periodStart: '2026-09-28',
    periodEnd: '2026-10-04',
  },
  employees: [
    { id: 'employee-1', name: 'Ana Lopez', externalEmployeeId: 'EMP-001', areaId: 'area-1' },
  ],
  assignments: [mockAssignment],
};

function renderAccessibleTable(overrides: Partial<Parameters<typeof AccessibleScheduleTable>[0]> = {}) {
  const assignmentsByCell = new Map<string, ShiftAssignment[]>([
    ['employee-1:2026-09-28', [mockAssignment]],
  ]);

  const defaultProps: Parameters<typeof AccessibleScheduleTable>[0] = {
    days: mockDays,
    locale: 'es',
    snapshot: mockSnapshot,
    assignmentsByCell,
    editable: true,
    minimumDate: '2026-09-28',
    editor: null,
    showEditor: false,
    isSaving: false,
    operationError: null,
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onChangeEditor: vi.fn(),
    onCloseEditor: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  return {
    ...render(
      <I18nProvider>
        <AccessibleScheduleTable {...defaultProps} />
      </I18nProvider>,
    ),
    props: defaultProps,
  };
}

describe('AccessibleScheduleTable (UXR-F3-M02 / CX-F02)', () => {
  it('renders table region with proper ARIA attributes, tabIndex=0, and persistent overflow indicator', () => {
    renderAccessibleTable();

    // Table region is keyboard-focusable with proper aria-label
    const region = screen.getByRole('region', { name: 'Tabla accesible de planificación semanal' });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('tabIndex', '0');

    // Persistent overflow hint is present for mobile/tablet discovery
    const overflowHint = screen.getByTestId('table-overflow-hint');
    expect(overflowHint).toBeInTheDocument();
    expect(overflowHint).toHaveTextContent('Desplaza horizontalmente para ver los 7 días →');
  });

  it('renders column headers and employee rows with assignments', () => {
    renderAccessibleTable();

    expect(screen.getByRole('columnheader', { name: 'Empleado' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Horario' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ubicación' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument();

    expect(screen.getAllByText('Ana Lopez').length).toBe(7);
    expect(screen.getAllByText('EMP-001').length).toBe(7);
    expect(screen.getByText('Edificio Central')).toBeInTheDocument();
  });

  it('allows editing and deleting an assignment through keyboard-accessible buttons', () => {
    const onEdit = vi.fn();
    renderAccessibleTable({ onEdit });

    const editBtn = screen.getByRole('button', { name: /Editar turno de Ana Lopez/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    expect(onEdit).toHaveBeenCalledWith('employee-1', '2026-09-28', mockAssignment);
  });

  it('allows adding an assignment for an empty slot', () => {
    const onAdd = vi.fn();
    renderAccessibleTable({ onAdd });

    const addBtn = screen.getByRole('button', { name: /Añadir turno para Ana Lopez el mar, 29 sept/i });
    expect(addBtn).toBeInTheDocument();
    fireEvent.click(addBtn);

    expect(onAdd).toHaveBeenCalledWith('employee-1', '2026-09-29');
  });
});

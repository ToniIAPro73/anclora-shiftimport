// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import type { RemoteArea, RemoteEmployee, RemoteMember } from '../../lib/remote';
import { EquipoModal } from './EquipoModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteMembers: vi.fn(),
    addRemoteMember: vi.fn(),
    updateRemoteMemberRole: vi.fn(),
    removeRemoteMember: vi.fn(),
    createRemoteEmployee: vi.fn(),
    transferRemoteOwnership: vi.fn(),
    listRemoteAreas: vi.fn(),
    createRemoteArea: vi.fn(),
    updateRemoteArea: vi.fn(),
    bulkMoveRemoteEmployeesArea: vi.fn(),
    updateRemoteEmployee: vi.fn(),
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mockedListRemoteAreas.mockResolvedValue(areasFixture);
});

const mockedListRemoteMembers = vi.mocked(remote.listRemoteMembers);
const mockedAddRemoteMember = vi.mocked(remote.addRemoteMember);
const mockedUpdateRemoteMemberRole = vi.mocked(remote.updateRemoteMemberRole);
const mockedRemoveRemoteMember = vi.mocked(remote.removeRemoteMember);
const mockedCreateRemoteEmployee = vi.mocked(remote.createRemoteEmployee);
const mockedTransferRemoteOwnership = vi.mocked(remote.transferRemoteOwnership);
const mockedListRemoteAreas = vi.mocked(remote.listRemoteAreas);
const mockedCreateRemoteArea = vi.mocked(remote.createRemoteArea);
const mockedUpdateRemoteArea = vi.mocked(remote.updateRemoteArea);
const mockedBulkMoveRemoteEmployeesArea = vi.mocked(remote.bulkMoveRemoteEmployeesArea);
const mockedUpdateRemoteEmployee = vi.mocked(remote.updateRemoteEmployee);

const areasFixture: RemoteArea[] = [
  { id: 'area-ops', name: 'Operaciones', code: 'OPS', active: true, createdAt: '2026-01-01' },
  { id: 'area-sec', name: 'Seguridad', code: 'SEC', active: true, createdAt: '2026-01-01' },
];

const membersFixture: RemoteMember[] = [
  {
    userId: 'usr-owner',
    email: 'owner@example.com',
    displayName: 'Alice Owner',
    role: 'OWNER',
  },
  {
    userId: 'usr-admin',
    email: 'admin@example.com',
    displayName: 'Bob Admin',
    role: 'ADMIN',
    employeeId: 'emp-bob',
  },
  {
    userId: 'usr-planner',
    email: 'planner@example.com',
    displayName: 'Charlie Planner',
    role: 'PLANNER',
    plannerScopeType: 'AREAS',
    scopedAreaIds: ['area-ops'],
  },
];

const employeesFixture: RemoteEmployee[] = [
  {
    id: 'emp-bob',
    organizationId: 'org-1',
    name: 'Bob Admin',
    userId: 'usr-admin',
    externalEmployeeId: 'EMP-001',
    areaId: 'area-ops',
    status: 'active',
  },
  {
    id: 'emp-dave',
    organizationId: 'org-1',
    name: 'Dave Worker',
    userId: null,
    externalEmployeeId: 'EMP-002',
    areaId: 'area-sec',
    status: 'pending_access',
  },
];

function renderModal(
  role: 'OWNER' | 'ADMIN' = 'OWNER',
  currentUserId = 'usr-owner',
  areas: RemoteArea[] = areasFixture,
  initialEmployeeId: string | null = null,
) {
  const onChanged = vi.fn();
  const onClose = vi.fn();

  render(
    <I18nProvider>
      <EquipoModal
        isOpen
        onClose={onClose}
        employees={employeesFixture}
        areas={areas}
        currentUserId={currentUserId}
        currentUserRole={role}
        initialEmployeeId={initialEmployeeId}
        onChanged={onChanged}
      />
    </I18nProvider>,
  );

  return { onChanged, onClose };
}

function renderModalWithParentRerenderOnInput(initialTab: 'personas' | 'assignments' = 'personas') {
  mockedListRemoteMembers.mockResolvedValue(membersFixture);

  function Parent() {
    const [, setRevision] = useState(0);

    return (
      <div onInput={() => setRevision((current) => current + 1)}>
        <EquipoModal
          isOpen
          onClose={() => {}}
          employees={employeesFixture}
          areas={areasFixture}
          currentUserId="usr-owner"
          currentUserRole="OWNER"
          onChanged={() => {}}
          initialTab={initialTab}
        />
      </div>
    );
  }

  render(
    <I18nProvider>
      <Parent />
    </I18nProvider>,
  );
}

describe('EquipoModal — Workspace navigation and tabs', () => {
  it('renders all 4 tabs and defaults to Personas', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    renderModal('OWNER');

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    expect(screen.getByTestId('tab-personas')).toBeInTheDocument();
    expect(screen.getByTestId('tab-roles')).toBeInTheDocument();
    expect(screen.getByTestId('tab-areas')).toBeInTheDocument();
    expect(screen.getByTestId('tab-assignments')).toBeInTheDocument();

    // Default tab is Personas table
    expect(screen.getByTestId('personas-table')).toBeInTheDocument();
  });

  it('switches between tabs cleanly', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    renderModal('OWNER');

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    // Switch to Roles tab
    fireEvent.click(screen.getByTestId('tab-roles'));
    expect(screen.getByTestId('roles-table')).toBeInTheDocument();

    // Switch to Areas tab
    fireEvent.click(screen.getByTestId('tab-areas'));
    expect(screen.getByTestId('areas-table')).toBeInTheDocument();

    // Switch to Assignments tab
    fireEvent.click(screen.getByTestId('tab-assignments'));
    expect(screen.getByTestId('assignments-tab')).toBeInTheDocument();
  });
});

describe('EquipoModal — Tab 1: PERSONAS', () => {
  it('preserves Personas search focus when the modal parent rerenders during typing', async () => {
    renderModalWithParentRerenderOnInput('personas');

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    const searchInput = screen.getByTestId('personas-search');
    searchInput.focus();
    fireEvent.input(searchInput, { target: { value: 'a' } });
    fireEvent.input(searchInput, { target: { value: 'ab' } });
    fireEvent.input(searchInput, { target: { value: 'abc' } });

    expect(searchInput).toHaveValue('abc');
    expect(document.activeElement).toBe(searchInput);
    expect(screen.getByRole('button', { name: 'Cerrar' })).not.toHaveFocus();
  });

  it('displays unified Personas table merging members and unlinked employees', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    renderModal('OWNER');

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    // Check Alice (member without employee)
    const aliceRow = screen.getByTestId('persona-row-usr-owner');
    expect(aliceRow).toHaveTextContent('Alice Owner');
    expect(aliceRow).toHaveTextContent('Sin ficha de empleado');

    // Check Bob (member linked to employee)
    const bobRow = screen.getByTestId('persona-row-usr-admin');
    expect(bobRow).toHaveTextContent('Bob Admin');
    expect(bobRow).toHaveTextContent('ID: EMP-001');

    // Check Dave (unlinked employee without user account)
    const daveRow = screen.getByTestId('persona-row-emp-emp-dave');
    expect(daveRow).toHaveTextContent('Dave Worker');
    expect(daveRow).toHaveTextContent('Acceso pendiente');
  });

  it('filters personas by search query', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    renderModal('OWNER');

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    const searchInput = screen.getByTestId('personas-search');
    fireEvent.change(searchInput, { target: { value: 'Dave' } });

    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    expect(screen.queryByText('Alice Owner')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Admin')).not.toBeInTheDocument();
  });

  it('runs the 5-step wizard to create a new Persona with access and employee record', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedCreateRemoteEmployee.mockResolvedValue({
      id: 'emp-new',
      organizationId: 'org-1',
      name: 'Elena Gómez',
      userId: null,
      externalEmployeeId: 'EMP-003',
      status: 'active',
    });
    mockedAddRemoteMember.mockResolvedValue({
      userId: 'usr-new',
      email: 'elena@empresa.com',
      role: 'EMPLOYEE',
      temporaryPassword: 'temp-password-123',
    });

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    // Click "Añadir persona"
    fireEvent.click(screen.getByTestId('add-persona-button'));
    expect(screen.getByTestId('add-persona-wizard')).toBeInTheDocument();

    // Step 1: Identidad
    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'Elena Gómez' } });
    fireEvent.click(screen.getByTestId('wizard-next-button'));

    // Step 2: Acceso
    fireEvent.change(screen.getByTestId('wizard-email-input'), { target: { value: 'elena@empresa.com' } });
    fireEvent.click(screen.getByTestId('wizard-next-button'));

    // Step 3: Empleo (keep defaults: create employee)
    fireEvent.click(screen.getByTestId('wizard-next-button'));

    // Step 4: Rol y Scope (keep default: EMPLOYEE)
    fireEvent.click(screen.getByTestId('wizard-next-button'));

    // Step 5: Confirmación
    expect(screen.getByText(/Elena Gómez/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-confirm-button'));

    // Verify calls
    await waitFor(() => {
      expect(mockedCreateRemoteEmployee).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Elena Gómez',
      }));
      expect(mockedAddRemoteMember).toHaveBeenCalledWith(expect.objectContaining({
        displayName: 'Elena Gómez',
        email: 'elena@empresa.com',
        role: 'EMPLOYEE',
        employeeId: 'emp-new',
      }));
    });

    // Temporary password display
    await waitFor(() => {
      expect(screen.getByText('temp-password-123')).toBeInTheDocument();
    });
  });

  it('allows revoking access from active member', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedRemoveRemoteMember.mockResolvedValue(undefined);

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    const revokeBtn = screen.getByTestId('revoke-access-usr-admin');
    fireEvent.click(revokeBtn);

    // Confirm dialog is shown; find confirm button in the dialog
    const confirmButtons = screen.getAllByRole('button', { name: 'Revocar acceso' });
    // The dialog button will be the last one or inside modal-content
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockedRemoveRemoteMember).toHaveBeenCalledWith('usr-admin');
    });
  });
});


describe('EquipoModal — Tab 2: ROLES Y ACCESO & Ownership Transfer', () => {
  it('displays members authority, roles, and scopes', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    renderModal('OWNER');

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('tab-roles'));

    expect(screen.getByTestId('role-row-usr-owner')).toHaveTextContent('Propietario');
    expect(screen.getByTestId('role-row-usr-admin')).toHaveTextContent('Administrador');
    expect(screen.getByTestId('role-row-usr-planner')).toHaveTextContent('Planificador');
    expect(screen.getByTestId('role-row-usr-planner')).toHaveTextContent('Áreas (1)');
  });

  it('shows Transferir propiedad button ONLY for active OWNER', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);

    // Render as OWNER
    const { unmount } = render(
      <I18nProvider>
        <EquipoModal
          isOpen
          onClose={() => {}}
          employees={employeesFixture}
          areas={areasFixture}
          currentUserId="usr-owner"
          currentUserRole="OWNER"
          onChanged={() => {}}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('tab-roles'));
    expect(screen.getByTestId('transfer-ownership-button')).toBeInTheDocument();
    unmount();

    // Render as ADMIN
    render(
      <I18nProvider>
        <EquipoModal
          isOpen
          onClose={() => {}}
          employees={employeesFixture}
          areas={areasFixture}
          currentUserId="usr-admin"
          currentUserRole="ADMIN"
          onChanged={() => {}}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('tab-roles'));
    expect(screen.queryByTestId('transfer-ownership-button')).not.toBeInTheDocument();
  });

  it('executes ownership transfer with confirmation and former owner role selection', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedTransferRemoteOwnership.mockResolvedValue({
      transferred: true,
      previousOwnerUserId: 'usr-owner',
      newOwnerUserId: 'usr-admin',
      previousOwnerRole: 'ADMIN',
    });

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('tab-roles'));

    // Open transfer dialog
    fireEvent.click(screen.getByTestId('transfer-ownership-button'));
    expect(screen.getByTestId('transfer-ownership-dialog')).toBeInTheDocument();

    // Select new owner
    fireEvent.change(screen.getByTestId('new-owner-select'), { target: { value: 'usr-admin' } });

    // Select former owner role
    fireEvent.change(screen.getByTestId('previous-owner-role-select'), { target: { value: 'ADMIN' } });

    // Check confirmation checkbox
    fireEvent.click(screen.getByTestId('transfer-confirm-checkbox'));

    // Submit transfer
    fireEvent.click(screen.getByTestId('confirm-transfer-ownership-button'));

    await waitFor(() => {
      expect(mockedTransferRemoteOwnership).toHaveBeenCalledWith('usr-admin', 'ADMIN');
    });
  });

  it('allows changing role of non-owner member', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedUpdateRemoteMemberRole.mockResolvedValue(undefined);

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('tab-roles'));

    // Click "Cambiar rol" for Bob Admin
    fireEvent.click(screen.getByTestId('change-role-usr-admin'));
    expect(screen.getByTestId('change-role-modal')).toBeInTheDocument();

    // Verify OWNER is NOT in the dropdown
    const roleSelect = screen.getByTestId('select-new-role');
    expect(roleSelect).not.toHaveTextContent('Propietario');
    expect(roleSelect).not.toHaveTextContent('OWNER');

    // Change to PLANNER
    fireEvent.change(roleSelect, { target: { value: 'PLANNER' } });
    fireEvent.click(screen.getByTestId('save-role-change-button'));

    await waitFor(() => {
      expect(mockedUpdateRemoteMemberRole).toHaveBeenCalledWith(
        'usr-admin',
        'PLANNER',
        null,
        expect.objectContaining({ plannerScopeType: 'ORGANIZATION' }),
      );
    });
  });
});

describe('EquipoModal — Tab 2: PLANNER Scopes', () => {
  it('allows managing planner scope with specific areas', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedUpdateRemoteMemberRole.mockResolvedValue(undefined);

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('tab-roles'));

    // Click "Gestionar ámbito" for Charlie Planner
    fireEvent.click(screen.getByTestId('manage-scope-usr-planner'));
    expect(screen.getByTestId('change-role-modal')).toBeInTheDocument();

    // Select specific areas radio
    const areasRadio = screen.getByTestId('scope-radio-areas');
    fireEvent.click(areasRadio);

    // Toggle area-sec checkbox
    const secCheckbox = screen.getByTestId('scope-area-area-sec');
    fireEvent.click(secCheckbox);

    fireEvent.click(screen.getByTestId('save-role-change-button'));

    await waitFor(() => {
      expect(mockedUpdateRemoteMemberRole).toHaveBeenCalledWith(
        'usr-planner',
        'PLANNER',
        'area-ops',
        expect.objectContaining({
          plannerScopeType: 'AREAS',
          scopedAreaIds: expect.arrayContaining(['area-ops', 'area-sec']),
        }),
      );
    });
  });

  it('allows managing planner scope with specific employees and search', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedUpdateRemoteMemberRole.mockResolvedValue(undefined);

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('tab-roles'));

    // Click "Gestionar ámbito" for Charlie Planner
    fireEvent.click(screen.getByTestId('manage-scope-usr-planner'));

    // Select specific employees radio
    const employeesRadio = screen.getByTestId('scope-radio-employees');
    fireEvent.click(employeesRadio);

    // Verify search and counter exist
    expect(screen.getByTestId('scope-employee-search')).toBeInTheDocument();
    expect(screen.getByTestId('scope-selected-employees-count')).toHaveTextContent('0 seleccionados');

    // Select employee
    const empCheckbox = screen.getByTestId('scope-employee-emp-bob');
    fireEvent.click(empCheckbox);

    expect(screen.getByTestId('scope-selected-employees-count')).toHaveTextContent('1 seleccionados');

    fireEvent.click(screen.getByTestId('save-role-change-button'));

    await waitFor(() => {
      expect(mockedUpdateRemoteMemberRole).toHaveBeenCalledWith(
        'usr-planner',
        'PLANNER',
        null,
        expect.objectContaining({
          plannerScopeType: 'EMPLOYEES',
          scopedEmployeeIds: ['emp-bob'],
        }),
      );
    });
  });
});

describe('EquipoModal — Tab 3: ÁREAS', () => {
  it('displays empty state when organization has 0 areas and allows creating first area', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedCreateRemoteArea.mockResolvedValue({
      id: 'area-new',
      name: 'Mantenimiento',
      code: 'MNT',
      active: true,
      createdAt: '2026-09-07',
    });

    renderModal('OWNER', 'usr-owner', []);
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('tab-areas'));
    expect(screen.getByTestId('empty-areas-state')).toBeInTheDocument();

    // Click "+ Crear primera área"
    fireEvent.click(screen.getByTestId('create-first-area-button'));
    expect(screen.getByTestId('area-modal')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByTestId('area-name-input'), { target: { value: 'Mantenimiento' } });
    fireEvent.change(screen.getByTestId('area-code-input'), { target: { value: 'mnt' } });

    // Submit
    fireEvent.click(screen.getByTestId('save-area-button'));

    await waitFor(() => {
      expect(mockedCreateRemoteArea).toHaveBeenCalledWith({
        name: 'Mantenimiento',
        code: 'MNT',
      });
    });
  });

  it('displays areas table with active status, employee count, and planner count', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('tab-areas'));
    expect(screen.getByTestId('areas-table')).toBeInTheDocument();

    const opsRow = screen.getByTestId('area-row-area-ops');
    expect(opsRow).toHaveTextContent('Operaciones');
    expect(opsRow).toHaveTextContent('OPS');
    expect(opsRow).toHaveTextContent('Activa');
    expect(opsRow).toHaveTextContent('1 empleado');
  });

  it('allows editing an existing area', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedUpdateRemoteArea.mockResolvedValue({
      id: 'area-ops',
      name: 'Operaciones y Vuelo',
      code: 'OPS',
      active: true,
      createdAt: '2026-01-01',
    });

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('tab-areas'));

    // Click Edit on area-ops
    fireEvent.click(screen.getByTestId('edit-area-area-ops'));
    expect(screen.getByTestId('area-modal')).toBeInTheDocument();

    const nameInput = screen.getByTestId('area-name-input');
    expect(nameInput).toHaveValue('Operaciones');

    fireEvent.change(nameInput, { target: { value: 'Operaciones y Vuelo' } });
    fireEvent.click(screen.getByTestId('save-area-button'));

    await waitFor(() => {
      expect(mockedUpdateRemoteArea).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'area-ops',
          name: 'Operaciones y Vuelo',
        }),
      );
    });
  });

  it('switches to assignments tab when clicking manage assignments on an area', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('tab-areas'));
    fireEvent.click(screen.getByTestId('manage-area-assignments-area-ops'));

    expect(screen.getByTestId('assignments-tab')).toBeInTheDocument();
  });
});

describe('EquipoModal — Tab 4: ASIGNACIONES & Bulk Operations', () => {
  it('preserves Asignaciones search focus when the modal parent rerenders during typing', async () => {
    renderModalWithParentRerenderOnInput('assignments');

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    const searchInput = screen.getByTestId('bulk-employee-search');
    searchInput.focus();
    fireEvent.input(searchInput, { target: { value: 'a' } });
    fireEvent.input(searchInput, { target: { value: 'ab' } });
    fireEvent.input(searchInput, { target: { value: 'abc' } });

    expect(searchInput).toHaveValue('abc');
    expect(document.activeElement).toBe(searchInput);
    expect(screen.getByRole('button', { name: 'Cerrar' })).not.toHaveFocus();
  });

  it('allows bulk moving employees to an area with effective date', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedBulkMoveRemoteEmployeesArea.mockResolvedValue({
      moved: true,
      count: 1,
      targetAreaId: 'area-sec',
      effectiveDate: '2026-10-01',
    });

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    // Switch to Assignments tab
    fireEvent.click(screen.getByTestId('tab-assignments'));
    expect(screen.getByTestId('assignments-tab')).toBeInTheDocument();

    // Verify subtab is employees_to_area by default
    expect(screen.getByTestId('subtab-employees-to-area')).toHaveClass('is-active');

    // Select target area
    fireEvent.change(screen.getByTestId('bulk-target-area-select'), { target: { value: 'area-sec' } });

    // Set effective date
    fireEvent.change(screen.getByTestId('bulk-effective-date-input'), { target: { value: '2026-10-01' } });

    // Select employee emp-bob
    const checkbox = screen.getByTestId('select-emp-emp-bob');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Verify counter
    expect(screen.getByTestId('bulk-selection-count')).toHaveTextContent('1 de 2 seleccionados');

    // Click Apply button
    const applyButton = screen.getByTestId('apply-bulk-move-button');
    expect(applyButton).toBeEnabled();
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockedBulkMoveRemoteEmployeesArea).toHaveBeenCalledWith({
        employeeIds: ['emp-bob'],
        targetAreaId: 'area-sec',
        effectiveDate: '2026-10-01',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('bulk-success-message')).toHaveTextContent(
        '1 empleados asignados a "Seguridad" con fecha de efecto 2026-10-01.',
      );
    });
  });

  it('allows updating planner scope from tab 4', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedUpdateRemoteMemberRole.mockResolvedValue(undefined);

    renderModal('OWNER');
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    // Switch to Assignments tab
    fireEvent.click(screen.getByTestId('tab-assignments'));

    // Switch to Planner scopes subtab
    fireEvent.click(screen.getByTestId('subtab-planner-scopes'));
    expect(screen.getByTestId('subtab-planner-scopes')).toHaveClass('is-active');

    // Select planner
    fireEvent.change(screen.getByTestId('tab4-planner-select'), { target: { value: 'usr-planner' } });

    // Switch scope mode to ORGANIZATION
    fireEvent.click(screen.getByTestId('tab4-scope-org'));

    // Click save
    fireEvent.click(screen.getByTestId('save-tab4-planner-scope-button'));

    await waitFor(() => {
      expect(mockedUpdateRemoteMemberRole).toHaveBeenCalledWith(
        'usr-planner',
        'PLANNER',
        null,
        {
          plannerScopeType: 'ORGANIZATION',
          scopedAreaIds: [],
          scopedEmployeeIds: [],
        },
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('tab4-planner-success')).toHaveTextContent(
        'Ámbito de planificación guardado correctamente.',
      );
    });
  });
});

describe('EquipoModal — initialEmployeeId & Import Recovery', () => {
  it('focuses the target employee and automatically opens the edit employee sheet', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    renderModal('ADMIN', 'usr-admin', areasFixture, 'emp-dave');

    // Tab should be personas
    expect(screen.getByTestId('tab-personas')).toHaveClass('is-active');

    // Wait for members and employees to render
    await waitFor(() => {
      expect(screen.getByTestId('persona-row-emp-emp-dave')).toBeInTheDocument();
    });

    // Target employee row should have data-focused="true" and recovery badge
    const targetRow = screen.getByTestId('persona-row-emp-emp-dave');
    expect(targetRow).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('target-recovery-badge')).toBeInTheDocument();

    // The edit modal should open automatically
    expect(screen.getByTestId('edit-employee-modal')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellidos/i)).toHaveValue('Dave Worker');
    expect(screen.getByLabelText(/identificador externo/i)).toHaveValue('EMP-002');
  });

  it('allows saving updated employee data from edit sheet and triggers onChanged', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedUpdateRemoteEmployee.mockResolvedValue({
      id: 'emp-dave',
      organizationId: 'org-1',
      name: 'Dave Worker Completo',
      userId: null,
      externalEmployeeId: 'EMP-002-FIXED',
      areaId: 'area-ops',
      status: 'active',
    });

    const { onChanged } = renderModal('ADMIN', 'usr-admin', areasFixture, 'emp-dave');

    await waitFor(() => {
      expect(screen.getByTestId('edit-employee-modal')).toBeInTheDocument();
    });

    // Update name
    fireEvent.change(screen.getByLabelText(/nombre y apellidos/i), {
      target: { value: 'Dave Worker Completo' },
    });
    // Update external ID
    fireEvent.change(screen.getByLabelText(/identificador externo/i), {
      target: { value: 'EMP-002-FIXED' },
    });
    // Update area
    fireEvent.change(screen.getByLabelText(/área asignada/i), {
      target: { value: 'area-ops' },
    });
    // Update status
    fireEvent.change(screen.getByLabelText(/estado operativo/i), {
      target: { value: 'active' },
    });

    // Save
    fireEvent.click(screen.getByTestId('save-employee-button'));

    await waitFor(() => {
      expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({
        id: 'emp-dave',
        name: 'Dave Worker Completo',
        externalEmployeeId: 'EMP-002-FIXED',
        areaId: 'area-ops',
        status: 'active',
      });
    });

    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    // The edit sheet should now be closed
    await waitFor(() => {
      expect(screen.queryByTestId('edit-employee-modal')).not.toBeInTheDocument();
    });
  });
});


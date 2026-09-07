// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedListRemoteMembers = vi.mocked(remote.listRemoteMembers);
const mockedAddRemoteMember = vi.mocked(remote.addRemoteMember);
const mockedUpdateRemoteMemberRole = vi.mocked(remote.updateRemoteMemberRole);
const mockedRemoveRemoteMember = vi.mocked(remote.removeRemoteMember);
const mockedCreateRemoteEmployee = vi.mocked(remote.createRemoteEmployee);
const mockedTransferRemoteOwnership = vi.mocked(remote.transferRemoteOwnership);

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

function renderModal(role: 'OWNER' | 'ADMIN' = 'OWNER', currentUserId = 'usr-owner') {
  const onChanged = vi.fn();
  const onClose = vi.fn();

  render(
    <I18nProvider>
      <EquipoModal
        isOpen
        onClose={onClose}
        employees={employeesFixture}
        areas={areasFixture}
        currentUserId={currentUserId}
        currentUserRole={role}
        onChanged={onChanged}
      />
    </I18nProvider>,
  );

  return { onChanged, onClose };
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

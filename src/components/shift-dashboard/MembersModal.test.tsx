// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { RemoteEmployee } from '../../lib/remote';
import { MembersModal } from './MembersModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteMembers: vi.fn(),
    addRemoteMember: vi.fn(),
    updateRemoteMemberRole: vi.fn(),
    removeRemoteMember: vi.fn(),
    createRemoteEmployee: vi.fn(),
    updateRemoteEmployee: vi.fn(),
    deleteRemoteEmployee: vi.fn(),
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedListRemoteMembers = vi.mocked(remote.listRemoteMembers);
const mockedAddRemoteMember = vi.mocked(remote.addRemoteMember);
const mockedCreateRemoteEmployee = vi.mocked(remote.createRemoteEmployee);
const mockedUpdateRemoteEmployee = vi.mocked(remote.updateRemoteEmployee);
const mockedDeleteRemoteEmployee = vi.mocked(remote.deleteRemoteEmployee);

const remoteEmployee = (over: Partial<RemoteEmployee> = {}): RemoteEmployee => ({
  id: 'emp-x',
  organizationId: 'org-1',
  externalEmployeeId: null,
  name: 'X',
  userId: null,
  status: 'active',
  ...over,
});

function renderMembersModal(employees: RemoteEmployee[] = [], onChanged: () => void = () => {}) {
  return render(
    <I18nProvider>
      <MembersModal
        isOpen
        onClose={() => {}}
        employees={employees}
        currentUserId="user-admin"
        onChanged={onChanged}
      />
    </I18nProvider>,
  );
}

describe('MembersModal — tabs', () => {
  it('defaults to the Usuarios tab and switches to Empleados', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Ana' })]);

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    expect(screen.getByText('Añadir usuario')).toBeTruthy();

    fireEvent.click(screen.getByText('Empleados'));
    expect(screen.getByText('Añadir empleado')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
  });
});

describe('MembersModal — single add-user temporary password', () => {
  it('shows the one-time generated password when the server returns one', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedAddRemoteMember.mockResolvedValue({ userId: 'u1', email: 'nuevo@example.com', role: 'EMPLOYEE', temporaryPassword: 'sup3rSecret!' });
    renderMembersModal();

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('Email del usuario'), { target: { value: 'nuevo@example.com' } });
    fireEvent.click(screen.getByText('Añadir'));

    await waitFor(() => expect(screen.getByText('Contraseña temporal generada')).toBeTruthy());
    expect(screen.getByText(/nuevo@example.com: sup3rSecret!/)).toBeTruthy();
  });

  it('shows no temporary password when the server did not generate one', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedAddRemoteMember.mockResolvedValue({ userId: 'u1', email: 'nuevo@example.com', role: 'EMPLOYEE' });
    renderMembersModal();

    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('Email del usuario'), { target: { value: 'nuevo@example.com' } });
    fireEvent.click(screen.getByText('Añadir'));

    await waitFor(() => expect(mockedAddRemoteMember).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Contraseña temporal generada')).toBeNull();
  });
});

describe('MembersModal — bulk employees CSV import', () => {
  const employeesCsv = () => new File(
    ['external_employee_id,name\nSI1,Ana Nueva\nSI2,Bea Existente'],
    'empleados.csv',
    { type: 'text/csv' },
  );

  it('preview classifies existing vs new by external_employee_id', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal([remoteEmployee({ id: 'e2', name: 'Bea Vieja', externalEmployeeId: 'SI2' })]);

    fireEvent.click(screen.getByText('Empleados'));
    fireEvent.click(screen.getByText('Importar empleados CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [employeesCsv()] } });

    await waitFor(() => expect(screen.getByText('2 filas · 1 existentes · 1 nuevas · 0 errores')).toBeTruthy());
    expect(screen.getByText('Nueva')).toBeTruthy();
    expect(screen.getByText('Existente')).toBeTruthy();
  });

  it('confirm creates only the new row and updates the changed-name existing row', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedCreateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e1', name: 'Ana Nueva', externalEmployeeId: 'SI1' }));
    mockedUpdateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e2', name: 'Bea Existente', externalEmployeeId: 'SI2' }));
    renderMembersModal([remoteEmployee({ id: 'e2', name: 'Bea Vieja', externalEmployeeId: 'SI2', status: 'active' })]);

    fireEvent.click(screen.getByText('Empleados'));
    fireEvent.click(screen.getByText('Importar empleados CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [employeesCsv()] } });

    await waitFor(() => expect(screen.getByText('Confirmar importación')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar importación'));

    await waitFor(() => expect(screen.getByText('Importación de empleados completada')).toBeTruthy());
    expect(mockedCreateRemoteEmployee).toHaveBeenCalledTimes(1);
    expect(mockedCreateRemoteEmployee).toHaveBeenCalledWith({ name: 'Ana Nueva', externalEmployeeId: 'SI1' });
    expect(mockedUpdateRemoteEmployee).toHaveBeenCalledTimes(1);
    expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({ id: 'e2', name: 'Bea Existente', status: 'active' });
    expect(screen.getByText(/Empleados creados.*1/)).toBeTruthy();
  });

  it('re-importing the same CSV a second time is idempotent (0 new, name already matches)', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal([
      remoteEmployee({ id: 'e1', name: 'Ana Nueva', externalEmployeeId: 'SI1' }),
      remoteEmployee({ id: 'e2', name: 'Bea Existente', externalEmployeeId: 'SI2' }),
    ]);

    fireEvent.click(screen.getByText('Empleados'));
    fireEvent.click(screen.getByText('Importar empleados CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [employeesCsv()] } });

    await waitFor(() => expect(screen.getByText('2 filas · 2 existentes · 0 nuevas · 0 errores')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar importación'));

    await waitFor(() => expect(screen.getByText('Importación de empleados completada')).toBeTruthy());
    expect(mockedCreateRemoteEmployee).not.toHaveBeenCalled();
    // Names already match the CSV — no-op update, not called either.
    expect(mockedUpdateRemoteEmployee).not.toHaveBeenCalled();
  });
});

describe('MembersModal — bulk users CSV import', () => {
  const usersCsv = () => new File(
    ['email,name,role,external_employee_id\npersona1@example.com,Adriana Molina,EMPLOYEE,\nmanager@example.com,Laura Riera,MANAGER,'],
    'usuarios.csv',
    { type: 'text/csv' },
  );

  it('preview shows row errors for bad rows without silently dropping them', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal();

    const badCsv = new File(['email,role\n,EMPLOYEE\nx@example.com,SUPERADMIN'], 'bad.csv', { type: 'text/csv' });
    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [badCsv] } });

    await waitFor(() => expect(screen.getByText('2 filas · 0 ya son miembros · 0 nuevas · 2 errores')).toBeTruthy());
    expect(screen.getByText('Falta el email')).toBeTruthy();
    expect(screen.getByText('Rol no válido (usa ADMIN, MANAGER o EMPLOYEE)')).toBeTruthy();
  });

  it('confirm creates new users and shows their one-time temporary passwords', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedAddRemoteMember.mockImplementation(async ({ email, role }) => ({
      userId: `user-${email}`,
      email,
      role,
      temporaryPassword: `temp-${email}`,
    }));
    renderMembersModal();

    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [usersCsv()] } });

    await waitFor(() => expect(screen.getByText('2 filas · 0 ya son miembros · 2 nuevas · 0 errores')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar importación'));

    await waitFor(() => expect(screen.getByText('Importación de usuarios completada')).toBeTruthy());
    expect(mockedAddRemoteMember).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/temp-persona1@example.com/)).toBeTruthy();
    expect(screen.getByText(/temp-manager@example.com/)).toBeTruthy();
  });

  it('never sends a password field from the CSV path — server always generates it', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedAddRemoteMember.mockResolvedValue({ userId: 'u1', email: 'persona1@example.com', role: 'EMPLOYEE', temporaryPassword: 'x' });
    renderMembersModal();

    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [usersCsv()] } });

    await waitFor(() => expect(screen.getByText('Confirmar importación')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar importación'));

    await waitFor(() => expect(mockedAddRemoteMember).toHaveBeenCalled());
    for (const call of mockedAddRemoteMember.mock.calls) {
      expect(call[0]).not.toHaveProperty('password');
    }
  });
});

describe('MembersModal — employee lifecycle (Bloque D)', () => {
  const openEmployeesTab = async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    fireEvent.click(screen.getByText('Empleados'));
    await waitFor(() => expect(screen.getByText('Añadir empleado')).toBeTruthy());
  };

  it('renders a text badge Activo/Inactivo per row', async () => {
    renderMembersModal([
      remoteEmployee({ id: 'e1', name: 'Ana Activa', status: 'active' }),
      remoteEmployee({ id: 'e2', name: 'Bea Inactiva', status: 'inactive' }),
    ]);
    await openEmployeesTab();

    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.getByText('Inactivo')).toBeTruthy();
  });

  it('the row menu shows Desactivar for active employees and Reactivar for inactive ones', async () => {
    renderMembersModal([
      remoteEmployee({ id: 'e1', name: 'Ana Activa', status: 'active' }),
      remoteEmployee({ id: 'e2', name: 'Bea Inactiva', status: 'inactive' }),
    ]);
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Ana Activa' }));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Eliminar definitivamente' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Reactivar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Bea Inactiva' }));
    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).toBeNull();
  });

  it('Desactivar asks for confirmation and PATCHes status inactive', async () => {
    const onChanged = vi.fn();
    mockedUpdateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e1', status: 'inactive' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Ana Activa', status: 'active' })], onChanged);
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Ana Activa' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));

    await waitFor(() => expect(mockedUpdateRemoteEmployee).toHaveBeenCalledTimes(1));
    expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({ id: 'e1', status: 'inactive' });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('Reactivar PATCHes status active without confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedUpdateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e2', status: 'active' }));
    renderMembersModal([remoteEmployee({ id: 'e2', name: 'Bea Inactiva', status: 'inactive' })]);
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Bea Inactiva' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));

    await waitFor(() => expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({ id: 'e2', status: 'active' }));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('Eliminar definitivamente deletes after explicit confirmation', async () => {
    const onChanged = vi.fn();
    mockedDeleteRemoteEmployee.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Ana Activa' })], onChanged);
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Ana Activa' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar definitivamente' }));

    await waitFor(() => expect(mockedDeleteRemoteEmployee).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockedUpdateRemoteEmployee).not.toHaveBeenCalled();
  });

  it('on 409 EMPLOYEE_HAS_HISTORY it shows the server message and offers Desactivar instead', async () => {
    const { ApiError } = await import('../../lib/session');
    mockedDeleteRemoteEmployee.mockRejectedValue(new ApiError(409, 'El empleado tiene turnos registrados.', 'EMPLOYEE_HAS_HISTORY'));
    mockedUpdateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e1', status: 'inactive' }));
    // First confirm = delete, second = accept the deactivate offer.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Ana Activa' })]);
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Ana Activa' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar definitivamente' }));

    await waitFor(() => expect(screen.getByText('El empleado tiene turnos registrados.')).toBeTruthy());
    await waitFor(() => expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({ id: 'e1', status: 'inactive' }));
  });

  it('on 400 LAST_ADMIN when deactivating, the server message is surfaced and nothing else happens', async () => {
    const { ApiError } = await import('../../lib/session');
    mockedUpdateRemoteEmployee.mockRejectedValue(new ApiError(400, 'No puedes desactivar al último administrador.', 'LAST_ADMIN'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Admin Vinculado', userId: 'user-admin' })]);
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Admin Vinculado' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desactivar' }));

    await waitFor(() => expect(screen.getByText('No puedes desactivar al último administrador.')).toBeTruthy());
  });

  it('Editar switches the row to inline edit and saves name via updateRemoteEmployee (status carried through)', async () => {
    mockedUpdateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e2', name: 'Bea Nueva', status: 'inactive' }));
    renderMembersModal([remoteEmployee({ id: 'e2', name: 'Bea Inactiva', status: 'inactive', externalEmployeeId: 'SI2' })]);
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Bea Inactiva' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    const nameInput = screen.getByDisplayValue('Bea Inactiva');
    fireEvent.change(nameInput, { target: { value: 'Bea Nueva' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({
      id: 'e2',
      name: 'Bea Nueva',
      externalEmployeeId: 'SI2',
      status: 'inactive',
    }));
  });
});

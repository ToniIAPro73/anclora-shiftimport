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

const remoteEmployee = (over: Partial<RemoteEmployee> = {}): RemoteEmployee => ({
  id: 'emp-x',
  organizationId: 'org-1',
  externalEmployeeId: null,
  name: 'X',
  userId: null,
  status: 'active',
  ...over,
});

function renderMembersModal(employees: RemoteEmployee[] = []) {
  return render(
    <I18nProvider>
      <MembersModal
        isOpen
        onClose={() => {}}
        employees={employees}
        currentUserId="user-admin"
        onChanged={() => {}}
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

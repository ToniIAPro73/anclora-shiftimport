// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { RemoteArea, RemoteEmployee } from '../../lib/remote';
import { MembersModal } from './MembersModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteMembers: vi.fn(),
    addRemoteMember: vi.fn(),
    bulkAddRemoteMembers: vi.fn(),
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
const mockedBulkAddRemoteMembers = vi.mocked(remote.bulkAddRemoteMembers);
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

const remoteArea = (over: Partial<RemoteArea> = {}): RemoteArea => ({
  id: 'area-n',
  name: 'Norte',
  code: 'N',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

function renderMembersModal(
  employees: RemoteEmployee[] = [],
  onChanged: () => void = () => {},
  areas: RemoteArea[] = [],
) {
  return render(
    <I18nProvider>
      <MembersModal
        isOpen
        onClose={() => {}}
        employees={employees}
        areas={areas}
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

describe('MembersModal — add-user initial password visibility toggle', () => {
  it('the initial password field is hidden by default, toggles to text and back, and has an accessible label', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal();
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    const passwordInput = screen.getByPlaceholderText('Contraseña inicial (opcional — se genera una si la dejas en blanco)') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });
    fireEvent.click(toggle);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(passwordInput.type).toBe('password');
  });

  it('typed password value and add-user flow are unaffected by toggling visibility', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedAddRemoteMember.mockResolvedValue({ userId: 'u1', email: 'nuevo@example.com', role: 'EMPLOYEE' });
    renderMembersModal();
    await waitFor(() => expect(mockedListRemoteMembers).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('Email del usuario'), { target: { value: 'nuevo@example.com' } });
    const passwordInput = screen.getByPlaceholderText('Contraseña inicial (opcional — se genera una si la dejas en blanco)') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'sup3rSecret!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(passwordInput.value).toBe('sup3rSecret!');

    fireEvent.click(screen.getByText('Añadir'));
    await waitFor(() => expect(mockedAddRemoteMember).toHaveBeenCalledWith({
      email: 'nuevo@example.com',
      role: 'EMPLOYEE',
      displayName: undefined,
      password: 'sup3rSecret!',
      employeeId: undefined,
    }));
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

describe('MembersModal — bulk users CSV import + automatic linking', () => {
  const usersCsv = () => new File(
    ['email,name,role,external_employee_id\npersona1@example.com,Adriana Molina,EMPLOYEE,SI1\nadmin@example.com,Laura Riera,ADMIN,'],
    'usuarios.csv',
    { type: 'text/csv' },
  );

  it('preview classifies bad rows without silently dropping them', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal();

    const badCsv = new File(['email,role\n,EMPLOYEE\nx@example.com,SUPERADMIN'], 'bad.csv', { type: 'text/csv' });
    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [badCsv] } });

    await waitFor(() => expect(screen.getByText('2 filas · 0 ya son miembros · 0 nuevas · 2 errores')).toBeTruthy());
    expect(screen.getByText('Email inválido')).toBeTruthy();
    expect(screen.getByText('Rol inválido')).toBeTruthy();
  });

  it('preview marks an unresolved external_employee_id as "Empleado no encontrado", never creating one', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal([]); // no employees in the org

    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [usersCsv()] } });

    await waitFor(() => expect(screen.getByText('Empleado no encontrado')).toBeTruthy());
    expect(screen.queryByText('Usuario nuevo + vincular')).toBeNull();
  });

  it('preview shows "Usuario nuevo + vincular" when the external id resolves to a free employee', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Adriana Molina', externalEmployeeId: 'SI1' })]);

    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [usersCsv()] } });

    await waitFor(() => expect(screen.getByText('Usuario nuevo + vincular')).toBeTruthy());
    expect(screen.getByText('Usuario sin empleado')).toBeTruthy(); // the admin row has no external id
  });

  it('confirm sends one bulk request and shows one-time temporary passwords + linked count', async () => {
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedBulkAddRemoteMembers.mockResolvedValue({
      results: [
        { row: 1, key: '0', email: 'persona1@example.com', status: 'created_and_linked', userId: 'u1', employeeId: 'e1', temporaryPassword: 'temp-1' },
        { row: 2, key: '1', email: 'admin@example.com', status: 'created', userId: 'u2', employeeId: null, temporaryPassword: 'temp-2' },
      ],
      summary: { created: 2, linked: 1, existing: 0, failed: 0 },
    });
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Adriana Molina', externalEmployeeId: 'SI1' })]);

    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [usersCsv()] } });

    await waitFor(() => expect(screen.getByText('Confirmar importación')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar importación'));

    await waitFor(() => expect(screen.getByText('Importación de usuarios completada')).toBeTruthy());
    expect(mockedBulkAddRemoteMembers).toHaveBeenCalledTimes(1);
    expect(mockedBulkAddRemoteMembers).toHaveBeenCalledWith([
      { key: '0', email: 'persona1@example.com', name: 'Adriana Molina', role: 'EMPLOYEE', externalEmployeeId: 'SI1' },
      { key: '1', email: 'admin@example.com', name: 'Laura Riera', role: 'ADMIN', externalEmployeeId: '' },
    ]);
    expect(screen.getByText(/Empleados vinculados.*1/)).toBeTruthy();
    expect(screen.getByText(/temp-1/)).toBeTruthy();
    expect(screen.getByText(/temp-2/)).toBeTruthy();
  });

  it('a plan-limit rejection from the bulk endpoint shows the Team upgrade prompt', async () => {
    const { ApiError } = await import('../../lib/session');
    mockedListRemoteMembers.mockResolvedValue([]);
    mockedBulkAddRemoteMembers.mockRejectedValue(new ApiError(403, 'Team plan required', 'PLAN_LIMIT'));
    renderMembersModal([remoteEmployee({ id: 'e1', name: 'Adriana Molina', externalEmployeeId: 'SI1' })]);

    fireEvent.click(screen.getByText('Importar CSV'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [usersCsv()] } });

    await waitFor(() => expect(screen.getByText('Confirmar importación')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar importación'));

    await waitFor(() => expect(screen.getByText('Esta función está disponible en Team')).toBeTruthy());
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

  it('manual add employee can assign an optional area when areas exist', async () => {
    mockedCreateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e1', name: 'Ana Nueva', areaId: 'area-s' }));
    renderMembersModal([], () => {}, [remoteArea(), remoteArea({ id: 'area-s', name: 'Sur', code: null })]);
    await openEmployeesTab();

    fireEvent.change(screen.getByPlaceholderText('Nombre del empleado'), { target: { value: 'Ana Nueva' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Área' })[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Sur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));

    await waitFor(() => expect(mockedCreateRemoteEmployee).toHaveBeenCalledWith({
      name: 'Ana Nueva',
      externalEmployeeId: undefined,
      areaId: 'area-s',
    }));
  });

  it('inline edit can move an employee to another area', async () => {
    mockedUpdateRemoteEmployee.mockResolvedValue(remoteEmployee({ id: 'e2', name: 'Bea', areaId: 'area-s' }));
    renderMembersModal(
      [remoteEmployee({ id: 'e2', name: 'Bea', status: 'active', areaId: 'area-n' })],
      () => {},
      [remoteArea(), remoteArea({ id: 'area-s', name: 'Sur', code: null })],
    );
    await openEmployeesTab();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Bea' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Área' })[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Sur' }));
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(mockedUpdateRemoteEmployee).toHaveBeenCalledWith({
      id: 'e2',
      name: 'Bea',
      externalEmployeeId: '',
      areaId: 'area-s',
      status: 'active',
    }));
  });
});

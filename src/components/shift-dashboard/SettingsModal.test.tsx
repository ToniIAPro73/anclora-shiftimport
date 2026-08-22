// @vitest-environment jsdom
import { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { RemoteEmployee } from '../../lib/remote';
import { SettingsModal } from './SettingsModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    updateUserDisplayName: vi.fn(),
    updateOwnEmployeeName: vi.fn(),
    resetOrganization: vi.fn(),
  };
});

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedUpdateUserDisplayName = vi.mocked(remote.updateUserDisplayName);
const mockedUpdateOwnEmployeeName = vi.mocked(remote.updateOwnEmployeeName);
const mockedResetOrganization = vi.mocked(remote.resetOrganization);

type SessionProp = NonNullable<ComponentProps<typeof SettingsModal>['session']>;

const makeSession = (over: Partial<SessionProp> = {}): SessionProp => ({
  user: { id: 'u1', email: 'admin@example.com', displayName: 'Toni Admin' },
  role: 'ADMIN',
  employeeId: null,
  organizationId: 'org-1',
  memberships: [
    { organizationId: 'org-1', organizationName: 'Acme', organizationType: 'company', organizationPlan: 'team', role: 'ADMIN' },
  ],
  ...over,
});

const remoteEmployee = (over: Partial<RemoteEmployee> = {}): RemoteEmployee => ({
  id: 'e1',
  organizationId: 'org-1',
  externalEmployeeId: null,
  name: 'Toni Empleado',
  userId: 'u1',
  status: 'active',
  ...over,
});

function renderSettings(props: Partial<ComponentProps<typeof SettingsModal>> = {}) {
  return render(
    <I18nProvider>
      <SettingsModal isOpen onClose={() => {}} session={null} {...props} />
    </I18nProvider>,
  );
}

describe('SettingsModal', () => {
  it('has no language control at all — locale is only ever changed via the global header toggle', () => {
    renderSettings();
    // The old duplicate controls: a <select> with 'Español'/'English' options,
    // and later a read-only "current locale" row. Neither should exist.
    expect(screen.queryByText('Español')).toBeNull();
    expect(screen.queryByRole('option', { name: 'English' })).toBeNull();
    expect(screen.queryByText('Idioma')).toBeNull();
    expect(screen.queryByText('Language')).toBeNull();
  });

  it('offers a curated IANA timezone dropdown with localized labels', () => {
    renderSettings();
    // Click the timezone selector to open the dropdown
    const timezoneTrigger = screen.getByLabelText('Zona horaria');
    fireEvent.click(timezoneTrigger);
    // Options are buttons with role="option" in SearchableSelect
    const madrid = screen.getByRole('option', { name: 'Madrid' });
    expect(madrid).toBeTruthy();
    const tokyo = screen.getByRole('option', { name: 'Tokio' });
    expect(tokyo).toBeTruthy();
    const utc = screen.getByRole('option', { name: 'UTC' });
    expect(utc).toBeTruthy();
  });

  it('closes via the external close button and on Escape', () => {
    const onClose = vi.fn();
    renderSettings({ onClose });
    const closeButton = screen.getByLabelText('Cerrar ajustes');
    expect(closeButton.style.position).toBe('absolute');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('SettingsModal — profile tab by role/employee linkage', () => {
  it('ADMIN without employee: editable account name + role, no employee-related UI', () => {
    renderSettings({ session: makeSession() });

    const input = screen.getByDisplayValue('Toni Admin') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(screen.getByText('Nombre de la cuenta')).toBeTruthy();
    expect(screen.getByText('Administrador')).toBeTruthy();

    // Nothing employee-related: no employee name field, no import prefs,
    // no identifiers, no employee hint, no dead read-only account ghost.
    expect(screen.queryByText('Nombre del empleado')).toBeNull();
    expect(screen.queryByText('Preferencias de importación')).toBeNull();
    expect(screen.queryByText('Identificadores de empleado')).toBeNull();
    expect(screen.queryByText(/Cambia tu nombre de empleado/)).toBeNull();
  });

  it('ADMIN without employee: save stays disabled until the name changes and is non-empty', () => {
    renderSettings({ session: makeSession() });

    const saveButton = screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const input = screen.getByDisplayValue('Toni Admin');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Toni Nuevo' } });
    expect(saveButton.disabled).toBe(false);
  });

  it('ADMIN without employee: successful save calls updateUserDisplayName (trimmed) and onAccountNameChange', async () => {
    mockedUpdateUserDisplayName.mockResolvedValue({ user: { id: 'u1', email: 'admin@example.com', displayName: 'Toni Nuevo' } });
    const onAccountNameChange = vi.fn();
    renderSettings({ session: makeSession(), onAccountNameChange });

    fireEvent.change(screen.getByDisplayValue('Toni Admin'), { target: { value: '  Toni Nuevo  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockedUpdateUserDisplayName).toHaveBeenCalledWith('Toni Nuevo'));
    await waitFor(() => expect(onAccountNameChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Guardado ✓')).toBeTruthy());
  });

  it('ADMIN without employee: failed save shows an inline error and never a fake success', async () => {
    mockedUpdateUserDisplayName.mockRejectedValue(new Error('boom'));
    const onAccountNameChange = vi.fn();
    renderSettings({ session: makeSession(), onAccountNameChange });

    fireEvent.change(screen.getByDisplayValue('Toni Admin'), { target: { value: 'Toni Nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.getByText('No se pudo guardar el nombre de la cuenta')).toBeTruthy());
    expect(screen.queryByText('Guardado ✓')).toBeNull();
    expect(onAccountNameChange).not.toHaveBeenCalled();
  });

  it('ADMIN with employee: employee name field + identifiers text, no account name field', () => {
    renderSettings({
      session: makeSession({ employeeId: 'e1' }),
      employees: [remoteEmployee({ externalEmployeeId: 'SI-9' })],
    });

    expect(screen.getByDisplayValue('Toni Empleado')).toBeTruthy();
    expect(screen.getByText('SI-9')).toBeTruthy();
    // External-id line (read-only text) + import-prefs identifiers label.
    expect(screen.getAllByText('Identificadores de empleado').length).toBeGreaterThan(0);
    expect(screen.queryByText('Nombre de la cuenta')).toBeNull();
    // Import preferences stay in this case.
    expect(screen.getByText('Preferencias de importación')).toBeTruthy();
  });

  it('ADMIN with employee: "Equipo" tab visible and danger zone accessible (role=ADMIN is sufficient, employeeId does not reduce admin perms)', () => {
    renderSettings({
      session: makeSession({ employeeId: 'e1' }),
      employees: [remoteEmployee({ externalEmployeeId: 'SI-9' })],
    });

    // Tab "Equipo" must be present for ADMIN in company org
    expect(screen.getByText('Equipo')).toBeTruthy();
    fireEvent.click(screen.getByText('Equipo'));

    // Danger zone (organization reset) must be accessible
    expect(screen.getByText('Zona de peligro')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restaurar estado inicial' })).toBeTruthy();
  });

  it('EMPLOYEE with employee: profile-only tabs and editable employee name', async () => {
    mockedUpdateOwnEmployeeName.mockResolvedValue(remoteEmployee({ name: 'Nombre Nuevo' }));
    const onEmployeeNameChange = vi.fn();
    renderSettings({
      session: makeSession({
        role: 'EMPLOYEE',
        employeeId: 'e1',
        memberships: [
          { organizationId: 'org-1', organizationName: 'Acme', organizationType: 'company', organizationPlan: 'team', role: 'EMPLOYEE' },
        ],
      }),
      employees: [remoteEmployee()],
      onEmployeeNameChange,
    });

    // Only the profile tab exists: no tab bar at all.
    expect(screen.queryByText('Tipos de turno')).toBeNull();
    expect(screen.queryByText('Equipo')).toBeNull();

    fireEvent.change(screen.getByDisplayValue('Toni Empleado'), { target: { value: 'Nombre Nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    await waitFor(() => expect(mockedUpdateOwnEmployeeName).toHaveBeenCalledWith('Nombre Nuevo'));
    await waitFor(() => expect(onEmployeeNameChange).toHaveBeenCalledTimes(1));
  });
});

describe('SettingsModal — danger zone (organization reset)', () => {
  const openTeamTab = () => fireEvent.click(screen.getByText('Equipo'));

  it('is not rendered for MANAGER', () => {
    renderSettings({
      session: makeSession({
        role: 'MANAGER',
        memberships: [
          { organizationId: 'org-1', organizationName: 'Acme', organizationType: 'company', organizationPlan: 'team', role: 'MANAGER' },
        ],
      }),
    });
    openTeamTab();
    expect(screen.queryByText('Zona de peligro')).toBeNull();
  });

  it('is not reachable for EMPLOYEE (no team tab)', () => {
    renderSettings({
      session: makeSession({
        role: 'EMPLOYEE',
        employeeId: 'e1',
        memberships: [
          { organizationId: 'org-1', organizationName: 'Acme', organizationType: 'company', organizationPlan: 'team', role: 'EMPLOYEE' },
        ],
      }),
      employees: [remoteEmployee()],
    });
    expect(screen.queryByText('Equipo')).toBeNull();
    expect(screen.queryByText('Zona de peligro')).toBeNull();
  });

  it('ADMIN: confirm stays disabled until RESTABLECER is typed exactly, then resets and notifies', async () => {
    mockedResetOrganization.mockResolvedValue({ reset: true, deleted: { shifts: 4, imports: 1, employees: 2 } });
    const onOrganizationReset = vi.fn();
    renderSettings({ session: makeSession(), onOrganizationReset });

    openTeamTab();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar estado inicial' }));

    expect(screen.getByText('Restaurar organización')).toBeTruthy();
    const confirmButton = screen.getByRole('button', { name: 'Restaurar' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const confirmInput = screen.getByPlaceholderText('RESTABLECER');
    fireEvent.change(confirmInput, { target: { value: 'restablecer' } });
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(confirmInput, { target: { value: 'RESTABLECER' } });
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() => expect(mockedResetOrganization).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOrganizationReset).toHaveBeenCalledTimes(1));
  });

  it('ADMIN: a failed reset shows the error inline in the modal and does not notify', async () => {
    mockedResetOrganization.mockRejectedValue(new Error('reset boom'));
    const onOrganizationReset = vi.fn();
    renderSettings({ session: makeSession(), onOrganizationReset });

    openTeamTab();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar estado inicial' }));
    fireEvent.change(screen.getByPlaceholderText('RESTABLECER'), { target: { value: 'RESTABLECER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));

    await waitFor(() => expect(screen.getByText('reset boom')).toBeTruthy());
    expect(onOrganizationReset).not.toHaveBeenCalled();
    // The modal stays open so the admin can retry or cancel.
    expect(screen.getByText('Restaurar organización')).toBeTruthy();
  });
});

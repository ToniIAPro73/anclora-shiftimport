// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';

afterEach(cleanup);
import { AppShell } from '../app-shell/AppShell';
import { SettingsModal } from '../shift-dashboard/SettingsModal';
import { EquipoModal } from './EquipoModal';
import type { RemoteArea, RemoteEmployee, RemoteMember } from '../../lib/remote';
import * as remote from '../../lib/remote';
import type { SessionInfo } from '../../lib/session';

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

const mockedListRemoteMembers = vi.mocked(remote.listRemoteMembers);
const mockedListRemoteAreas = vi.mocked(remote.listRemoteAreas);

const areasFixture: RemoteArea[] = [
  { id: 'area-ops', name: 'Operaciones', code: 'OPS', active: true, createdAt: '2026-01-01' },
];

const membersFixture: RemoteMember[] = [
  {
    userId: 'usr-admin',
    email: 'admin@example.com',
    displayName: 'Bob Admin',
    role: 'ADMIN',
    employeeId: 'emp-bob',
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
    id: 'emp-target',
    organizationId: 'org-1',
    name: 'Target Worker',
    userId: null,
    externalEmployeeId: 'EMP-999',
    areaId: null,
    status: 'pending_access',
  },
];

const testSession: SessionInfo = {
  user: { id: 'usr-admin', email: 'admin@example.com', displayName: 'Bob Admin' },
  organizationId: 'org-1',
  role: 'ADMIN',
  employeeId: 'emp-bob',
  memberships: [
    {
      organizationId: 'org-1',
      organizationName: 'Acme Corp',
      role: 'ADMIN',
      scopedAreaId: null,
    },
  ],
  plan: 'team',
};

describe('Unified Team Management Navigation Regression Suite', () => {
  it('1. SETTINGS_OPENS_EQUIPO_MODAL: SettingsModal team tab renders canonical button and fires onOpenTeam', () => {
    const onOpenTeam = vi.fn();
    render(
      <I18nProvider>
        <SettingsModal
          isOpen
          onClose={() => {}}
          session={testSession}
          onOpenTeam={onOpenTeam}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText('Equipo'));
    expect(screen.queryByText('Abrir Usuarios')).not.toBeInTheDocument();

    const openTeamBtn = screen.getByTestId('settings-open-team');
    expect(openTeamBtn).toHaveTextContent('Abrir gestión de equipo');

    fireEvent.click(openTeamBtn);
    expect(onOpenTeam).toHaveBeenCalledTimes(1);
  });

  it('2. IMPORT_RECOVERY_OPENS_EQUIPO_MODAL_WITH_INITIAL_EMPLOYEE: initialEmployeeId focuses employee row and opens edit sheet', async () => {
    mockedListRemoteMembers.mockResolvedValue(membersFixture);
    mockedListRemoteAreas.mockResolvedValue(areasFixture);

    render(
      <I18nProvider>
        <EquipoModal
          isOpen
          onClose={() => {}}
          employees={employeesFixture}
          areas={areasFixture}
          currentUserId="usr-admin"
          currentUserRole="ADMIN"
          initialEmployeeId="emp-target"
          onChanged={() => {}}
        />
      </I18nProvider>,
    );

    // Should switch to personas tab
    expect(screen.getByTestId('tab-personas')).toHaveClass('is-active');

    // Should render target row with data-focused="true" and recovery badge
    await waitFor(() => {
      expect(screen.getByTestId('persona-row-emp-emp-target')).toBeInTheDocument();
    });
    const targetRow = screen.getByTestId('persona-row-emp-emp-target');
    expect(targetRow).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('target-recovery-badge')).toHaveTextContent('Completar ficha');

    // Should automatically open the edit employee modal
    expect(screen.getByTestId('edit-employee-modal')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellidos/i)).toHaveValue('Target Worker');
  });

  it('3. SIDEBAR_OPENS_EQUIPO_MODAL: Sidebar provides Equipo button and calls onTeam', () => {
    const onTeam = vi.fn();
    render(
      <I18nProvider>
        <AppShell
          role="ADMIN"
          userName="Bob Admin"
          userRole="Administrador"
          activeSection="calendar"
          themeControl={<div />}
          languageControl={<div />}
          onTeam={onTeam}
        >
          <div>Body</div>
        </AppShell>
      </I18nProvider>,
    );

    const teamBtn = screen.getAllByTestId('sidebar-team')[0];
    expect(teamBtn).toBeInTheDocument();
    fireEvent.click(teamBtn);
    expect(onTeam).toHaveBeenCalledTimes(1);
  });

  it('4. MEMBERS_MODAL_NOT_USER_REACHABLE: No sidebar-members item is present in DOM', () => {
    render(
      <I18nProvider>
        <AppShell
          role="ADMIN"
          userName="Bob Admin"
          userRole="Administrador"
          activeSection="calendar"
          themeControl={<div />}
          languageControl={<div />}
          onTeam={() => {}}
        >
          <div>Body</div>
        </AppShell>
      </I18nProvider>,
    );

    expect(screen.queryByTestId('sidebar-members')).not.toBeInTheDocument();
    expect(screen.queryByText(/usuarios legacy/i)).not.toBeInTheDocument();
  });

  it('5. AREAS_MODAL_NOT_USER_REACHABLE: No sidebar-areas item is present in DOM', () => {
    render(
      <I18nProvider>
        <AppShell
          role="ADMIN"
          userName="Bob Admin"
          userRole="Administrador"
          activeSection="calendar"
          themeControl={<div />}
          languageControl={<div />}
          onTeam={() => {}}
        >
          <div>Body</div>
        </AppShell>
      </I18nProvider>,
    );

    expect(screen.queryByTestId('sidebar-areas')).not.toBeInTheDocument();
    expect(screen.queryByText(/áreas legacy/i)).not.toBeInTheDocument();
  });

  it('6. TEAM_ENTRY_POINT_UNIFIED: Canonical team entry point is exclusively EquipoModal across sidebar and settings', () => {
    const onTeamFromSidebar = vi.fn();
    const onTeamFromSettings = vi.fn();

    const { unmount } = render(
      <I18nProvider>
        <AppShell
          role="ADMIN"
          userName="Bob Admin"
          userRole="Administrador"
          activeSection="calendar"
          themeControl={<div />}
          languageControl={<div />}
          onTeam={onTeamFromSidebar}
        >
          <div>Body</div>
        </AppShell>
      </I18nProvider>,
    );

    fireEvent.click(screen.getAllByTestId('sidebar-team')[0]);
    expect(onTeamFromSidebar).toHaveBeenCalledTimes(1);

    unmount();

    render(
      <I18nProvider>
        <SettingsModal
          isOpen
          onClose={() => {}}
          session={testSession}
          onOpenTeam={onTeamFromSettings}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText('Equipo'));
    fireEvent.click(screen.getByTestId('settings-open-team'));
    expect(onTeamFromSettings).toHaveBeenCalledTimes(1);
  });
});

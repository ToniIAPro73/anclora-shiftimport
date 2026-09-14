// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import type { RemoteAccessInvitation, RemoteArea, RemoteEmployee, RemoteMember } from '../../lib/remote';
import { EquipoModal } from './EquipoModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteMembers: vi.fn(),
    listRemoteAccessDirectory: vi.fn(),
    resendRemoteAccessInvitation: vi.fn(),
    revokeRemoteAccessInvitation: vi.fn(),
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
const mockedListRemoteAccessDirectory = vi.mocked(remote.listRemoteAccessDirectory);
const mockedListRemoteAreas = vi.mocked(remote.listRemoteAreas);
const mockedResendRemoteAccessInvitation = vi.mocked(remote.resendRemoteAccessInvitation);
const mockedRevokeRemoteAccessInvitation = vi.mocked(remote.revokeRemoteAccessInvitation);

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
  {
    id: 'emp-carmen',
    organizationId: 'org-1',
    name: 'Carmen Inactiva',
    userId: null,
    externalEmployeeId: 'EMP-003',
    areaId: null,
    status: 'inactive',
  },
];

function generateInvitations(count: number): RemoteAccessInvitation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `inv-${i + 1}`,
    organizationId: 'org-1',
    organizationPersonId: `person-${i + 1}`,
    email: `gf.csv.e${String(i + 1).padStart(3, '0')}@e2e.test`,
    status: 'PENDING',
    createdAt: '2026-09-14T10:00:00.000Z',
    expiresAt: '2026-09-21T10:00:00.000Z',
    acceptedAt: null,
    revokedAt: null,
    lastSentAt: '2026-09-14T10:00:00.000Z',
    lastDeliveryAt: null,
    deliveryStatus: 'SENT',
    sendAttempts: 1,
  }));
}

function renderModal(invitationsCount = 0) {
  const invitations = generateInvitations(invitationsCount);
  mockedListRemoteMembers.mockResolvedValue(membersFixture);
  mockedListRemoteAccessDirectory.mockResolvedValue({
    people: [],
    invitations,
  });
  mockedListRemoteAreas.mockResolvedValue(areasFixture);

  const onChanged = vi.fn();
  const onClose = vi.fn();

  const utils = render(
    <I18nProvider>
      <EquipoModal
        isOpen
        onClose={onClose}
        employees={employeesFixture}
        areas={areasFixture}
        currentUserId="usr-admin"
        currentUserRole="ADMIN"
        onChanged={onChanged}
      />
    </I18nProvider>
  );

  return { ...utils, onChanged, onClose, invitations };
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe('EquipoModal — Pending Invitations Layout & Scrollability', () => {
  it('renders correctly with 0 invitations: no pending section, table accessible', async () => {
    renderModal(0);

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('pending-invitations-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('tab-personas')).toBeInTheDocument();
    expect(screen.getByTestId('filter-status')).toBeInTheDocument();
    expect(screen.getByTestId('add-persona-button')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-import-employees-button')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-import-users-button')).toBeInTheDocument();

    // Table rows are rendered
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
  });

  it('renders correctly with 1 invitation: section visible, table accessible', async () => {
    renderModal(1);

    await waitFor(() => {
      expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument();
    });

    expect(screen.getByText('gf.csv.e001@e2e.test')).toBeInTheDocument();
    expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
  });

  it('renders correctly with 6 invitations: internal scroll container present, table rendered and accessible, controls visible', async () => {
    renderModal(6);

    await waitFor(() => {
      expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument();
    });

    const list = screen.getByTestId('pending-invitations-list');
    expect(list).toBeInTheDocument();
    expect(list.className).toContain('equipo-pending-invitations__list');

    // Title is rendered
    expect(screen.getByText(/invitaciones pendientes/i)).toBeInTheDocument();

    // All 6 invitations are rendered in the DOM
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByTestId(`pending-invitation-inv-${i}`)).toBeInTheDocument();
    }

    // Both first and last invitation reachable
    expect(screen.getByText('gf.csv.e001@e2e.test')).toBeInTheDocument();
    expect(screen.getByText('gf.csv.e006@e2e.test')).toBeInTheDocument();

    // Personas table is rendered and accessible
    expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();

    // Toolbar, tabs, filters remain in document
    expect(screen.getByTestId('tab-personas')).toBeInTheDocument();
    expect(screen.getByTestId('personas-search')).toBeInTheDocument();
    expect(screen.getByTestId('filter-access')).toBeInTheDocument();
    expect(screen.getByTestId('filter-role')).toBeInTheDocument();
    expect(screen.getByTestId('filter-area')).toBeInTheDocument();
    expect(screen.getByTestId('filter-status')).toBeInTheDocument();
    expect(screen.getByTestId('add-persona-button')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-import-employees-button')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-import-users-button')).toBeInTheDocument();
  });

  it('renders correctly with 20 invitations: all 20 rendered, last reachable, resend and revoke work, table accessible', async () => {
    mockedResendRemoteAccessInvitation.mockResolvedValue({
      invitationId: 'inv-20',
      status: 'SENT',
    });
    mockedRevokeRemoteAccessInvitation.mockResolvedValue(undefined);

    renderModal(20);

    await waitFor(() => {
      expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument();
    });

    // Exactly 20 invitation rows in the list
    for (let i = 1; i <= 20; i++) {
      expect(screen.getByTestId(`pending-invitation-inv-${i}`)).toBeInTheDocument();
    }

    // Reach 20th invitation and trigger Resend
    const resend20 = screen.getByTestId('resend-invitation-inv-20');
    expect(resend20).toBeInTheDocument();
    fireEvent.click(resend20);

    await waitFor(() => {
      expect(mockedResendRemoteAccessInvitation).toHaveBeenCalledWith('inv-20', 'es');
    });

    // Trigger Revoke on 20th invitation
    const revoke20 = screen.getByTestId('revoke-invitation-inv-20');
    expect(revoke20).toBeInTheDocument();
    fireEvent.click(revoke20);

    await waitFor(() => {
      expect(mockedRevokeRemoteAccessInvitation).toHaveBeenCalledWith('inv-20');
    });

    // Personas table is simultaneously accessible
    expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    expect(screen.getByText('Carmen Inactiva')).toBeInTheDocument();
  });
});

describe('EquipoModal — Filter Behavior & Integrity', () => {
  it('neutral "all" shows all people; "pending_access" filters correctly; switching back restores all', async () => {
    renderModal(6);

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    const filterStatus = screen.getByTestId('filter-status') as HTMLSelectElement;

    // 1. Initial state is 'all'
    expect(filterStatus.value).toBe('all');
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    expect(screen.getByText('Carmen Inactiva')).toBeInTheDocument();

    // 2. Filter by 'pending_access'
    fireEvent.change(filterStatus, { target: { value: 'pending_access' } });
    expect(filterStatus.value).toBe('pending_access');

    // Dave Worker has status pending_access -> shown
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    // Bob Admin (active) and Carmen (inactive) -> filtered out
    expect(screen.queryByText('Bob Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Carmen Inactiva')).not.toBeInTheDocument();

    // Pending invitations section remains intact and does NOT disappear
    expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument();

    // 3. Switch back to 'all' -> all persons restored
    fireEvent.change(filterStatus, { target: { value: 'all' } });
    expect(filterStatus.value).toBe('all');
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    expect(screen.getByText('Carmen Inactiva')).toBeInTheDocument();
  });

  it('pending invitations do not replace or block the personas table', async () => {
    renderModal(10);

    await waitFor(() => {
      expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument();
    });

    // Both sections coexist
    expect(screen.getByTestId('pending-invitations-section')).toBeInTheDocument();
    expect(screen.getByTestId('personas-table')).toBeInTheDocument();

    // Table rows are directly queryable
    const table = screen.getByTestId('personas-table');
    expect(table).toBeVisible();
    expect(screen.getByTestId('persona-row-usr-admin')).toBeInTheDocument();
    expect(screen.getByTestId('persona-row-emp-emp-dave')).toBeInTheDocument();
  });
});

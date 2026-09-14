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

function generateManyEmployees(count: number): RemoteEmployee[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `emp-gen-${i + 1}`,
    organizationId: 'org-1',
    name: `Empleado ${String(i + 1).padStart(3, '0')}`,
    userId: i === 0 ? 'usr-admin' : null,
    externalEmployeeId: `EMP-${String(i + 1).padStart(3, '0')}`,
    areaId: i % 2 === 0 ? 'area-ops' : 'area-sec',
    status: i % 5 === 0 ? 'inactive' : 'active',
  }));
}

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

function renderModal({
  invitationsCount = 0,
  employees = employeesFixture,
  members = membersFixture,
}: {
  invitationsCount?: number;
  employees?: RemoteEmployee[];
  members?: RemoteMember[];
} = {}) {
  const invitations = generateInvitations(invitationsCount);
  mockedListRemoteMembers.mockResolvedValue(members);
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
        employees={employees}
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

describe('EquipoModal — Pending Invitations Toolbar Button & Dialog', () => {
  it('renders correctly with 0 invitations: button disabled, badge shows 0, table accessible', async () => {
    renderModal({ invitationsCount: 0 });

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    const btn = screen.getByTestId('pending-invitations-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();

    const badge = screen.getByTestId('pending-invitations-badge');
    expect(badge).toHaveTextContent('0');
    expect(badge.className).not.toContain('is-active');

    // No pending invitations modal or inline list
    expect(screen.queryByTestId('pending-invitations-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-invitations-section')).not.toBeInTheDocument();

    // Table rows are rendered
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
  });

  it('renders correctly with 6 invitations: button enabled with counter, opens sibling dialog', async () => {
    mockedResendRemoteAccessInvitation.mockResolvedValue({
      invitationId: 'inv-1',
      status: 'SENT',
    });
    mockedRevokeRemoteAccessInvitation.mockResolvedValue(undefined);

    renderModal({ invitationsCount: 6 });

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    const btn = screen.getByTestId('pending-invitations-button');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();

    const badge = screen.getByTestId('pending-invitations-badge');
    expect(badge).toHaveTextContent('6');
    expect(badge.className).toContain('is-active');

    // Click to open sibling modal
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByTestId('pending-invitations-modal')).toBeInTheDocument();
    });

    // All 6 invitations are rendered
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByTestId(`pending-invitation-inv-${i}`)).toBeInTheDocument();
    }

    // Reach 1st invitation and trigger Resend
    const resend1 = screen.getByTestId('resend-invitation-inv-1');
    fireEvent.click(resend1);
    await waitFor(() => {
      expect(mockedResendRemoteAccessInvitation).toHaveBeenCalledWith('inv-1', 'es');
    });

    // Reach 6th invitation and trigger Revoke
    const revoke6 = screen.getByTestId('revoke-invitation-inv-6');
    fireEvent.click(revoke6);
    await waitFor(() => {
      expect(mockedRevokeRemoteAccessInvitation).toHaveBeenCalledWith('inv-6');
    });

    // Close button dismisses modal
    const closeBtn = screen.getByTestId('close-pending-invitations-modal');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('pending-invitations-modal')).not.toBeInTheDocument();
    });
  });

  it('allows searching within pending invitations modal', async () => {
    renderModal({ invitationsCount: 10 });

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('pending-invitations-button'));

    await waitFor(() => {
      expect(screen.getByTestId('pending-invitations-modal')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('pending-invitations-search');
    fireEvent.change(searchInput, { target: { value: 'e005' } });

    expect(screen.getByText('gf.csv.e005@e2e.test')).toBeInTheDocument();
    expect(screen.queryByText('gf.csv.e001@e2e.test')).not.toBeInTheDocument();
    expect(screen.queryByText('gf.csv.e002@e2e.test')).not.toBeInTheDocument();
  });
});

describe('EquipoModal — Filter Behavior & Integrity', () => {
  it('filter-access with "pending_access" filters correctly; switching back restores all', async () => {
    renderModal({ invitationsCount: 6 });

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    const filterAccess = screen.getByTestId('filter-access') as HTMLSelectElement;

    // 1. Initial state is 'all'
    expect(filterAccess.value).toBe('all');
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    expect(screen.getByText('Carmen Inactiva')).toBeInTheDocument();

    // 2. Filter by 'pending_access'
    fireEvent.change(filterAccess, { target: { value: 'pending_access' } });
    expect(filterAccess.value).toBe('pending_access');

    // Dave Worker has status pending_access -> shown
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    // Bob Admin (active) and Carmen (inactive) -> filtered out
    expect(screen.queryByText('Bob Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Carmen Inactiva')).not.toBeInTheDocument();

    // 3. Switch back to 'all' -> all persons restored
    fireEvent.change(filterAccess, { target: { value: 'all' } });
    expect(filterAccess.value).toBe('all');
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Dave Worker')).toBeInTheDocument();
    expect(screen.getByText('Carmen Inactiva')).toBeInTheDocument();
  });

  it('filter-status filters by active vs inactive', async () => {
    renderModal({ invitationsCount: 0 });

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    const filterStatus = screen.getByTestId('filter-status') as HTMLSelectElement;
    expect(filterStatus.value).toBe('all');

    // Filter inactive
    fireEvent.change(filterStatus, { target: { value: 'inactive' } });
    expect(screen.getByText('Carmen Inactiva')).toBeInTheDocument();
    expect(screen.queryByText('Bob Admin')).not.toBeInTheDocument();

    // Filter active
    fireEvent.change(filterStatus, { target: { value: 'active' } });
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.queryByText('Carmen Inactiva')).not.toBeInTheDocument();
  });
});

describe('EquipoModal — Client Pagination on Personas Table', () => {
  it('paginates personas correctly and handles prev/next navigation', async () => {
    const manyEmployees = generateManyEmployees(27);
    renderModal({ invitationsCount: 0, employees: manyEmployees });

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    // Pagination controls should be rendered
    const pagination = screen.getByTestId('personas-pagination');
    expect(pagination).toBeInTheDocument();

    const prevBtn = screen.getByTestId('personas-page-prev');
    const nextBtn = screen.getByTestId('personas-page-next');

    // On first page: prev is disabled
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Advance to next page
    fireEvent.click(nextBtn);
    expect(prevBtn).not.toBeDisabled();

    // Go back to first page
    fireEvent.click(prevBtn);
    expect(prevBtn).toBeDisabled();
  });

  it('resets page to 1 when search query changes', async () => {
    const manyEmployees = generateManyEmployees(27);
    renderModal({ invitationsCount: 0, employees: manyEmployees });

    await waitFor(() => {
      expect(screen.getByTestId('personas-table')).toBeInTheDocument();
    });

    const nextBtn = screen.getByTestId('personas-page-next');
    const prevBtn = screen.getByTestId('personas-page-prev');

    // Go to page 2
    fireEvent.click(nextBtn);
    expect(prevBtn).not.toBeDisabled();

    // Type into search
    const searchInput = screen.getByTestId('personas-search');
    fireEvent.change(searchInput, { target: { value: '002' } });

    // Page should be reset to 1 -> prev is disabled
    expect(prevBtn).toBeDisabled();
    expect(screen.getByText('Empleado 002')).toBeInTheDocument();
  });

  it('formats Ficha Empleado in Roles y acceso tab omitting empty parentheses', async () => {
    const customMembers: RemoteMember[] = [
      {
        userId: 'usr-owner',
        email: 'owner@example.com',
        displayName: 'Alice Owner',
        role: 'OWNER',
      },
      {
        userId: 'usr-sebas',
        email: 'sebas@example.com',
        displayName: 'Sebas',
        role: 'ADMIN',
        employeeId: 'emp-sebas',
        employeeName: 'Sebas',
        employeeExternalId: null,
      },
      {
        userId: 'usr-dave',
        email: 'dave@example.com',
        displayName: 'Dave Worker',
        role: 'EMPLOYEE',
        employeeId: 'emp-dave',
        employeeName: 'Dave Worker',
        employeeExternalId: '84881',
      },
    ];

    mockedListRemoteMembers.mockResolvedValue(customMembers);
    mockedListRemoteAccessDirectory.mockResolvedValue({ people: [], invitations: [] });
    mockedListRemoteAreas.mockResolvedValue([]);

    renderModal({ members: customMembers });

    const rolesTab = screen.getByTestId('tab-roles');
    fireEvent.click(rolesTab);

    await waitFor(() => {
      expect(screen.getByTestId('roles-table')).toBeInTheDocument();
    });

    const sebasRow = screen.getByTestId('role-row-usr-sebas');
    expect(sebasRow).toHaveTextContent('Sebas');
    expect(sebasRow).not.toHaveTextContent('Sebas ()');
    expect(sebasRow).not.toHaveTextContent('()');

    const daveRow = screen.getByTestId('role-row-usr-dave');
    expect(daveRow).toHaveTextContent('Dave Worker (84881)');

    const aliceRow = screen.getByTestId('role-row-usr-owner');
    expect(aliceRow).toHaveTextContent('Sin ficha de empleado');
  });
});


// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import type { RemoteArea, RemoteEmployee, RemoteMember } from '../../lib/remote';
import { EquipoModal } from './EquipoModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return { ...actual, listRemoteMembers: vi.fn(), listRemoteAreas: vi.fn(), listRemoteAccessDirectory: vi.fn(), bulkMoveRemoteEmployeesArea: vi.fn() };
});

setupLocalStorageMock();

const areas: RemoteArea[] = [
  { id: 'area-ops', name: 'Operaciones', code: 'OPS', active: true, createdAt: '2026-01-01' },
  { id: 'area-sec', name: 'Seguridad', code: 'SEC', active: true, createdAt: '2026-01-01' },
];
const members: RemoteMember[] = [
  { userId: 'usr-owner', email: 'owner@example.com', displayName: 'Alice Owner', role: 'OWNER' },
  { userId: 'usr-admin', email: 'admin@example.com', displayName: 'Bob Admin', role: 'ADMIN', employeeId: 'emp-bob' },
  { userId: 'usr-planner', email: 'planner@example.com', displayName: 'Charlie Planner', role: 'PLANNER', plannerScopeType: 'AREAS', scopedAreaIds: ['area-ops'] },
];
const employees: RemoteEmployee[] = [
  { id: 'emp-bob', organizationId: 'org-1', name: 'Bob Admin', userId: 'usr-admin', externalEmployeeId: 'EMP-001', areaId: 'area-ops', status: 'active' },
  { id: 'emp-dave', organizationId: 'org-1', name: 'Dave Worker with a very long second surname that must wrap', userId: null, externalEmployeeId: 'EMP-002', areaId: null, status: 'active' },
];

function mockMatchMedia(compact: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: compact && query.includes('max-width: 900px'), media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

function renderModal(compact: boolean, initialTab: 'personas' | 'roles' | 'areas' | 'assignments' = 'roles', locale: 'es' | 'en' = 'es') {
  mockMatchMedia(compact);
  if (locale === 'en') localStorage.setItem('anclora_shiftimport_locale_v1', 'en'); else localStorage.removeItem('anclora_shiftimport_locale_v1');
  return render(
    <I18nProvider>
      <EquipoModal isOpen onClose={vi.fn()} employees={employees} areas={areas} currentUserId="usr-owner" currentUserRole="OWNER" onChanged={vi.fn()} initialTab={initialTab} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.mocked(remote.listRemoteMembers).mockResolvedValue(members);
  vi.mocked(remote.listRemoteAreas).mockResolvedValue(areas);
  vi.mocked(remote.listRemoteAccessDirectory).mockResolvedValue({ people: [], invitations: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Equipo móvil — Roles y acceso como tarjetas', () => {
  it('shows cards instead of the table, with the real role, scope and only the actions each role really has', async () => {
    renderModal(true);
    await screen.findByTestId('roles-cards');
    expect(screen.queryByTestId('roles-table')).toBeNull();
    const owner = screen.getByTestId('role-row-usr-owner');
    expect(within(owner).getByText('Propietario')).toBeInTheDocument();
    expect(within(owner).queryByTestId('change-role-usr-owner')).toBeNull(); // the owner is never edited here
    expect(within(owner).queryByTestId('manage-scope-usr-owner')).toBeNull();
    expect(within(owner).getByText('(Tú)')).toBeInTheDocument();
    const admin = screen.getByTestId('role-row-usr-admin');
    expect(within(admin).getByTestId('change-role-usr-admin')).toBeInTheDocument();
    expect(within(admin).queryByTestId('manage-scope-usr-admin')).toBeNull();
    const planner = screen.getByTestId('role-row-usr-planner');
    expect(within(planner).getByText('Áreas (1)')).toBeInTheDocument();
    expect(within(planner).getByText('Áreas: Operaciones')).toBeInTheDocument(); // the scope is not just a label
    expect(within(planner).getByTestId('change-role-usr-planner')).toBeInTheDocument();
    expect(within(planner).getByTestId('manage-scope-usr-planner')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-ownership-button')).toBeInTheDocument();
  });

  it('the card actions open the very same editors as the table', async () => {
    renderModal(true);
    await screen.findByTestId('roles-cards');
    fireEvent.click(screen.getByTestId('manage-scope-usr-planner'));
    expect(await screen.findByTestId('change-role-modal')).toBeInTheDocument();
  });

  it('searches the loaded people (name or email) without any new request', async () => {
    renderModal(true);
    await screen.findByTestId('roles-cards');
    expect(screen.getByTestId('roles-count')).toHaveTextContent('3 personas');
    fireEvent.change(screen.getByTestId('roles-search'), { target: { value: 'charlie' } });
    expect(screen.getByTestId('roles-count')).toHaveTextContent('1 personas');
    expect(screen.queryByTestId('role-row-usr-admin')).toBeNull();
    expect(vi.mocked(remote.listRemoteMembers)).toHaveBeenCalledTimes(1);
  });

  it('desktop/tablet keeps the table and has no cards', async () => {
    renderModal(false);
    await screen.findByTestId('roles-table');
    expect(screen.queryByTestId('roles-cards')).toBeNull();
  });
});

describe('Equipo móvil — Áreas como tarjetas', () => {
  const withAreas = (tab: 'areas' = 'areas') => renderModal(true, tab as never);

  it('shows one card per area with its data and the same actions as the table, no horizontal table', async () => {
    withAreas();
    await screen.findByTestId('areas-cards');
    expect(screen.queryByTestId('areas-table')).toBeNull();
    const ops = screen.getByTestId('area-row-area-ops');
    expect(within(ops).getByText('Operaciones')).toBeInTheDocument();
    expect(within(ops).getByText('OPS')).toBeInTheDocument();
    expect(within(ops).getByText('Activa')).toBeInTheDocument();
    expect(within(ops).getByText('Empleados asignados').nextSibling).toHaveTextContent('1'); // Bob Admin is the only OPS employee
    expect(within(ops).getByText('Planificadores asignados').nextSibling).toHaveTextContent('1'); // Charlie is scoped to OPS
    expect(within(ops).getByTestId('edit-area-area-ops')).toBeInTheDocument();
    expect(within(ops).getByTestId('manage-area-assignments-area-ops')).toBeInTheDocument();
  });

  it('Editar opens the area editor; Gestionar asignaciones jumps to Assignments with that area preselected', async () => {
    withAreas();
    await screen.findByTestId('areas-cards');
    fireEvent.click(screen.getByTestId('edit-area-area-sec'));
    expect(await screen.findByTestId('area-modal')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('area-modal')).toBeNull());
    fireEvent.click(screen.getByTestId('manage-area-assignments-area-sec'));
    expect(await screen.findByTestId('assignments-tab')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-target-area-select')).toHaveValue('area-sec');
  });

  it('desktop/tablet keeps the areas table', async () => {
    renderModal(false, 'roles');
    fireEvent.click(await screen.findByTestId('tab-areas'));
    await screen.findByTestId('areas-table');
    expect(screen.queryByTestId('areas-cards')).toBeNull();
  });
});

describe('Equipo móvil — Asignaciones', () => {
  it('lists the employees as cards with one primary action, pinned in the footer (never duplicated)', async () => {
    renderModal(true, 'assignments');
    await screen.findByTestId('bulk-employees-cards');
    expect(screen.queryByTestId('bulk-employees-table')).toBeNull();
    const buttons = screen.getAllByTestId('apply-bulk-move-button');
    expect(buttons).toHaveLength(1);
    expect(screen.getByTestId('bulk-footer')).toContainElement(buttons[0]);
    expect(buttons[0]).toBeDisabled();
    expect(screen.getByTestId('bulk-footer')).toHaveTextContent('0 empleados seleccionados');
    // long names are plain text in the card (wrapped by CSS), never clipped by the DOM
    expect(screen.getByText(/Dave Worker with a very long second surname/)).toBeInTheDocument();
  });

  it('multi-selection and the apply rule are unchanged: needs a target area and at least one employee', async () => {
    renderModal(true, 'assignments');
    await screen.findByTestId('bulk-employees-cards');
    const apply = screen.getByTestId('apply-bulk-move-button');
    fireEvent.click(screen.getByTestId('select-emp-emp-bob'));
    fireEvent.click(screen.getByTestId('select-emp-emp-dave'));
    expect(screen.getByTestId('bulk-footer')).toHaveTextContent('2 empleados seleccionados');
    expect(apply).toBeDisabled(); // no destination area yet
    fireEvent.change(screen.getByTestId('bulk-target-area-select'), { target: { value: 'area-sec' } });
    expect(apply).toBeEnabled();
    expect(apply).toHaveTextContent('Aplicar a 2 empleados');
    fireEvent.click(screen.getByTestId('select-emp-emp-bob'));
    expect(screen.getByTestId('bulk-footer')).toHaveTextContent('1 empleado seleccionado');
  });

  it('the fields have real labels and the sub-tab strip keeps both real sub-tabs', async () => {
    renderModal(true, 'assignments');
    await screen.findByTestId('bulk-employees-cards');
    expect(screen.getByLabelText(/Área de destino/)).toBe(screen.getByTestId('bulk-target-area-select'));
    expect(screen.getByLabelText(/Fecha de efecto/)).toBe(screen.getByTestId('bulk-effective-date-input'));
    expect(screen.getByTestId('subtab-employees-to-area')).toBeInTheDocument();
    expect(screen.getByTestId('subtab-planner-scopes')).toBeInTheDocument();
  });

  it('desktop/tablet keeps the table and the inline action', async () => {
    renderModal(false, 'assignments');
    await screen.findByTestId('bulk-employees-table');
    expect(screen.queryByTestId('bulk-footer')).toBeNull();
    expect(screen.getAllByTestId('apply-bulk-move-button')).toHaveLength(1);
  });

  it('marks each tab strip with its scroll state so the edge can fade', async () => {
    renderModal(true, 'assignments');
    await screen.findByTestId('bulk-employees-cards');
    const strip = screen.getByTestId('tab-roles').closest('[role="tablist"]') as HTMLElement;
    expect(strip).toHaveAttribute('data-scroll-start');
    expect(strip).toHaveAttribute('data-scroll-end');
  });
});

describe('Equipo móvil — Añadir nueva persona', () => {
  const open = async (locale: 'es' | 'en' = 'es') => {
    renderModal(true, 'personas', locale);
    fireEvent.click(await screen.findByTestId('add-persona-button'));
    return screen.findByTestId('wizard-progress');
  };

  it('shows "Paso X de 5 · Nombre" with accessible, non-colour-only progress, and keeps the real steps', async () => {
    const progress = await open();
    expect(progress).toHaveTextContent('Paso 1 de 5 · Identidad');
    const steps = within(progress).getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(steps[0]).toHaveTextContent('1. Identidad — paso actual');
    expect(steps[1]).toHaveTextContent('2. Acceso — pendiente');
    expect(screen.getByTestId('wizard-name-input')).toBeInTheDocument(); // step 1 keeps its real field only
    expect(screen.queryByTestId('wizard-email-input')).toBeNull();
  });

  it('Siguiente is gated by the same rule, Atrás returns, completed steps are announced, Cancelar closes', async () => {
    const progress = await open();
    const next = screen.getByTestId('wizard-next-button');
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByTestId('wizard-name-input'), { target: { value: 'Persona de prueba' } });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(progress).toHaveTextContent('Paso 2 de 5 · Acceso');
    expect(within(progress).getAllByRole('listitem')[0]).toHaveTextContent('1. Identidad — completado');
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(progress).toHaveTextContent('Paso 1 de 5 · Identidad');
    expect(screen.getByTestId('wizard-name-input')).toHaveValue('Persona de prueba'); // draft kept when navigating
    fireEvent.click(screen.getByTestId('wizard-cancel-button'));
    await waitFor(() => expect(screen.queryByTestId('add-persona-wizard')).toBeNull());
  });

  it('English copy', async () => {
    const progress = await open('en');
    expect(progress).toHaveTextContent('Step 1 of 5 · Identity');
  });
});

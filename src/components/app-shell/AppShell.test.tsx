// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { AppShell, CalendarToolbar } from './AppShell';

setupLocalStorageMock();

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

function renderShell(role: 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE' | null = 'OWNER', activeSection: 'calendar' | 'planner' = 'calendar') {
  const callbacks = {
    onImport: vi.fn(),
    onAddShift: vi.fn(),
    onSelfImport: vi.fn(),
    onHistoricalAdd: vi.fn(),
    onRequests: vi.fn(),
    onHistory: vi.fn(),
    onPlanner: vi.fn(),
    onApprovals: vi.fn(),
    onTeam: vi.fn(),
    onFormatProfiles: vi.fn(),
    onSettings: vi.fn(),
    onLogout: vi.fn(),
  };
  render(
    <I18nProvider>
      <AppShell
        role={role}
        userName="Toni"
        userRole={role ?? undefined}
        activeSection={activeSection}
        themeControl={<button type="button">Theme</button>}
        languageControl={<button type="button">Language</button>}
        contextContent={activeSection === 'planner' ? <div>Organization context</div> : null}
        contextSummary={<span>Organization summary</span>}
        {...callbacks}
      >
        <h1>Calendar workspace</h1>
      </AppShell>
    </I18nProvider>,
  );
  return callbacks;
}

describe('AppShell', () => {
  it('shows the complete authorized OWNER navigation and preserves context', () => {
    renderShell('OWNER');

    expect(screen.getByTestId('app-shell-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-import')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-add-shift')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-history')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-planner')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-approvals')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-team')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-members')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-areas')).not.toBeInTheDocument();
    expect(screen.getByTestId('sidebar-formats')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell-main-context')).not.toBeInTheDocument();
    const sidebar = screen.getByTestId('app-shell-sidebar');
    expect(sidebar).not.toHaveTextContent('Organization context');
    expect(sidebar.lastElementChild).toBe(screen.getByTestId('sidebar-collapse'));
    expect(screen.getByText('Organization summary')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell-context-menu')).not.toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Espacio de trabajo principal' })).toHaveTextContent('Calendar workspace');
  });

  it('filters administrative actions for PLANNER and keeps the active section visible', () => {
    renderShell('PLANNER', 'planner');

    expect(screen.getByTestId('sidebar-planner')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('sidebar-members')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-areas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-settings')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-shell-main-context')).toHaveTextContent('Organization context');
  });

  it('renders the shared shell with only self-service actions for EMPLOYEE', () => {
    renderShell('EMPLOYEE');

    expect(screen.getByTestId('sidebar-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-self-import')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-historical-add')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-requests')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-history')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-planner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-approvals')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-team')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-members')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-areas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-formats')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-settings')).not.toBeInTheDocument();
  });

  it('persists collapsed state and keeps icon actions named', () => {
    const callbacks = renderShell('ADMIN');
    const collapse = screen.getByTestId('sidebar-collapse');
    expect(collapse).toHaveAttribute('aria-label', 'Contraer navegación');
    expect(collapse).not.toHaveTextContent('Contraer');
    fireEvent.click(collapse);

    expect(screen.getByTestId('app-shell')).toHaveClass('is-collapsed');
    const expand = screen.getByTestId('sidebar-collapse');
    expect(expand).toHaveAttribute('aria-label', 'Expandir navegación');
    expect(expand).not.toHaveTextContent('Expandir');
    expect(screen.getByTestId('sidebar-import')).toHaveAttribute('title', 'Importar turnos');
    expect(window.localStorage.getItem('anclora_shiftimport_sidebar_v1')).toBe('collapsed');
    fireEvent.click(screen.getByTestId('sidebar-import'));
    expect(callbacks.onImport).toHaveBeenCalledTimes(1);
  });

  it('opens the account menu, exposes logout and closes it with Escape', () => {
    const callbacks = renderShell('OWNER');
    fireEvent.click(screen.getByTestId('app-shell-user-menu'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    const logout = screen.getByRole('menuitem', { name: 'Salir' });
    fireEvent.click(logout);
    expect(callbacks.onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('app-shell-user-menu'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens and closes the mobile drawer without changing the content state', () => {
    renderShell('OWNER');
    fireEvent.click(screen.getByTestId('app-shell-mobile-menu'));
    expect(screen.getByTestId('app-shell')).toHaveClass('is-drawer-open');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('app-shell')).not.toHaveClass('is-drawer-open');
    expect(screen.getByRole('heading', { name: 'Calendar workspace' })).toBeInTheDocument();
  });

  it('renders unified Equipo entry point in Gestión group and separates Configuración', () => {
    const onTeam = vi.fn();
    render(
      <I18nProvider>
        <AppShell
          role="ADMIN"
          userName="Toni"
          userRole="Admin"
          activeSection="calendar"
          themeControl={<button type="button">Theme</button>}
          languageControl={<button type="button">Language</button>}
          onTeam={onTeam}
          onHistory={vi.fn()}
          onFormatProfiles={vi.fn()}
          onSettings={vi.fn()}
          onImport={vi.fn()}
          onAddShift={vi.fn()}
          onPlanner={vi.fn()}
          onApprovals={vi.fn()}
        >
          <h1>Content</h1>
        </AppShell>
      </I18nProvider>,
    );

    // Verify Equipo is present and separate members/areas are omitted
    expect(screen.getByTestId('sidebar-team')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-team')).toHaveTextContent('Equipo');
    expect(screen.queryByTestId('sidebar-members')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-areas')).not.toBeInTheDocument();

    // Verify groups
    expect(screen.getByText('Operación')).toBeInTheDocument();
    expect(screen.getByText('Gestión')).toBeInTheDocument();
    expect(screen.getByText('Configuración')).toBeInTheDocument();

    // Click Equipo
    fireEvent.click(screen.getByTestId('sidebar-team'));
    expect(onTeam).toHaveBeenCalledTimes(1);
  });

  it('enforces Solicitudes terminology (never Aprobaciones) in manager and employee navigation', () => {
    // Manager
    render(
      <I18nProvider>
        <AppShell
          role="OWNER"
          userName="Toni"
          activeSection="calendar"
          themeControl={null}
          languageControl={null}
          onApprovals={vi.fn()}
        >
          <h1>Content</h1>
        </AppShell>
      </I18nProvider>,
    );
    const managerApprovals = screen.getByTestId('sidebar-approvals');
    expect(managerApprovals).toHaveTextContent('Solicitudes');
    expect(managerApprovals).not.toHaveTextContent('Aprobaciones');
    cleanup();

    // Employee
    render(
      <I18nProvider>
        <AppShell
          role="EMPLOYEE"
          userName="Employee"
          activeSection="calendar"
          themeControl={null}
          languageControl={null}
          onRequests={vi.fn()}
        >
          <h1>Content</h1>
        </AppShell>
      </I18nProvider>,
    );
    const employeeRequests = screen.getByTestId('sidebar-requests');
    expect(employeeRequests).toHaveTextContent('Solicitudes');
    expect(employeeRequests).not.toHaveTextContent('Aprobaciones');
    expect(screen.queryByText('Gestión')).not.toBeInTheDocument();
    expect(screen.queryByText('Configuración')).not.toBeInTheDocument();
  });

  it('renders pending requests counter badge in sidebar and topbar for managers', () => {
    const onApprovals = vi.fn();
    render(
      <I18nProvider>
        <AppShell
          role="ADMIN"
          userName="Bob"
          activeSection="calendar"
          themeControl={null}
          languageControl={null}
          onApprovals={onApprovals}
          pendingRequestsCount={3}
        >
          <h1>Content</h1>
        </AppShell>
      </I18nProvider>,
    );

    // Sidebar badge
    const sidebarApprovals = screen.getByTestId('sidebar-approvals');
    expect(sidebarApprovals).toHaveTextContent('3');

    // Topbar counter button
    const topbarCounter = screen.getByTestId('topbar-pending-requests');
    expect(topbarCounter).toHaveTextContent('3');
    fireEvent.click(topbarCounter);
    expect(onApprovals).toHaveBeenCalledTimes(1);
  });
});

describe('CalendarToolbar', () => {
  it('renders the manual refresh button with accessible label and tooltip', () => {
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    const onRefresh = vi.fn();
    render(
      <I18nProvider>
        <CalendarToolbar
          year={2026}
          month={8}
          shiftCount={12}
          onNavigate={vi.fn()}
          onRefresh={onRefresh}
          isRefreshing={false}
        />
      </I18nProvider>,
    );

    const button = screen.getByTestId('calendar-refresh-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Actualizar calendario');
    expect(button).toHaveAttribute('title', 'Actualizar calendario');
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders the refresh button in English when English locale is active', () => {
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
    render(
      <I18nProvider>
        <CalendarToolbar
          year={2026}
          month={8}
          shiftCount={12}
          onNavigate={vi.fn()}
          onRefresh={vi.fn()}
          isRefreshing={false}
        />
      </I18nProvider>,
    );

    const button = screen.getByTestId('calendar-refresh-button');
    expect(button).toHaveAttribute('aria-label', 'Refresh calendar');
    expect(button).toHaveAttribute('title', 'Refresh calendar');
  });

  it('disables the refresh button and displays spinning icon while refreshing', () => {
    window.localStorage.setItem('anclora_shiftimport_locale_v1', 'es');
    render(
      <I18nProvider>
        <CalendarToolbar
          year={2026}
          month={8}
          shiftCount={12}
          onNavigate={vi.fn()}
          onRefresh={vi.fn()}
          isRefreshing={true}
        />
      </I18nProvider>,
    );

    const button = screen.getByTestId('calendar-refresh-button');
    expect(button).toBeDisabled();
    const icon = button.querySelector('.icon-spin');
    expect(icon).toBeInTheDocument();
  });
});

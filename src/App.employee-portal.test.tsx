// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from './lib/i18n-react';
import { ThemeProvider } from './lib/theme-react';
import { setupLocalStorageMock } from './test-utils/local-storage';
import App from './App';

setupLocalStorageMock();
afterEach(cleanup);

const employee = {
  id: 'employee-1',
  organizationId: 'org-1',
  externalEmployeeId: 'E-001',
  name: 'Ana Demo',
  userId: 'user-1',
  areaId: null,
  status: 'active',
};

function sessionFor(role: 'EMPLOYEE' | 'ADMIN') {
  return {
    user: { id: 'user-1', email: `${role.toLowerCase()}@example.com`, displayName: 'Demo User' },
    organizationId: 'org-1',
    role,
    employeeId: role === 'EMPLOYEE' ? 'employee-1' : null,
    memberships: [{ organizationId: 'org-1', organizationName: 'Hotel Aurora', role }],
  };
}

function renderAuthenticated(role: 'EMPLOYEE' | 'ADMIN') {
  const session = sessionFor(role);
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/session/me')) {
      return Promise.resolve(new Response(JSON.stringify(session), { status: 200 }));
    }
    if (url.includes('/api/employees')) {
      return Promise.resolve(new Response(JSON.stringify({ employees: [employee] }), { status: 200 }));
    }
    if (url.includes('/api/areas')) {
      return Promise.resolve(new Response(JSON.stringify({ areas: [] }), { status: 200 }));
    }
    if (url.includes('/api/me/shifts/today')) {
      return Promise.resolve(new Response(JSON.stringify({ shifts: [] }), { status: 200 }));
    }
    if (url.includes('/api/shifts')) {
      return Promise.resolve(new Response(JSON.stringify({ shifts: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  }));
  window.history.pushState({}, '', '/app');
  return render(
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('unified role-aware employee entry point', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('sends an authenticated EMPLOYEE to the shared application shell', async () => {
    renderAuthenticated('EMPLOYEE');

    await waitFor(() => expect(screen.getByTestId('app-shell')).toBeTruthy());
    expect(screen.getByTestId('app-shell-sidebar')).toBeTruthy();
    expect(screen.getByTestId('sidebar-calendar')).toBeTruthy();
    expect(screen.getByTestId('sidebar-self-import')).toBeTruthy();
    expect(screen.getByTestId('sidebar-historical-add')).toBeTruthy();
    expect(screen.getByTestId('sidebar-requests')).toBeTruthy();
    expect(screen.queryByTestId('sidebar-planner')).toBeNull();
    expect(screen.queryByTestId('sidebar-approvals')).toBeNull();
    expect(screen.queryByTestId('sidebar-members')).toBeNull();
    expect(screen.queryByTestId('employee-portal')).toBeNull();
    expect(screen.getByTestId('calendar-employee-readonly')).toHaveTextContent('Ana Demo');
  });

  it('keeps the existing dashboard for an authenticated ADMIN', async () => {
    renderAuthenticated('ADMIN');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar turnos' })).toBeTruthy());
    expect(screen.queryByTestId('employee-portal')).toBeNull();
  });
});

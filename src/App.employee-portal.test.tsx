// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

describe('R4-M00 employee entry point', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('sends an authenticated EMPLOYEE to the dedicated portal shell', async () => {
    renderAuthenticated('EMPLOYEE');

    await waitFor(() => expect(screen.getByTestId('employee-portal')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Importar' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Navegación del portal' })).toBeTruthy();
  });

  it('keeps the existing dashboard for an authenticated ADMIN', async () => {
    renderAuthenticated('ADMIN');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toBeTruthy());
    expect(screen.queryByTestId('employee-portal')).toBeNull();
  });
});

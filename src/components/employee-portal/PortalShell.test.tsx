// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { SessionInfo } from '../../lib/session';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { PortalShell } from './PortalShell';

setupLocalStorageMock();
afterEach(cleanup);

const session: SessionInfo = {
  user: { id: 'user-1', email: 'employee@example.com', displayName: 'Empleado Demo' },
  organizationId: 'org-1',
  role: 'EMPLOYEE',
  employeeId: 'employee-1',
  memberships: [{ organizationId: 'org-1', organizationName: 'Hotel Aurora', role: 'EMPLOYEE' }],
};

function renderPortal() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <PortalShell session={session} employeeName="Ana Demo" onLogout={vi.fn()} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('PortalShell', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('renders the employee landmarks and identity without content screens', () => {
    renderPortal();

    expect(screen.getByTestId('employee-portal')).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Tu espacio de turnos está listo' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navegación del portal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hotel Aurora' })).toBeTruthy();
    expect(screen.getByText('Ana Demo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  });

  it('uses the session identity fallback and exposes a keyboard-visible logout action', () => {
    const onLogout = vi.fn();
    render(
      <ThemeProvider>
        <I18nProvider>
          <PortalShell session={{ ...session, user: { ...session.user, displayName: '' } }} onLogout={onLogout} />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText('employee@example.com')).toBeTruthy();
    const logout = screen.getByRole('button', { name: 'Cerrar sesión' });
    logout.focus();
    expect(document.activeElement).toBe(logout);
    fireEvent.click(logout);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

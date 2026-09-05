// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { SessionInfo } from '../../lib/session';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { PortalShell } from './PortalShell';

vi.mock('../../lib/remote', () => ({
  loadRemoteTodayShifts: vi.fn().mockResolvedValue([{
    id: '11111111-1111-4111-8111-111111111111', date: '2026-09-05', startTime: '09:00', endTime: '17:00', location: 'Recepción', origin: 'IMP',
  }]),
  loadRemoteWeekShifts: vi.fn().mockResolvedValue({ weekStart: '2026-09-07', shifts: [] }),
  loadRemoteChangeRequests: vi.fn().mockResolvedValue([]),
  loadRemoteShiftDetail: vi.fn().mockResolvedValue({
    shift: { id: '11111111-1111-4111-8111-111111111111', date: '2026-09-05', startTime: '09:00', endTime: '17:00', location: 'Recepción', origin: 'IMP' },
    areaName: 'Recepción',
  }),
  loadRemoteShiftComments: vi.fn().mockResolvedValue([]),
  createRemoteShiftComment: vi.fn(),
  loadRemoteNotifications: vi.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
  markRemoteNotificationRead: vi.fn(),
}));

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
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navegación del portal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hotel Aurora' })).toBeTruthy();
    expect(screen.getByText('Ana Demo')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^(Hoy|Semana|Solicitudes|Más)$/ })).toHaveLength(4);
  });

  it('uses the session identity fallback and exposes a keyboard-visible logout action', async () => {
    const onLogout = vi.fn();
    render(
      <ThemeProvider>
        <I18nProvider>
          <PortalShell session={{ ...session, user: { ...session.user, displayName: '' } }} onLogout={onLogout} />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText('employee@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    const logout = await screen.findByRole('button', { name: 'Cerrar sesión' });
    logout.focus();
    expect(document.activeElement).toBe(logout);
    fireEvent.click(logout);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('exposes My Week through the shell without a page navigation', async () => {
    renderPortal();

    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
    await waitFor(() => expect(screen.getByTestId('my-week')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Semana' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByTestId('today-empty')).toBeNull();
  });

  it('opens shift detail from Today and restores focus when returning', async () => {
    renderPortal();
    const trigger = await screen.findByRole('button', { name: 'Turno de 09:00 a 17:00' });
    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Detalle del turno' })));
    expect(screen.getByTestId('shift-detail')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Volver al portal' }));
    await waitFor(() => expect(screen.getByTestId('today-shifts')).toBeTruthy());
    const restoredTrigger = document.querySelector(`[data-shift-id="${trigger.getAttribute('data-shift-id')}"]`);
    expect(document.activeElement).toBe(restoredTrigger);
  });

  it('exposes request status through the portal shell', async () => {
    renderPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Solicitudes' }));
    await waitFor(() => expect(screen.getByTestId('request-status')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Tus solicitudes' })).toBeTruthy();
  });

  it('keeps exactly four navigation sections and marks More active', async () => {
    renderPortal();
    const navigation = screen.getByTestId('employee-portal-nav');
    expect(navigation.querySelectorAll('button')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    await waitFor(() => expect(screen.getByTestId('employee-more')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Más' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: 'Más opciones' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cambiar tema\. Actual:/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar idioma. Actual: ES' })).toBeTruthy();
  });
});

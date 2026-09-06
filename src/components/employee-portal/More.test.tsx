// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { More } from './More';

afterEach(cleanup);

const session = {
  user: { id: 'user-1', email: 'employee@example.com', displayName: 'Empleado Demo' },
  organizationId: 'org-1',
  role: 'EMPLOYEE' as const,
  employeeId: 'employee-1',
  memberships: [{ organizationId: 'org-1', organizationName: 'Hotel Aurora', role: 'EMPLOYEE' as const }],
};

function renderMore() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <More
          session={session}
          identity="Ana Demo"
          organizationName="Hotel Aurora"
          notificationsController={{ notifications: [], unreadCount: 0, loading: false, error: false, reload: vi.fn(), markRead: vi.fn() }}
          onOpenShift={vi.fn()}
          onOpenSelfImport={vi.fn()}
          onOpenHistoricalAdd={vi.fn()}
          onLogout={vi.fn()}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('More', () => {
  it('exposes self import and historical add without management actions', () => {
    renderMore();
    expect(screen.getByRole('button', { name: 'Importar mis turnos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Añadir turno pasado' })).toBeTruthy();
    expect(screen.queryByText('Planificar')).toBeNull();
    expect(screen.queryByText('Aprobaciones')).toBeNull();
  });

  it('routes both self-service actions through their callbacks', () => {
    const onOpenSelfImport = vi.fn();
    const onOpenHistoricalAdd = vi.fn();
    render(
      <ThemeProvider>
        <I18nProvider>
          <More
            session={session}
            identity="Ana Demo"
            organizationName="Hotel Aurora"
            notificationsController={{ notifications: [], unreadCount: 0, loading: false, error: false, reload: vi.fn(), markRead: vi.fn() }}
            onOpenShift={vi.fn()}
            onOpenSelfImport={onOpenSelfImport}
            onOpenHistoricalAdd={onOpenHistoricalAdd}
            onLogout={vi.fn()}
          />
        </I18nProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Importar mis turnos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir turno pasado' }));
    expect(onOpenSelfImport).toHaveBeenCalledTimes(1);
    expect(onOpenHistoricalAdd).toHaveBeenCalledTimes(1);
  });
});

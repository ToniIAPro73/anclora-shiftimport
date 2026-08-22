// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { MonthHeader } from './MonthHeader';
import { SessionInfo } from '../../lib/session';
import { RemoteEmployee } from '../../lib/remote';

setupLocalStorageMock();
afterEach(cleanup);

function renderHeader(overrides?: { session?: SessionInfo | null; employees?: RemoteEmployee[] }) {
  const defaultSession: SessionInfo = {
    user: { id: 'user-1', email: 'test@test.com', displayName: 'Test User' },
    organizationId: 'org-1',
    role: 'ADMIN',
    employeeId: 'emp-1',
    memberships: [{ organizationId: 'org-1', organizationName: 'Test Org', role: 'ADMIN' }],
  };
  const defaultEmployees: RemoteEmployee[] = [
    { id: 'emp-1', organizationId: 'org-1', externalEmployeeId: '1001', name: 'Test Employee', userId: 'user-1', status: 'active' },
  ];

  return render(
    <ThemeProvider>
      <I18nProvider>
        <MonthHeader
          year={2026}
          month={0}
          onNavigate={() => {}}
          onAddShift={() => {}}
          onImport={() => {}}
          onOpenSettings={() => {}}
          session={overrides?.session ?? defaultSession}
          employees={overrides?.employees ?? defaultEmployees}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('MonthHeader language toggle', () => {
  it('shows a compact SVG flag + ES text label, not a redundant country-code label', () => {
    renderHeader();
    const toggle = screen.getByRole('button', { name: /Cambiar idioma/i });
    // Text label is exactly "ES" — the flag is a decorative SVG, not text.
    expect(toggle.textContent).toBe('ES');
    const flag = toggle.querySelector('svg');
    expect(flag).toBeTruthy();
    expect(flag?.getAttribute('aria-hidden')).toBe('true');
  });

  it('toggles the locale on click, swaps the flag, and updates month names', () => {
    renderHeader();
    expect(screen.getByText('Enero 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cambiar idioma/i }));
    expect(screen.getByText('January 2026')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Change language/i });
    expect(toggle.textContent).toBe('EN');
    expect(toggle.querySelector('svg')).toBeTruthy();
  });

  it('toggling the language does not touch the theme toggle state', () => {
    renderHeader();
    const themeToggle = screen.getByRole('button', { name: /Cambiar tema/i });
    const themeEmojiBefore = themeToggle.textContent;
    fireEvent.click(screen.getByRole('button', { name: /Cambiar idioma/i }));
    expect(screen.getByRole('button', { name: /Change theme/i }).textContent).toBe(themeEmojiBefore);
  });

  it('shows identity from employee when available', () => {
    renderHeader();
    expect(screen.getByText('Test Employee')).toBeTruthy();
    expect(screen.getByText(/Test Org/)).toBeTruthy();
  });

  it('falls back to user displayName when no employee', () => {
    const session: SessionInfo = {
      user: { id: 'user-1', email: 'test@test.com', displayName: 'Fallback User' },
      organizationId: 'org-1',
      role: 'ADMIN',
      employeeId: null,
      memberships: [{ organizationId: 'org-1', organizationName: 'Test Org', role: 'ADMIN' }],
    };
    renderHeader({ session, employees: [] });
    expect(screen.getByText('Fallback User')).toBeTruthy();
  });
});
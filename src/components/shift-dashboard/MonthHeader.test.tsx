// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { MonthHeader } from './MonthHeader';

setupLocalStorageMock();
afterEach(cleanup);

function renderHeader(onToggleTheme = vi.fn()) {
  return render(
    <I18nProvider>
      <MonthHeader
        year={2026}
        month={0}
        onNavigate={() => {}}
        onAddShift={() => {}}
        onImport={() => {}}
        onOpenSettings={() => {}}
        themeMode="dark"
        onToggleTheme={onToggleTheme}
      />
    </I18nProvider>,
  );
}

describe('MonthHeader language toggle', () => {
  it('shows a compact flag + ES/EN control, not a redundant label', () => {
    renderHeader();
    const toggle = screen.getByRole('button', { name: /Cambiar idioma/i });
    expect(toggle.textContent).toBe('🇪🇸ES');
  });

  it('toggles the locale on click and updates month names', () => {
    renderHeader();
    expect(screen.getByText('Enero 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cambiar idioma/i }));
    expect(screen.getByText('January 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Change language/i }).textContent).toBe('🇬🇧EN');
  });

  it('toggling the language does not touch the theme toggle state', () => {
    const onToggleTheme = vi.fn();
    renderHeader(onToggleTheme);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar idioma/i }));
    expect(onToggleTheme).not.toHaveBeenCalled();
  });
});

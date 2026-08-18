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
    const onToggleTheme = vi.fn();
    renderHeader(onToggleTheme);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar idioma/i }));
    expect(onToggleTheme).not.toHaveBeenCalled();
  });
});

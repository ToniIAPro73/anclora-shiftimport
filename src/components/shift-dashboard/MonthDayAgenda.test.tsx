// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { MonthGrid } from './MonthGrid';
import type { Shift } from '../../lib/types';

setupLocalStorageMock();

const shift = (id: string, date: string, over: Partial<Shift> = {}): Shift => ({
  id, date, startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true,
  location: '', origin: 'IMP', employeeId: 'e1', layer: 'CHANGE', effectiveState: 'EFFECTIVE', ...over,
} as Shift);

function mockMatchMedia(compact: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: compact && query.includes('max-width: 640px'),
    media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

function renderGrid(compact: boolean, extra: { onCreateShift?: (d: string) => void; onEditShift?: (id: string) => void } = {}) {
  mockMatchMedia(compact);
  localStorage.removeItem('anclora_shiftimport_locale_v1');
  return render(
    <I18nProvider>
      <MonthGrid
        year={2026} month={7}
        shifts={[shift('a', '2026-08-03'), shift('b', '2026-08-03', { startTime: '', endTime: '', shiftType: 'Libre', countsAsWork: false }), shift('c', '2026-08-04')]}
        onEditShift={extra.onEditShift ?? vi.fn()} onCreateShift={extra.onCreateShift ?? vi.fn()} role="OWNER"
      />
    </I18nProvider>,
  );
}

describe('compact month (≤640px) — F1-M03', () => {
  beforeEach(() => mockMatchMedia(false));
  afterEach(cleanup);

  it('desktop keeps the full grid and renders no day panel', () => {
    renderGrid(false);
    expect(screen.queryByTestId('month-day-agenda')).toBeNull();
    expect(screen.queryByTestId('month-day-select-2026-08-03')).toBeNull();
  });

  it('shows a day panel and lets a tap on the day select it', () => {
    renderGrid(true);
    const agenda = screen.getByTestId('month-day-agenda');
    expect(agenda).toHaveAttribute('data-date', '2026-08-01'); // month has no "today": falls back to day 1
    expect(within(agenda).getByText('Sin turnos este día.')).toBeInTheDocument();

    const select = screen.getByTestId('month-day-select-2026-08-03');
    expect(select).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(select);
    expect(select).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('month-day-agenda')).toHaveAttribute('data-date', '2026-08-03');
    expect(within(screen.getByTestId('month-day-agenda')).getAllByRole('button').length).toBeGreaterThanOrEqual(4);
    expect(within(screen.getByTestId('month-day-agenda')).getByText(/05:00–13:00/)).toBeInTheDocument();
  });

  it('chips keep the full accessible name while the visible text is short', () => {
    renderGrid(true);
    const chips = screen.getAllByRole('button', { name: /Regular 05:00–13:00/ });
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0].querySelector('.month-shift-badge__short')).toBeInTheDocument();
  });

  it('the panel add button follows the same policy and creates for the selected day', () => {
    const onCreateShift = vi.fn();
    renderGrid(true, { onCreateShift });
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-04'));
    fireEvent.click(screen.getByTestId('month-day-agenda-add'));
    expect(onCreateShift).toHaveBeenCalledWith('2026-08-04');
  });

  it('a tap on a chip selects the day instead of editing it', () => {
    const onEditShift = vi.fn();
    renderGrid(true, { onEditShift });
    fireEvent.click(screen.getAllByRole('button', { name: /Regular 05:00–13:00/ })[0]);
    expect(onEditShift).not.toHaveBeenCalled();
    expect(screen.getByTestId('month-day-agenda')).toHaveAttribute('data-date', '2026-08-03');
  });
});

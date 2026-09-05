// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { Shift } from '../../lib/types';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { loadRemoteWeekShifts } from '../../lib/remote';
import { addWeeks, fromISODate, getWeekDaysISO, getWeekStartMonday, toISODate } from '../../lib/week';
import { MyWeek } from './MyWeek';

vi.mock('../../lib/remote', () => ({ loadRemoteWeekShifts: vi.fn() }));

setupLocalStorageMock();
afterEach(() => {
  cleanup();
});

const mockedLoadWeek = vi.mocked(loadRemoteWeekShifts);
const currentWeekStart = () => toISODate(getWeekStartMonday(new Date()));

function renderWeek() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MyWeek />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('MyWeek', () => {
  beforeEach(() => {
    mockedLoadWeek.mockReset();
  });

  it('renders seven days, a shift and explicit free days', async () => {
    const weekStart = currentWeekStart();
    const shift: Shift = {
      id: 'shift-week', date: getWeekDaysISO(weekStart)[2], startTime: '09:00', endTime: '17:00', location: 'Recepción', origin: 'IMP',
    };
    mockedLoadWeek.mockResolvedValue({ weekStart: '2026-09-07', shifts: [shift] });
    renderWeek();
    await waitFor(() => expect(screen.getByTestId('my-week')).toBeTruthy());
    expect(screen.getByText(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).format(fromISODate(shift.date)))).toBeTruthy();
    expect(screen.getByText('09:00 — 17:00')).toBeTruthy();
    expect(screen.getByText('Recepción')).toBeTruthy();
    expect(screen.getAllByText('Libre')).toHaveLength(6);
    expect(screen.getByText('Hoy')).toBeTruthy();
  });

  it('navigates without a page reload and keeps the selected week in the request', async () => {
    const weekStart = currentWeekStart();
    mockedLoadWeek.mockResolvedValue({ weekStart: '2026-09-07', shifts: [] });
    renderWeek();
    await waitFor(() => expect(mockedLoadWeek).toHaveBeenCalledWith(weekStart));
    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await waitFor(() => expect(mockedLoadWeek).toHaveBeenCalledWith(addWeeks(weekStart, 1)));
    const nextStartLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(fromISODate(addWeeks(weekStart, 1)));
    expect(screen.getByText((content) => content.includes(nextStartLabel))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await waitFor(() => expect(mockedLoadWeek).toHaveBeenCalledTimes(3));
    expect(mockedLoadWeek).toHaveBeenLastCalledWith(weekStart);
  });

  it('shows an error and retries the currently selected week', async () => {
    const weekStart = currentWeekStart();
    mockedLoadWeek.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ weekStart: '2026-09-07', shifts: [] });
    renderWeek();
    await waitFor(() => expect(screen.getByTestId('my-week-error')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getAllByText('Libre').length).toBeGreaterThan(0));
    expect(mockedLoadWeek).toHaveBeenLastCalledWith(weekStart);
  });
});

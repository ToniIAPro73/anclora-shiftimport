// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { Shift } from '../../lib/types';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { Today } from './Today';
import { loadRemoteTodayShifts } from '../../lib/remote';

vi.mock('../../lib/remote', () => ({ loadRemoteTodayShifts: vi.fn() }));

setupLocalStorageMock();
afterEach(cleanup);

const mockedLoadToday = vi.mocked(loadRemoteTodayShifts);
const shift: Shift = {
  id: 'shift-1', date: '2026-09-05', startTime: '09:00', endTime: '17:00', location: 'Recepción', origin: 'IMP',
};

function renderToday() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <Today />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('Today', () => {
  beforeEach(() => {
    mockedLoadToday.mockReset();
  });

  it('shows a loading state while the today endpoint is pending', () => {
    mockedLoadToday.mockReturnValue(new Promise(() => {}));
    renderToday();
    expect(screen.getByTestId('today-loading')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cargando tu turno…' })).toBeTruthy();
  });

  it('renders every shift returned for today', async () => {
    mockedLoadToday.mockResolvedValue([shift]);
    renderToday();
    await waitFor(() => expect(screen.getByTestId('today-shifts')).toBeTruthy());
    expect(screen.getByText('Publicado')).toBeTruthy();
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('17:00')).toBeTruthy();
    expect(screen.getByText('Recepción')).toBeTruthy();
  });

  it('renders the explicit empty state', async () => {
    mockedLoadToday.mockResolvedValue([]);
    renderToday();
    await waitFor(() => expect(screen.getByTestId('today-empty')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Sin turno hoy' })).toBeTruthy();
  });

  it('renders an error and retries the same endpoint', async () => {
    mockedLoadToday.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([shift]);
    renderToday();
    await waitFor(() => expect(screen.getByTestId('today-error')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByTestId('today-shifts')).toBeTruthy());
    expect(mockedLoadToday).toHaveBeenCalledTimes(2);
  });
});

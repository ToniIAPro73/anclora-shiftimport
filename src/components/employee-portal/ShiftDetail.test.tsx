// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { loadRemoteShiftDetail } from '../../lib/remote';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { ShiftDetail } from './ShiftDetail';

vi.mock('../../lib/remote', () => ({ loadRemoteShiftDetail: vi.fn() }));

setupLocalStorageMock();
afterEach(cleanup);

const mockedLoadDetail = vi.mocked(loadRemoteShiftDetail);
const shift = {
  id: '11111111-1111-4111-8111-111111111111',
  date: '2026-09-05',
  startTime: '09:00',
  endTime: '17:00',
  location: 'Recepción',
  origin: 'IMP' as const,
};

function renderDetail(onBack = vi.fn()) {
  return { onBack, ...render(
    <ThemeProvider>
      <I18nProvider>
        <ShiftDetail shiftId={shift.id} onBack={onBack} />
      </I18nProvider>
    </ThemeProvider>,
  ) };
}

describe('ShiftDetail', () => {
  beforeEach(() => mockedLoadDetail.mockReset());

  it('renders the published shift facts and disabled future actions', async () => {
    mockedLoadDetail.mockResolvedValue({ shift, areaName: 'Recepción' });
    renderDetail();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Detalle del turno' })).toBeTruthy());

    expect(screen.getByText('Publicado')).toBeTruthy();
    expect(screen.getByText('2026-09-05')).toBeTruthy();
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('17:00')).toBeTruthy();
    expect(screen.getAllByText('Recepción').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Confirmar recepción' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Añadir comentario' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Solicitar cambio' })).toHaveProperty('disabled', true);
  });

  it('moves focus to the detail heading and supports retry/back from an error', async () => {
    const onBack = vi.fn();
    mockedLoadDetail.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ shift, areaName: null });
    renderDetail(onBack);
    await waitFor(() => expect(screen.getByTestId('shift-detail-error')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Detalle del turno' })));
    expect(screen.getByText('Sin área')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al portal' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('exposes a focusable heading for keyboard entry', async () => {
    mockedLoadDetail.mockResolvedValue({ shift, areaName: null });
    renderDetail();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Detalle del turno' }).getAttribute('tabindex')).toBe('-1'));
  });
});

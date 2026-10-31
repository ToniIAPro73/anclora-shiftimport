// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { ApiError } from '../../lib/session';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { cancelRemoteTimeOffRequest, loadRemoteTimeOffRequests, TimeOffRequest } from '../../lib/remote';
import { TimeOffRequests } from './TimeOffRequests';

vi.mock('../../lib/remote', () => ({
  loadRemoteTimeOffRequests: vi.fn(),
  cancelRemoteTimeOffRequest: vi.fn(),
  createRemoteTimeOffRequest: vi.fn(),
  loadRemoteTimeOffImpact: vi.fn().mockResolvedValue({ publishedShifts: 0, draftAssignments: 0, overlapsOwn: [] }),
}));

setupLocalStorageMock();
afterEach(cleanup);

const load = vi.mocked(loadRemoteTimeOffRequests);
const cancel = vi.mocked(cancelRemoteTimeOffRequest);

const request = (patch: Partial<TimeOffRequest> = {}): TimeOffRequest => ({
  id: 'r1', requestType: 'VACATION', startDate: '2026-11-10', endDate: '2026-11-14', requestedDays: 5, comment: 'Verano',
  status: 'PENDING', createdAt: '2026-11-02T10:00:00.000Z', resolvedAt: null, resolvedByName: null, rejectionReason: null,
  history: [{ type: 'CREATED', at: '2026-11-02T10:00:00.000Z' }], ...patch,
});
const summary = { approvedDaysInYear: 0, pendingDays: 5, activeCount: 1 };

function renderSection() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <TimeOffRequests />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('TimeOffRequests (Mis solicitudes de vacaciones)', () => {
  beforeEach(() => {
    load.mockReset();
    cancel.mockReset();
  });

  it('renders nothing at all when the server answers 404 (server flag off)', async () => {
    load.mockRejectedValue(new ApiError(404, 'Not found'));
    renderSection();
    await waitFor(() => expect(load).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('time-off-section')).toBeNull());
  });

  it('lists the requests with status as text, dates, days, comment, summary and the history', async () => {
    load.mockResolvedValue({ requests: [request(), request({ id: 'r2', status: 'REJECTED', rejectionReason: 'Hay cobertura mínima', startDate: '2026-12-01', endDate: '2026-12-02', requestedDays: 2, comment: '' })], summary });
    renderSection();
    expect(await screen.findAllByTestId('time-off-item')).toHaveLength(2);
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.getByText('Rechazada')).toBeTruthy();
    expect(screen.getByText('Verano')).toBeTruthy();
    expect(screen.getByText('Motivo del rechazo: Hay cobertura mínima')).toBeTruthy();
    expect(screen.getByTestId('time-off-summary').textContent).toContain('Días pendientes5');
    expect(screen.getAllByText('Historial').length).toBe(2);
  });

  it('shows the really applied range of an approved request (OD-08), never silently', async () => {
    load.mockResolvedValue({
      requests: [request({ status: 'APPROVED', appliedStartDate: '2026-11-12', appliedDays: 3, skippedPastDays: 2, history: [{ type: 'CREATED', at: '2026-11-02T10:00:00.000Z' }, { type: 'APPROVED', at: '2026-11-12T08:00:00.000Z', byName: 'Ana' }] })],
      summary: { approvedDaysInYear: 3, pendingDays: 0, activeCount: 1 },
    });
    renderSection();
    const applied = await screen.findByTestId('time-off-applied');
    expect(applied.textContent).toContain('Aplicados 3 de 5 días');
    expect(applied.textContent).toContain('Los 2 días anteriores a la aprobación no se modifican.');
    expect(screen.queryByTestId('time-off-cancel')).toBeNull(); // APPROVED is terminal: no cancel
  });

  it('empty year: truthful copy', async () => {
    load.mockResolvedValue({ requests: [], summary: { approvedDaysInYear: 0, pendingDays: 0, activeCount: 0 } });
    renderSection();
    expect(await screen.findByTestId('time-off-empty')).toBeTruthy();
  });

  it('a load failure is a role=alert with retry', async () => {
    load.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue({ requests: [], summary });
    renderSection();
    const error = await screen.findByTestId('time-off-list-error');
    expect(error.getAttribute('role')).toBe('alert');
    fireEvent.click(screen.getByText('Reintentar'));
    await waitFor(() => expect(screen.queryByTestId('time-off-list-error')).toBeNull());
  });

  it('cancels only PENDING requests and reports it', async () => {
    load.mockResolvedValue({ requests: [request()], summary });
    cancel.mockResolvedValue(request({ status: 'CANCELLED' }));
    renderSection();
    fireEvent.click(await screen.findByTestId('time-off-cancel'));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('r1'));
    expect((await screen.findByTestId('time-off-feedback')).textContent).toBe('Solicitud cancelada.');
  });

  it('a cancel on a request that is no longer pending says so and refreshes', async () => {
    load.mockResolvedValue({ requests: [request()], summary });
    cancel.mockRejectedValue(new ApiError(409, 'x', 'TIME_OFF_NOT_PENDING'));
    renderSection();
    fireEvent.click(await screen.findByTestId('time-off-cancel'));
    const feedback = await screen.findByTestId('time-off-feedback');
    expect(feedback.textContent).toBe('Esa solicitud ya no está pendiente.');
    expect(feedback.getAttribute('role')).toBe('alert');
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(1));
  });

  it('the year selector reloads for that year', async () => {
    load.mockResolvedValue({ requests: [], summary });
    renderSection();
    await screen.findByTestId('time-off-empty');
    const next = Number(new Date().getFullYear()) + 1;
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: String(next) } });
    await waitFor(() => expect(load).toHaveBeenLastCalledWith({ year: next }));
  });

  it('opens and closes the request form', async () => {
    load.mockResolvedValue({ requests: [], summary });
    renderSection();
    fireEvent.click(await screen.findByTestId('time-off-new'));
    expect(screen.getByTestId('time-off-form')).toBeTruthy();
    expect(screen.queryByTestId('time-off-new')).toBeNull();
    fireEvent.click(screen.getByLabelText('Cerrar formulario'));
    expect(screen.queryByTestId('time-off-form')).toBeNull();
  });
});

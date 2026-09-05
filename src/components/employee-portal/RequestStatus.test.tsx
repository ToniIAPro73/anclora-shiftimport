// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ChangeRequest, loadRemoteChangeRequests } from '../../lib/remote';
import { ThemeProvider } from '../../lib/theme-react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { RequestStatus } from './RequestStatus';

vi.mock('../../lib/remote', () => ({
  loadRemoteChangeRequests: vi.fn(),
}));

setupLocalStorageMock();
afterEach(cleanup);

const mockedLoad = vi.mocked(loadRemoteChangeRequests);
const shiftId = '11111111-1111-4111-8111-111111111111';

function request(status: ChangeRequest['status'], id: string, rejectionReason?: string): ChangeRequest {
  return {
    id,
    shiftId,
    employeeId: 'employee-1',
    organizationId: 'org-1',
    requestType: status === 'REJECTED' ? 'OTHER' : 'TIME_CHANGE',
    reason: `Motivo ${status}`,
    status,
    createdAt: '2026-09-05T10:00:00.000Z',
    resolvedAt: status === 'PENDING' ? null : '2026-09-05T11:00:00.000Z',
    resolvedByUserId: null,
    rejectionReason: rejectionReason ?? null,
    shiftDate: '2026-09-08',
    shiftStartTime: '09:00',
    shiftEndTime: '17:00',
    shiftLocation: 'Recepción',
  };
}

function renderStatus(onSelectShift = vi.fn()) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <RequestStatus onSelectShift={onSelectShift} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('RequestStatus', () => {
  beforeEach(() => {
    mockedLoad.mockReset();
  });

  it('renders all statuses as text and filters the list without changing data', async () => {
    mockedLoad.mockResolvedValue([
      request('PENDING', 'request-pending'),
      request('APPROVED', 'request-approved'),
      request('REJECTED', 'request-rejected'),
      request('CANCELLED', 'request-cancelled'),
    ]);
    renderStatus();

    await waitFor(() => expect(screen.getByText('Motivo PENDING')).toBeTruthy());
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Aprobada').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Rechazada').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Cancelada').length).toBeGreaterThan(1);

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'REJECTED' } });
    expect(screen.getByText('Motivo REJECTED')).toBeTruthy();
    expect(screen.queryByText('Motivo PENDING')).toBeNull();
  });

  it('opens the associated shift detail and exposes empty and error states', async () => {
    const onSelectShift = vi.fn();
    mockedLoad.mockResolvedValue([request('PENDING', 'request-pending')]);
    renderStatus(onSelectShift);
    await waitFor(() => expect(screen.getByRole('button', { name: /Ver turno asociado/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Ver turno asociado/ }));
    expect(onSelectShift).toHaveBeenCalledWith(shiftId);

    cleanup();
    mockedLoad.mockResolvedValue([]);
    renderStatus();
    await waitFor(() => expect(screen.getByTestId('request-status-empty')).toBeTruthy());

    cleanup();
    mockedLoad.mockRejectedValue(new Error('offline'));
    renderStatus();
    await waitFor(() => expect(screen.getByTestId('request-status-error')).toBeTruthy());
  });

  it('shows the approver reason for rejected requests', async () => {
    mockedLoad.mockResolvedValue([request('REJECTED', 'request-rejected', 'Falta cobertura en el turno.')]);
    renderStatus();
    await waitFor(() => expect(screen.getByText('Falta cobertura en el turno.')).toBeTruthy());
    expect(screen.getByText('Motivo del rechazo')).toBeTruthy();
  });
});

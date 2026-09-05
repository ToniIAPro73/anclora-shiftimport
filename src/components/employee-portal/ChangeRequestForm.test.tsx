// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ChangeRequest, cancelRemoteChangeRequest, createRemoteChangeRequest, loadRemoteChangeRequests } from '../../lib/remote';
import { ThemeProvider } from '../../lib/theme-react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { ChangeRequestForm } from './ChangeRequestForm';

vi.mock('../../lib/remote', () => ({
  cancelRemoteChangeRequest: vi.fn(),
  createRemoteChangeRequest: vi.fn(),
  loadRemoteChangeRequests: vi.fn(),
}));

setupLocalStorageMock();
afterEach(cleanup);

const mockedCancel = vi.mocked(cancelRemoteChangeRequest);
const mockedCreate = vi.mocked(createRemoteChangeRequest);
const mockedLoad = vi.mocked(loadRemoteChangeRequests);
const shiftId = '11111111-1111-4111-8111-111111111111';

function request(status: ChangeRequest['status'] = 'PENDING'): ChangeRequest {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    shiftId,
    employeeId: 'employee-1',
    organizationId: 'org-1',
    requestType: 'TIME_CHANGE',
    reason: 'Necesito cambiar la hora de entrada.',
    status,
    createdAt: '2026-09-05T10:00:00.000Z',
    resolvedAt: status === 'CANCELLED' ? '2026-09-05T10:05:00.000Z' : null,
    resolvedByUserId: null,
  };
}

function renderForm() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <ChangeRequestForm shiftId={shiftId} shiftStartTime="09:00" shiftEndTime="17:00" />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('ChangeRequestForm', () => {
  beforeEach(() => {
    mockedCancel.mockReset();
    mockedCreate.mockReset();
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValue([]);
  });

  it('validates the reason locally and does not send whitespace', async () => {
    renderForm();
    const reason = screen.getByLabelText('Motivo');
    fireEvent.change(reason, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(await screen.findByText('Escribe el motivo antes de enviar la solicitud.')).toBeTruthy();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('creates a pending request, clears the draft and allows cancelling it', async () => {
    mockedCreate.mockResolvedValue(request());
    mockedCancel.mockResolvedValue(request('CANCELLED'));
    renderForm();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: '  Necesito cambiar la hora de entrada.  ' } });
    fireEvent.change(screen.getByLabelText('Tipo de solicitud'), { target: { value: 'TIME_CHANGE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(screen.getByText('Solicitud enviada. Queda pendiente de revisión.')).toBeTruthy());
    expect(mockedCreate).toHaveBeenCalledWith(shiftId, 'TIME_CHANGE', 'Necesito cambiar la hora de entrada.', '09:00', '17:00');
    expect(screen.getByLabelText('Motivo')).toHaveProperty('value', '');
    expect(screen.getByRole('button', { name: 'Cancelar solicitud' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }));
    await waitFor(() => expect(screen.getByText('Solicitud cancelada.')).toBeTruthy());
    expect(mockedCancel).toHaveBeenCalledWith(request().id);
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).toBeNull();
  });

  it('keeps the reason when the server rejects creation', async () => {
    mockedCreate.mockRejectedValue(new Error('offline'));
    renderForm();
    const reason = screen.getByLabelText('Motivo');
    fireEvent.change(reason, { target: { value: 'No puedo cubrir este horario.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(screen.getByText('No se pudo enviar la solicitud. El texto se ha conservado.')).toBeTruthy());
    expect(reason).toHaveProperty('value', 'No puedo cubrir este horario.');
  });

  it('rehydrates an existing request when opening the associated shift', async () => {
    mockedLoad.mockResolvedValue([request()]);
    renderForm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar solicitud' })).toBeTruthy());
    expect(screen.getByText('Necesito cambiar la hora de entrada.')).toBeTruthy();
  });
});

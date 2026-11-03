// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { ApprovalInbox } from './ApprovalInbox';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return { ...actual, listRemoteApprovals: vi.fn(), bulkApproveRemoteApprovals: vi.fn(), approveRemoteApprovalRequest: vi.fn(), rejectRemoteApprovalRequest: vi.fn() };
});

const mockedList = vi.mocked(remote.listRemoteApprovals);
const mockedBulk = vi.mocked(remote.bulkApproveRemoteApprovals);
const page = (requests: remote.ApprovalItem[], nextCursor: string | null = null) => ({ requests, nextCursor });
const mockedApprove = vi.mocked(remote.approveRemoteApprovalRequest);
const mockedReject = vi.mocked(remote.rejectRemoteApprovalRequest);

const request: remote.ShiftChangeApprovalItem = {
  kind: 'SHIFT_CHANGE',
  id: 'approval-1',
  organizationId: 'org-1',
  changeRequestId: 'change-1',
  status: 'PENDING',
  policySnapshot: 'ORGANIZATION_ADMIN',
  createdAt: '2026-09-05T10:00:00.000Z',
  requestType: 'TIME_CHANGE',
  reason: 'Necesito cambiar la hora de entrada.',
  employeeId: 'employee-1',
  employeeName: 'Ana López',
  areaId: 'area-1',
  areaName: 'Recepción',
  shiftId: 'shift-1',
  shiftDate: '2026-09-08',
  shiftStartTime: '09:00',
  shiftEndTime: '17:00',
  shiftLocation: 'Hotel Aurora',
};

function renderInbox(currentEmployeeId?: string | null, props: Partial<React.ComponentProps<typeof ApprovalInbox>> = {}) {
  return render(
    <I18nProvider>
      <ApprovalInbox currentEmployeeId={currentEmployeeId} {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApprove.mockResolvedValue(undefined);
  mockedReject.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('ApprovalInbox', () => {
  it('shows the loading and empty states', async () => {
    mockedList.mockResolvedValue(page([]));
    renderInbox();
    expect(screen.getByTestId('approval-inbox-loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('approval-inbox-empty')).toBeTruthy());
    expect(screen.getByText('No tienes solicitudes pendientes')).toBeTruthy();
    expect(screen.getByLabelText('0 pendientes')).toBeTruthy();
  });

  it('renders pending request details and count', async () => {
    mockedList.mockResolvedValue(page([request]));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    expect(screen.getByText('Necesito cambiar la hora de entrada.')).toBeTruthy();
    expect(screen.getByText('Recepción')).toBeTruthy();
    expect(screen.getByLabelText('1 pendiente')).toBeTruthy();
  });

  it('approves a request and removes it after the server confirms', async () => {
    mockedList.mockResolvedValue(page([request]));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(mockedApprove).toHaveBeenCalledWith('approval-1'));
    await waitFor(() => expect(screen.getByTestId('approval-inbox-empty')).toBeTruthy());
  });

  it('refreshes and explains a 409 conflict instead of hiding the request optimistically', async () => {
    mockedList.mockResolvedValue(page([request]));
    mockedApprove.mockRejectedValueOnce(Object.assign(new Error('conflict'), {
      status: 409,
      details: { by: 'Carlos Admin', at: '2026-09-05T12:30:00.000Z' },
    }));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Carlos Admin'));
    expect(screen.getByRole('alert').textContent).toContain('2026-09-05T12:30:00.000Z');
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('shows an error and retries the request', async () => {
    mockedList.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(page([request]));
    renderInbox();
    await waitFor(() => expect(screen.getByTestId('approval-inbox-error')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('requires a rejection reason and removes the request after server confirmation', async () => {
    mockedList.mockResolvedValue(page([request]));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect((screen.getByRole('button', { name: 'Confirmar rechazo' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'No hay cobertura.' } });
    expect((screen.getByRole('button', { name: 'Confirmar rechazo' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    await waitFor(() => expect(mockedReject).toHaveBeenCalledWith('approval-1', 'No hay cobertura.'));
    await waitFor(() => expect(screen.getByTestId('approval-inbox-empty')).toBeTruthy());
  });

  it('enforces anti-self-approval rule in UI with warning banner and disabled buttons', async () => {
    mockedList.mockResolvedValue(page([request]));
    renderInbox('employee-1');
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());

    // Check warning banner
    const warning = screen.getByTestId('self-approval-warning-approval-1');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent('No puedes aprobar o rechazar tus propias solicitudes');

    // Buttons should be disabled
    const approveBtn = screen.getByTestId('approve-btn-approval-1');
    const rejectBtn = screen.getByTestId('reject-btn-approval-1');
    expect(approveBtn).toBeDisabled();
    expect(rejectBtn).toBeDisabled();
  });

  it('displays anti-self-approval message when server returns 403 self_approval_forbidden on approve', async () => {
    mockedList.mockResolvedValue(page([request]));
    mockedApprove.mockRejectedValueOnce(Object.assign(new Error('You cannot approve your own request'), {
      status: 403,
      code: 'self_approval_forbidden',
    }));
    renderInbox('other-employee');
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No puedes aprobar o rechazar tus propias solicitudes');
    });
  });

  it('displays anti-self-approval message when server returns 403 self_approval_forbidden on reject', async () => {
    mockedList.mockResolvedValue(page([request]));
    mockedReject.mockRejectedValueOnce(Object.assign(new Error('You cannot reject your own request'), {
      status: 403,
      code: 'self_approval_forbidden',
    }));
    renderInbox('other-employee');
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'Denegado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No puedes aprobar o rechazar tus propias solicitudes');
    });
  });
});

const timeOff = (over: Partial<remote.TimeOffApprovalItem> = {}): remote.TimeOffApprovalItem => ({
  kind: 'TIME_OFF', id: 'to-1', timeOffRequestId: 'tor-1', employeeId: 'employee-2', employeeName: 'Marta Ruiz', areaId: 'area-1', areaName: 'Recepción',
  requestType: 'VACATION', startDate: '2026-12-10', endDate: '2026-12-14', requestedDays: 5, comment: 'Navidad', status: 'PENDING',
  createdAt: '2026-11-02T10:00:00.000Z', resolvedAt: null, sortAt: '2026-11-02T10:00:00.000Z', resolvedByName: null, rejectionReason: null,
  overlapping: [], affectedShifts: { published: 3, draft: 1 }, alreadyStarted: false, effectiveStartDate: '2026-12-10', materializableDays: 5,
  skippedPastDays: 0, canDecide: true, cannotDecideReason: null, ...over,
});

describe('ApprovalInbox — unified feed (F4-M02)', () => {
  beforeEach(() => { vi.stubEnv('VITE_TIME_OFF_ENABLED', 'true'); });

  it('asks for the unified feed with kind and status, and tells vacations from shift changes', async () => {
    mockedList.mockResolvedValue(page([request, timeOff()]));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ALL', status: 'PENDING' }));
    expect(screen.getByText('Cambio de horario')).toBeTruthy();
    expect(screen.getAllByText('Vacaciones').length).toBeGreaterThan(0);
    expect(screen.getByTestId('time-off-affected')).toHaveTextContent('3 publicados · 1 en borrador');
  });

  it('shows the overlap badge (warn with names, clear without) as text, not colour alone', async () => {
    mockedList.mockResolvedValue(page([
      timeOff({ id: 'a', overlapping: [{ employeeId: 'e9', name: 'Pablo Gil', startDate: '2026-12-11', endDate: '2026-12-12', status: 'APPROVED' }] }),
      timeOff({ id: 'b', employeeName: 'Laura Sanz' }),
    ]));
    renderInbox();
    await waitFor(() => expect(screen.getAllByTestId('time-off-overlap-badge')).toHaveLength(2));
    const [warn, clear] = screen.getAllByTestId('time-off-overlap-badge');
    expect(warn).toHaveAttribute('data-state', 'overlap');
    expect(warn).toHaveTextContent('Pablo Gil');
    expect(clear).toHaveAttribute('data-state', 'clear');
    expect(clear).toHaveTextContent('Sin solapes');
  });

  it('warns about OD-08 when the vacation has already started', async () => {
    mockedList.mockResolvedValue(page([timeOff({ alreadyStarted: true, effectiveStartDate: '2026-12-12', materializableDays: 3, skippedPastDays: 2 })]));
    renderInbox();
    await waitFor(() => expect(screen.getByTestId('time-off-already-started')).toBeTruthy());
    expect(screen.getByTestId('time-off-already-started')).toHaveTextContent('3 de 5 días desde 2026-12-12');
  });

  it.each([
    ['SELF_REQUEST', 'No puedes aprobar o rechazar tus propias solicitudes'],
    ['OUT_OF_SCOPE', 'fuera de tu alcance'],
    ['POLICY', 'asigna esta decisión a otro responsable'],
  ] as const)('canDecide=false (%s) explains why and offers no decision', async (reason, text) => {
    mockedList.mockResolvedValue(page([timeOff({ canDecide: false, cannotDecideReason: reason })]));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    expect(screen.getByRole('note')).toHaveTextContent(text);
    expect(screen.getByTestId('approve-btn-to-1')).toBeDisabled();
    expect(screen.getByTestId('reject-btn-to-1')).toBeDisabled();
    expect(screen.queryByTestId('approval-select-to-1')).toBeNull();
  });

  it('reports how many days were really applied when a started vacation is approved', async () => {
    mockedList.mockResolvedValue(page([timeOff({ alreadyStarted: true })]));
    mockedApprove.mockResolvedValueOnce({ requestedDays: 5, materializedDays: 3, skippedPastDays: 2 });
    renderInbox();
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    fireEvent.click(screen.getByTestId('approve-btn-to-1'));
    await waitFor(() => expect(screen.getByTestId('approval-notice')).toHaveTextContent('3 de 5 días aplicados; 2 días pasados no se modifican'));
  });

  it('history mode is read-only and shows who resolved it and the rejection reason', async () => {
    mockedList.mockResolvedValue(page([timeOff({ status: 'REJECTED', resolvedByName: 'Carlos Admin', resolvedAt: '2026-11-03T09:00:00.000Z', rejectionReason: 'Sin cobertura' })]));
    renderInbox(undefined, { mode: 'HISTORY' });
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    expect(mockedList).toHaveBeenCalledWith(expect.objectContaining({ status: 'HISTORY' }));
    expect(screen.getByTestId('approval-resolution-to-1')).toHaveTextContent('Carlos Admin');
    expect(screen.getByTestId('approval-resolution-to-1')).toHaveTextContent('Motivo del rechazo: Sin cobertura');
    expect(screen.queryByTestId('approve-btn-to-1')).toBeNull();
    expect(screen.queryByTestId('approval-bulk-bar')).toBeNull();
  });

  it('filters by type and employee text and paginates with the server cursor', async () => {
    mockedList.mockResolvedValueOnce(page([request], 'cursor-1')).mockResolvedValue(page([timeOff()]));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    fireEvent.click(screen.getByTestId('approval-load-more'));
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    fireEvent.change(screen.getByTestId('approval-filter-kind'), { target: { value: 'TIME_OFF' } });
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'TIME_OFF' })));
    fireEvent.change(screen.getByTestId('approval-filter-search'), { target: { value: 'marta' } });
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'TIME_OFF', q: 'marta' })));
  });

  it('only eligible vacations are selectable; shift changes never are', async () => {
    mockedList.mockResolvedValue(page([request, timeOff(), timeOff({ id: 'to-2', employeeName: 'Otra Persona', canDecide: false, cannotDecideReason: 'OUT_OF_SCOPE' })]));
    renderInbox();
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    expect(screen.getByTestId('approval-select-to-1')).toBeTruthy();
    expect(screen.queryByTestId('approval-select-to-2')).toBeNull();
    expect(screen.queryByTestId('approval-select-approval-1')).toBeNull();
    expect(screen.getByTestId('approval-bulk-approve')).toBeDisabled();
  });

  it('bulk approve sends only the selection and shows a PARTIAL result with each failure', async () => {
    mockedList.mockResolvedValue(page([timeOff(), timeOff({ id: 'to-2', employeeName: 'Luis Vega' })]));
    mockedBulk.mockResolvedValue({
      results: [
        { id: 'to-1', ok: true, status: 'APPROVED', requestedDays: 5, materializedDays: 5, skippedPastDays: 0 },
        { id: 'to-2', ok: false, status: 409, code: 'ALREADY_RESOLVED' },
      ],
      summary: { requested: 2, approved: 1, failed: 1 },
    });
    renderInbox();
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    fireEvent.click(screen.getByTestId('approval-select-all'));
    expect(screen.getByTestId('approval-bulk-approve')).toHaveTextContent('Aprobar seleccionadas (2)');
    fireEvent.click(screen.getByTestId('approval-bulk-approve'));
    await waitFor(() => expect(mockedBulk).toHaveBeenCalledWith(['to-1', 'to-2']));
    await waitFor(() => expect(screen.getByTestId('approval-bulk-result')).toHaveTextContent('1 aprobadas · 1 no aprobadas'));
    expect(screen.getByTestId('approval-bulk-failure-to-2')).toHaveTextContent('Luis Vega: ya fue decidida por otra persona');
    // the approved one left the list; the failure is reloaded from the server, never hidden
    expect(mockedList.mock.calls.length).toBeGreaterThan(1);
  });

  it('moves focus to the bulk result so it never falls back to <body> when the button leaves', async () => {
    mockedList.mockResolvedValue(page([timeOff()]));
    mockedBulk.mockResolvedValue({
      results: [{ id: 'to-1', ok: true, status: 'APPROVED', requestedDays: 5, materializedDays: 5, skippedPastDays: 0 }],
      summary: { requested: 1, approved: 1, failed: 0 },
    });
    renderInbox();
    await waitFor(() => expect(screen.getByText('Marta Ruiz')).toBeTruthy());
    fireEvent.click(screen.getByTestId('approval-select-all'));
    fireEvent.click(screen.getByTestId('approval-bulk-approve'));
    await waitFor(() => expect(screen.getByTestId('approval-bulk-result')).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByTestId('approval-bulk-result'));
  });
});

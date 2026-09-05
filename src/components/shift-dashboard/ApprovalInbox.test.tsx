// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { ApprovalInbox } from './ApprovalInbox';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return { ...actual, listRemoteApprovalRequests: vi.fn() };
});

const mockedList = vi.mocked(remote.listRemoteApprovalRequests);

const request: remote.ApprovalRequest = {
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

function renderInbox() {
  return render(
    <I18nProvider>
      <ApprovalInbox />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('ApprovalInbox', () => {
  it('shows the loading and empty states', async () => {
    mockedList.mockResolvedValue([]);
    renderInbox();
    expect(screen.getByTestId('approval-inbox-loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('approval-inbox-empty')).toBeTruthy());
    expect(screen.getByText('No tienes aprobaciones pendientes')).toBeTruthy();
    expect(screen.getByLabelText('0 pendientes')).toBeTruthy();
  });

  it('renders pending request details and count', async () => {
    mockedList.mockResolvedValue([request]);
    renderInbox();
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    expect(screen.getByText('Necesito cambiar la hora de entrada.')).toBeTruthy();
    expect(screen.getByText('Recepción')).toBeTruthy();
    expect(screen.getByLabelText('1 pendiente')).toBeTruthy();
  });

  it('shows an error and retries the request', async () => {
    mockedList.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([request]);
    renderInbox();
    await waitFor(() => expect(screen.getByTestId('approval-inbox-error')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Ana López')).toBeTruthy());
    expect(mockedList).toHaveBeenCalledTimes(2);
  });
});

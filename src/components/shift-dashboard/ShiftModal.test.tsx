// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { Shift } from '../../lib/types';
import * as remote from '../../lib/remote';
import { ShiftModal } from './ShiftModal';

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    acknowledgeRemoteShift: vi.fn(),
  };
});

const mockedAcknowledge = vi.mocked(remote.acknowledgeRemoteShift);

const publishedShift: Shift = {
  id: 'shift-pub-1',
  date: '2026-09-15',
  startTime: '08:00',
  endTime: '16:00',
  location: 'Edificio Norte',
  origin: 'IMP',
  employeeId: 'emp-self',
  acknowledgementStatus: 'PENDING',
};

const draftManualShift: Shift = {
  id: 'shift-man-1',
  date: '2026-09-15',
  startTime: '08:00',
  endTime: '16:00',
  location: 'Edificio Norte',
  origin: 'MAN',
  employeeId: 'emp-self',
};

describe('ShiftModal close consistency', () => {
  it('renders the close button in the shared dialog shell', () => {
    render(
      <I18nProvider>
        <ShiftModal isOpen editingShift={null} onClose={() => {}} onSave={() => {}} />
      </I18nProvider>,
    );
    const closeButton = screen.getByLabelText('Cerrar');
    expect(closeButton.closest('[role="dialog"]')).toBeTruthy();
    expect(closeButton.closest('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <ShiftModal isOpen editingShift={null} onClose={onClose} onSave={() => {}} />
      </I18nProvider>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ShiftModal acknowledgement connection (UXR-F3-M03 / CX-F06)', () => {
  it('displays reception status and authorized action for SELF employee on published shift', () => {
    render(
      <I18nProvider>
        <ShiftModal
          isOpen
          editingShift={publishedShift}
          sessionRole="EMPLOYEE"
          currentEmployeeId="emp-self"
          onClose={() => {}}
          onSave={() => {}}
        />
      </I18nProvider>,
    );

    // Shows published pill and pending acknowledgement status
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByTestId('ack-status-pill')).toHaveTextContent('Pendiente de confirmar');

    // Shows acknowledge action button
    const ackBtn = screen.getByTestId('shift-acknowledge-button');
    expect(ackBtn).toBeInTheDocument();
    expect(ackBtn).toHaveTextContent('Confirmar recepción');

    // Does NOT allow editing schedule: Save and Delete buttons are absent
    expect(screen.queryByRole('button', { name: /^Guardar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/i })).not.toBeInTheDocument();
  });

  it('does NOT expose acknowledgement action for ADMIN (strictly gated to SELF scope)', () => {
    render(
      <I18nProvider>
        <ShiftModal
          isOpen
          editingShift={publishedShift}
          sessionRole="ADMIN"
          currentEmployeeId="emp-admin"
          onClose={() => {}}
          onSave={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('shift-acknowledge-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ack-status-pill')).not.toBeInTheDocument();
  });

  it('does NOT expose acknowledgement action when employeeId does not match (not own shift)', () => {
    render(
      <I18nProvider>
        <ShiftModal
          isOpen
          editingShift={publishedShift}
          sessionRole="EMPLOYEE"
          currentEmployeeId="emp-other"
          onClose={() => {}}
          onSave={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('shift-acknowledge-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ack-status-pill')).not.toBeInTheDocument();
  });

  it('does NOT expose acknowledgement action for draft/manual shift (origin MAN)', () => {
    render(
      <I18nProvider>
        <ShiftModal
          isOpen
          editingShift={draftManualShift}
          sessionRole="EMPLOYEE"
          currentEmployeeId="emp-self"
          onClose={() => {}}
          onSave={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('shift-acknowledge-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ack-status-pill')).not.toBeInTheDocument();
  });
});

describe('ShiftModal failure and retry without duplicate action (UXR-F3-M04 / CX-F06)', () => {
  it('disables button during saving to prevent duplicate actions, and transitions to acknowledged on success', async () => {
    let resolvePromise!: (val: { status: 'ACKNOWLEDGED'; acknowledgedAt: string }) => void;
    const pendingPromise = new Promise<{ status: 'ACKNOWLEDGED'; acknowledgedAt: string }>((res) => {
      resolvePromise = res;
    });
    mockedAcknowledge.mockReturnValue(pendingPromise);

    const onAcknowledged = vi.fn();
    render(
      <I18nProvider>
        <ShiftModal
          isOpen
          editingShift={publishedShift}
          sessionRole="EMPLOYEE"
          currentEmployeeId="emp-self"
          onClose={() => {}}
          onSave={() => {}}
          onAcknowledged={onAcknowledged}
        />
      </I18nProvider>,
    );

    const ackBtn = screen.getByTestId('shift-acknowledge-button');
    fireEvent.click(ackBtn);

    // In flight: button disabled and showing saving copy
    expect(ackBtn).toBeDisabled();
    expect(ackBtn).toHaveAttribute('aria-busy', 'true');
    expect(ackBtn).toHaveTextContent('Guardando…');

    // Clicking again while saving does nothing
    fireEvent.click(ackBtn);
    expect(mockedAcknowledge).toHaveBeenCalledTimes(1);

    // Resolve successfully
    resolvePromise({ status: 'ACKNOWLEDGED', acknowledgedAt: '2026-09-15T12:00:00Z' });
    await waitFor(() => {
      expect(screen.getByTestId('ack-status-pill')).toHaveTextContent('Turno reconocido');
      expect(screen.getByTestId('ack-success-msg')).toHaveTextContent('Turno reconocido');
    });

    expect(onAcknowledged).toHaveBeenCalledWith('shift-pub-1', '2026-09-15T12:00:00Z');
  });

  it('preserves shift, displays visible error, and allows explicit retry on failure', async () => {
    mockedAcknowledge.mockRejectedValueOnce(new Error('Network failure'));

    render(
      <I18nProvider>
        <ShiftModal
          isOpen
          editingShift={publishedShift}
          sessionRole="EMPLOYEE"
          currentEmployeeId="emp-self"
          onClose={() => {}}
          onSave={() => {}}
        />
      </I18nProvider>,
    );

    const ackBtn = screen.getByTestId('shift-acknowledge-button');
    fireEvent.click(ackBtn);

    // Error appears
    await waitFor(() => {
      expect(screen.getByTestId('ack-error-msg')).toHaveTextContent('No se pudo confirmar el turno. Inténtalo de nuevo.');
    });

    // Button is re-enabled for retry
    expect(ackBtn).not.toBeDisabled();

    // Now mock success on retry
    mockedAcknowledge.mockResolvedValueOnce({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: '2026-09-15T12:05:00Z',
    });

    fireEvent.click(ackBtn);

    await waitFor(() => {
      expect(screen.getByTestId('ack-status-pill')).toHaveTextContent('Turno reconocido');
    });

    expect(mockedAcknowledge).toHaveBeenCalledTimes(2);
  });
});

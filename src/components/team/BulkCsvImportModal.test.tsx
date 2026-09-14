// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import type { RemoteArea, RemoteEmployee, RemoteMember } from '../../lib/remote';
import { BulkCsvImportModal } from './BulkCsvImportModal';
import { ApiError } from '../../lib/session';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    bulkCreateRemoteEmployees: vi.fn(),
    bulkCreateRemoteInvitations: vi.fn(),
  };
});

const mockedBulkCreateRemoteEmployees = vi.mocked(remote.bulkCreateRemoteEmployees);
const mockedBulkCreateRemoteInvitations = vi.mocked(remote.bulkCreateRemoteInvitations);

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const employeesFixture: RemoteEmployee[] = [
  { id: 'emp-ana', organizationId: 'org-1', name: 'Ana Soler', userId: null, externalEmployeeId: 'EMP-001', areaId: null, status: 'active' },
];
const membersFixture: RemoteMember[] = [];
const areasFixture: RemoteArea[] = [];

function renderModal(kind: 'employees' | 'users' = 'employees') {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <I18nProvider>
      <BulkCsvImportModal
        isOpen
        kind={kind}
        onClose={onClose}
        employees={employeesFixture}
        members={membersFixture}
        invitations={[]}
        areas={areasFixture}
        locale="es"
        onChanged={onChanged}
      />
    </I18nProvider>,
  );
  return { onClose, onChanged };
}

async function uploadFile(kind: 'employees' | 'users', csv: string) {
  const file = new File([csv], 'import.csv', { type: 'text/csv' });
  const input = document.getElementById(`bulk-file-${kind}`) as HTMLInputElement;
  await fireEvent.change(input, { target: { files: [file] } });
}

describe('BulkCsvImportModal — accessibility', () => {
  it('exposes the file trigger as a real, keyboard-focusable button — never a hidden, unreachable input', () => {
    renderModal('employees');
    const trigger = screen.getByRole('button', { name: /Seleccionar archivo CSV/i });
    expect(trigger.tagName).toBe('BUTTON');
    trigger.focus();
    expect(trigger).toHaveFocus();

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    fireEvent.click(trigger);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});

describe('BulkCsvImportModal — preview vs confirmed result (employees)', () => {
  it('labels the table "Vista previa" before import and switches to "Resultado" only after a confirmed server response', async () => {
    renderModal('employees');
    await uploadFile('employees', 'externalEmployeeId,name\nEMP-002,Bruno Martí');
    expect(await screen.findByRole('heading', { name: 'Vista previa' })).toBeInTheDocument();

    mockedBulkCreateRemoteEmployees.mockResolvedValue([{ key: '1', status: 'created', employee: employeesFixture[0] }]);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar importación/i }));

    expect(await screen.findByRole('heading', { name: 'Resultado' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vista previa' })).not.toBeInTheDocument();
    expect(screen.getByText(/1 creados/)).toBeInTheDocument();
  });

  it('translates a server rejection reason instead of showing the raw backend code', async () => {
    renderModal('employees');
    // Client-side analysis has no opinion on plan limits — this row passes
    // preview validation and only the SERVER rejects it (a real scenario:
    // the org's employee quota fills up between preview and confirm).
    await uploadFile('employees', 'externalEmployeeId,name\nEMP-002,Bruno Martí');
    await screen.findByRole('heading', { name: 'Vista previa' });
    mockedBulkCreateRemoteEmployees.mockResolvedValue([{ key: '1', status: 'failed', reason: 'plan_limit' }]);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar importación/i }));

    expect(await screen.findByText('Se alcanzó el límite de empleados de tu plan.')).toBeInTheDocument();
    expect(screen.queryByText('plan_limit')).not.toBeInTheDocument();
  });

  it('shows a translated error and keeps the preview intact when the import request itself fails', async () => {
    renderModal('employees');
    await uploadFile('employees', 'externalEmployeeId,name\nEMP-002,Bruno Martí');
    await screen.findByRole('heading', { name: 'Vista previa' });
    mockedBulkCreateRemoteEmployees.mockRejectedValue(new ApiError(403, 'forbidden', 'FORBIDDEN'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar importación/i }));

    expect(await screen.findByText('No tienes permiso para realizar esta importación.')).toBeInTheDocument();
    // No confirmed result exists — the preview is still what's shown, not a fabricated success.
    expect(screen.getByRole('heading', { name: 'Vista previa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar importación/i })).not.toBeDisabled();
  });
});

describe('BulkCsvImportModal — i18n regression', () => {
  it('never renders a raw teamWorkspace.* key across preview, result, and error states', async () => {
    renderModal('users');
    await uploadFile('users', 'email,name,role\nnueva@e2e.test,Nueva Persona,EMPLOYEE');
    await screen.findByRole('heading', { name: 'Vista previa' });
    expect(screen.queryByText(/teamWorkspace\./)).not.toBeInTheDocument();

    mockedBulkCreateRemoteInvitations.mockResolvedValue({
      results: [{ row: 1, key: '1', email: 'nueva@e2e.test', status: 'INVITED', invitationStatus: 'PENDING', deliveryStatus: 'FAILED', code: 'EMAIL_SEND_FAILED' }],
      summary: { invited: 1, updated: 0, unchanged: 0, failed: 0 },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar importación/i }));
    await screen.findByRole('heading', { name: 'Resultado' });
    expect(screen.queryByText(/teamWorkspace\./)).not.toBeInTheDocument();
    expect(screen.queryByText('EMAIL_SEND_FAILED')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/1 sin email enviado/)).toBeInTheDocument());
  });
});

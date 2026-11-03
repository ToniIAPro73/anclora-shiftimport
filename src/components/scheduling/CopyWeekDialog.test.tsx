// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { ApiError } from '../../lib/session';
import { CopyWeekDialog } from './CopyWeekDialog';

vi.mock('../../lib/remote', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/remote')>()), copyRemoteScheduleWeek: vi.fn() }));
const copy = vi.mocked(remote.copyRemoteScheduleWeek);

const base = (over: Partial<remote.CopyWeekResult> = {}): remote.CopyWeekResult => ({
  mode: 'preview',
  source: { scheduleId: 's0', versionId: 'v0', versionNumber: 2, periodStart: '2026-11-02', periodEnd: '2026-11-08' },
  target: { scheduleId: 's1', versionId: 'v1', periodStart: '2026-11-09', periodEnd: '2026-11-15' },
  candidates: [{ sourceAssignmentId: 'a1', employeeId: 'e1', employeeName: 'Ana López', sourceDate: '2026-11-03', targetDate: '2026-11-10', shiftType: 'Regular', startTime: '08:00', endTime: '16:00', location: null }],
  skipped: [
    { reason: 'PROTECTED_ABSENCE_DAY', targetDate: '2026-11-11', sourceAssignmentId: 'a2', employeeId: 'e2', employeeName: 'Beto Gil', shiftType: 'Regular', startTime: '08:00', endTime: '16:00' },
    { reason: 'OUT_OF_SCOPE', targetDate: '2026-11-12', sourceAssignmentId: null, employeeId: null, employeeName: null, shiftType: null, startTime: null, endTime: null },
  ],
  summary: { candidates: 1, skipped: 2, byReason: { PROTECTED_ABSENCE_DAY: 1, OUT_OF_SCOPE: 1 } },
  created: 0, createdAssignmentIds: [],
  ...over,
});
const renderDialog = (onCopied = vi.fn(), onClose = vi.fn()) => render(
  <I18nProvider><CopyWeekDialog isOpen scheduleId="s1" versionId="v1" periodStart="2026-11-09" onClose={onClose} onCopied={onCopied} /></I18nProvider>,
);

beforeEach(() => { vi.clearAllMocks(); window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es'); });
afterEach(cleanup);

describe('CopyWeekDialog', () => {
  it('opens by PREVIEWING (never writing) the week before the draft, and lists what is copied and what is left out with the reason', async () => {
    copy.mockResolvedValue(base());
    renderDialog();
    expect(await screen.findByTestId('copy-week-candidates')).toHaveTextContent('Ana López');
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith('s1', 'v1', { sourceWeekStart: '2026-11-02', mode: 'preview' });
    expect(screen.getByTestId('copy-week-skipped')).toHaveTextContent('Vacaciones aprobadas ese día');
    expect(screen.getByText('Se copiará 1 asignación')).toBeInTheDocument();
    expect(screen.getByText(/versión publicada 2/)).toBeInTheDocument();
  });

  it('an employee outside the scope shows no name, only the reason', async () => {
    copy.mockResolvedValue(base());
    renderDialog();
    const skipped = await screen.findByTestId('copy-week-skipped');
    expect(skipped).toHaveTextContent('Empleado fuera de tu alcance');
    expect(skipped).toHaveTextContent('Fuera de tu alcance');
  });

  it('copies ONLY after the explicit confirmation, reports what the server really did and refreshes the planner', async () => {
    copy.mockResolvedValueOnce(base()).mockResolvedValueOnce(base({ mode: 'apply', created: 1, createdAssignmentIds: ['n1'] }));
    const onCopied = vi.fn();
    renderDialog(onCopied);
    await screen.findByTestId('copy-week-candidates');
    expect(copy).not.toHaveBeenCalledWith('s1', 'v1', expect.objectContaining({ mode: 'apply' }));
    fireEvent.click(screen.getByTestId('copy-week-confirm'));
    await waitFor(() => expect(screen.getByTestId('copy-week-done')).toHaveTextContent('Copiadas 1 asignaciones; 2 omitidas'));
    expect(copy).toHaveBeenLastCalledWith('s1', 'v1', { sourceWeekStart: '2026-11-02', mode: 'apply' });
    expect(onCopied).toHaveBeenCalledWith(1);
  });

  it('cancelling never applies anything', async () => {
    copy.mockResolvedValue(base());
    const onClose = vi.fn();
    renderDialog(vi.fn(), onClose);
    await screen.findByTestId('copy-week-candidates');
    fireEvent.click(screen.getByTestId('copy-week-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it('with nothing to copy the confirmation is disabled and the screen says so', async () => {
    copy.mockResolvedValue(base({ candidates: [], summary: { candidates: 0, skipped: 2, byReason: {} } }));
    renderDialog();
    expect(await screen.findByTestId('copy-week-nothing')).toBeInTheDocument();
    expect(screen.getByTestId('copy-week-confirm')).toBeDisabled();
  });

  it('a previous week without a published version is explained, not a generic failure', async () => {
    copy.mockRejectedValue(new ApiError(404, 'The source week has no published version', 'SOURCE_NOT_PUBLISHED'));
    renderDialog();
    expect(await screen.findByTestId('copy-week-error')).toHaveTextContent('no tiene ninguna versión publicada');
    expect(screen.getByTestId('copy-week-confirm')).toBeDisabled();
  });

  it('a failed copy says nothing was changed and keeps the preview so the user can retry', async () => {
    copy.mockResolvedValueOnce(base()).mockRejectedValueOnce(new ApiError(500, 'boom'));
    renderDialog();
    await screen.findByTestId('copy-week-candidates');
    fireEvent.click(screen.getByTestId('copy-week-confirm'));
    expect(await screen.findByTestId('copy-week-error')).toHaveTextContent('No se ha cambiado nada');
    expect(screen.getByTestId('copy-week-confirm')).not.toBeDisabled();
  });
});

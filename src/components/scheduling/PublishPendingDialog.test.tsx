// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { getOperationalDate, shiftOperationalDate } from '../../lib/operational-date';
import { PUBLISH_PENDING_MAX, pendingVersions } from '../../lib/publish-pending';
import { PublishPendingDialog } from './PublishPendingDialog';

vi.mock('../../lib/remote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/remote')>()),
  listRemoteScheduleVersions: vi.fn(),
  publishPendingRemoteVersions: vi.fn(),
}));
const list = vi.mocked(remote.listRemoteScheduleVersions);
const publish = vi.mocked(remote.publishPendingRemoteVersions);

const today = getOperationalDate();
const version = (n: number, over: Partial<remote.ScheduleVersion> = {}): remote.ScheduleVersion => ({
  id: `v${n}`, scheduleId: `s${n}`, areaId: null, versionNumber: 1, status: 'DRAFT',
  periodStart: shiftOperationalDate(today, 7 * n), periodEnd: shiftOperationalDate(today, 7 * n + 6), ...over,
});
const okItem = (n: number, extra: Record<string, unknown> = {}) => ({ versionId: `v${n}`, ok: true as const, scheduleId: `s${n}`, periodStart: 'x', periodEnd: 'y', assignmentCount: 4, excludedCount: 0, ...extra });
const renderDialog = (onPublished = vi.fn(), onClose = vi.fn()) => render(<I18nProvider><PublishPendingDialog isOpen onClose={onClose} onPublished={onPublished} /></I18nProvider>);

beforeEach(() => { vi.clearAllMocks(); window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es'); });
afterEach(cleanup);

describe('pendingVersions', () => {
  it('a pending week is a DRAFT that has not ended, ordered by date', () => {
    const out = pendingVersions([
      version(2), version(1), version(3, { status: 'PUBLISHED' }),
      version(4, { periodStart: shiftOperationalDate(today, -14), periodEnd: shiftOperationalDate(today, -8) }),
      version(5, { periodStart: shiftOperationalDate(today, -3), periodEnd: shiftOperationalDate(today, 3) }),
    ], today);
    expect(out.map((v) => v.id)).toEqual(['v5', 'v1', 'v2']);
  });
});

describe('PublishPendingDialog', () => {
  it('lists the pending weeks with the server’s PREVIEW (assignments, expected exclusions, conflicts) and publishes nothing yet', async () => {
    list.mockResolvedValue([version(1), version(2), version(3)]);
    publish.mockResolvedValue({ mode: 'preview', summary: { requested: 3, ok: 2, failed: 1 }, results: [
      okItem(1), okItem(2, { excludedCount: 2 }), { versionId: 'v3', ok: false, status: 422, code: 'OVERLAP' },
    ] });
    renderDialog();
    expect(await screen.findByTestId('publish-pending-list')).toBeInTheDocument();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(['v1', 'v2', 'v3'], 'preview');
    expect(screen.getByTestId('publish-pending-row-v2')).toHaveTextContent('2 se excluirán');
    expect(screen.getByTestId('publish-pending-problem-v3')).toHaveTextContent('Hay asignaciones que se solapan');
    expect(screen.getByTestId('publish-pending-select-v3')).toBeDisabled(); // an unpublishable week cannot be ticked
    expect(screen.getByTestId('publish-pending-confirm')).toBeDisabled(); // nothing selected, nothing to confirm
  });

  it('publishes ONLY the ticked weeks after the explicit confirmation and shows one result per week (partial)', async () => {
    list.mockResolvedValue([version(1), version(2)]);
    publish.mockResolvedValueOnce({ mode: 'preview', summary: { requested: 2, ok: 2, failed: 0 }, results: [okItem(1), okItem(2)] });
    publish.mockResolvedValueOnce({ mode: 'apply', summary: { requested: 2, ok: 1, failed: 1 }, results: [
      okItem(1, { createdShiftCount: 4, excludedAssignmentCount: 1 }), { versionId: 'v2', ok: false, status: 409, code: 'VERSION_NOT_EDITABLE' },
    ] });
    const onPublished = vi.fn();
    renderDialog(onPublished);
    await screen.findByTestId('publish-pending-list');
    fireEvent.click(screen.getByTestId('publish-pending-select-all'));
    expect(screen.getByTestId('publish-pending-confirm')).toHaveTextContent('Publicar 2 semanas');
    fireEvent.click(screen.getByTestId('publish-pending-confirm'));
    await screen.findByTestId('publish-pending-results');
    expect(publish).toHaveBeenLastCalledWith(['v1', 'v2'], 'apply');
    expect(screen.getByTestId('publish-pending-result-v1')).toHaveTextContent('Publicada: 4 turnos creados; 1 asignaciones excluidas');
    expect(screen.getByTestId('publish-pending-result-v2')).toHaveTextContent('No publicada · Ya no es un borrador');
    expect(onPublished).toHaveBeenCalledTimes(1);
  });

  it('with nothing pending it says so and never calls the publication', async () => {
    list.mockResolvedValue([version(1, { status: 'PUBLISHED' })]);
    renderDialog();
    expect(await screen.findByTestId('publish-pending-empty')).toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();
  });

  it('shows at most 12 weeks and says there are more', async () => {
    list.mockResolvedValue(Array.from({ length: PUBLISH_PENDING_MAX + 3 }, (_, i) => version(i + 1)));
    publish.mockImplementation(async (ids) => ({ mode: 'preview', summary: { requested: ids.length, ok: ids.length, failed: 0 }, results: ids.map((id) => okItem(Number(id.slice(1)))) }));
    renderDialog();
    expect(await screen.findByTestId('publish-pending-overflow')).toBeInTheDocument();
    expect(publish.mock.calls[0][0]).toHaveLength(PUBLISH_PENDING_MAX);
  });

  it('a week outside the user’s scope or with past days is explained, not hidden, and cannot be ticked', async () => {
    list.mockResolvedValue([version(1), version(2)]);
    publish.mockResolvedValue({ mode: 'preview', summary: { requested: 2, ok: 0, failed: 2 }, results: [
      { versionId: 'v1', ok: false, status: 403, code: 'SCOPE_FORBIDDEN' }, { versionId: 'v2', ok: false, status: 422, code: 'PAST_DATES_AFFECTED', pastAssignmentCount: 2 },
    ] });
    renderDialog();
    await screen.findByTestId('publish-pending-list');
    expect(screen.getByTestId('publish-pending-problem-v1')).toHaveTextContent('fuera de tu alcance');
    expect(screen.getByTestId('publish-pending-problem-v2')).toHaveTextContent('Incluye días ya pasados');
    expect(screen.getByTestId('publish-pending-select-all')).toBeDisabled();
  });

  it('a failed check says nothing was published and offers no confirmation', async () => {
    list.mockResolvedValue([version(1)]);
    publish.mockRejectedValue(new Error('network'));
    renderDialog();
    expect(await screen.findByTestId('publish-pending-error')).toHaveTextContent('No se ha publicado nada');
    expect(screen.getByTestId('publish-pending-confirm')).toBeDisabled();
  });

  it('cancelling never publishes', async () => {
    list.mockResolvedValue([version(1)]);
    publish.mockResolvedValue({ mode: 'preview', summary: { requested: 1, ok: 1, failed: 0 }, results: [okItem(1)] });
    const onClose = vi.fn();
    renderDialog(vi.fn(), onClose);
    await screen.findByTestId('publish-pending-list');
    fireEvent.click(screen.getByTestId('publish-pending-cancel'));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  });
});

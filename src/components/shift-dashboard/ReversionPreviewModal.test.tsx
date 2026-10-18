// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import type { ReversionPlan } from '../../lib/remote';
import { ReversionPreviewModal } from './ReversionPreviewModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return { ...actual, previewImportReversion: vi.fn(), confirmImportReversion: vi.fn() };
});

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const mockedPreview = vi.mocked(remote.previewImportReversion);

const impact = {
  shiftsRemoved: 3, shiftsRestored: 0, reviewCleared: 0, planRevisionsReverted: 0, assignmentsRemoved: 0, assignmentsRestored: 0,
  draftVersionsRemoved: 0, draftVersionsRestored: 0, schedulesRemoved: 0, schedulesRestored: 0, dcfRemoved: 0, dcfPreserved: 0,
  commentsRemoved: 0, changesRemoved: 0, changesRestored: 0, employeesAffected: 1, alreadyAbsent: 0,
};
const planImport = (id: string, over: Record<string, unknown> = {}) => ({
  id, fileName: `${id}.xlsx`, sourceFormat: 'xlsx', createdAt: '2026-09-01T10:00:00.000Z', importedByName: 'Toni',
  requestedByUser: true, autoIncluded: false, executionOrder: 1, legacy: false, ...over,
});
const readyWithDependencies = (): ReversionPlan => ({
  status: 'READY', planHash: 'hash-a', requestedIds: ['a'],
  imports: [planImport('a'), planImport('a2', { requestedByUser: false, autoIncluded: true }), planImport('a3', { requestedByUser: false, autoIncluded: true })],
  order: ['a3', 'a2', 'a'], impact, blockers: [], warnings: [],
});
const blockedPlan = (): ReversionPlan => ({
  status: 'BLOCKED', planHash: 'hash-blocked', requestedIds: ['a'], imports: [planImport('a')], order: ['a'], impact,
  blockers: [{ code: 'LATER_MANUAL_CHANGE_UNSAFE', importId: 'a', count: 2 }], warnings: [],
});
const readyPlain = (): ReversionPlan => ({
  status: 'READY', planHash: 'hash-b', requestedIds: ['b'], imports: [planImport('b')], order: ['b'], impact, blockers: [], warnings: [],
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};

const renderModal = (isOpen: boolean, importIds: string[]) => (
  <I18nProvider>
    <ReversionPreviewModal isOpen={isOpen} importIds={importIds} onClose={() => undefined} onReverted={() => undefined} />
  </I18nProvider>
);

/** The preview request is issued from the effect that runs right after the FIRST commit of a re-open / selection change, i.e. before any
 * state set by that effect is rendered. What the DOM shows at that moment is exactly what the user could see for the first frame. */
const firstFrameProbe = (pending: Promise<ReversionPlan>) => {
  const seen = { metrics: null as boolean | null, related: null as boolean | null, blocked: null as boolean | null };
  mockedPreview.mockImplementationOnce(() => {
    seen.metrics = Boolean(screen.queryByTestId('reversion-metrics'));
    seen.related = Boolean(screen.queryByTestId('reversion-related'));
    seen.blocked = Boolean(screen.queryByTestId('reversion-blocked'));
    return pending;
  });
  return seen;
};

describe('ReversionPreviewModal — no stale preview', () => {
  it('D1-A: re-opening starts from a clean loading state (nothing of the previous plan is rendered)', async () => {
    mockedPreview.mockResolvedValueOnce(readyWithDependencies());
    const view = render(renderModal(true, ['a']));
    await screen.findByTestId('reversion-metrics');
    view.rerender(renderModal(false, ['a']));
    const pending = deferred<ReversionPlan>();
    const firstFrame = firstFrameProbe(pending.promise);
    view.rerender(renderModal(true, ['b']));
    expect(firstFrame).toEqual({ metrics: false, related: false, blocked: false });
    expect(screen.queryByTestId('reversion-metrics')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => { pending.resolve(readyPlain()); await pending.promise; });
    expect(await screen.findByTestId('reversion-metrics')).toBeTruthy();
  });

  it('D1-B: changing the selected ids drops the previous plan immediately, and Confirm is disabled while loading', async () => {
    mockedPreview.mockResolvedValueOnce(readyWithDependencies());
    const view = render(renderModal(true, ['a']));
    await screen.findByTestId('reversion-metrics');
    expect((screen.getByTestId('reversion-confirm') as HTMLButtonElement).disabled).toBe(false);
    const pending = deferred<ReversionPlan>();
    const firstFrame = firstFrameProbe(pending.promise);
    view.rerender(renderModal(true, ['b']));
    expect(firstFrame.metrics).toBe(false);
    expect(screen.queryByTestId('reversion-metrics')).toBeNull();
    expect((screen.getByTestId('reversion-confirm') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { pending.resolve(readyPlain()); await pending.promise; });
  });

  it('D1-C: a blocker of the previous preview is not shown while the next one loads', async () => {
    mockedPreview.mockResolvedValueOnce(blockedPlan());
    const view = render(renderModal(true, ['a']));
    await screen.findByTestId('reversion-blocked');
    view.rerender(renderModal(false, ['a']));
    const pending = deferred<ReversionPlan>();
    const firstFrame = firstFrameProbe(pending.promise);
    view.rerender(renderModal(true, ['b']));
    expect(firstFrame.blocked).toBe(false);
    expect(screen.queryByTestId('reversion-blocked')).toBeNull();
    await act(async () => { pending.resolve(readyPlain()); await pending.promise; });
    expect(screen.queryByTestId('reversion-blocked')).toBeNull();
  });

  it('D1-D: auto-included dependencies of the previous preview are not shown while the next one loads', async () => {
    mockedPreview.mockResolvedValueOnce(readyWithDependencies());
    const view = render(renderModal(true, ['a']));
    await screen.findByTestId('reversion-related');
    view.rerender(renderModal(false, ['a']));
    const pending = deferred<ReversionPlan>();
    const firstFrame = firstFrameProbe(pending.promise);
    view.rerender(renderModal(true, ['b']));
    expect(firstFrame.related).toBe(false);
    expect(screen.queryByTestId('reversion-related')).toBeNull();
    expect(screen.queryByText(/Relacionadas incluidas|Related included/i)).toBeNull();
    await act(async () => { pending.resolve(readyPlain()); await pending.promise; });
    expect(screen.queryByTestId('reversion-related')).toBeNull();
  });

  it('D1-E: a late response of an older request never overwrites the newer preview', async () => {
    const slowA = deferred<ReversionPlan>();
    mockedPreview.mockReturnValueOnce(slowA.promise);
    const view = render(renderModal(true, ['a']));
    const fastB = deferred<ReversionPlan>();
    mockedPreview.mockReturnValueOnce(fastB.promise);
    view.rerender(renderModal(true, ['b']));
    await act(async () => { fastB.resolve(readyPlain()); await fastB.promise; });
    await screen.findByTestId('reversion-metrics');
    await act(async () => { slowA.resolve(readyWithDependencies()); await slowA.promise; });
    expect(screen.queryByTestId('reversion-related')).toBeNull();
    expect(screen.getByTestId('reversion-metrics').textContent).toContain('1');
  });
});

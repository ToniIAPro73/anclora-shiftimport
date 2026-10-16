// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import type { ReconciliationItem, ReconciliationWorklist } from '../../lib/remote';
import { ReconciliationModal } from './ReconciliationModal';
import { pageWindow } from './reconciliation-paging';

afterEach(cleanup);
beforeEach(() => window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es'));

const pending = (index: number): ReconciliationItem => ({
  date: `2026-01-${String(index).padStart(2, '0')}`,
  status: 'PENDING',
  company: [{ type: 'Libre', startTime: null, endTime: null }],
  current: [{ type: 'Regular', startTime: '17:00', endTime: '01:00' }],
  resolvedAt: null, resolvedReason: null, selfChange: null,
});
const resolved: ReconciliationItem = {
  date: '2026-02-02', status: 'RESOLVED',
  company: [{ type: 'Regular', startTime: '13:00', endTime: '21:00' }],
  current: [{ type: 'Regular', startTime: '13:00', endTime: '21:00' }],
  resolvedAt: '2026-10-01T10:00:00Z', resolvedReason: 'Confirmado con el jefe', selfChange: false,
};
const worklist = (count: number, withResolved = true): ReconciliationWorklist => ({
  employeeId: 'e1', year: 2026, pendingCount: count, resolvedCount: withResolved ? 1 : 0,
  items: [...Array.from({ length: count }, (_, index) => pending(index + 1)), ...(withResolved ? [resolved] : [])],
});

function renderModal(list: ReconciliationWorklist | null, extra: Partial<React.ComponentProps<typeof ReconciliationModal>> = {}) {
  const handlers = { onClose: vi.fn(), onRetry: vi.fn(), onReview: vi.fn(), onViewDay: vi.fn() };
  render(
    <I18nProvider>
      <ReconciliationModal isOpen worklist={list} loading={false} failed={false} {...handlers} {...extra} />
    </I18nProvider>,
  );
  return handlers;
}

describe('ReconciliationModal', () => {
  it('is a dialog with the pending badge and the three tabs', () => {
    renderModal(worklist(7));
    expect(screen.getByRole('dialog', { name: 'Reconciliación de días' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('recon-modal-badge')).toHaveTextContent('7');
    expect(screen.getByRole('tab', { name: /Pendientes/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Resueltos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument();
  });

  it('paginates long lists (1–5 de 35) instead of rendering every row', () => {
    renderModal(worklist(35));
    expect(screen.getByTestId('recon-range')).toHaveTextContent('1–5 de 35');
    expect(within(screen.getByTestId('recon-list')).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Página 7' }));
    expect(screen.getByTestId('recon-range')).toHaveTextContent('31–35 de 35');
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('pending tab hides resolved days; resolved and all tabs filter correctly', () => {
    renderModal(worklist(3));
    expect(screen.queryByTestId('recon-row-2026-02-02')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Resueltos' }));
    expect(screen.getByTestId('recon-row-2026-02-02')).toHaveTextContent('Confirmado con el jefe');
    expect(screen.queryByTestId('recon-row-2026-01-01')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Todos' }));
    expect(screen.getByTestId('recon-range')).toHaveTextContent('1–4 de 4');
  });

  it('rows show company plan vs current record and status', () => {
    renderModal(worklist(1, false));
    const row = screen.getByTestId('recon-row-2026-01-01');
    expect(row).toHaveTextContent('01/01/2026');
    expect(row).toHaveTextContent('Día libre');
    expect(row).toHaveTextContent('Regular 17:00–01:00');
    expect(row).toHaveTextContent('Pendiente');
  });

  it('resolve opens the day detail and the calendar shortcut views the day', () => {
    const { onReview, onViewDay } = renderModal(worklist(2));
    fireEvent.click(screen.getByTestId('recon-review-2026-01-02'));
    expect(onReview).toHaveBeenCalledWith('2026-01-02');
    fireEvent.click(screen.getByTestId('recon-view-2026-01-01'));
    expect(onViewDay).toHaveBeenCalledWith('2026-01-01');
  });

  it('shows an empty state and Escape closes', () => {
    const { onClose } = renderModal(worklist(0, false));
    expect(screen.getByTestId('recon-empty')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces load errors with retry', () => {
    const { onRetry } = renderModal(null, { failed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('pageWindow', () => {
  it('collapses long ranges with gaps', () => {
    expect(pageWindow(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
  });
});

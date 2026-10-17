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
  it('shows company before / company now / effective calendar with a plain-language reason (no ids)', () => {
    const item: ReconciliationItem = {
      date: '2026-06-02', status: 'PENDING',
      companyBefore: [{ type: 'Regular', startTime: '14:00', endTime: '22:00' }],
      companyNow: [{ type: 'Regular', startTime: '14:00', endTime: '22:00' }],
      effective: [{ type: 'Baja', startTime: null, endTime: null }],
      reasonCode: 'EFFECTIVE_DIFFERS_FROM_PLAN',
      company: [{ type: 'Regular', startTime: '14:00', endTime: '22:00' }],
      current: [{ type: 'Baja', startTime: null, endTime: null }],
      resolvedAt: null, resolvedReason: null, selfChange: null,
    };
    renderModal({ employeeId: 'e1', year: 2026, pendingCount: 1, resolvedCount: 0, items: [item] });
    expect(screen.getByTestId('recon-before-2026-06-02')).toHaveTextContent('14:00–22:00');
    expect(screen.getByTestId('recon-now-2026-06-02')).toHaveTextContent('14:00–22:00');
    expect(screen.getByTestId('recon-effective-2026-06-02')).toHaveTextContent('Baja');
    expect(screen.getByTestId('recon-why-2026-06-02')).toHaveTextContent('difiere del plan de empresa');
    expect(screen.getByTestId('reconciliation-modal').textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('is a dialog with the pending badge and the three tabs', () => {
    renderModal(worklist(7));
    expect(screen.getByRole('dialog', { name: 'Reconciliación de días' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('recon-modal-badge')).toHaveTextContent('7 pendientes');
    expect(screen.getByRole('tab', { name: 'Pendientes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Resueltos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument();
  });

  it('paginates long lists 4 per page (1–4 de 35) instead of rendering every row', () => {
    renderModal(worklist(35));
    expect(screen.getByTestId('recon-range')).toHaveTextContent('1–4 de 35');
    expect(within(screen.getByTestId('recon-list')).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByTestId('recon-row-2026-01-05')).toBeNull(); // the fifth row is on page 2
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByTestId('recon-range')).toHaveTextContent('5–8 de 35');
    expect(within(screen.getByTestId('recon-list')).getAllByRole('listitem')[0]).toHaveAttribute('data-testid', 'recon-row-2026-01-05');
    fireEvent.click(screen.getByRole('button', { name: 'Página 9' }));
    expect(screen.getByTestId('recon-range')).toHaveTextContent('33–35 de 35');
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('pending tab hides resolved days; resolved and all tabs filter correctly', () => {
    renderModal(worklist(3));
    expect(screen.queryByTestId('recon-row-2026-02-02')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Resueltos' }));
    expect(screen.getByTestId('recon-row-2026-02-02')).toHaveTextContent('Confirmado con el jefe');
    expect(screen.getByTestId('recon-row-2026-02-02')).toHaveTextContent('Resuelto');
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

describe('ReconciliationModal — presentation', () => {
  it('hides technical run ids / UUIDs and summarises the reason', () => {
    const technical: ReconciliationItem = {
      ...resolved,
      resolvedReason: '[run 1acfbb93-09f0-40c3-9860-8de50a26b3d8] Reconciled (HIGH): consistent with company calendar',
    };
    renderModal({ employeeId: 'e1', year: 2026, pendingCount: 0, resolvedCount: 1, items: [technical] });
    fireEvent.click(screen.getByRole('tab', { name: 'Resueltos' }));
    const reason = screen.getByTestId('recon-reason-2026-02-02');
    expect(reason).toHaveTextContent('Coincide con el plan de la empresa');
    const row = screen.getByTestId('recon-row-2026-02-02');
    expect(row.textContent).not.toMatch(/run|1acfbb93|[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(reason.getAttribute('title') ?? '').not.toMatch(/1acfbb93/);
  });

  it('status is conveyed by text, not only color', () => {
    renderModal(worklist(1));
    expect(screen.getByTestId('recon-row-2026-01-01')).toHaveTextContent('Pendiente');
    fireEvent.click(screen.getByRole('tab', { name: 'Resueltos' }));
    expect(screen.getByTestId('recon-row-2026-02-02')).toHaveTextContent('Resuelto');
  });

  it('review is the primary action on every row and the calendar icon has a tooltip + label', () => {
    renderModal(worklist(1));
    expect(screen.getByRole('button', { name: 'Revisar el día 01/01/2026' })).toHaveTextContent('Revisar');
    const view = screen.getByRole('button', { name: 'Ver el día 01/01/2026 en el calendario' });
    expect(view).toHaveAttribute('title', 'Ver día en calendario');
  });

  it('tabs use arrow-key navigation and Home/End', () => {
    renderModal(worklist(2));
    const pendingTab = screen.getByRole('tab', { name: 'Pendientes' });
    pendingTab.focus();
    fireEvent.keyDown(pendingTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Resueltos' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Resueltos' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Todos' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Pendientes' })).toHaveAttribute('aria-selected', 'true');
  });
});

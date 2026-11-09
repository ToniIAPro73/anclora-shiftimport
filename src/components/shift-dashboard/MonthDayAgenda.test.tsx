// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { MonthGrid } from './MonthGrid';
import type { Shift } from '../../lib/types';
import type { DayAnnotation } from '../../lib/remote';

setupLocalStorageMock();

const shift = (id: string, date: string, over: Partial<Shift> = {}): Shift => ({
  id, date, startTime: '05:00', endTime: '13:00', shiftType: 'Regular', countsAsWork: true,
  location: '', origin: 'IMP', employeeId: 'e1', layer: 'CHANGE', effectiveState: 'EFFECTIVE', ...over,
} as Shift);

function mockMatchMedia(compact: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: compact && query.includes('max-width: 640px'),
    media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

function renderGrid(compact: boolean, extra: { onCreateShift?: (d: string) => void; onEditShift?: (id: string) => void; shifts?: Shift[]; annotations?: DayAnnotation[]; role?: 'OWNER' | 'EMPLOYEE'; locale?: 'es' | 'en' } = {}) {
  mockMatchMedia(compact);
  if (extra.locale === 'en') localStorage.setItem('anclora_shiftimport_locale_v1', 'en'); else localStorage.removeItem('anclora_shiftimport_locale_v1');
  return render(
    <I18nProvider>
      <MonthGrid
        year={2026} month={7}
        shifts={extra.shifts ?? [shift('a', '2026-08-03'), shift('b', '2026-08-03', { startTime: '', endTime: '', shiftType: 'Libre', countsAsWork: false }), shift('c', '2026-08-04')]}
        annotations={extra.annotations ?? []}
        onEditShift={extra.onEditShift ?? vi.fn()} onCreateShift={extra.onCreateShift ?? vi.fn()} role={extra.role ?? 'OWNER'}
      />
    </I18nProvider>,
  );
}

describe('compact month (≤640px) — F1-M03', () => {
  beforeEach(() => mockMatchMedia(false));
  afterEach(cleanup);

  it('desktop keeps the full grid and renders no day panel', () => {
    renderGrid(false);
    expect(screen.queryByTestId('month-day-agenda')).toBeNull();
    expect(screen.queryByTestId('month-day-select-2026-08-03')).toBeNull();
  });

  it('shows a day panel and lets a tap on the day select it', () => {
    renderGrid(true);
    const agenda = screen.getByTestId('month-day-agenda');
    expect(agenda).toHaveAttribute('data-date', '2026-08-01'); // month has no "today": falls back to day 1
    expect(within(agenda).getByText('Sin turnos este día.')).toBeInTheDocument();

    const select = screen.getByTestId('month-day-select-2026-08-03');
    expect(select).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(select);
    expect(select).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('month-day-agenda')).toHaveAttribute('data-date', '2026-08-03');
    expect(within(screen.getByTestId('month-day-agenda')).getAllByRole('button').length).toBeGreaterThanOrEqual(4);
    expect(within(screen.getByTestId('month-day-agenda')).getByText(/05:00–13:00/)).toBeInTheDocument();
  });

  it('the panel add button follows the same policy and creates for the selected day', () => {
    const onCreateShift = vi.fn();
    renderGrid(true, { onCreateShift });
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-04'));
    fireEvent.click(screen.getByTestId('month-day-agenda-add'));
    expect(onCreateShift).toHaveBeenCalledWith('2026-08-04');
  });

  it('cells carry only the day number and one dot per effective shift: no labels, times or per-cell controls', () => {
    const { container } = renderGrid(true);
    expect(container.querySelectorAll('.month-day-cell .month-shift-badge')).toHaveLength(0);
    expect(container.querySelectorAll('.month-day-cell .month-day-add-button')).toHaveLength(0);
    expect(container.querySelectorAll('.month-day-cell .month-day-history-button')).toHaveLength(0);
    const dots = (iso: string) => screen.getByTestId(`month-day-dots-${iso}`);
    expect(dots('2026-08-03').querySelectorAll('.month-dot')).toHaveLength(2);
    expect(dots('2026-08-04').querySelectorAll('.month-dot')).toHaveLength(1);
    expect(dots('2026-08-05').querySelectorAll('.month-dot')).toHaveLength(0);
    // the visible text of a cell is just its number; the full summary stays in the accessible name
    expect(screen.getByTestId('month-day-select-2026-08-03')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('month-day-select-2026-08-03')).toHaveAccessibleName(/2026-08-03: 2 turnos/);
  });

  it('two shifts of the SAME type give two dots of that type, never one', () => {
    renderGrid(true, { shifts: [shift('a', '2026-08-06'), shift('b', '2026-08-06', { startTime: '14:00', endTime: '18:00' })] });
    const dots = screen.getByTestId('month-day-dots-2026-08-06').querySelectorAll('.month-dot');
    expect(dots).toHaveLength(2);
    expect([...dots].map((dot) => dot.getAttribute('data-shift-type'))).toEqual(['Regular', 'Regular']);
  });

  it('four or more shifts: three dots and +N; the panel shows three rows and expands with "Ver N más"', () => {
    const day = (id: string, start: string) => shift(id, '2026-08-10', { startTime: start, endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00` });
    renderGrid(true, { shifts: [day('a', '05:00'), day('b', '07:00'), day('c', '09:00'), day('d', '11:00'), day('e', '13:00')] });
    const dots = screen.getByTestId('month-day-dots-2026-08-10');
    expect(dots.querySelectorAll('.month-dot')).toHaveLength(3);
    expect(dots.querySelector('.month-dot-more')).toHaveTextContent('+2');
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-10'));
    const agenda = screen.getByTestId('month-day-agenda');
    // the redundant visible counter is gone: the total is the accessible name of the list
    expect(within(agenda).queryByTestId('month-day-agenda-count')).toBeNull();
    expect(within(agenda).getByRole('list', { name: '5 turnos' })).toBeInTheDocument();
    expect(agenda.querySelectorAll('.month-day-agenda__row')).toHaveLength(3);
    fireEvent.click(within(agenda).getByTestId('month-day-agenda-more'));
    expect(agenda.querySelectorAll('.month-day-agenda__row')).toHaveLength(5);
    fireEvent.click(within(agenda).getByTestId('month-day-agenda-more'));
    expect(agenda.querySelectorAll('.month-day-agenda__row')).toHaveLength(3);
  });

  it('a day with NO shifts shows only the empty text and the Add shift button (ES)', () => {
    renderGrid(true);
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-20'));
    const agenda = screen.getByTestId('month-day-agenda');
    expect(within(agenda).getByText('Sin turnos este día.')).toBeInTheDocument();
    expect(within(agenda).getByRole('button', { name: 'Añadir turno' })).toBeEnabled();
    expect(within(agenda).queryByTestId('month-day-agenda-detail')).toBeNull();
    expect(within(agenda).queryByTestId('month-day-agenda-count')).toBeNull();
    expect(within(agenda).getAllByRole('button')).toHaveLength(1);
  });

  it('a day with NO shifts shows only the empty text and the Add shift button (EN)', () => {
    renderGrid(true, { locale: 'en' });
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-20'));
    const agenda = screen.getByTestId('month-day-agenda');
    expect(within(agenda).getByText('No shifts on this day.')).toBeInTheDocument();
    expect(within(agenda).getByRole('button', { name: 'Add shift' })).toBeEnabled();
    expect(within(agenda).getAllByRole('button')).toHaveLength(1);
  });

  it('a day with only a comment and a DCF (no shifts) still offers them, without a duplicate "Ver detalle"', () => {
    const annotation = (id: string, kind: 'DCF' | 'COMMENT'): DayAnnotation => ({ id, employeeId: 'e1', date: '2026-08-12', kind, text: kind === 'COMMENT' ? 'nota' : null, startTime: null, endTime: null, completeness: null, origin: 'MANUAL', sourceKind: null });
    renderGrid(true, { annotations: [annotation('1', 'COMMENT'), annotation('2', 'DCF')] });
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-12'));
    const agenda = screen.getByTestId('month-day-agenda');
    expect(within(agenda).getByTestId('month-day-agenda-dcf')).toBeInTheDocument();
    expect(within(agenda).getByTestId('month-day-agenda-comments')).toBeInTheDocument();
    expect(within(agenda).queryByTestId('month-day-agenda-warnings')).toBeNull();
    expect(within(agenda).queryByTestId('month-day-agenda-history')).toBeNull();
    // the accesses already open the day detail: a separate "Ver detalle" would be a duplicate
    expect(within(agenda).queryByTestId('month-day-agenda-detail')).toBeNull();
    // annotations never appear inside the grid cell
    expect(screen.getByTestId('month-day-select-2026-08-12')).toHaveTextContent(/^12$/);
  });

  it('"Ver detalle" appears only when no warning/DCF/comment/history access already opens the day detail', () => {
    renderGrid(true);
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-03')); // two shifts, nothing else
    const agenda = screen.getByTestId('month-day-agenda');
    expect(within(agenda).getByTestId('month-day-agenda-detail')).toBeInTheDocument();
    expect(agenda.querySelector('.month-day-agenda__pills')).toBeNull();
  });

  it('an employee cannot add a future shift: the button is disabled and the reason is visible', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z')); // 2026-08-28 is in the future for this test
    try {
      renderGrid(true, { role: 'EMPLOYEE', shifts: [] });
      fireEvent.click(screen.getByTestId('month-day-select-2026-08-28'));
      const agenda = screen.getByTestId('month-day-agenda');
      expect(within(agenda).getByTestId('month-day-agenda-add')).toBeDisabled();
      expect(within(agenda).getByTestId('month-day-agenda-blocked')).toHaveTextContent('Los turnos futuros los gestiona planificación.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a tap on a panel row edits that shift; a tap on a day cell only selects the day', () => {
    const onEditShift = vi.fn();
    renderGrid(true, { onEditShift });
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-03'));
    expect(onEditShift).not.toHaveBeenCalled();
    expect(screen.getByTestId('month-day-agenda')).toHaveAttribute('data-date', '2026-08-03');
    fireEvent.click(screen.getByTestId('month-day-agenda-shift-a'));
    expect(onEditShift).toHaveBeenCalledWith('a');
  });
});

describe('compact month — hotfix: day markers and one-line agenda header', () => {
  beforeEach(() => mockMatchMedia(false));
  afterEach(cleanup);

  const annotation = (id: string, kind: 'DCF' | 'COMMENT', date: string): DayAnnotation => ({ id, employeeId: 'e1', date, kind, text: kind === 'COMMENT' ? 'nota' : null, startTime: null, endTime: null, completeness: null, origin: 'MANUAL', sourceKind: null });
  const render4 = (extra: Partial<Shift> = {}) => ['a', 'b', 'c', 'd'].map((id, i) => shift(id, '2026-08-17', { startTime: `${String(5 + i * 2).padStart(2, '0')}:00`, endTime: `${String(6 + i * 2).padStart(2, '0')}:00`, layer: 'COMPANY_PLAN', ...extra }));
  const renderWith = (shifts: Shift[], annotations: DayAnnotation[] = [], provenanceEnabled = true) => {
    mockMatchMedia(true);
    localStorage.removeItem('anclora_shiftimport_locale_v1');
    return render(<I18nProvider><MonthGrid year={2026} month={7} shifts={shifts} annotations={annotations} provenanceEnabled={provenanceEnabled} onEditShift={vi.fn()} onCreateShift={vi.fn()} role="OWNER" /></I18nProvider>);
  };

  it('4 shifts + a REQUIRES_REVIEW row + DCF: three dots and +1, info marker, warning marker, both decorative and non-interactive; selection and today stay independent', () => {
    const review = shift('r', '2026-08-17', { effectiveState: 'REQUIRES_REVIEW', layer: 'COMPANY_PLAN', startTime: '06:00', endTime: '10:00' });
    renderWith([...render4(), review], [annotation('1', 'DCF', '2026-08-17')]);
    const select = screen.getByTestId('month-day-select-2026-08-17');
    const dots = screen.getByTestId('month-day-dots-2026-08-17');
    expect(dots.querySelectorAll('.month-dot')).toHaveLength(3);
    expect(dots.querySelector('.month-dot-more')).toHaveTextContent('+1'); // 4 effective shifts: the proposal is not a shift
    const info = select.querySelector('[data-marker="info"]');
    const warning = select.querySelector('[data-marker="warning"]');
    expect(info).not.toBeNull();
    expect(warning).not.toBeNull();
    for (const marker of [info, warning] as Element[]) {
      expect(marker).toHaveAttribute('aria-hidden', 'true');
      expect(marker.tagName).toBe('SPAN');
      expect(marker.hasAttribute('tabindex')).toBe(false);
      expect(marker.closest('button')).toBe(select); // not a control of its own: the cell is the only touch target
    }
    expect(select.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
    // the markers sit on either side of the number and the meaning is in the cell's accessible name (no duplicated reading)
    const order = [...select.querySelector('.month-day-select__top')!.children].map((slot) => slot.querySelector('[data-marker]')?.getAttribute('data-marker') ?? (slot.classList.contains('month-day-select__number') ? 'number' : null));
    expect(order).toEqual(['info', 'number', 'warning']);
    expect(select).toHaveAccessibleName(/4 turnos, con aviso, con DCF/);
    expect(select.querySelector('.month-day-select__number')).toHaveTextContent(/^17$/);
    // selection is its own state: clicking only toggles aria-pressed / data-selected
    fireEvent.click(select);
    expect(select.closest('.month-day-cell')).toHaveAttribute('data-selected', 'true');
    expect(select.querySelector('[data-marker="info"]')).not.toBeNull();
  });

  it('a day with only informative history (no review) shows the info marker and NEVER the warning marker', () => {
    renderWith([shift('a', '2026-08-05', { layer: 'CHANGE' })]);
    const select = screen.getByTestId('month-day-select-2026-08-05');
    expect(select.querySelector('[data-marker="info"]')).not.toBeNull();
    expect(select.querySelector('[data-marker="warning"]')).toBeNull();
  });

  it('REQUIRES_REVIEW without any visible change shows the warning marker and counts no dot for the proposal', () => {
    renderWith([shift('r', '2026-08-06', { effectiveState: 'REQUIRES_REVIEW', layer: 'COMPANY_PLAN' })]);
    const select = screen.getByTestId('month-day-select-2026-08-06');
    expect(select.querySelector('[data-marker="warning"]')).not.toBeNull();
    expect(screen.getByTestId('month-day-dots-2026-08-06').querySelectorAll('.month-dot')).toHaveLength(0);
  });

  it('without provenance (no backend session) neither review nor history markers appear; plain days show none', () => {
    renderWith([shift('r', '2026-08-06', { effectiveState: 'REQUIRES_REVIEW' }), shift('a', '2026-08-07', { layer: 'COMPANY_PLAN' })], [], false);
    expect(document.querySelectorAll('[data-marker]')).toHaveLength(0);
  });

  it('exactly three shifts: three dots, no "+N"; four: "+1"', () => {
    renderWith([...render4().slice(0, 3)]);
    expect(screen.getByTestId('month-day-dots-2026-08-17').querySelector('.month-dot-more')).toBeNull();
    cleanup();
    renderWith(render4());
    expect(screen.getByTestId('month-day-dots-2026-08-17').querySelector('.month-dot-more')).toHaveTextContent('+1');
  });

  it('the agenda header is one line: short date, compact Add (full accessible name) and the detail icon; no counter, no footer, accesses right after the rows', () => {
    renderWith(render4().slice(0, 2));
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-17'));
    const agenda = screen.getByTestId('month-day-agenda');
    const header = agenda.querySelector('.month-day-agenda__header') as HTMLElement;
    expect(within(header).getByRole('heading', { level: 2 })).toHaveTextContent('Lun 17 ago.');
    expect(within(header).getByRole('heading', { level: 2 })).toHaveAccessibleName(/lunes.*17.*agosto/i);
    expect(agenda.querySelector('h3')).toBeNull();
    const add = within(header).getByRole('button', { name: 'Añadir turno' });
    expect(add).toHaveTextContent('Añadir');
    expect(within(header).getByRole('button', { name: 'Ver detalle' })).toBeInTheDocument(); // no pills ⇒ not a duplicate
    expect(agenda.querySelector('.month-day-agenda__footer')).toBeNull();
    expect(agenda.querySelector('.month-day-agenda__count')).toBeNull();
    expect(within(agenda).getByRole('list', { name: '2 turnos' })).toBeInTheDocument();
  });

  it('with accesses (avisos/DCF/comentarios) "Ver detalle" is not duplicated and the accesses follow the rows directly', () => {
    renderWith(render4().slice(0, 2), [annotation('1', 'COMMENT', '2026-08-17')]);
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-17'));
    const agenda = screen.getByTestId('month-day-agenda');
    expect(within(agenda).queryByTestId('month-day-agenda-detail')).toBeNull();
    const children = [...agenda.children].map((el) => el.className.split(' ')[0]);
    expect(children.indexOf('month-day-agenda__pills')).toBe(children.indexOf('month-day-agenda__list') + 1);
  });

  it('English: short date and "Add" with the full accessible name', () => {
    mockMatchMedia(true);
    localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
    render(<I18nProvider><MonthGrid year={2026} month={7} shifts={render4().slice(0, 1)} annotations={[]} onEditShift={vi.fn()} onCreateShift={vi.fn()} role="OWNER" /></I18nProvider>);
    fireEvent.click(screen.getByTestId('month-day-select-2026-08-17'));
    const agenda = screen.getByTestId('month-day-agenda');
    expect(within(agenda).getByRole('heading', { level: 2 })).toHaveTextContent('Mon 17 Aug');
    expect(within(agenda).getByRole('button', { name: 'Add shift' })).toHaveTextContent('Add');
  });
});

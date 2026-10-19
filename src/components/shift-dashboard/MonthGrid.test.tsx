// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { MAX_VISIBLE_DAY_ITEMS, MonthGrid } from './MonthGrid';
import { sortDayShifts } from '../../lib/shifts';
import { Shift } from '../../lib/types';
import { getOperationalDate } from '../../lib/operational-date';

setupLocalStorageMock();
afterEach(cleanup);

function renderGrid({
  locale = 'es',
  shifts = [],
  year = 2026,
  month = 7, // August 2026 (0-indexed 7)
  onEditShift = vi.fn(),
  onDeleteShift = vi.fn(),
  onCreateShift = vi.fn(),
  requestedDetailDate,
}: {
  locale?: 'es' | 'en';
  shifts?: Shift[];
  year?: number;
  month?: number;
  onEditShift?: (id: string) => void;
  onDeleteShift?: (id: string) => void | Promise<void>;
  onCreateShift?: (date: string) => void;
  requestedDetailDate?: string;
} = {}) {
  if (locale === 'en') {
    localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
  } else {
    localStorage.removeItem('anclora_shiftimport_locale_v1');
  }
  const utils = render(
    <I18nProvider>
      <MonthGrid
        year={year}
        month={month}
        shifts={shifts}
        onEditShift={onEditShift}
        onDeleteShift={onDeleteShift}
        onCreateShift={onCreateShift}
        requestedDetailDate={requestedDetailDate}
      />
    </I18nProvider>,
  );
  return { ...utils, onEditShift, onDeleteShift, onCreateShift };
}

describe('MonthGrid week-start policy', () => {
  it('es-ES: weekday header row reads L M X J V S D (Monday-first)', () => {
    renderGrid({ locale: 'es' });
    const headers = document.querySelectorAll('.month-weekday-cell');
    expect(Array.from(headers).map((el) => el.textContent)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
  });

  it('en-GB: weekday header row reads Mo Tu We Th Fr Sa Su (Monday-first, not Sunday-first)', () => {
    renderGrid({ locale: 'en' });
    const headers = document.querySelectorAll('.month-weekday-cell');
    expect(Array.from(headers).map((el) => el.textContent)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  });

  it('changing locale does not move a persisted shift to a different calendar cell', () => {
    const shift: Shift = { id: 's1', date: '2026-08-01', startTime: '08:00', endTime: '14:00', location: 'Regular', origin: 'MAN' };

    renderGrid({ locale: 'es', shifts: [shift] });
    const esBadge = screen.getByText(/08:00/);
    const esCell = esBadge.closest('.month-day-cell');
    const esDayNumber = esCell?.querySelector('.month-day-number')?.textContent;
    expect(esDayNumber).toBe('1');

    cleanup();
    renderGrid({ locale: 'en', shifts: [shift] });
    const enBadge = screen.getByText(/08:00/);
    const enCell = enBadge.closest('.month-day-cell');
    const enDayNumber = enCell?.querySelector('.month-day-number')?.textContent;
    expect(enDayNumber).toBe('1');

    expect(esDayNumber).toBe(enDayNumber);
  });

  it('marks only today for the scoped hover treatment', () => {
    const today = getOperationalDate();
    const [year, month] = today.split('-').map(Number);
    renderGrid({ locale: 'es', year, month: month - 1 });

    const todayCells = Array.from(document.querySelectorAll('.month-day-cell[data-today="true"]'));
    expect(todayCells).toHaveLength(1);
    expect(document.querySelectorAll('.month-day-cell:not([data-today="true"])')).toHaveLength(
      document.querySelectorAll('.month-day-cell').length - 1,
    );
  });
});

describe('sortDayShifts helper', () => {
  it('places all-day events before timed shifts', () => {
    const timed: Shift = { id: 's-timed', date: '2026-08-10', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' };
    const vacation: Shift = { id: 's-vac', date: '2026-08-10', startTime: '', endTime: '', location: 'Vacaciones', origin: 'MAN' };

    const sorted = sortDayShifts([timed, vacation]);
    expect(sorted[0].id).toBe('s-vac');
    expect(sorted[1].id).toBe('s-timed');
  });

  it('orders timed shifts chronologically by startTime, then endTime', () => {
    const sAfternoon: Shift = { id: 's3', date: '2026-08-10', startTime: '16:00', endTime: '20:00', location: 'Regular', origin: 'MAN' };
    const sMorningShort: Shift = { id: 's1', date: '2026-08-10', startTime: '08:00', endTime: '11:00', location: 'Regular', origin: 'MAN' };
    const sMorningLong: Shift = { id: 's2', date: '2026-08-10', startTime: '08:00', endTime: '14:00', location: 'Regular', origin: 'MAN' };

    const sorted = sortDayShifts([sAfternoon, sMorningLong, sMorningShort]);
    expect(sorted.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('MonthGrid cell item limit (MAX_VISIBLE_DAY_ITEMS = 2) & Day Detail Dialog', () => {
  it('renders up to 2 items without +N más button', () => {
    const shifts: Shift[] = [
      { id: 's1', date: '2026-08-15', startTime: '08:00', endTime: '12:00', location: 'Regular', origin: 'MAN' },
      { id: 's2', date: '2026-08-15', startTime: '12:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ];

    renderGrid({ shifts });

    const badges = document.querySelectorAll('.month-shift-badge');
    expect(badges).toHaveLength(2);
    expect(document.querySelector('.month-day-more-button')).not.toBeInTheDocument();
  });

  it('renders exactly 2 visible items and a compact +N chip when a day has > 2 shifts (never 3)', () => {
    const shifts: Shift[] = [
      { id: 's1', date: '2026-08-15', startTime: '08:00', endTime: '11:00', location: 'Regular', origin: 'MAN' },
      { id: 's2', date: '2026-08-15', startTime: '11:00', endTime: '13:00', location: 'Regular', origin: 'MAN' },
      { id: 's3', date: '2026-08-15', startTime: '14:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
      { id: 's4', date: '2026-08-15', startTime: '16:00', endTime: '18:00', location: 'Regular', origin: 'MAN' },
    ];

    renderGrid({ shifts });

    const badges = document.querySelectorAll('.month-shift-badge');
    expect(badges).toHaveLength(MAX_VISIBLE_DAY_ITEMS);
    expect(badges).toHaveLength(2);

    const moreBtn = screen.getByTestId('day-more-btn-2026-08-15');
    expect(moreBtn).toBeInTheDocument();
    expect(moreBtn).toHaveTextContent('+2');
    expect(moreBtn).toHaveAttribute('aria-label', 'Mostrar 2 turnos más');
  });

  it('renders +8 when a day has 10 shifts, never rendering more than 2 badges', () => {
    const shifts: Shift[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s-${i + 1}`,
      date: '2026-08-15',
      startTime: `${String(8 + i).padStart(2, '0')}:00`,
      endTime: `${String(9 + i).padStart(2, '0')}:00`,
      location: 'Regular',
      origin: 'MAN',
    }));

    renderGrid({ shifts });

    const badges = document.querySelectorAll('.month-shift-badge');
    expect(badges).toHaveLength(2);

    const moreBtn = screen.getByTestId('day-more-btn-2026-08-15');
    expect(moreBtn).toHaveTextContent('+8');
    expect(moreBtn).toHaveAttribute('aria-label', 'Mostrar 8 turnos más');
  });

  it('uses compact visible content and singular accessible copy for one extra shift', () => {
    const shifts: Shift[] = [
      { id: 's1', date: '2026-08-15', startTime: '08:00', endTime: '11:00', location: 'Regular', origin: 'MAN' },
      { id: 's2', date: '2026-08-15', startTime: '11:00', endTime: '13:00', location: 'Regular', origin: 'MAN' },
      { id: 's3', date: '2026-08-15', startTime: '14:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ];

    renderGrid({ shifts });

    const moreBtn = screen.getByTestId('day-more-btn-2026-08-15');
    expect(moreBtn).toHaveTextContent('+1');
    expect(moreBtn).not.toHaveTextContent('más');
    expect(moreBtn).toHaveAttribute('aria-label', 'Mostrar 1 turno más');
  });

  it('localizes the compact chip and complete accessible copy in English', () => {
    const shifts: Shift[] = Array.from({ length: 3 }, (_, i) => ({
      id: `s-${i + 1}`,
      date: '2026-08-15',
      startTime: `${String(8 + i).padStart(2, '0')}:00`,
      endTime: `${String(9 + i).padStart(2, '0')}:00`,
      location: 'Regular',
      origin: 'MAN',
    }));

    renderGrid({ locale: 'en', shifts });

    const moreBtn = screen.getByTestId('day-more-btn-2026-08-15');
    expect(moreBtn).toHaveTextContent('+1');
    expect(moreBtn).toHaveAttribute('aria-label', 'Show 1 more shift');
  });

  it('clicking visible shift opens editor without creating a new shift', () => {
    const onEditShift = vi.fn();
    const onCreateShift = vi.fn();

    const shifts: Shift[] = [
      { id: 's1', date: '2026-08-15', startTime: '08:00', endTime: '12:00', location: 'Regular', origin: 'MAN' },
    ];

    renderGrid({ shifts, onEditShift, onCreateShift });

    const badge = screen.getByText(/08:00/);
    fireEvent.click(badge);

    expect(onEditShift).toHaveBeenCalledWith('s1');
    expect(onCreateShift).not.toHaveBeenCalled();
  });

  it('clicking +N más opens DayDetailModal, does not trigger onCreateShift, and allows editing/deleting', async () => {
    const onEditShift = vi.fn();
    const onDeleteShift = vi.fn();
    const onCreateShift = vi.fn();

    const shifts: Shift[] = [
      { id: 's-vac', date: '2026-08-15', startTime: '', endTime: '', location: 'Vacaciones', origin: 'MAN' },
      { id: 's1', date: '2026-08-15', startTime: '08:00', endTime: '11:00', location: 'Regular', origin: 'MAN' },
      { id: 's2', date: '2026-08-15', startTime: '11:00', endTime: '13:00', location: 'Regular', origin: 'MAN' },
      { id: 's3', date: '2026-08-15', startTime: '14:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ];

    const { rerender } = renderGrid({ shifts, onEditShift, onDeleteShift, onCreateShift });

    const moreBtn = screen.getByTestId('day-more-btn-2026-08-15');
    expect(moreBtn).toHaveTextContent('+2');

    // Click +2 más
    fireEvent.click(moreBtn);

    // onCreateShift must NOT have been called
    expect(onCreateShift).not.toHaveBeenCalled();

    // DayDetailModal opens
    await waitFor(() => {
      expect(screen.getByTestId('day-detail-dialog')).toBeInTheDocument();
    });

    // Contains count badge (4 items)
    expect(screen.getByTestId('day-detail-count-badge')).toHaveTextContent('4');

    // All-day and timed sections present
    expect(screen.getByTestId('day-detail-allday-section')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-timed-section')).toBeInTheDocument();

    // All 4 items are listed in detail
    expect(screen.getByTestId('day-detail-item-s-vac')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-item-s1')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-item-s2')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-item-s3')).toBeInTheDocument();

    // Click edit on s1
    const editBtn = screen.getByTestId('edit-shift-btn-s1');
    fireEvent.click(editBtn);

    expect(onEditShift).toHaveBeenCalledWith('s1');

    // Reopen detail modal to test delete confirmation
    fireEvent.click(screen.getByTestId('day-more-btn-2026-08-15'));
    await waitFor(() => {
      expect(screen.getByTestId('day-detail-dialog')).toBeInTheDocument();
    });

    // Click delete on s3
    const deleteBtn = screen.getByTestId('delete-shift-btn-s3');
    fireEvent.click(deleteBtn);

    // Confirmation bar appears
    expect(screen.getByTestId('confirm-delete-s3')).toBeInTheDocument();
    const confirmBtn = screen.getByTestId('confirm-delete-btn-s3');
    fireEvent.click(confirmBtn);

    expect(onDeleteShift).toHaveBeenCalledWith('s3');

    // When shifts drop to 2, rerender updates grid and +N más disappears
    rerender(
      <I18nProvider>
        <MonthGrid
          year={2026}
          month={7}
          shifts={shifts.slice(0, 2)}
          onEditShift={onEditShift}
          onDeleteShift={onDeleteShift}
          onCreateShift={onCreateShift}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('day-more-btn-2026-08-15')).not.toBeInTheDocument();
  });

  it('keeps the selected date and renders the daily empty state after the last shift is deleted', async () => {
    const onDeleteShift = vi.fn();
    const shifts: Shift[] = [
      { id: 's1', date: '2026-08-15', startTime: '08:00', endTime: '11:00', location: 'Regular', origin: 'MAN' },
      { id: 's2', date: '2026-08-15', startTime: '11:00', endTime: '13:00', location: 'Ausencia', origin: 'MAN' },
      { id: 's3', date: '2026-08-15', startTime: '14:00', endTime: '16:00', location: 'Regular', origin: 'MAN' },
    ];
    const { rerender } = renderGrid({ shifts, onDeleteShift });

    fireEvent.click(screen.getByTestId('day-more-btn-2026-08-15'));
    await waitFor(() => expect(screen.getByTestId('day-detail-dialog')).toBeInTheDocument());

    const renderCurrent = (currentShifts: Shift[]) => rerender(
      <I18nProvider>
        <MonthGrid
          year={2026}
          month={7}
          shifts={currentShifts}
          onEditShift={vi.fn()}
          onDeleteShift={onDeleteShift}
          onCreateShift={vi.fn()}
        />
      </I18nProvider>,
    );

    let currentShifts = shifts;
    for (const shift of [...shifts].reverse()) {
      fireEvent.click(screen.getByTestId(`delete-shift-btn-${shift.id}`));
      fireEvent.click(screen.getByTestId(`confirm-delete-btn-${shift.id}`));
      await waitFor(() => expect(onDeleteShift).toHaveBeenCalledWith(shift.id));
      currentShifts = currentShifts.filter((candidate) => candidate.id !== shift.id);
      renderCurrent(currentShifts);
    }

    expect(onDeleteShift).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('day-detail-count-badge')).toHaveTextContent('0');
    expect(screen.getByTestId('day-detail-empty-state')).toHaveTextContent(
      'No hay turnos registrados para este empleado el 15 de agosto de 2026.',
    );
    expect(screen.queryByTestId('day-more-btn-2026-08-15')).not.toBeInTheDocument();
  });
});

describe('MonthGrid cell capacity with a pending difference', () => {
  const current = (id: string, startTime: string, endTime: string): Shift => ({ id, date: '2026-09-17', startTime, endTime, location: 'Regular', origin: 'IMP', shiftType: 'Regular', effectiveState: 'EFFECTIVE' } as Shift);
  const proposal: Shift = { id: 'proposal', date: '2026-09-17', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'IMP', shiftType: 'Regular', effectiveState: 'REQUIRES_REVIEW' } as Shift;

  const renderReview = (count: number) => {
    const shifts = [current('s1', '04:30', '07:30'), current('s2', '08:00', '11:00'), current('s3', '12:00', '15:00')].slice(0, count).concat(proposal);
    return render(
      <I18nProvider>
        <MonthGrid year={2026} month={8} shifts={shifts} onEditShift={vi.fn()} onCreateShift={vi.fn()} provenanceEnabled employeeId="e1" canReconcile />
      </I18nProvider>,
    );
  };
  const cell = () => document.querySelector('[data-testid="day-history-btn-2026-09-17"]')!.closest('.month-day-cell') as HTMLElement;

  it('G2/G4: two shifts and the warning share the cell without a +N chip', () => {
    renderReview(2);
    expect(cell().querySelectorAll('.month-shift-badge')).toHaveLength(2);
    expect(cell().querySelector('[data-testid="day-more-btn-2026-09-17"]')).toBeNull();
    expect(cell().querySelector('.month-day-add-button')).not.toBeNull();
  });

  it('G4: three shifts + warning → warning + add + two bands + +1 (never a third band)', () => {
    renderReview(3);
    expect(cell().querySelector('[data-testid="day-history-btn-2026-09-17"]')).not.toBeNull();
    expect(cell().querySelector('.month-day-add-button')).not.toBeNull();
    expect(cell().querySelectorAll('.month-shift-badge')).toHaveLength(MAX_VISIBLE_DAY_ITEMS);
    expect(cell().querySelector('[data-testid="day-more-btn-2026-09-17"]')).toHaveTextContent('+1');
  });

  it('G5: warning and add buttons are laid out from the same size token (same footprint)', () => {
    renderReview(3);
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    const shared = css.match(/\.month-day-add-button,\s*\.month-day-history-button\s*{[^}]*}/)?.[0] ?? '';
    expect(shared).toMatch(/width:\s*var\(--day-action-size\)/);
    expect(shared).toMatch(/height:\s*var\(--day-action-size\)/);
    expect(shared).toMatch(/flex:\s*0 0 var\(--day-action-size\)/);
    // neither button re-declares its own fixed size anywhere (breakpoints only change the token)
    expect(css).not.toMatch(/\.month-day-(add|history)-button\s*{[^}]*\b(width|height):\s*\d+px/);
  });

  it('G6/G7: warning and +N open the day detail', async () => {
    renderReview(3);
    fireEvent.click(document.querySelector('[data-testid="day-history-btn-2026-09-17"]')!);
    expect(await screen.findByTestId('day-detail-dialog')).toBeInTheDocument();
  });
});

describe('MonthGrid current-only day detail for pending differences', () => {
  const cellFor = (dayNumber: string) => Array.from(document.querySelectorAll('.month-day-cell'))
    .find((cell) => cell.querySelector('.month-day-number')?.textContent === dayNumber) as HTMLElement;

  it('2026-01-07: JT current is shown once as Regular; proposals stay out of calendar and detail, with source ID preserved', async () => {
    const onEditShift = vi.fn();
    const shifts: Shift[] = [
      { id: 'jt-current', date: '2026-01-07', startTime: '17:00', endTime: '01:00', location: 'JT', shiftType: 'JT', dutyRole: 'shift_lead', origin: 'IMP', effectiveState: 'EFFECTIVE' },
      { id: 'proposal-same', date: '2026-01-07', startTime: '17:00', endTime: '01:00', location: 'Regular', shiftType: 'Regular', origin: 'IMP', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-01-08T10:00:00Z' },
      { id: 'proposal-other', date: '2026-01-07', startTime: '16:00', endTime: '00:00', location: 'Regular', shiftType: 'Regular', origin: 'IMP', effectiveState: 'REQUIRES_REVIEW', createdAt: '2026-01-09T10:00:00Z' },
    ];
    renderGrid({ year: 2026, month: 0, shifts, requestedDetailDate: '2026-01-07', onEditShift });

    expect(cellFor('7').querySelectorAll('.month-shift-badge')).toHaveLength(1);
    expect(cellFor('7')).toHaveTextContent('Regular 17:00–01:00');
    expect(await screen.findByTestId('day-detail-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-count-badge')).toHaveTextContent('1 elemento');
    expect(screen.getByTestId('day-detail-item-jt-current')).toHaveTextContent('Regular');
    expect(screen.queryByTestId('day-detail-item-proposal-same')).not.toBeInTheDocument();
    expect(screen.queryByTestId('day-detail-item-proposal-other')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('edit-shift-btn-jt-current'));
    expect(onEditShift).toHaveBeenCalledWith('jt-current');

    cleanup();
    const onDeleteShift = vi.fn();
    renderGrid({ year: 2026, month: 0, shifts, requestedDetailDate: '2026-01-07', onDeleteShift });
    await screen.findByTestId('day-detail-dialog');
    fireEvent.click(screen.getByTestId('delete-shift-btn-jt-current'));
    fireEvent.click(screen.getByTestId('confirm-delete-btn-jt-current'));
    expect(onDeleteShift).toHaveBeenCalledWith('jt-current');
  });

  it('2026-01-14: keeps both CURRENT intervals and excludes the matching proposed Regular', async () => {
    const shifts: Shift[] = [
      { id: 'regular-current', date: '2026-01-14', startTime: '06:00', endTime: '11:00', location: 'Regular', shiftType: 'Regular', origin: 'IMP', effectiveState: 'EFFECTIVE' },
      { id: 'extras-current', date: '2026-01-14', startTime: '11:00', endTime: '13:00', location: 'Extras', shiftType: 'Extras', origin: 'IMP', effectiveState: 'EFFECTIVE' },
      { id: 'regular-proposed', date: '2026-01-14', startTime: '06:00', endTime: '11:00', location: 'Regular', shiftType: 'Regular', origin: 'IMP', effectiveState: 'REQUIRES_REVIEW' },
    ];
    renderGrid({ year: 2026, month: 0, shifts, requestedDetailDate: '2026-01-14' });

    expect(cellFor('14').querySelectorAll('.month-shift-badge')).toHaveLength(2);
    expect(await screen.findByTestId('day-detail-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-count-badge')).toHaveTextContent('2 elementos');
    expect(screen.getByTestId('day-detail-item-regular-current')).toBeInTheDocument();
    expect(screen.getByTestId('day-detail-item-extras-current')).toBeInTheDocument();
    expect(screen.queryByTestId('day-detail-item-regular-proposed')).not.toBeInTheDocument();
  });

  it('pending detail rows always equal the deterministic CURRENT projection', async () => {
    const shifts: Shift[] = [
      { id: 'current', date: '2026-01-21', startTime: '08:00', endTime: '16:00', location: 'Regular', shiftType: 'Regular', origin: 'IMP', effectiveState: 'EFFECTIVE' },
      { id: 'proposal', date: '2026-01-21', startTime: '09:00', endTime: '17:00', location: 'Regular', shiftType: 'Regular', origin: 'IMP', effectiveState: 'REQUIRES_REVIEW' },
    ];
    renderGrid({ year: 2026, month: 0, shifts, requestedDetailDate: '2026-01-21' });
    await screen.findByTestId('day-detail-dialog');
    const displayed = Array.from(document.querySelectorAll('[data-testid^="day-detail-item-"]'))
      .map((item) => item.getAttribute('data-testid')?.replace('day-detail-item-', ''));
    expect(displayed).toEqual(['current']);
    expect(displayed).not.toContain('proposal');
  });
});

describe('MonthGrid planning drafts', () => {
  it('shows a draft as a marked, read-only row: click opens the day, never the editor', async () => {
    const onEditShift = vi.fn();
    const draft = { id: 'draft:a1', date: '2026-11-25', startTime: '14:00', endTime: '22:00', location: 'Regular', origin: 'IMP', shiftType: 'Regular', isDraft: true } as Shift;
    render(
      <I18nProvider>
        <MonthGrid year={2026} month={10} shifts={[draft]} onEditShift={onEditShift} onCreateShift={vi.fn()} />
      </I18nProvider>,
    );
    const badge = document.querySelector('.month-shift-badge.is-draft') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Borrador');
    fireEvent.click(badge);
    expect(onEditShift).not.toHaveBeenCalled();
    expect(await screen.findByTestId('day-detail-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-shift-btn-draft:a1')).toBeNull();
  });
});

describe('MonthGrid "day changed" indicator is a VISIBLE change, not technical history', () => {
  const day = (extra: Partial<Shift>): Shift => ({ id: 's1', date: '2026-07-16', startTime: '', endTime: '', location: 'Vacaciones', origin: 'IMP', shiftType: 'Vacaciones', effectiveState: 'EFFECTIVE', ...extra } as Shift);
  const indicator = (shifts: Shift[]) => {
    const view = render(
      <I18nProvider>
        <MonthGrid year={2026} month={6} shifts={shifts} onEditShift={vi.fn()} onCreateShift={vi.fn()} provenanceEnabled employeeId="e1" canReconcile />
      </I18nProvider>,
    );
    const button = view.container.querySelector('[data-testid="day-history-btn-2026-07-16"]');
    view.unmount();
    return button;
  };

  it('a change id on a day whose history equals what is shown (Vacaciones → Vacaciones) shows no indicator', () => {
    expect(indicator([day({ changeId: 'c-1', hasHistory: false })])).toBeNull();
  });
  it('a day with a real visible change (the server flags history that differs) shows the indicator', () => {
    expect(indicator([day({ shiftType: 'Libre', location: 'Libre', changeId: 'c-2', hasHistory: true })])).not.toBeNull();
  });
  it('a pending difference still shows the warning', () => {
    const button = indicator([day({ effectiveState: 'REQUIRES_REVIEW' })]);
    expect(button).not.toBeNull();
    expect(button?.getAttribute('data-review')).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
}: {
  locale?: 'es' | 'en';
  shifts?: Shift[];
  year?: number;
  month?: number;
  onEditShift?: (id: string) => void;
  onDeleteShift?: (id: string) => void | Promise<void>;
  onCreateShift?: (date: string) => void;
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

  it('renders exactly 2 visible items and +N más button when a day has > 2 shifts (never 3)', () => {
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
    expect(moreBtn).toHaveTextContent('+2 más');
    expect(moreBtn).toHaveAttribute('aria-label', 'Mostrar 2 turnos más del 2026-08-15');
  });

  it('renders +8 más when a day has 10 shifts, never rendering more than 2 badges', () => {
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
    expect(moreBtn).toHaveTextContent('+8 más');
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
    expect(moreBtn).toHaveTextContent('+2 más');

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

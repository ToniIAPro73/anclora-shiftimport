// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { MonthGrid } from './MonthGrid';
import { Shift } from '../../lib/types';

setupLocalStorageMock();
afterEach(cleanup);

function renderGrid(locale: 'es' | 'en', shifts: Shift[] = []) {
  if (locale === 'en') {
    localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
  } else {
    localStorage.removeItem('anclora_shiftimport_locale_v1');
  }
  return render(
    <I18nProvider>
      <MonthGrid year={2026} month={7} shifts={shifts} onEditShift={() => {}} onCreateShift={() => {}} />
    </I18nProvider>,
  );
}

describe('MonthGrid week-start policy', () => {
  it('es-ES: weekday header row reads L M X J V S D (Monday-first)', () => {
    renderGrid('es');
    const headers = document.querySelectorAll('.month-weekday-cell');
    expect(Array.from(headers).map((el) => el.textContent)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
  });

  it('en-GB: weekday header row reads Mo Tu We Th Fr Sa Su (Monday-first, not Sunday-first)', () => {
    renderGrid('en');
    const headers = document.querySelectorAll('.month-weekday-cell');
    expect(Array.from(headers).map((el) => el.textContent)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  });

  it('changing locale does not move a persisted shift to a different calendar cell', () => {
    const shift: Shift = { id: 's1', date: '2026-08-01', startTime: '08:00', endTime: '14:00', location: 'Regular', origin: 'MAN' };

    renderGrid('es', [shift]);
    // 2026-08-01 is a Saturday; Monday-first week places it in the 6th column.
    const esBadge = screen.getByText(/08:00/);
    const esCell = esBadge.closest('.month-day-cell');
    const esDayNumber = esCell?.querySelector('.month-day-number')?.textContent;
    expect(esDayNumber).toBe('1');

    cleanup();
    renderGrid('en', [shift]);
    const enBadge = screen.getByText(/08:00/);
    const enCell = enBadge.closest('.month-day-cell');
    const enDayNumber = enCell?.querySelector('.month-day-number')?.textContent;
    expect(enDayNumber).toBe('1');

    // Same underlying date, same grid position regardless of locale.
    expect(esDayNumber).toBe(enDayNumber);
  });
});

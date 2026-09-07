import { Shift } from './types';

export interface FormattedShiftOption {
  shiftId: string;
  weekday: string;
  dateStr: string;
  timeOrType: string;
  location?: string;
  isOff: boolean;
  fullLabel: string;
}

export function formatRequestDateTime(iso: string | undefined, locale = 'es'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-GB';
  const datePart = d.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

export function formatShiftOption(shift: Shift, locale = 'es'): FormattedShiftOption {
  const [year, month, day] = (shift.date || '').split('-').map(Number);
  const dateObj = year && month ? new Date(year, month - 1, day || 1) : null;
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-GB';

  let weekday = '';
  let dateStr = shift.date;
  if (dateObj && !isNaN(dateObj.getTime())) {
    weekday = dateObj.toLocaleDateString(dateLocale, { weekday: 'short' });
    weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    dateStr = dateObj.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const isOff = shift.countsAsWork === false ||
    shift.shiftType === 'LIBRE' ||
    shift.shiftType === 'VACACIONES' ||
    (!shift.startTime && !shift.endTime) ||
    shift.startTime === '--' ||
    shift.startTime === '-';

  let timeOrType = '';
  if (isOff) {
    if (shift.shiftType === 'VACACIONES') {
      timeOrType = locale === 'es' ? 'Vacaciones' : 'Vacation';
    } else {
      timeOrType = locale === 'es' ? 'Libre' : 'Off';
    }
  } else if (shift.startTime && shift.endTime && shift.startTime !== '--') {
    timeOrType = `${shift.startTime} — ${shift.endTime}`;
  } else if (shift.shiftType) {
    timeOrType = shift.shiftType;
  } else {
    timeOrType = locale === 'es' ? 'Turno' : 'Shift';
  }

  const loc = shift.location ? ` (${shift.location})` : '';
  const fullLabel = `${weekday ? `${weekday}, ` : ''}${dateStr} · ${timeOrType}${loc}`;

  return {
    shiftId: shift.id,
    weekday,
    dateStr,
    timeOrType,
    location: shift.location,
    isOff,
    fullLabel,
  };
}

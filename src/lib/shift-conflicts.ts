/**
 * Shift conflict rules, extracted from App.tsx so they can be unit tested.
 * A conflict check compares an incoming shift against the existing shifts of
 * the same date and origin, honoring the configurable shift-type registry.
 */
import { Locale, translate } from './i18n';
import { getShiftOrigin, getShiftType, hasShiftTimes } from './shifts';
import { shiftTypeCountsAsWork } from './shift-types';
import { normalizeShift } from './storage';
import { parseHHMM } from './time';
import { Shift } from './types';

export function timeRangesOverlap(left: Shift, right: Shift): boolean {
  if (!hasShiftTimes(left) || !hasShiftTimes(right)) {
    return false;
  }

  const leftStart = parseHHMM(left.startTime);
  const leftEnd = parseHHMM(left.endTime) <= leftStart
    ? parseHHMM(left.endTime) + (24 * 60)
    : parseHHMM(left.endTime);
  const rightStart = parseHHMM(right.startTime);
  const rightEnd = parseHHMM(right.endTime) <= rightStart
    ? parseHHMM(right.endTime) + (24 * 60)
    : parseHHMM(right.endTime);

  const intervals: Array<[number, number]> = [
    [leftStart, leftEnd],
    [leftStart + (24 * 60), leftEnd + (24 * 60)],
  ];
  const candidates: Array<[number, number]> = [
    [rightStart, rightEnd],
    [rightStart + (24 * 60), rightEnd + (24 * 60)],
  ];

  return intervals.some(([aStart, aEnd]) =>
    candidates.some(([bStart, bEnd]) => aStart < bEnd && bStart < aEnd));
}

/**
 * Returns a human-readable conflict reason, or null when the incoming shift
 * can be saved alongside the existing ones. Messages are localized via the
 * centralized i18n layer (default 'es' keeps existing callers/tests intact).
 */
export function findShiftConflict(current: Shift[], incoming: Shift, locale: Locale = 'es'): string | null {
  const normalizedIncoming = normalizeShift(incoming);
  const incomingType = getShiftType(normalizedIncoming);
  const incomingOrigin = getShiftOrigin(normalizedIncoming);
  const comparable = current.filter(
    (shift) =>
      shift.id !== normalizedIncoming.id &&
      shift.date === normalizedIncoming.date &&
      getShiftOrigin(shift) === incomingOrigin,
  );

  const existingVacation = comparable.find((shift) => getShiftType(shift) === 'Vacaciones');
  if (existingVacation && incomingType !== 'Vacaciones') {
    return translate(locale, 'conflicts.vacationExists', { type: incomingType, date: normalizedIncoming.date });
  }

  const sameType = comparable.find(
    (shift) => getShiftType(shift) === incomingType && incomingType !== 'Extras',
  );
  if (sameType) {
    return translate(locale, 'conflicts.duplicateType', { type: incomingType, date: normalizedIncoming.date });
  }

  if (incomingType === 'Libre') {
    const incompatible = comparable.find((shift) => {
      const existingType = getShiftType(shift);
      // Generic: Libre conflicts with any type that counts as work plus
      // explicit Libre entries. No company-specific type is hardcoded.
      return shiftTypeCountsAsWork(existingType) || existingType === 'Libre';
    });

    if (incompatible) {
      return translate(locale, 'conflicts.libreConflict', { type: getShiftType(incompatible), date: normalizedIncoming.date });
    }
  }

  if (shiftTypeCountsAsWork(incomingType) && incomingType !== 'Extras') {
    const incompatible = comparable.find((shift) => getShiftType(shift) === 'Libre');

    if (incompatible) {
      return translate(locale, 'conflicts.workConflictsWithLibre', { type: incomingType, date: normalizedIncoming.date });
    }
  }

  if (incomingType === 'Extras' && hasShiftTimes(normalizedIncoming)) {
    const overlapping = comparable.find((shift) => {
      const existingType = getShiftType(shift);
      if (existingType !== 'Regular' && existingType !== 'Extras') {
        return false;
      }

      return hasShiftTimes(shift) && timeRangesOverlap(shift, normalizedIncoming);
    });

    if (overlapping) {
      return translate(locale, 'conflicts.extrasOverlap', { type: getShiftType(overlapping), date: normalizedIncoming.date });
    }
  }

  return null;
}

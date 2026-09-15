import { Locale, translate } from './i18n';
import { getShiftType, hasShiftTimes } from './shifts';
import { getShiftTypeSemantics } from './shift-types';
import { normalizeShift } from './storage';
import { parseHHMM } from './time';
import { Shift } from './types';

export type ShiftConflictCode = 'OVERLAP' | 'FULL_DAY_CONFLICT';

export interface ShiftConflict {
  code: ShiftConflictCode;
  existing: Shift;
  message: string;
}

/**
 * Shared frontend/domain rule for a date: timed records are half-open,
 * therefore 08:00–11:00 and 11:00–12:00 are compatible. Whole-day records
 * are exclusive. A temporal absence is timed and is never treated as Libre.
 */
export function findDomainShiftConflict(
  current: Shift[],
  incoming: Shift,
  locale: Locale = 'es',
): ShiftConflict | null {
  const normalizedIncoming = normalizeShift(incoming);
  const incomingType = getShiftType(normalizedIncoming);
  const incomingSemantics = getShiftTypeSemantics(incomingType);
  const comparable = current.filter((shift) => (
    shift.id !== normalizedIncoming.id && shift.date === normalizedIncoming.date
  ));

  for (const existing of comparable) {
    const existingType = getShiftType(existing);
    const existingSemantics = getShiftTypeSemantics(existingType);

    if (incomingSemantics.exclusive || existingSemantics.exclusive) {
      return {
        code: 'FULL_DAY_CONFLICT',
        existing,
        message: fullDayConflictMessage(locale, existingType, incomingType),
      };
    }

    if (hasShiftTimes(normalizedIncoming) && hasShiftTimes(existing) && rangesOverlap(existing, normalizedIncoming)) {
      return {
        code: 'OVERLAP',
        existing,
        message: translate(locale, 'conflicts.overlap'),
      };
    }
  }

  return null;
}

function rangesOverlap(left: Shift, right: Shift): boolean {
  const leftStart = parseHHMM(left.startTime);
  const leftEnd = parseHHMM(left.endTime) <= leftStart ? parseHHMM(left.endTime) + 1440 : parseHHMM(left.endTime);
  const rightStart = parseHHMM(right.startTime);
  const rightEnd = parseHHMM(right.endTime) <= rightStart ? parseHHMM(right.endTime) + 1440 : parseHHMM(right.endTime);
  return [[leftStart, leftEnd], [leftStart + 1440, leftEnd + 1440]].some(([aStart, aEnd]) =>
    [[rightStart, rightEnd], [rightStart + 1440, rightEnd + 1440]].some(([bStart, bEnd]) => aStart < bEnd && bStart < aEnd));
}

function fullDayConflictMessage(locale: Locale, existingType: string, incomingType: string): string {
  const fullDayType = getShiftTypeSemantics(existingType).exclusive ? existingType : incomingType;
  if (fullDayType === 'Vacaciones') return translate(locale, 'conflicts.vacationFullDay');
  if (fullDayType.toLowerCase() === 'baja') return translate(locale, 'conflicts.leaveFullDay');
  return translate(locale, 'conflicts.dayOffFullDay');
}

export function assertNoDomainShiftConflict(current: Shift[], incoming: Shift, locale: Locale = 'es'): void {
  const conflict = findDomainShiftConflict(current, incoming, locale);
  if (conflict) {
    throw Object.assign(new Error(conflict.message), { code: conflict.code, conflict });
  }
}

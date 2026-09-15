/**
 * Shift conflict rules, extracted from App.tsx so they can be unit tested.
 * A conflict check compares an incoming shift against the existing shifts of
 * the same date and origin, honoring the configurable shift-type registry.
 */
import { Locale } from './i18n';
import { hasShiftTimes } from './shifts';
import { parseHHMM } from './time';
import { Shift } from './types';
import { findDomainShiftConflict } from './shift-compatibility';

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
  return findDomainShiftConflict(current, incoming, locale)?.message ?? null;
}

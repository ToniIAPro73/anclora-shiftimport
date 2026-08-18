import { Shift, ShiftCategory, ShiftOrigin, ShiftWithDerived, WeeklyStats } from './types';
import { durationMinutes, parseHHMM } from './time';
import { DEFAULT_SHIFT_TYPES, resolveShiftTypeId, shiftTypeCountsAsWork } from './shift-types';

const isEmptyTime = (value: string): boolean => value.trim() === '';

export const normalizeShiftTypeLabel = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';

  const importedMatch = normalized.match(/^importado\s*\(([^)]+)\)$/i);
  if (importedMatch) {
    return normalizeShiftTypeLabel(importedMatch[1]);
  }

  return resolveShiftTypeId(normalized) ?? 'Regular';
};

export const getShiftType = (shift: Shift): string => {
  const normalizedFromLocation = normalizeShiftTypeLabel(shift.location);
  if (normalizedFromLocation) {
    return normalizedFromLocation;
  }

  if (isEmptyTime(shift.startTime) && isEmptyTime(shift.endTime)) {
    return 'Libre';
  }

  return 'Regular';
};

export const hasShiftTimes = (shift: Shift): boolean =>
  !isEmptyTime(shift.startTime) && !isEmptyTime(shift.endTime);

export const isFreeShift = (shift: Shift): boolean => getShiftType(shift) === 'Libre';
export const isZeroDurationShift = (shift: Shift): boolean => !shiftTypeCountsAsWork(getShiftType(shift));
export const getShiftOrigin = (shift: Shift): ShiftOrigin => shift.origin === 'PDF' ? 'PDF' : 'MAN';

/**
 * Pure functions for shift business logic.
 */

/**
 * Determines category based on SPEC:
 * Mañana: [08:00 - 14:00)
 * Tarde: [14:00 - 22:00)
 * Noche: Rest
 */
export const computeShiftCategory = (startTime: string): ShiftCategory => {
  if (isEmptyTime(startTime)) return 'Mañana';

  const mins = parseHHMM(startTime);
  const eightAM = 8 * 60;
  const twoPM = 14 * 60;
  const tenPM = 22 * 60;

  if (mins >= eightAM && mins < twoPM) return 'Mañana';
  if (mins >= twoPM && mins < tenPM) return 'Tarde';
  return 'Noche';
};

/**
 * Enriches a shift with derived metadata.
 */
export const enrichShift = (shift: Shift): ShiftWithDerived => ({
  ...shift,
  category: computeShiftCategory(shift.startTime),
  duration: isZeroDurationShift(shift) ? 0 : durationMinutes(shift.startTime, shift.endTime) / 60,
});

/**
 * Filters shifts within a specific week.
 */
export const getShiftsInWeek = (shifts: Shift[], weekDays: string[]): Shift[] => {
  const daySet = new Set(weekDays);
  return shifts.filter(s => daySet.has(s.date));
};

/**
 * Finds the chronologically next shift relative to "now".
 */
export const getNextShift = (shifts: Shift[], now: Date = new Date()): Shift | null => {
  const nowISO = now.toISOString().split('T')[0];
  const nowTime = now.toTimeString().slice(0, 5);

  const upcoming = shifts.filter(s =>
    hasShiftTimes(s) && (
    s.date > nowISO || (s.date === nowISO && s.startTime > nowTime)
  ));

  if (upcoming.length === 0) return null;

  return upcoming.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  })[0];
};

function getShiftIntervals(shift: Shift): Array<[number, number]> {
  if (!hasShiftTimes(shift)) {
    return [];
  }

  const start = parseHHMM(shift.startTime);
  const endBase = parseHHMM(shift.endTime);
  const end = endBase <= start ? endBase + (24 * 60) : endBase;

  if (end <= 24 * 60) {
    return [[start, end]];
  }

  return [
    [start, 24 * 60],
    [0, end - (24 * 60)],
  ];
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: Array<[number, number]> = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
      continue;
    }

    merged.push([...current] as [number, number]);
  }

  return merged;
}

function sumIntervalsMinutes(intervals: Array<[number, number]>): number {
  return mergeIntervals(intervals).reduce((total, [start, end]) => total + (end - start), 0);
}

/**
 * Aggregates statistics for a set of shifts over a given number of days.
 */
export const aggregateWeeklyStats = (shifts: Shift[], totalDays: number = 7): WeeklyStats => {
  const explicitFreeDaySet = new Set(shifts.filter(isFreeShift).map((shift) => shift.date));
  const workedDaySet = new Set(shifts.filter((shift) => !isZeroDurationShift(shift)).map((shift) => shift.date));
  const freeDays = explicitFreeDaySet.size + Math.max(0, totalDays - explicitFreeDaySet.size - workedDaySet.size);
  const hoursByType: Record<string, number> = {};
  const daysByTypeSets: Record<string, Set<string>> = {};
  const knownTypeIds = new Set<string>();

  for (const type of DEFAULT_SHIFT_TYPES) {
    hoursByType[type.id] = 0;
    daysByTypeSets[type.id] = new Set<string>();
    knownTypeIds.add(type.id);
  }

  const intervalsByDate = new Map<string, Array<[number, number]>>();

  for (const shift of shifts) {
    const type = getShiftType(shift);
    const enriched = enrichShift(shift);

    if (knownTypeIds.has(type)) {
      hoursByType[type] += enriched.duration;
      daysByTypeSets[type].add(shift.date);
    }

    if (!isZeroDurationShift(shift)) {
      const currentIntervals = intervalsByDate.get(shift.date) ?? [];
      currentIntervals.push(...getShiftIntervals(shift));
      intervalsByDate.set(shift.date, currentIntervals);
    }
  }

  const totalWorkedMinutes = Array.from(intervalsByDate.values()).reduce(
    (total, intervals) => total + sumIntervalsMinutes(intervals),
    0,
  );

  const daysByType: Record<string, number> = {};
  let totalWorkedDays = 0;
  for (const type of DEFAULT_SHIFT_TYPES) {
    daysByType[type.id] = daysByTypeSets[type.id].size;
    totalWorkedDays += daysByTypeSets[type.id].size;
  }

  return {
    totalWorkedHours: totalWorkedMinutes / 60,
    totalWorkedDays,
    freeDays,
    hoursByType,
    daysByType,
  };
};

export const filterShiftsByOrigin = (shifts: Shift[], origin: ShiftOrigin): Shift[] =>
  shifts.filter((shift) => getShiftOrigin(shift) === origin);

/**
 * Pure functions for week and date manipulation (ISO YYYY-MM-DD strings).
 */

/**
 * Gets the date object for the Monday of the week containing the given date.
 */
export const getWeekStartMonday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

/**
 * Formats a Date object to ISO YYYY-MM-DD.
 */
export const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parses ISO YYYY-MM-DD string to Date object (local time).
 */
export const fromISODate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Gets all 7 days of a week starting from a Monday ISO date.
 */
export const getWeekDaysISO = (mondayISO: string): string[] => {
  const start = fromISODate(mondayISO);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISODate(d);
  });
};

/**
 * Adds or subtracts weeks to an ISO date.
 */
export const addWeeks = (isoDate: string, weeks: number): string => {
  const d = fromISODate(isoDate);
  d.setDate(d.getDate() + (weeks * 7));
  return toISODate(d);
};

/**
 * Checks if two ISO date strings are equal.
 */
export const isSameISODate = (d1: string, d2: string): boolean => d1 === d2;

/**
 * Returns { year, month } for a given date (month is 0-indexed).
 */
export const getYearMonth = (date: Date): { year: number; month: number } => ({
  year: date.getFullYear(),
  month: date.getMonth(),
});

/**
 * Returns the number of days in a given month.
 */
export const getDaysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

/**
 * Returns the weekday index of the 1st of the month, relative to
 * `weekStartsOn` (JS Date.getDay() convention: 0=Sunday..6=Saturday).
 * Defaults to 1 (Monday) — the calendar's week-start policy is a locale
 * property (see lib/i18n.ts getWeekStartsOn), never inferred from the UI
 * language or timezone.
 */
export const getFirstWeekdayOfMonth = (year: number, month: number, weekStartsOn: 0 | 1 = 1): number => {
  const day = new Date(year, month, 1).getDay();
  return (day - weekStartsOn + 7) % 7;
};

/**
 * Returns all ISO date strings for a month.
 */
export const getMonthDaysISO = (year: number, month: number): string[] => {
  const count = getDaysInMonth(year, month);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return toISODate(d);
  });
};

/**
 * Navigate months: returns { year, month } offset by `delta` months.
 */
export const addMonths = (year: number, month: number, delta: number): { year: number; month: number } => {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/**
 * Reorders a 7-item Sunday-first label list (index 0 = Sunday, matching
 * Date.getDay()) to start at `weekStartsOn`, so weekday headers stay in
 * sync with getFirstWeekdayOfMonth for any week-start policy.
 */
export const orderWeekdayLabels = (sundayFirstLabels: string[], weekStartsOn: 0 | 1 = 1): string[] => [
  ...sundayFirstLabels.slice(weekStartsOn),
  ...sundayFirstLabels.slice(0, weekStartsOn),
];

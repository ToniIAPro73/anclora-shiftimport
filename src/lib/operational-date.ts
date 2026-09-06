/**
 * Operational calendar date shared by the historical and scheduling flows.
 * The organization timezone is not configurable in the current data model;
 * keep the product boundary explicit until that setting exists.
 */
export const OPERATIONAL_TIME_ZONE = 'Europe/Madrid';

export function getOperationalDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isHistoricalDate(date: string, today = getOperationalDate()): boolean {
  return date < today;
}

export function shiftOperationalDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getPreviousOperationalDate(now: Date = new Date()): string {
  return shiftOperationalDate(getOperationalDate(now), -1);
}

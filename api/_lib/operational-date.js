/**
 * Keep the API's date-domain boundary aligned with the browser. The database
 * model has no organization timezone setting yet, so this product-level
 * timezone remains explicit and centralized.
 */
export const OPERATIONAL_TIME_ZONE = 'Europe/Madrid';

export function getOperationalDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isHistoricalDate(date, today = getOperationalDate()) {
  return date < today;
}

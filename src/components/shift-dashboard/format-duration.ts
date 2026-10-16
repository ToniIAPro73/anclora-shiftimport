import { splitMinutes } from '../../lib/effective-calendar.js';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function formatDuration(minutes: number, t: Translate, locale: string): string {
  const { sign, hours, minutes: mins } = splitMinutes(minutes);
  const prefix = sign < 0 ? '−' : '';
  const hoursText = hours.toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES');
  if (mins === 0) return prefix + t('effectiveStats.hoursValue', { hours: hoursText });
  if (hours === 0) return prefix + t('effectiveStats.minutesValue', { minutes: mins });
  return prefix + t('effectiveStats.hoursMinutesValue', { hours: hoursText, minutes: mins });
}

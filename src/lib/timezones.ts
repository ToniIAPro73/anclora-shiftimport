import { Locale } from './i18n';

/**
 * Curated IANA timezone identifiers for the profile timezone selector.
 * The stored/canonical value is always the IANA id (DST-safe); only the
 * display label is localized.
 */
export interface TimezoneOption {
  id: string;
  label: { es: string; en: string };
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: 'Europe/Madrid', label: { es: 'Madrid', en: 'Madrid' } },
  { id: 'Europe/London', label: { es: 'Londres', en: 'London' } },
  { id: 'Europe/Paris', label: { es: 'París', en: 'Paris' } },
  { id: 'Europe/Berlin', label: { es: 'Berlín', en: 'Berlin' } },
  { id: 'Europe/Rome', label: { es: 'Roma', en: 'Rome' } },
  { id: 'Europe/Lisbon', label: { es: 'Lisboa', en: 'Lisbon' } },
  { id: 'America/New_York', label: { es: 'Nueva York', en: 'New York' } },
  { id: 'America/Chicago', label: { es: 'Chicago', en: 'Chicago' } },
  { id: 'America/Denver', label: { es: 'Denver', en: 'Denver' } },
  { id: 'America/Los_Angeles', label: { es: 'Los Ángeles', en: 'Los Angeles' } },
  { id: 'America/Mexico_City', label: { es: 'Ciudad de México', en: 'Mexico City' } },
  { id: 'America/Sao_Paulo', label: { es: 'São Paulo', en: 'São Paulo' } },
  { id: 'America/Argentina/Buenos_Aires', label: { es: 'Buenos Aires', en: 'Buenos Aires' } },
  { id: 'Asia/Dubai', label: { es: 'Dubái', en: 'Dubai' } },
  { id: 'Asia/Kolkata', label: { es: 'Calcuta', en: 'Kolkata' } },
  { id: 'Asia/Singapore', label: { es: 'Singapur', en: 'Singapore' } },
  { id: 'Asia/Tokyo', label: { es: 'Tokio', en: 'Tokyo' } },
  { id: 'Asia/Shanghai', label: { es: 'Shanghái', en: 'Shanghai' } },
  { id: 'Australia/Sydney', label: { es: 'Sídney', en: 'Sydney' } },
  { id: 'UTC', label: { es: 'UTC', en: 'UTC' } },
];

export function getTimezoneLabel(id: string, locale: Locale): string {
  const found = TIMEZONE_OPTIONS.find((option) => option.id === id);
  return found ? found.label[locale] : id;
}

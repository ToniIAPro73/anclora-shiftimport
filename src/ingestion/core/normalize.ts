/**
 * Text normalization primitives shared by all ingestion profiles.
 */

/** Lowercases, strips accents and collapses whitespace. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Keeps only the digits of an employee identifier token. */
export function normalizeEmployeeId(value: string): string {
  return value.replace(/\D/g, '');
}

/** Pads `H:mm` to `HH:mm`; leaves non-time tokens untouched. */
export function normalizeTimeToken(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return value.trim();
  }

  return `${String(Number.parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}`;
}

export function isTimeToken(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value.trim());
}

export function isSeparatorToken(value: string): boolean {
  return /^--+$/.test(value.trim());
}

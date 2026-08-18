/**
 * Shift token classification and expansion.
 *
 * "Off" tokens are not hardcoded: they are whatever resolves to the `Libre`
 * type through the configurable shift-type registry (src/lib/shift-types.ts).
 * Company tokens (e.g. dl/aj via SHIFT_TYPE_PRESET_EXAMPLE) therefore work
 * only when the corresponding alias set is loaded.
 */
import { resolveShiftTypeId } from '../../lib/shift-types';
import { isSeparatorToken, isTimeToken, normalizeTimeToken } from './normalize';

export function isOffToken(value: string): boolean {
  return resolveShiftTypeId(value) === 'Libre';
}

/**
 * Expands a raw cell text into an ordered token stream of
 * times (`HH:mm`), `OFF` markers and `--` segment separators.
 */
export function expandShiftTokens(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (isOffToken(trimmed)) {
    return ['OFF'];
  }

  if (isSeparatorToken(trimmed)) {
    return ['--'];
  }

  const segments = trimmed.split(/(--+)/).filter(Boolean);
  const expanded: string[] = [];

  for (const segment of segments) {
    if (isSeparatorToken(segment)) {
      expanded.push('--');
      continue;
    }

    const times = Array.from(segment.matchAll(/\b(\d{1,2}:\d{2})\b/g), (match) => normalizeTimeToken(match[1]));
    if (times.length > 0) {
      expanded.push(...times);
      continue;
    }

    if (isOffToken(segment)) {
      expanded.push('OFF');
    }
  }

  return expanded;
}

export function isEmployeeIdToken(value: string): boolean {
  return /^\(\d+\)$/.test(value.trim());
}

export function looksLikeEmployeeLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isTimeToken(trimmed) || isOffToken(trimmed) || isSeparatorToken(trimmed)) return false;
  if (isEmployeeIdToken(trimmed)) return true;
  return /^[A-Za-zÁÉÍÓÚÜÑ.,' -]+$/.test(trimmed);
}

export function isEmployeeNameLabel(value: string): boolean {
  const trimmed = value.trim();
  return looksLikeEmployeeLabel(trimmed) && !isEmployeeIdToken(trimmed);
}

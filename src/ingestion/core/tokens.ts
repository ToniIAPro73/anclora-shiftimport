/**
 * Shift token classification and expansion.
 *
 * "Off" tokens are not hardcoded: they are whatever resolves to the `Libre`
 * type through the configurable shift-type registry (src/lib/shift-types.ts).
 * Company tokens (e.g. dl/aj via SHIFT_TYPE_PRESET_EXAMPLE) therefore work
 * only when the corresponding alias set is loaded.
 */
import { resolveShiftTypeId } from '../../lib/shift-types';
import { isSeparatorToken, isTimeToken, normalizeText, normalizeTimeToken } from './normalize';
import { resolveCode, ShiftCodeMapping } from './shift-code-profile';

export function isOffToken(value: string): boolean {
  return resolveShiftTypeId(value) === 'Libre';
}

/**
 * Strips a trailing footnote-reference annotation (e.g. `AJ [2]` -> `AJ`,
 * `DL [12]` -> `DL`) some documents print inline in the same cell/text run
 * as the shift code. The footnote itself is document metadata (explained in
 * a separate legend section), never part of the code's identity — matching
 * must ignore it or an annotated occurrence of an otherwise-known code
 * fails classification.
 */
function stripFootnoteAnnotation(value: string): string {
  return value.replace(/\s*\[[^[\]]*\]\s*$/, '').trim();
}

/**
 * Expands a raw cell text into an ordered token stream of
 * times (`HH:mm`), `OFF` markers and `--` segment separators.
 *
 * `codeProfile`, when provided, resolves declarative source shift codes
 * (M/T/N/L or a document's own legend) into their mapped times/OFF marker
 * before falling back to the literal time/off parsing below. It only
 * applies to profiles that opt in (see IngestionProfile.useShiftCodeProfile)
 * so existing literal-time profiles are unaffected.
 */
export function expandShiftTokens(value: string, codeProfile?: Map<string, ShiftCodeMapping>): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const core = stripFootnoteAnnotation(trimmed);

  if (isOffToken(core)) {
    return ['OFF'];
  }

  if (isSeparatorToken(trimmed)) {
    return ['--'];
  }

  if (codeProfile) {
    const mapped = resolveCode(core, codeProfile);
    if (mapped) {
      return mapped.status === 'free' ? ['OFF'] : [mapped.startTime as string, mapped.endTime as string];
    }
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

// Structural table-header words that are pure letters (so they'd otherwise
// satisfy the name-label shape below) but are never a person's name. Real
// regression: TYPE_B's own "nomina" column header (the same literal anchor
// TYPE_B_PROFILE.detection.normalizedIncludes matches on) got picked up as
// the "nearest name band" for every id in a layout where the true employee
// names fall outside the row-window's name zone — collapsing every
// employee's row into one that spanned from the table header down to the
// target row, pulling in every row in between.
const STRUCTURAL_LABEL_WORDS = new Set(['nomina', 'empleado', 'supervisor']);

/** True when EVERY word of the (accent/case-normalized) text is a known
 * structural label word — catches both a bare "Nomina" and a combined
 * header run like "Nomina Empleado" printed as one text item, without
 * excluding a real name that merely contains one of these as a substring. */
function isStructuralLabel(value: string): boolean {
  const words = normalizeText(value).split(' ').filter(Boolean);
  return words.length > 0 && words.every((word) => STRUCTURAL_LABEL_WORDS.has(word));
}

export function looksLikeEmployeeLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isTimeToken(trimmed) || isOffToken(trimmed) || isSeparatorToken(trimmed)) return false;
  if (isEmployeeIdToken(trimmed)) return true;
  if (isStructuralLabel(trimmed)) return false;
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.,' -]+$/.test(trimmed);
}

export function isEmployeeNameLabel(value: string): boolean {
  const trimmed = value.trim();
  return looksLikeEmployeeLabel(trimmed) && !isEmployeeIdToken(trimmed);
}

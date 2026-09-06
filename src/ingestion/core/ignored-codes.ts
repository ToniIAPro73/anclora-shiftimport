/** Explicit source codes intentionally excluded from ingestion for now. */
const FOOTNOTE_SUFFIX = /\s*\[[^[\]]*\]\s*$/;

export const IGNORED_EXPLICIT_SHIFT_CODES = new Set(['AJ']);

export function isExplicitlyIgnoredCode(value: string | null | undefined): boolean {
  const normalized = (value ?? '').replace(FOOTNOTE_SUFFIX, '').trim().toUpperCase();
  return IGNORED_EXPLICIT_SHIFT_CODES.has(normalized);
}

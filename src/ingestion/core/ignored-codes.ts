/** Explicit source codes intentionally excluded from ingestion for now. */
const FOOTNOTE_SUFFIX = /\s*\[[^[\]]*\]\s*$/;

export const IGNORED_EXPLICIT_SHIFT_CODES = new Set<string>();

export function isExplicitlyIgnoredCode(value: string | null | undefined): boolean {
  if (IGNORED_EXPLICIT_SHIFT_CODES.size === 0) return false;
  const normalized = (value ?? '').replace(FOOTNOTE_SUFFIX, '').trim().toUpperCase();
  return IGNORED_EXPLICIT_SHIFT_CODES.has(normalized);
}

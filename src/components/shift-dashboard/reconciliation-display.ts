const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const RUN_TAG = /\[\s*run[^\]]*\]\s*/gi;

/** Human-readable reason: technical run tags / UUIDs belong to the audit trail, not the list. */
export function cleanReason(reason: string | null | undefined): string {
  return String(reason ?? '')
    .replace(RUN_TAG, '')
    .replace(UUID, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:;,-]+|[\s:;,-]+$/g, '')
    .trim();
}

export type ReasonSummary = { kind: 'matchesPlan' | 'reconciled' | 'text'; text: string; full: string };

/** One short line for the row; `full` (still ID-free) feeds the tooltip. */
export function summarizeReason(reason: string | null | undefined, maxLength = 48): ReasonSummary {
  const full = cleanReason(reason);
  if (!full) return { kind: 'reconciled', text: '', full: '' };
  if (/company calendar|plan (de la )?empresa|company plan/i.test(full)) return { kind: 'matchesPlan', text: '', full };
  const text = full.length > maxLength ? `${full.slice(0, maxLength - 1).trimEnd()}…` : full;
  return { kind: 'text', text, full };
}

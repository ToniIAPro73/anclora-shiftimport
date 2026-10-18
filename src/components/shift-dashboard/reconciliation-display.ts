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
  if (humanizeReason(reason) === null) return { kind: 'reconciled', text: '', full: '' };
  const text = full.length > maxLength ? `${full.slice(0, maxLength - 1).trimEnd()}…` : full;
  return { kind: 'text', text, full };
}

const INTERNAL_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|REQUIRES_REVIEW/;

/** Reason safe to show: ID-free and free of internal codes. `null` = the stored text is audit jargon; show a generic line instead. */
export function humanizeReason(reason: string | null | undefined): string | null {
  const clean = cleanReason(reason);
  if (!clean || INTERNAL_TOKEN.test(clean) || /^marked\b/i.test(clean)) return null;
  return clean;
}

/**
 * Semantic identity of a shift option: two rows with the same type and hours are the SAME business state even when
 * they carry different internal ids (e.g. a row of an older and a newer import).
 */
export const semanticRowKey = (row: { shiftType?: string | null; startTime?: string | null; endTime?: string | null }): string =>
  `${String(row.shiftType ?? '').trim().toLowerCase()}|${row.startTime ? String(row.startTime).slice(0, 5) : ''}|${row.endTime ? String(row.endTime).slice(0, 5) : ''}`;

/**
 * Candidates the administrator can keep for a pending day: semantically unique. Order is the order of first appearance
 * (plan history first, then pending rows); each option carries the id of the row that is actually pending when there is
 * one, so confirming it keeps exactly the row the backend is waiting for a decision on.
 */
export interface KeepOptionRow { id?: string | null; shiftType?: string | null; startTime?: string | null; endTime?: string | null }
export function uniqueKeepOptions(
  historyRows: readonly KeepOptionRow[],
  pendingRows: readonly KeepOptionRow[],
): KeepOptionRow[] {
  type T = KeepOptionRow;
  const pendingIds = new Set(pendingRows.map((row) => row.id));
  const groups = new Map<string, T>();
  for (const row of [...historyRows, ...pendingRows]) {
    if (!row.id) continue;
    const key = semanticRowKey(row);
    const current = groups.get(key);
    if (!current) groups.set(key, row);
    else if (!pendingIds.has(current.id) && pendingIds.has(row.id)) groups.set(key, row);
  }
  return [...groups.values()];
}

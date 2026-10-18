import { hasSemanticDayChange as sharedHasSemanticDayChange } from '../../lib/company-plan.js';

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

const INTERNAL_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|REQUIRES_REVIEW/;
const MATCHES_CALENDAR = /consistent with|company calendar|company plan|plan (de la )?empresa/i;
const AUDIT_JARGON = /^(marked|reconciled)\b|\((?:high|medium|low)\)|\bconfidence\b/i;

/**
 * ONE interpretation of a stored reason for every screen (day history and the differences list):
 *  - matchesCalendar: the automatic check found the information already consistent (legacy "Reconciled (HIGH): consistent with company calendar");
 *  - automatic: audit jargon (confidence levels, internal codes, run tags): shown as a generic localized line;
 *  - text: a human-written reason, shown as typed (ids / run tags stripped).
 * The stored value is never rewritten: this only decides what is PRESENTED.
 */
export type ReasonKind = 'matchesCalendar' | 'automatic' | 'text';
export function classifyReason(reason: string | null | undefined): { kind: ReasonKind; text: string } {
  const clean = cleanReason(reason);
  if (!clean) return { kind: 'automatic', text: '' };
  if (MATCHES_CALENDAR.test(clean)) return { kind: 'matchesCalendar', text: '' };
  if (INTERNAL_TOKEN.test(clean) || AUDIT_JARGON.test(clean)) return { kind: 'automatic', text: '' };
  return { kind: 'text', text: clean };
}

export type ReasonSummary = { kind: 'matchesPlan' | 'reconciled' | 'text'; text: string; full: string };

/** One short line for the row; `full` (still ID-free) feeds the tooltip. */
export function summarizeReason(reason: string | null | undefined, maxLength = 48): ReasonSummary {
  const { kind, text: clean } = classifyReason(reason);
  if (kind === 'matchesCalendar') return { kind: 'matchesPlan', text: '', full: cleanReason(reason) };
  if (kind === 'automatic') return { kind: 'reconciled', text: '', full: '' };
  const text = clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
  return { kind: 'text', text, full: clean };
}

/** Reason safe to show: `null` = not a human-written text (generic / matches-calendar line applies instead). */
export function humanizeReason(reason: string | null | undefined): string | null {
  const { kind, text } = classifyReason(reason);
  return kind === 'text' ? text : null;
}

type SnapshotRow = { shiftType?: string | null; startTime?: string | null; endTime?: string | null; type?: string | null; start?: string | null; end?: string | null };

/** Audit snapshots may store a row as {type,start,end} (migration / system sources) or {shiftType,startTime,endTime}: read both. */
export function normalizeChangeRows(rows: readonly SnapshotRow[] = []): Array<{ shiftType: string; startTime: string | null; endTime: string | null }> {
  return rows.map((row) => ({
    shiftType: String(row.shiftType ?? row.type ?? ''),
    startTime: row.startTime ?? row.start ?? null,
    endTime: row.endTime ?? row.end ?? null,
  }));
}

type DayRow = { shiftType?: string | null; startTime?: string | null; endTime?: string | null; countsAsWork?: boolean | null };

/** Visible business state of a day before / after a change: ids, imports, order and provenance never count. */
export function hasSemanticDayChange(before: readonly DayRow[] = [], after: readonly DayRow[] = []): boolean {
  const withDate = (rows: readonly DayRow[]) => rows.map((row) => ({ date: '2000-01-01', ...row }));
  return sharedHasSemanticDayChange(withDate(before), withDate(after));
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

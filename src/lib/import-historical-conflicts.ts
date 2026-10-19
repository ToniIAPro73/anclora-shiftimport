import { semanticShiftFingerprint } from './import-dedup';
import type { Shift } from './types';

export type ImportConflictDecision = 'replace' | 'skip' | 'abort';

export interface HistoricalIncomingResult {
  aborted: boolean;
  /** Rows to write through the legacy historical path (new days, or rows the user chose to replace). */
  upserts: Shift[];
  /** Effective shifts the legacy path replaces. ALWAYS empty under smart server reconciliation. */
  deleteIds: string[];
  /** Rows the calendar already holds (identical): still part of the company plan. */
  identicalIncoming: Shift[];
  /** Smart path only: historical rows that differ from the calendar, handed to the server untouched. */
  serverReconciledHistorical: Shift[];
  /** Local working copy after the legacy decisions (used to refresh the screen). */
  working: Shift[];
}

/**
 * Classifies the historical rows of an import against the calendar snapshot.
 *
 * - Legacy path (pure historical Safe Import, EMPLOYEE self import): a differing day asks the user (replace / skip / abort);
 *   "replace" means delete the existing shift and insert the imported one.
 * - Smart server reconciliation (MIXED + planner + "historical-and-plan" => /api/imports/confirm-split): the SERVER owns every
 *   historical difference (UNCHANGED / EVIDENCE_APPLIED / KEPT_LOCAL / REQUIRES_REVIEW). The client never prompts, never
 *   generates deleteIds and never deletes locally; it just forwards the row.
 */
export async function classifyHistoricalIncoming(input: {
  incoming: Shift[];
  snapshot: Shift[];
  smartServerReconciliation: boolean;
  requestDecision: (existing: Shift, incoming: Shift) => Promise<ImportConflictDecision>;
}): Promise<HistoricalIncomingResult> {
  const { incoming, snapshot, smartServerReconciliation, requestDecision } = input;
  let working = [...snapshot];
  const upserts: Shift[] = [];
  const deleteIds: string[] = [];
  const identicalIncoming: Shift[] = [];
  const serverReconciledHistorical: Shift[] = [];

  const incomingByDate = new Map<string, Shift[]>();
  for (const shift of incoming) incomingByDate.set(shift.date, [...(incomingByDate.get(shift.date) ?? []), shift]);

  for (const [date, dayIncoming] of incomingByDate) {
    const dayExisting = snapshot.filter((existing) => existing.date === date);
    const unmatchedExisting = [...dayExisting];
    const unmatchedIncoming: Shift[] = [];

    // Exact business equality is a no-op regardless of origin/provenance.
    for (const shift of dayIncoming) {
      const matchIndex = unmatchedExisting.findIndex((existing) => semanticShiftFingerprint(existing) === semanticShiftFingerprint(shift));
      if (matchIndex < 0) unmatchedIncoming.push(shift);
      else {
        unmatchedExisting.splice(matchIndex, 1);
        identicalIncoming.push(shift);
      }
    }

    if (unmatchedIncoming.length === 0) continue;
    if (unmatchedExisting.length === 0) {
      working.push(...unmatchedIncoming);
      upserts.push(...unmatchedIncoming);
      continue;
    }
    if (smartServerReconciliation) {
      serverReconciledHistorical.push(...unmatchedIncoming);
      continue;
    }

    // Resolve only a one-to-one pair. If several rows remain, the legacy
    // replace/skip prompt has no safe way to identify a target, so fail closed.
    if (unmatchedIncoming.length !== 1 || unmatchedExisting.length !== 1) {
      return { aborted: true, upserts: [], deleteIds: [], identicalIncoming: [], serverReconciledHistorical: [], working: snapshot };
    }
    const [incomingShift] = unmatchedIncoming;
    const [existingShift] = unmatchedExisting;
    const decision = await requestDecision(existingShift, incomingShift);
    if (decision === 'abort') return { aborted: true, upserts: [], deleteIds: [], identicalIncoming: [], serverReconciledHistorical: [], working: snapshot };
    if (decision === 'skip') continue;

    working = [...working.filter((existing) => existing.id !== existingShift.id), incomingShift];
    upserts.push(incomingShift);
    deleteIds.push(existingShift.id);
  }
  return { aborted: false, upserts, deleteIds, identicalIncoming, serverReconciledHistorical, working };
}

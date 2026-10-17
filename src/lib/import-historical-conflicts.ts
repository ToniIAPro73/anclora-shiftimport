import { fingerprintShift } from './import-dedup';
import { getShiftOrigin, getShiftType } from './shifts';
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
  const pendingImportedByDate = new Map<string, Shift[]>();
  const upserts: Shift[] = [];
  const deleteIds: string[] = [];
  const identicalIncoming: Shift[] = [];
  const serverReconciledHistorical: Shift[] = [];

  for (const shift of incoming) {
    const existingImportedShifts = pendingImportedByDate.get(shift.date)
      ?? snapshot.filter((existing) => existing.date === shift.date && getShiftOrigin(existing) === 'IMP');
    pendingImportedByDate.set(shift.date, existingImportedShifts);

    if (existingImportedShifts.length === 0) {
      working.push(shift);
      upserts.push(shift);
      pendingImportedByDate.set(shift.date, [...existingImportedShifts, shift]);
      continue;
    }

    // Idempotent re-import: identity is the deterministic fingerprint, never the random UUID.
    if (existingImportedShifts.some((existing) => fingerprintShift(existing).full === fingerprintShift(shift).full)) {
      identicalIncoming.push(shift);
      continue;
    }
    if (smartServerReconciliation) {
      serverReconciledHistorical.push(shift);
      continue;
    }

    const existingShift = existingImportedShifts.find((existing) => getShiftType(existing) === getShiftType(shift)) ?? existingImportedShifts[0];
    const decision = await requestDecision(existingShift, shift);
    if (decision === 'abort') return { aborted: true, upserts, deleteIds, identicalIncoming, serverReconciledHistorical, working: snapshot };
    if (decision === 'skip') continue;

    working = [...working.filter((existing) => existing.id !== existingShift.id), shift];
    upserts.push(shift);
    deleteIds.push(existingShift.id);
    pendingImportedByDate.set(shift.date, [...existingImportedShifts.filter((existing) => existing.id !== existingShift.id), shift]);
  }
  return { aborted: false, upserts, deleteIds, identicalIncoming, serverReconciledHistorical, working };
}

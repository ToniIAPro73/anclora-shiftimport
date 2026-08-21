/**
 * IMPORT -> PERSIST -> RECONCILE -> RESULT.
 *
 * An import is not "correct" because the HTTP call returned 200 or because
 * no exception was thrown — it's correct only when what the importer
 * determined should be stored is what actually got persisted. This compares
 * the two by id (the shift id is generated client-side before the PATCH
 * call and echoed back unchanged by the server on a successful write, so it
 * is a reliable join key — never re-derived from date/time, which would
 * hide a swap between two shifts on the same day as a false match).
 */
import { Shift } from './types';

export type ReconciliationMismatchReason = 'missing_in_persisted' | 'field_mismatch';

const COMPARED_FIELDS = ['date', 'startTime', 'endTime', 'location', 'origin'] as const;
type ComparedField = (typeof COMPARED_FIELDS)[number];

export interface ReconciliationMismatch {
  id: string;
  date: string;
  reason: ReconciliationMismatchReason;
  expected: Shift;
  persisted?: Shift;
  diffFields?: ComparedField[];
}

export interface ReconciliationReport {
  expectedCount: number;
  persistedCount: number;
  matchedCount: number;
  mismatches: ReconciliationMismatch[];
  status: 'PASS' | 'FAIL';
}

/**
 * `expected` is what the importer decided to write for this call (the
 * upserts payload); `persisted` is what the server's response says it
 * actually wrote (the `saved` rows returned by PATCH /api/shifts, never a
 * bare count). A row present in `expected` but absent from `persisted` is
 * exactly the silent-loss case this exists to catch.
 */
export function reconcileImport(expected: Shift[], persisted: Shift[]): ReconciliationReport {
  const persistedById = new Map(persisted.map((shift) => [shift.id, shift]));
  const mismatches: ReconciliationMismatch[] = [];
  let matchedCount = 0;

  for (const exp of expected) {
    const found = persistedById.get(exp.id);
    if (!found) {
      mismatches.push({ id: exp.id, date: exp.date, reason: 'missing_in_persisted', expected: exp });
      continue;
    }

    const diffFields = COMPARED_FIELDS.filter((field) => exp[field] !== found[field]);
    if (diffFields.length > 0) {
      mismatches.push({
        id: exp.id,
        date: exp.date,
        reason: 'field_mismatch',
        expected: exp,
        persisted: found,
        diffFields,
      });
      continue;
    }

    matchedCount += 1;
  }

  return {
    expectedCount: expected.length,
    persistedCount: persisted.length,
    matchedCount,
    mismatches,
    status: mismatches.length === 0 ? 'PASS' : 'FAIL',
  };
}

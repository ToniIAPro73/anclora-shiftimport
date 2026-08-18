/**
 * Idempotent import semantics (Phase 0): deterministic semantic identity for
 * shifts so that re-importing the same schedule does not create duplicates.
 *
 * Identity is NOT the random UUID: it is a fingerprint over the normalized
 * semantic fields (date, start, end, resolved type, origin). Repeated imports
 * of the same document therefore converge to the same shifts.
 *
 * Merge policy: mergeImportedShifts never deletes. Shifts outside the
 * incoming date range are untouched; within the range, an incoming shift
 * replaces the existing one that shares its fingerprint (preserving the
 * existing id) and new fingerprints are appended. classifyImportChanges
 * reports the diff (NEW / UNCHANGED / CHANGED / REMOVED) for preview UIs.
 */
import { Shift } from './types';
import { normalizeShift } from './storage';
import { getShiftOrigin, getShiftType } from './shifts';

export interface ShiftFingerprint {
  /** Full semantic identity: date | start | end | type | origin. */
  full: string;
  /** Coarse identity ignoring type/origin: date | start | end. */
  base: string;
}

export function fingerprintShift(shift: Shift): ShiftFingerprint {
  const normalized = normalizeShift(shift);
  const typeId = getShiftType(normalized);
  const origin = getShiftOrigin(normalized);
  const start = normalized.startTime.trim();
  const end = normalized.endTime.trim();
  const base = `${normalized.date}|${start}|${end}`;
  return { base, full: `${base}|${typeId}|${origin}` };
}

export type ImportChangeKind = 'NEW' | 'UNCHANGED' | 'CHANGED' | 'REMOVED';

export interface ImportChange {
  kind: ImportChangeKind;
  fingerprint: string;
  /** Existing shift for UNCHANGED/CHANGED/REMOVED; incoming for NEW/CHANGED. */
  shift: Shift;
}

export interface ImportChangeReport {
  new: ImportChange[];
  unchanged: ImportChange[];
  changed: ImportChange[];
  removed: ImportChange[];
  /** Shift records to add or update (new + changed). */
  additions: Shift[];
}

function dateRangeOf(shifts: Shift[]): { min: string; max: string } | null {
  if (shifts.length === 0) {
    return null;
  }
  const dates = shifts.map((shift) => normalizeShift(shift).date).filter(Boolean);
  if (dates.length === 0) {
    return null;
  }
  dates.sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}

/**
 * Classifies the difference between the existing shifts and an incoming
 * batch, scoped to the date range covered by the incoming batch (so a new
 * month's import does not flag the previous month as REMOVED).
 */
export function classifyImportChanges(existing: Shift[], incoming: Shift[]): ImportChangeReport {
  const report: ImportChangeReport = { new: [], unchanged: [], changed: [], removed: [], additions: [] };

  if (incoming.length === 0) {
    return report;
  }

  const incomingFingerprints = new Map<string, Shift>();
  for (const shift of incoming) {
    incomingFingerprints.set(fingerprintShift(shift).full, shift);
  }

  const range = dateRangeOf(incoming);
  const existingInRange = range
    ? existing.filter((shift) => {
      const date = normalizeShift(shift).date;
      return date >= range.min && date <= range.max;
    })
    : [];

  const existingByFull = new Map<string, Shift>();
  const existingByBase = new Map<string, Shift[]>();
  for (const shift of existingInRange) {
    const fp = fingerprintShift(shift);
    existingByFull.set(fp.full, shift);
    const baseList = existingByBase.get(fp.base) ?? [];
    baseList.push(shift);
    existingByBase.set(fp.base, baseList);
  }

  for (const shift of incoming) {
    const fp = fingerprintShift(shift);
    const existingMatch = existingByFull.get(fp.full);
    if (existingMatch) {
      report.unchanged.push({ kind: 'UNCHANGED', fingerprint: fp.full, shift: existingMatch });
      continue;
    }

    const sameSlot = existingByBase.get(fp.base);
    if (sameSlot && sameSlot.length > 0) {
      report.changed.push({ kind: 'CHANGED', fingerprint: fp.full, shift });
      report.additions.push(shift);
      continue;
    }

    report.new.push({ kind: 'NEW', fingerprint: fp.full, shift });
    report.additions.push(shift);
  }

  for (const shift of existingInRange) {
    const fp = fingerprintShift(shift);
    if (incomingFingerprints.has(fp.full)) {
      continue;
    }
    const sameSlot = incomingFingerprints.has(
      [...incomingFingerprints.keys()].find((key) => key.startsWith(`${fp.base}|`)) ?? '',
    );
    if (sameSlot) {
      continue; // reported as CHANGED from the incoming side
    }
    report.removed.push({ kind: 'REMOVED', fingerprint: fp.full, shift });
  }

  return report;
}

/**
 * Merges an incoming import into the existing shifts without deleting:
 * - Shifts outside the incoming date range are preserved untouched.
 * - An incoming shift whose full fingerprint matches an existing one keeps
 *   the existing record (id preserved, so the UI edit history survives).
 * - New fingerprints are appended with their own id.
 * Idempotent: importing the same document twice yields the same final set.
 */
export function mergeImportedShifts(existing: Shift[], incoming: Shift[]): Shift[] {
  if (incoming.length === 0) {
    return existing;
  }

  const range = dateRangeOf(incoming);
  const kept = range
    ? existing.filter((shift) => {
      const date = normalizeShift(shift).date;
      return date < range.min || date > range.max;
    })
    : [];

  const inRangeExisting = range
    ? existing.filter((shift) => {
      const date = normalizeShift(shift).date;
      return date >= range.min && date <= range.max;
    })
    : [];

  const existingByFull = new Map<string, Shift>();
  for (const shift of inRangeExisting) {
    existingByFull.set(fingerprintShift(shift).full, shift);
  }

  const merged: Shift[] = [...kept];
  const incomingFull = new Map(
    incoming.map((shift) => [fingerprintShift(shift).full, shift]),
  );
  const seenFull = new Set<string>();

  // Preserve every existing in-range shift that the incoming batch does not
  // reproduce exactly (no silent deletes: the diff UI reports those as
  // REMOVED instead).
  for (const shift of inRangeExisting) {
    const fp = fingerprintShift(shift);
    if (!incomingFull.has(fp.full)) {
      merged.push(shift);
      seenFull.add(fp.full);
    }
  }

  for (const shift of incoming) {
    const fp = fingerprintShift(shift);
    if (seenFull.has(fp.full)) {
      continue;
    }
    seenFull.add(fp.full);

    const existingMatch = existingByFull.get(fp.full);
    if (existingMatch) {
      merged.push(existingMatch);
    } else {
      merged.push(normalizeShift(shift));
    }
  }

  return merged;
}

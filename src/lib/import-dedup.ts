/**
 * Idempotent import semantics (Phase 0): deterministic semantic identity for
 * shifts so that re-importing the same schedule does not create duplicates.
 *
 * The technical fingerprint includes the normalized business fields plus
 * provenance. semanticShiftFingerprint is used when the question is whether
 * the calendar already contains the same visible business state.
 *
 * Merge policy: mergeImportedShifts never deletes. Shifts outside the
 * incoming date range are untouched; within the range, an incoming shift
 * replaces the existing one that shares its fingerprint (preserving the
 * existing id) and new fingerprints are appended. classifyImportChanges
 * reports the diff (NEW / UNCHANGED / CHANGED / REMOVED) for preview UIs.
 */
import { Shift } from './types';
import { normalizeShift } from './storage';
import { getShiftType } from './shifts';

export interface ShiftFingerprint {
  /** Technical identity: date | start | end | type | origin. */
  full: string;
  /** Coarse identity ignoring type/origin: date | start | end. */
  base: string;
}

export function fingerprintShift(shift: Shift): ShiftFingerprint {
  const normalized = normalizeShift(shift);
  const typeId = getShiftType(normalized);
  // Keep the raw provenance value here. This is the technical fingerprint;
  // business equality is provided separately below.
  const origin = String(shift.origin ?? '').trim();
  const start = normalized.startTime.trim();
  const end = normalized.endTime.trim();
  const base = `${normalized.date}|${start}|${end}`;
  return { base, full: `${base}|${typeId}|${origin}` };
}

/** Calendar business state; provenance and persistence identifiers are excluded. */
export function semanticShiftFingerprint(shift: Shift): string {
  const normalized = normalizeShift(shift);
  return `${normalized.date}|${normalized.startTime.trim()}|${normalized.endTime.trim()}|${getShiftType(normalized)}`;
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

  const range = dateRangeOf(incoming);
  const existingInRange = range
    ? existing.filter((shift) => {
      const date = normalizeShift(shift).date;
      return date >= range.min && date <= range.max;
    })
    : [];

  const matchedExisting = new Set<number>();
  const matchedIncoming = new Set<number>();
  const existingKeys = existingInRange.map(semanticShiftFingerprint);
  const incomingKeys = incoming.map(semanticShiftFingerprint);

  // First consume exact business matches (multiset-aware; no duplicate collapse).
  for (let i = 0; i < incoming.length; i += 1) {
    const match = existingKeys.findIndex((key, j) => !matchedExisting.has(j) && key === incomingKeys[i]);
    if (match < 0) continue;
    matchedExisting.add(match);
    matchedIncoming.add(i);
    report.unchanged.push({ kind: 'UNCHANGED', fingerprint: incomingKeys[i], shift: existingInRange[match] });
  }

  const pairAsChanged = (existingIndex: number, incomingIndex: number) => {
    matchedExisting.add(existingIndex);
    matchedIncoming.add(incomingIndex);
    const shift = incoming[incomingIndex];
    report.changed.push({ kind: 'CHANGED', fingerprint: incomingKeys[incomingIndex], shift });
    report.additions.push(shift);
  };

  // Pair remaining rows only when date + type identifies exactly one row on
  // each side. This handles a changed time without guessing among extras.
  const dates = new Set(incoming.map((shift) => normalizeShift(shift).date));
  for (const date of dates) {
    const types = new Set(incoming
      .map((shift, i) => ({ shift, i }))
      .filter(({ shift, i }) => !matchedIncoming.has(i) && normalizeShift(shift).date === date)
      .map(({ shift }) => getShiftType(shift)));
    for (const type of types) {
      const left = existingInRange.map((shift, i) => ({ shift, i }))
        .filter(({ shift, i }) => !matchedExisting.has(i) && normalizeShift(shift).date === date && getShiftType(shift) === type);
      const right = incoming.map((shift, i) => ({ shift, i }))
        .filter(({ shift, i }) => !matchedIncoming.has(i) && normalizeShift(shift).date === date && getShiftType(shift) === type);
      if (left.length === 1 && right.length === 1) pairAsChanged(left[0].i, right[0].i);
    }
  }

  // A unique remaining row on a date can represent a type change (for
  // example work -> day off). Multiple rows remain explicit NEW/REMOVED.
  for (const date of dates) {
    const left = existingInRange.map((shift, i) => ({ shift, i }))
      .filter(({ shift, i }) => !matchedExisting.has(i) && normalizeShift(shift).date === date);
    const right = incoming.map((shift, i) => ({ shift, i }))
      .filter(({ shift, i }) => !matchedIncoming.has(i) && normalizeShift(shift).date === date);
    if (left.length === 1 && right.length === 1) pairAsChanged(left[0].i, right[0].i);
  }

  incoming.forEach((shift, i) => {
    if (matchedIncoming.has(i)) return;
    report.new.push({ kind: 'NEW', fingerprint: incomingKeys[i], shift });
    report.additions.push(shift);
  });
  existingInRange.forEach((shift, i) => {
    if (!matchedExisting.has(i)) report.removed.push({ kind: 'REMOVED', fingerprint: existingKeys[i], shift });
  });

  return report;
}

/**
 * Merges an incoming import into the existing shifts without deleting:
 * - Shifts outside the incoming date range are preserved untouched.
 * - An incoming shift whose semantic fingerprint matches an existing one keeps
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

  const existingBySemantic = new Map<string, Shift[]>();
  for (const shift of inRangeExisting) {
    const key = semanticShiftFingerprint(shift);
    existingBySemantic.set(key, [...(existingBySemantic.get(key) ?? []), shift]);
  }

  const merged: Shift[] = [...kept];
  const incomingSemantic = new Map<string, Shift>();
  for (const shift of incoming) incomingSemantic.set(semanticShiftFingerprint(shift), shift);
  const seenSemantic = new Set<string>();

  // Preserve every existing in-range shift that the incoming batch does not
  // reproduce exactly (no silent deletes: the diff UI reports those as
  // REMOVED instead).
  for (const shift of inRangeExisting) {
    const key = semanticShiftFingerprint(shift);
    if (!incomingSemantic.has(key)) {
      merged.push(shift);
      seenSemantic.add(key);
    }
  }

  for (const shift of incoming) {
    const key = semanticShiftFingerprint(shift);
    if (seenSemantic.has(key)) {
      continue;
    }
    seenSemantic.add(key);

    const existingMatch = existingBySemantic.get(key)?.shift();
    if (existingMatch) {
      merged.push(existingMatch);
    } else {
      merged.push(normalizeShift(shift));
    }
  }

  return merged;
}

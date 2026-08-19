import type { ParsedCalendarShift } from './import-types';

export type ImportWarningCode =
  | 'UNKNOWN_SHIFT_TOKEN'
  | 'EMPLOYEE_MATCH_WEAK'
  | 'MULTIPLE_EMPLOYEE_MATCHES'
  | 'DATE_MAPPING_UNCERTAIN'
  | 'PROFILE_DRIFT'
  | 'PARTIAL_EXTRACTION'
  | 'UNKNOWN_CELL'
  | 'UNSUPPORTED_SECTION';

export interface ImportWarning {
  code: ImportWarningCode;
  /** machine context for UI rendering, e.g. { token: 'DL', date: '2026-03-04' } */
  context?: Record<string, string | number>;
}

export type ImportQualityState = 'CORRECT' | 'REVIEW' | 'UNRECOGNIZED';

export interface ImportResult<T = ParsedCalendarShift> {
  shifts: T[];
  /** internal numeric confidence 0..1 — never render as fake precision in UI */
  confidence: number;
  warnings: ImportWarning[];
  state: ImportQualityState;
  profileId?: string;
}

export interface QualitySignals {
  knownProfileMatched: boolean;
  profileDrift: boolean;
  periodDetected: boolean;
  employeeMatch: 'strong' | 'weak' | 'multiple' | 'none' | 'mismatch';
  /** expected working rows/days the document layout implies */
  expectedDays: number;
  /** days actually mapped to a column */
  mappedDays: number;
  /** total cell tokens inspected in the employee row */
  totalTokens: number;
  recognizedTokens: number;
  unknownTokens: string[]; // distinct unknown token strings
  invalidTimes: number;
  incompleteAssignments: number;
}

/**
 * Import quality heuristic — explainable evidence only, no ML.
 *
 * Confidence starts at 1.0 and receives additive penalties, each tied to a
 * concrete, user-explainable signal from the parsing pipeline:
 *
 * - Unknown profile (knownProfileMatched=false): NO penalty by itself — new
 *   documents are normal; the profile system is an accelerator, not a gate.
 * - profileDrift: −0.25 + PROFILE_DRIFT. A previously saved format changed;
 *   old assumptions may silently misassign columns.
 * - !periodDetected: −0.15 + DATE_MAPPING_UNCERTAIN. Without a detected
 *   month/year, dates may be mapped against the wrong period.
 * - employeeMatch:
 *   - 'weak': −0.25 + EMPLOYEE_MATCH_WEAK. The employee row was chosen by a
 *     fuzzy match; wrong-row extraction is the worst silent failure.
 *   - 'multiple': no confidence penalty, but MULTIPLE_EMPLOYEE_MATCHES and
 *     the state is capped at REVIEW — a human must pick the row.
 *   - 'none': state forced to UNRECOGNIZED and confidence clamped to ≤ 0.2;
 *     without an employee row nothing extracted is trustworthy.
 *   - 'mismatch': the typed name and id resolve to different employees;
 *     same treatment as 'none' — nothing may import until the user picks
 *     the correct row.
 * - unknown tokens: −0.05 per distinct token (cap −0.3), one
 *   UNKNOWN_SHIFT_TOKEN warning per token.
 * - mappedDays < expectedDays: PARTIAL_EXTRACTION and
 *   −0.15 · (missing / expected). The layout promised more days than were
 *   mapped, so some assignments are silently missing.
 * - invalidTimes: −0.05 each (cap −0.2) + a single UNKNOWN_CELL warning.
 * - incompleteAssignments: −0.05 each (cap −0.2) + PARTIAL_EXTRACTION once
 *   (shared with the missing-days warning above).
 *
 * The result is clamped to 0..1 and rounded to 2 decimals. The number is
 * internal evidence for routing (CORRECT/REVIEW/UNRECOGNIZED) — the UI must
 * render the state and warnings, never the raw confidence as fake precision.
 *
 * State mapping (see qualityStateFor):
 * - employeeMatch 'none' → UNRECOGNIZED, always.
 * - confidence ≥ 0.85 → CORRECT; ≥ 0.5 → REVIEW; below → UNRECOGNIZED.
 * - profileDrift or 'multiple' matches can never be CORRECT.
 *
 * A known-profile match with zero issues keeps confidence at 1.0 → CORRECT.
 */
const UNKNOWN_TOKEN_PENALTY = 0.05;
const UNKNOWN_TOKEN_PENALTY_CAP = 0.3;
const PROFILE_DRIFT_PENALTY = 0.25;
const PERIOD_UNDETECTED_PENALTY = 0.15;
const WEAK_MATCH_PENALTY = 0.25;
const PARTIAL_EXTRACTION_FACTOR = 0.15;
const INVALID_TIME_PENALTY = 0.05;
const INVALID_TIME_PENALTY_CAP = 0.2;
const INCOMPLETE_ASSIGNMENT_PENALTY = 0.05;
const INCOMPLETE_ASSIGNMENT_PENALTY_CAP = 0.2;
const NO_MATCH_CONFIDENCE_CAP = 0.2;

const CORRECT_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.5;

const clampConfidence = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 100) / 100;
};

export function qualityStateFor(confidence: number, signals: QualitySignals): ImportQualityState {
  if (signals.employeeMatch === 'none' || signals.employeeMatch === 'mismatch') {
    return 'UNRECOGNIZED';
  }
  const canBeCorrect = !signals.profileDrift && signals.employeeMatch !== 'multiple';
  if (confidence >= CORRECT_THRESHOLD && canBeCorrect) {
    return 'CORRECT';
  }
  if (confidence >= REVIEW_THRESHOLD) {
    return 'REVIEW';
  }
  return 'UNRECOGNIZED';
}

export function computeImportResult<T = ParsedCalendarShift>(
  shifts: T[],
  signals: QualitySignals,
  profileId?: string,
): ImportResult<T> {
  const warnings: ImportWarning[] = [];
  let confidence = 1.0;

  if (signals.profileDrift) {
    confidence -= PROFILE_DRIFT_PENALTY;
    warnings.push({ code: 'PROFILE_DRIFT' });
  }

  if (!signals.periodDetected) {
    confidence -= PERIOD_UNDETECTED_PENALTY;
    warnings.push({ code: 'DATE_MAPPING_UNCERTAIN' });
  }

  if (signals.employeeMatch === 'weak') {
    confidence -= WEAK_MATCH_PENALTY;
    warnings.push({ code: 'EMPLOYEE_MATCH_WEAK' });
  } else if (signals.employeeMatch === 'multiple') {
    warnings.push({ code: 'MULTIPLE_EMPLOYEE_MATCHES' });
  }

  const distinctUnknownTokens = [...new Set(signals.unknownTokens)];
  if (distinctUnknownTokens.length > 0) {
    confidence -= Math.min(
      distinctUnknownTokens.length * UNKNOWN_TOKEN_PENALTY,
      UNKNOWN_TOKEN_PENALTY_CAP,
    );
    for (const token of distinctUnknownTokens) {
      warnings.push({ code: 'UNKNOWN_SHIFT_TOKEN', context: { token } });
    }
  }

  const missingDays = signals.expectedDays > 0
    ? Math.max(0, signals.expectedDays - signals.mappedDays)
    : 0;
  let partialExtractionWarned = false;
  if (missingDays > 0) {
    confidence -= PARTIAL_EXTRACTION_FACTOR * (missingDays / signals.expectedDays);
    warnings.push({
      code: 'PARTIAL_EXTRACTION',
      context: { expected: signals.expectedDays, mapped: signals.mappedDays },
    });
    partialExtractionWarned = true;
  }

  if (signals.invalidTimes > 0) {
    confidence -= Math.min(signals.invalidTimes * INVALID_TIME_PENALTY, INVALID_TIME_PENALTY_CAP);
    warnings.push({ code: 'UNKNOWN_CELL', context: { count: signals.invalidTimes } });
  }

  if (signals.incompleteAssignments > 0) {
    confidence -= Math.min(
      signals.incompleteAssignments * INCOMPLETE_ASSIGNMENT_PENALTY,
      INCOMPLETE_ASSIGNMENT_PENALTY_CAP,
    );
    if (!partialExtractionWarned) {
      warnings.push({ code: 'PARTIAL_EXTRACTION', context: { count: signals.incompleteAssignments } });
    }
  }

  if (signals.employeeMatch === 'none' || signals.employeeMatch === 'mismatch') {
    confidence = Math.min(confidence, NO_MATCH_CONFIDENCE_CAP);
  }

  const rounded = clampConfidence(confidence);
  return {
    shifts,
    confidence: rounded,
    warnings,
    state: qualityStateFor(rounded, signals),
    profileId,
  };
}

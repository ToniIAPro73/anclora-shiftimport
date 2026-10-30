/**
 * Auto-publication planner (pure: NO I/O, deterministic, unit-testable).
 *
 * Decides, per planning week and per `(employee, date)` pair of an import, what may be published and what must stay in a draft or
 * go to review. Specification: docs/specs/SPEC-SHIFTIMPORT-PLANNING-SIMPLIFICATION-MOBILE-AND-VACATIONS.md §2.2 and §4.1.3.
 *
 * Fail closed: anything that cannot be attributed unambiguously to the import itself is retained (INV-07, INV-15, OD-05).
 * The SQL gate of `publishImportedPairsTx` re-validates whatever this module accepts (defence in depth).
 */
import { findAssignmentConflict, getShiftSemantics } from './shift-compatibility.js';
import { MINIMUM_REST_HOURS, calculateRestGapMinutes } from './scheduling.js';

export const RETENTION = Object.freeze({
  OVERLAP: 'OVERLAP',
  FULL_DAY_CONFLICT: 'FULL_DAY_CONFLICT',
  REST_RULE_VIOLATION: 'REST_RULE_VIOLATION',
  MANUAL_CURRENT_PROTECTED: 'MANUAL_CURRENT_PROTECTED',
  MANUAL_DRAFT_PROTECTED: 'MANUAL_DRAFT_PROTECTED',
  FOREIGN_DRAFT_PRESENT: 'FOREIGN_DRAFT_PRESENT',
  UNATTRIBUTABLE_PROVENANCE: 'UNATTRIBUTABLE_PROVENANCE',
  PENDING_MODIFICATION: 'PENDING_MODIFICATION',
});

export const WEEK_MODE = Object.freeze({
  PUBLISH: 'PUBLISH',
  SPLIT: 'SPLIT',
  RETAIN_DRAFT: 'RETAIN_DRAFT',
  NONE: 'NONE',
});

/** Provenances that are manual work: an import never overwrites or absorbs them (row 3). */
export const MANUAL_PROVENANCES = Object.freeze(new Set([
  'MANUAL_ADMIN_CHANGE', 'MANUAL_CONFIRMED_WHOLE_DAY_OVERRIDE', 'EMPLOYEE_REQUEST', 'MIGRATION',
]));

/**
 * WHITE list of provenances attributable to an import (INV-15). `COMPANY_IMPORT` is the legacy import layer; `SYSTEM` is what the
 * import pipeline stamps on rows it writes. A `SCHEDULE_PUBLICATION` row counts only when it carries an `import_id` (a previous
 * auto-publication); a published manual plan has none. Anything else, including NULL or an unknown future value, is unattributable.
 */
export function isAttributableToImport(row) {
  const provenance = row?.provenance ?? null;
  if (provenance === 'COMPANY_IMPORT' || provenance === 'SYSTEM') return true;
  if (provenance === 'SCHEDULE_PUBLICATION') return Boolean(row.importId ?? row.import_id);
  return false;
}

const pairKey = (employeeId, date) => `${employeeId}|${date}`;
const normalizeTime = (value) => (value === null || value === undefined || value === '' ? null : String(value).slice(0, 5));

function toAssignment(row) {
  return {
    id: row.id ?? null,
    employeeId: row.employeeId ?? row.employee_id,
    date: String(row.date).slice(0, 10),
    startTime: normalizeTime(row.startTime ?? row.start_time),
    endTime: normalizeTime(row.endTime ?? row.end_time),
    shiftType: row.shiftType ?? row.shift_type ?? 'Regular',
    countsAsWork: row.countsAsWork ?? row.counts_as_work ?? true,
  };
}

const withSnake = (row) => ({ ...row, start_time: row.startTime, end_time: row.endTime, shift_type: row.shiftType, counts_as_work: row.countsAsWork });

function sortKey(day) {
  const first = [...day.rows].map(toAssignment).sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')))[0];
  return [day.date, first?.startTime ?? '', day.employeeId];
}

function compareDays(a, b) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    const c = String(ka[i]).localeCompare(String(kb[i]));
    if (c !== 0) return c;
  }
  return 0;
}

/** Rest between two worked timed assignments on different dates: same rule as the manual publication (11 h, no cross-week). */
function restViolation(candidate, others) {
  const candidateSemantics = getShiftSemantics(withSnake(candidate));
  if (!candidateSemantics.contributesWorkedTime) return false;
  const minutes = MINIMUM_REST_HOURS * 60;
  return others.some((other) => {
    if (other.date === candidate.date) return false;
    if (!getShiftSemantics(withSnake(other)).contributesWorkedTime) return false;
    const gap = calculateRestGapMinutes(withSnake(candidate), withSnake(other));
    return gap !== null && gap < minutes;
  });
}

const dayDiff = (a, b) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/**
 * @param {{
 *   periodStart: string, areaId: string|null,
 *   fileDays: Array<{ employeeId: string, date: string, outcome: 'UNCHANGED'|'NEW'|'MODIFIED'|'REQUIRES_REVIEW', reasonCode?: string,
 *                     rows: Array<{startTime,endTime,shiftType,countsAsWork}> }>,
 *   draftAssignments?: Array<{ employeeId: string, date: string, importId: string|null }>,
 *   baseAssignments?: Array<object>,
 *   currentByDay?: Map<string, Array<{ provenance: string|null, importId?: string|null }>>,
 *   pendingModificationDays?: Set<string>,
 * }} input
 * @returns {{ mode: string, publishPairs: Array<{employeeId,date}>, retainPairs: Array<{employeeId,date,reason}>,
 *             reviewPairs: Array<{employeeId,date,reason}>, unchangedCount: number }}
 */
export function planAutoPublication(input) {
  const fileDays = [...(input.fileDays ?? [])];
  const draft = (input.draftAssignments ?? []).map((row) => ({
    employeeId: row.employeeId ?? row.employee_id, date: String(row.date).slice(0, 10), importId: row.importId ?? row.import_id ?? null,
  }));
  const base = (input.baseAssignments ?? []).map(toAssignment);
  const currentByDay = input.currentByDay ?? new Map();
  const pending = input.pendingModificationDays ?? new Set();

  const reviewPairs = [];
  const retainPairs = [];
  const publishPairs = [];
  let unchangedCount = 0;

  const filePairs = new Set(fileDays.map((day) => pairKey(day.employeeId, day.date)));
  const candidates = [];
  for (const day of fileDays) {
    if (day.outcome === 'UNCHANGED') { unchangedCount += 1; continue; }
    if (day.outcome === 'REQUIRES_REVIEW') {
      reviewPairs.push({ employeeId: day.employeeId, date: day.date, reason: day.reasonCode ?? 'REQUIRES_REVIEW' });
      continue;
    }
    if (day.outcome === 'NEW' || day.outcome === 'MODIFIED') candidates.push(day);
    else retainPairs.push({ employeeId: day.employeeId, date: day.date, reason: RETENTION.UNATTRIBUTABLE_PROVENANCE }); // unknown outcome: fail closed
  }

  const result = (mode) => ({ mode, publishPairs, retainPairs, reviewPairs, unchangedCount });
  if (candidates.length === 0) return result(WEEK_MODE.NONE);

  const retainAll = (reason) => {
    for (const day of [...candidates].sort(compareDays)) retainPairs.push({ employeeId: day.employeeId, date: day.date, reason });
    return result(WEEK_MODE.RETAIN_DRAFT);
  };

  // Week rule (INV-03): any draft assignment whose pair is not in the file ⇒ the whole week stays a draft.
  if (draft.some((row) => !filePairs.has(pairKey(row.employeeId, row.date)))) return retainAll(RETENTION.FOREIGN_DRAFT_PRESENT);
  // A manually edited draft assignment for a file pair lives in the very draft that would be published: the week stays a draft.
  if (draft.some((row) => filePairs.has(pairKey(row.employeeId, row.date)) && !row.importId)) return retainAll(RETENTION.MANUAL_DRAFT_PROTECTED);

  const candidateKeys = new Set(candidates.map((day) => pairKey(day.employeeId, day.date)));
  // Carry-over of the published base only constrains OTHER pairs: a candidate pair's own base rows are replaced by the file.
  const baseOthers = base.filter((row) => !candidateKeys.has(pairKey(row.employeeId, row.date)));
  const accepted = [];

  for (const day of [...candidates].sort(compareDays)) {
    const key = pairKey(day.employeeId, day.date);
    const current = currentByDay.get(key) ?? [];
    const retain = (reason) => retainPairs.push({ employeeId: day.employeeId, date: day.date, reason });

    // Row 3: manual provenance in CURRENT is never overwritten or absorbed.
    if (current.some((row) => MANUAL_PROVENANCES.has(row.provenance ?? ''))) { retain(RETENTION.MANUAL_CURRENT_PROTECTED); continue; }
    // Row 3b: anything not provably the import's own (white list), or a pending modification, fails closed.
    if (current.some((row) => !isAttributableToImport(row))) { retain(RETENTION.UNATTRIBUTABLE_PROVENANCE); continue; }
    if (pending.has(key)) { retain(RETENTION.PENDING_MODIFICATION); continue; }

    const incoming = day.rows.map((row) => toAssignment({ ...row, employeeId: day.employeeId, date: day.date }));
    // Row 5: overlap / whole-day conflict among the day's own rows.
    let conflict = null;
    const seen = [];
    for (const row of incoming) {
      conflict = findAssignmentConflict(seen.map(withSnake), withSnake(row));
      if (conflict) break;
      seen.push(row);
    }
    if (conflict) { retain(conflict.code === 'OVERLAP' ? RETENTION.OVERLAP : RETENTION.FULL_DAY_CONFLICT); continue; }

    // Row 6: rest against neighbours (±1 day) already accepted or carried over from the base version.
    const neighbours = [...accepted, ...baseOthers].filter((other) => other.employeeId === day.employeeId && dayDiff(other.date, day.date) === 1);
    if (incoming.some((row) => restViolation(row, neighbours))) { retain(RETENTION.REST_RULE_VIOLATION); continue; }

    accepted.push(...incoming);
    publishPairs.push({ employeeId: day.employeeId, date: day.date });
  }

  if (publishPairs.length === 0) return result(WEEK_MODE.RETAIN_DRAFT);
  return result(retainPairs.length === 0 ? WEEK_MODE.PUBLISH : WEEK_MODE.SPLIT);
}

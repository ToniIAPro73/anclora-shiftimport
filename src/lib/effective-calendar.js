/**
 * Effective calendar domain (single source of truth for API and client).
 *
 *   COMPANY PLAN  ->  CHANGES  ->  EFFECTIVE CALENDAR  ->  WORKTIME  ->  ANNUAL TARGET
 *
 * Statistics are computed from the effective calendar. A pending day remains
 * unresolved, but its single deterministic current baseline may be counted
 * provisionally. Alternatives are never combined; ambiguous days fail closed.
 * `origin` is provenance, never a computation criterion.
 *
 * All arithmetic is done in integer minutes. Intervals are half-open
 * [start, end); an end that is <= start crosses midnight.
 */

export const EFFECTIVE_STATES = Object.freeze({
  EFFECTIVE: 'EFFECTIVE',
  SUPERSEDED: 'SUPERSEDED',
  ABSORBED: 'ABSORBED',
  METADATA_ONLY: 'METADATA_ONLY',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
});

export const CALENDAR_LAYERS = Object.freeze({
  COMPANY_PLAN: 'COMPANY_PLAN',
  CHANGE: 'CHANGE',
});

export const PROVENANCE = Object.freeze({
  COMPANY_IMPORT: 'COMPANY_IMPORT',
  MANUAL_ADMIN_CHANGE: 'MANUAL_ADMIN_CHANGE',
  EMPLOYEE_REQUEST: 'EMPLOYEE_REQUEST',
  SCHEDULE_PUBLICATION: 'SCHEDULE_PUBLICATION',
  MIGRATION: 'MIGRATION',
  SYSTEM: 'SYSTEM',
});

export const CHANGE_TYPES = Object.freeze([
  'ADD_SHIFT', 'TIME_CHANGE', 'CANCEL_SHIFT', 'ADD_EXTRA', 'PARTIAL_ABSENCE',
  'TYPE_CHANGE', 'REPLACE_DAY', 'RECONCILIATION',
]);

export const CONTRACT_STATUS = Object.freeze({
  NO_DATA: 'NO_DATA',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  UNCONFIGURED: 'UNCONFIGURED',
  BELOW_MINIMUM: 'BELOW_MINIMUM',
  WITHIN_RANGE: 'WITHIN_RANGE',
  ABOVE_MAXIMUM: 'ABOVE_MAXIMUM',
});

/**
 * Legacy company summary type ("Jefe de Turno"). Two dimensions:
 *   A. a work interval (start/end) -> JT_COUNTS_AS_WORK_INTERVAL
 *   B. the duty `shift_lead`        -> tracked separately (duty minutes/days)
 * Effective hours are the UNION of all work intervals, so a JT that coincides
 * with confirmed Regular/Extras never adds hours (JT_COUNTS_AS_ADDITIONAL_WORK
 * stays false). A JT with no other confirmed interval is legacy work that has
 * no classification: it counts as LEGACY_UNCLASSIFIED_WORK, never as Regular.
 */
export const JT_COUNTS_AS_WORK_INTERVAL = true;
export const JT_COUNTS_AS_ADDITIONAL_WORK = false;
export const LEGACY_UNCLASSIFIED_WORK = 'LEGACY_UNCLASSIFIED_WORK';
export const DUTY_ROLE_SHIFT_LEAD = 'shift_lead';

const FULL_DAY_KINDS = Object.freeze({ libre: 'Libre', vacaciones: 'Vacaciones', baja: 'Baja' });
const FULL_DAY_ALIASES = Object.freeze({
  libre: 'libre', 'día libre': 'libre', 'dia libre': 'libre', 'day off': 'libre', off: 'libre', dl: 'libre', aj: 'libre',
  vacaciones: 'vacaciones', vac: 'vacaciones', 'vac.': 'vacaciones', vacation: 'vacaciones', holiday: 'vacaciones',
  baja: 'baja', leave: 'baja', 'sick leave': 'baja',
});
const ABSENCE_ALIASES = new Set(['ausencia', 'ausencias', 'absence', 'absences']);

export function toMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClock(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** Normalizes snake_case DB rows and camelCase client rows into one shape. */
export function normalizeCalendarRow(row) {
  const pick = (camel, snake) => row[camel] ?? row[snake];
  const shiftType = String(pick('shiftType', 'shift_type') ?? row.location ?? '').trim();
  const countsAsWork = pick('countsAsWork', 'counts_as_work');
  return {
    id: row.id ?? null,
    date: String(row.date ?? '').slice(0, 10),
    startTime: pick('startTime', 'start_time') ?? null,
    endTime: pick('endTime', 'end_time') ?? null,
    shiftType,
    countsAsWork: countsAsWork === undefined ? null : countsAsWork,
    effectiveState: pick('effectiveState', 'effective_state') ?? EFFECTIVE_STATES.EFFECTIVE,
    layer: row.layer ?? CALENDAR_LAYERS.COMPANY_PLAN,
    provenance: row.provenance ?? null,
    legacyOrigin: pick('legacyOrigin', 'legacy_origin') ?? null,
    dutyRole: pick('dutyRole', 'duty_role') ?? null,
    planRevision: pick('planRevision', 'plan_revision') ?? 1,
  };
}

/** Classifies a row into its accounting kind. */
export function classifyKind(row) {
  const type = row.shiftType.trim();
  const normalized = type.toLowerCase();
  if (normalized === 'jt') return { kind: 'LEGACY_DUTY_ROLE', type: 'JT' };
  const fullDay = FULL_DAY_ALIASES[normalized];
  if (fullDay) return { kind: 'FULL_DAY', type: FULL_DAY_KINDS[fullDay] };
  if (ABSENCE_ALIASES.has(normalized)) return { kind: 'ABSENCE', type: 'Ausencia' };
  if (normalized === 'extras' || normalized === 'extra') return { kind: 'WORK', type: 'Extras', bucket: 'extras' };
  if (normalized === 'regular' || normalized === '' || normalized === 'trabajo') return { kind: 'WORK', type: 'Regular', bucket: 'regular' };
  if (row.countsAsWork === false) return { kind: 'FULL_DAY', type };
  return { kind: 'WORK', type, bucket: 'other' };
}

function rowInterval(row) {
  const start = toMinutes(row.startTime);
  const end = toMinutes(row.endTime);
  if (start === null || end === null) return null;
  return { start, end: end <= start ? end + 1440 : end };
}

function mergeIntervals(intervals) {
  const sorted = intervals.map((i) => ({ ...i })).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const overlapMinutes = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const sumMinutes = (intervals) => intervals.reduce((total, i) => total + (i.end - i.start), 0);

/**
 * Resolves one calendar day from its rows. EFFECTIVE rows and a deterministic
 * provisional baseline may participate while the day remains under review.
 * A day carrying a blocking inconsistency contributes NO minutes (never an
 * inflated or guessed total) and is reported through `issues`.
 */
export function resolveProvisionalReviewRows(inputRows, companyNow = null) {
  const rows = inputRows.map(normalizeCalendarRow);
  const businessRows = (items) => items.filter((row) => classifyKind(row).kind !== 'LEGACY_DUTY_ROLE');
  const effective = businessRows(rows.filter((row) => row.effectiveState === EFFECTIVE_STATES.EFFECTIVE));
  const valid = (selected) => {
    if (!selected.length) return false;
    const checked = resolveDay(selected[0].date, selected.map((row) => ({ ...row, effectiveState: EFFECTIVE_STATES.EFFECTIVE })));
    return !checked.issues.some((issue) => issue.blocking);
  };
  if (valid(effective)) return { counted: true, reason: 'CURRENT_EFFECTIVE', rows: effective };

  const review = businessRows(rows.filter((row) => row.effectiveState === EFFECTIVE_STATES.REQUIRES_REVIEW));
  if (!review.length || !Array.isArray(companyNow)) return { counted: false, reason: 'AMBIGUOUS', rows: [] };
  const label = (row) => `${classifyKind(row).type}|${row.startTime ?? ''}|${row.endTime ?? ''}`;
  const companyLabels = new Set(companyNow.map((row) => label(normalizeCalendarRow(row))));
  const local = review.filter((row) => !companyLabels.has(label(row)));
  if (!valid(local)) return { counted: false, reason: 'AMBIGUOUS', rows: [] };
  return { counted: true, reason: 'CURRENT_LOCAL', rows: local };
}

export function resolveDay(date, inputRows, { companyNow = null } = {}) {
  const allRows = inputRows.map(normalizeCalendarRow);
  const reviewRows = allRows.filter((row) => row.effectiveState === EFFECTIVE_STATES.REQUIRES_REVIEW);
  const selection = reviewRows.length
    ? resolveProvisionalReviewRows(allRows, companyNow)
    : { counted: false, reason: null, rows: [] };
  const rows = allRows.filter((row) => row.effectiveState !== EFFECTIVE_STATES.REQUIRES_REVIEW);
  if (selection.counted) rows.push(...selection.rows.map((row) => ({ ...row, effectiveState: EFFECTIVE_STATES.EFFECTIVE })));
  const issues = [];
  const result = {
    date,
    status: 'EMPTY',
    accountingStatus: 'EMPTY',
    fullDayType: null,
    workIntervals: [],
    absenceIntervals: [],
    minutes: { regular: 0, extras: 0, other: 0, unclassified: 0, work: 0, absence: 0, duty: 0 },
    byType: {},
    issues,
    requiresReview: false,
    countedProvisionally: false,
    provisionalReason: null,
    legacyDutyRows: 0,
    dutyRole: null,
    duplicateRows: 0,
  };

  if (reviewRows.length) {
    result.requiresReview = true;
    result.countedProvisionally = selection.counted;
    result.provisionalReason = selection.reason;
    issues.push({ code: 'REQUIRES_REVIEW', blocking: true, rows: reviewRows.length });
  }

  // Legacy JT rows parked as METADATA_ONLY still carry their interval.
  const active = rows.filter((row) => row.effectiveState === EFFECTIVE_STATES.EFFECTIVE
    || (row.effectiveState === EFFECTIVE_STATES.METADATA_ONLY && classifyKind(row).kind === 'LEGACY_DUTY_ROLE'));
  const seen = new Set();
  const entries = [];
  const dutyIntervals = [];
  for (const row of active) {
    const classified = classifyKind(row);
    if (classified.kind === 'LEGACY_DUTY_ROLE') {
      result.legacyDutyRows += 1;
      result.dutyRole = DUTY_ROLE_SHIFT_LEAD;
      const jtInterval = rowInterval(row);
      if (jtInterval) dutyIntervals.push(jtInterval);
      continue;
    }
    if (row.dutyRole) result.dutyRole = row.dutyRole;
    const interval = classified.kind === 'FULL_DAY' ? null : rowInterval(row);
    if (classified.kind !== 'FULL_DAY' && !interval) {
      issues.push({ code: 'MISSING_TIMES', blocking: true, type: classified.type });
      continue;
    }
    const key = `${classified.kind}|${classified.type}|${interval?.start ?? ''}|${interval?.end ?? ''}`;
    if (seen.has(key)) {
      result.duplicateRows += 1;
      continue;
    }
    seen.add(key);
    entries.push({ ...classified, interval });
  }
  if (result.duplicateRows) issues.push({ code: 'DUPLICATE_ROWS', blocking: false, rows: result.duplicateRows });

  const fullDays = entries.filter((entry) => entry.kind === 'FULL_DAY');
  const work = entries.filter((entry) => entry.kind === 'WORK');
  const absences = entries.filter((entry) => entry.kind === 'ABSENCE');

  if (new Set(fullDays.map((entry) => entry.type)).size > 1) {
    issues.push({ code: 'FULL_DAY_CONFLICT', blocking: true, types: [...new Set(fullDays.map((e) => e.type))] });
  }
  if (fullDays.length && (work.length || absences.length)) {
    issues.push({ code: 'FULL_DAY_WITH_WORK', blocking: true, fullDay: fullDays[0].type });
  }
  const timed = [...work, ...absences];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      if (overlaps(timed[i].interval, timed[j].interval)) {
        issues.push({ code: 'OVERLAP', blocking: true, a: timed[i].type, b: timed[j].type });
      }
    }
  }

  result.fullDayType = fullDays[0]?.type ?? null;
  const blocking = issues.some((issue) => issue.blocking && issue.code !== 'REQUIRES_REVIEW');
  result.workIntervals = work.map((entry) => ({ ...entry.interval, type: entry.type }));
  result.absenceIntervals = absences.map((entry) => ({ ...entry.interval, type: 'Ausencia' }));

  if (blocking && !result.countedProvisionally) {
    result.status = result.requiresReview ? 'REQUIRES_REVIEW' : 'CONFLICT';
    return result;
  }
  if (blocking && result.countedProvisionally) {
    // The selected baseline itself must remain internally valid.
    result.status = 'REQUIRES_REVIEW';
    return result;
  }

  for (const entry of work) {
    const minutes = entry.interval.end - entry.interval.start;
    result.minutes[entry.bucket] += minutes;
    result.byType[entry.type] = (result.byType[entry.type] ?? 0) + minutes;
  }
  // JT: union with confirmed work. Only the part of a JT interval that no
  // classified interval already covers is (unclassified) legacy work.
  const dutyUnion = mergeIntervals(dutyIntervals);
  result.minutes.duty = sumMinutes(dutyUnion);
  if (dutyUnion.length && !result.fullDayType) {
    const covered = mergeIntervals(work.map((entry) => entry.interval));
    const uncovered = result.minutes.duty - dutyUnion.reduce(
      (total, jt) => total + covered.reduce((sum, w) => sum + overlapMinutes(jt, w), 0), 0,
    );
    if (uncovered > 0) {
      result.minutes.unclassified = uncovered;
      result.byType[LEGACY_UNCLASSIFIED_WORK] = uncovered;
      if (work.length) issues.push({ code: 'DUTY_INTERVAL_PARTIAL_OVERLAP', blocking: false, uncoveredMinutes: uncovered });
    }
  } else if (dutyUnion.length && result.fullDayType) {
    issues.push({ code: 'DUTY_INTERVAL_ON_NON_WORK_DAY', blocking: false });
    result.minutes.duty = 0;
  }
  result.minutes.work = result.minutes.regular + result.minutes.extras + result.minutes.other + result.minutes.unclassified;
  result.minutes.absence = sumMinutes(mergeIntervals(absences.map((entry) => entry.interval)));
  if (result.minutes.absence) result.byType.Ausencia = result.minutes.absence;

  if (result.fullDayType) result.status = result.fullDayType.toUpperCase();
  else if (work.length || result.minutes.unclassified > 0) result.status = 'WORK';
  else if (absences.length) result.status = 'ABSENCE_ONLY';
  else result.status = result.legacyDutyRows ? 'DUTY_ONLY' : 'EMPTY';
  if (result.status === 'DUTY_ONLY') issues.push({ code: 'DUTY_ROLE_WITHOUT_WORK', blocking: false });
  result.accountingStatus = result.status;
  if (result.requiresReview) result.status = 'REQUIRES_REVIEW';
  return result;
}

/** Cross-day check: an overnight interval must not collide with the next day. */
export function findOvernightSpillConflicts(days) {
  const conflicts = [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const day = sorted[index];
    const next = sorted[index + 1];
    if (day.status === 'CONFLICT' || next.status === 'CONFLICT') continue;
    const nextDate = new Date(`${day.date}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    if (nextDate.toISOString().slice(0, 10) !== next.date) continue;
    for (const spill of [...day.workIntervals, ...day.absenceIntervals].filter((i) => i.end > 1440)) {
      const spillOnNext = { start: 0, end: spill.end - 1440 };
      for (const interval of [...next.workIntervals, ...next.absenceIntervals]) {
        if (overlaps(spillOnNext, interval)) conflicts.push({ date: day.date, nextDate: next.date, code: 'OVERNIGHT_SPILL_OVERLAP' });
      }
    }
  }
  return conflicts;
}

const emptyBucket = () => ({
  effectiveMinutes: 0, regularMinutes: 0, extrasMinutes: 0, otherWorkMinutes: 0, unclassifiedWorkMinutes: 0,
  absenceMinutes: 0, dutyMinutes: 0, dutyDays: 0, workedDays: 0, freeDays: 0, vacationDays: 0, sickLeaveDays: 0,
});

function addDay(bucket, day) {
  bucket.effectiveMinutes += day.minutes.work;
  bucket.regularMinutes += day.minutes.regular;
  bucket.extrasMinutes += day.minutes.extras;
  bucket.otherWorkMinutes += day.minutes.other;
  bucket.unclassifiedWorkMinutes += day.minutes.unclassified;
  bucket.absenceMinutes += day.minutes.absence;
  bucket.dutyMinutes += day.minutes.duty;
  if (day.minutes.duty > 0) bucket.dutyDays += 1;
  if (day.minutes.work > 0) bucket.workedDays += 1;
  const accountingStatus = day.accountingStatus ?? day.status;
  if (accountingStatus === 'LIBRE') bucket.freeDays += 1;
  if (accountingStatus === 'VACACIONES') bucket.vacationDays += 1;
  if (accountingStatus === 'BAJA') bucket.sickLeaveDays += 1;
}

/**
 * Effective statistics for a date range. `realized` covers dates before
 * `today`; `planned` covers today onwards. Future hours are never reported
 * as realized. Pending days remain listed even when counted provisionally.
 */
export function computeEffectiveStats(inputRows, { from, to, today, companyNowByDate = {} } = {}) {
  const byDate = new Map();
  let calendarRows = 0;
  for (const row of inputRows) {
    const normalized = normalizeCalendarRow(row);
    if (!normalized.date) continue;
    if (from && normalized.date < from) continue;
    if (to && normalized.date > to) continue;
    calendarRows += 1;
    if (!byDate.has(normalized.date)) byDate.set(normalized.date, []);
    byDate.get(normalized.date).push(normalized);
  }
  const days = [...byDate.entries()].map(([date, rows]) => resolveDay(date, rows, { companyNow: companyNowByDate[date] ?? null }));
  const total = emptyBucket();
  const realized = emptyBucket();
  const planned = emptyBucket();
  const unresolved = [];
  let legacyDutyRows = 0;
  let duplicateRows = 0;
  let provisionalReviewDays = 0;
  let provisionalReviewMinutes = 0;
  let unresolvedUncountedDays = 0;
  let realizedProvisionalReviewDays = 0;
  let plannedProvisionalReviewDays = 0;
  let realizedProvisionalReviewMinutes = 0;
  let plannedProvisionalReviewMinutes = 0;
  for (const day of days) {
    legacyDutyRows += day.legacyDutyRows;
    duplicateRows += day.duplicateRows;
    if (day.status === 'CONFLICT') {
      unresolved.push({ date: day.date, status: day.status, issues: day.issues.filter((i) => i.blocking).map((i) => i.code) });
      unresolvedUncountedDays += 1;
      continue;
    }
    if (day.status === 'REQUIRES_REVIEW') {
      unresolved.push({ date: day.date, status: day.status, issues: day.issues.filter((i) => i.blocking).map((i) => i.code) });
      if (!day.countedProvisionally) { unresolvedUncountedDays += 1; continue; }
      provisionalReviewDays += 1;
      provisionalReviewMinutes += day.minutes.work;
      const bucket = today ? (day.date < today ? realized : planned) : total;
      if (today && day.date < today) {
        realizedProvisionalReviewDays += 1;
        realizedProvisionalReviewMinutes += day.minutes.work;
      } else if (today) {
        plannedProvisionalReviewDays += 1;
        plannedProvisionalReviewMinutes += day.minutes.work;
      }
      addDay(total, day);
      if (today) addDay(bucket, day);
      continue;
    }
    if (day.status === 'DUTY_ONLY') {
      // A JT row without usable times is the only trace of that day: never
      // invent hours from it, never hide it either.
      unresolved.push({ date: day.date, status: 'REQUIRES_REVIEW', issues: ['DUTY_ROLE_WITHOUT_WORK'] });
      unresolvedUncountedDays += 1;
      continue;
    }
    addDay(total, day);
    if (today) addDay(day.date < today ? realized : planned, day);
  }
  const spill = findOvernightSpillConflicts(days);
  for (const conflict of spill) unresolved.push({ date: conflict.date, status: 'CONFLICT', issues: [conflict.code] });
  const byType = {};
  for (const day of days) {
    if (day.status === 'CONFLICT' || (day.status === 'REQUIRES_REVIEW' && !day.countedProvisionally)) continue;
    for (const [type, minutes] of Object.entries(day.byType)) byType[type] = (byType[type] ?? 0) + minutes;
  }
  return {
    calendarRows,
    total,
    realized: today ? realized : total,
    planned: today ? planned : emptyBucket(),
    byType,
    unresolvedDays: unresolved.length,
    totalReviewDays: days.filter((day) => day.requiresReview).length,
    provisionalReviewDays,
    provisionalReviewMinutes,
    unresolvedUncountedDays,
    realizedProvisionalReviewDays,
    plannedProvisionalReviewDays,
    realizedProvisionalReviewMinutes,
    plannedProvisionalReviewMinutes,
    unresolved: unresolved.sort((a, b) => a.date.localeCompare(b.date)),
    legacyDutyRows,
    duplicateRows,
    days,
  };
}

/** Annual contract evaluation in integer minutes. Informational only. */
export function evaluateAnnualTarget(effectiveMinutes, target, { calendarRows = null } = {}) {
  const minimum = target?.minimumAnnualMinutes ?? null;
  const maximum = target?.maximumAnnualMinutes ?? null;
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) {
    return { status: CONTRACT_STATUS.UNCONFIGURED, effectiveMinutes };
  }
  // No calendar rows at all is "not evaluable", never "0 h = non-compliant".
  if (calendarRows === 0) {
    return { status: CONTRACT_STATUS.NO_DATA, effectiveMinutes, minimumMinutes: minimum, maximumMinutes: maximum, marginMinutes: maximum - minimum };
  }
  const margin = maximum - minimum;
  const status = effectiveMinutes < minimum
    ? CONTRACT_STATUS.BELOW_MINIMUM
    : effectiveMinutes > maximum ? CONTRACT_STATUS.ABOVE_MAXIMUM : CONTRACT_STATUS.WITHIN_RANGE;
  return {
    status,
    effectiveMinutes,
    minimumMinutes: minimum,
    maximumMinutes: maximum,
    marginMinutes: margin,
    missingToMinimumMinutes: Math.max(0, minimum - effectiveMinutes),
    aboveMinimumMinutes: Math.max(0, effectiveMinutes - minimum),
    marginUsedMinutes: Math.min(margin, Math.max(0, effectiveMinutes - minimum)),
    marginRemainingMinutes: Math.max(0, maximum - Math.max(effectiveMinutes, minimum)),
    excessOverMaximumMinutes: Math.max(0, effectiveMinutes - maximum),
    maximumReached: effectiveMinutes >= maximum,
  };
}

export function hoursToMinutes(hours) {
  return Math.round(Number(hours) * 60);
}

export function splitMinutes(totalMinutes) {
  const sign = totalMinutes < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(totalMinutes));
  return { sign, hours: Math.floor(abs / 60), minutes: abs % 60 };
}

/**
 * Day provenance model for the detail view: effective rows, the original and
 * current company plan, and the change trail (chronological).
 */
export function buildDayProvenance(inputRows, changes = []) {
  const rows = inputRows.map(normalizeCalendarRow);
  const plan = rows.filter((row) => row.layer === CALENDAR_LAYERS.COMPANY_PLAN);
  const revisions = [...new Set(plan.map((row) => row.planRevision))].sort((a, b) => a - b);
  const forRevision = (revision) => plan.filter((row) => row.planRevision === revision && classifyKind(row).kind !== 'LEGACY_DUTY_ROLE');
  const original = revisions.length ? forRevision(revisions[0]) : [];
  const currentRevision = revisions.length
    ? [...revisions].reverse().find((revision) => forRevision(revision).some((row) => row.effectiveState !== EFFECTIVE_STATES.REQUIRES_REVIEW)) ?? revisions[revisions.length - 1]
    : null;
  const current = currentRevision === null ? [] : forRevision(currentRevision);
  const effective = rows.filter((row) => row.effectiveState === EFFECTIVE_STATES.EFFECTIVE && classifyKind(row).kind !== 'LEGACY_DUTY_ROLE');
  const signature = (list) => list.map((r) => `${classifyKind(r).type}|${r.startTime ?? ''}|${r.endTime ?? ''}`).sort().join(';');
  return {
    effective,
    companyOriginal: original,
    companyCurrent: current,
    revisions,
    changes: [...changes].sort((a, b) => String(a.createdAt ?? a.created_at).localeCompare(String(b.createdAt ?? b.created_at))),
    hasChangesFromPlan: changes.length > 0 || signature(effective) !== signature(current),
    requiresReview: rows.some((row) => row.effectiveState === EFFECTIVE_STATES.REQUIRES_REVIEW),
    legacyDutyRows: rows.filter((row) => classifyKind(row).kind === 'LEGACY_DUTY_ROLE'),
  };
}

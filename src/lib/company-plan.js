/**
 * Company-plan import domain (pure, shared by API and client; NO I/O, NO crypto).
 *
 *   COMPANY PLAN (versioned baseline) -> CHANGES -> EFFECTIVE CALENDAR -> STATS
 *
 * - Temporal class of a document is derived AFTER parsing, whatever the format.
 * - Importing future rows creates/updates the PLAN (schedule drafts); it never publishes.
 * - A plan update is reconciled three-way per employee + date:
 *     B = previous company baseline, N = new company plan, E = effective calendar / local override.
 */
import { classifyKind, toMinutes } from './effective-calendar.js';

export const TEMPORAL_CLASS = Object.freeze({ HISTORICAL: 'HISTORICAL', FUTURE: 'FUTURE', MIXED: 'MIXED' });
export const DOCUMENT_CLASS = Object.freeze({
  COMPANY_PLAN: 'COMPANY_PLAN',
  COMPANY_PLAN_UPDATE: 'COMPANY_PLAN_UPDATE',
  HISTORICAL_CALENDAR: 'HISTORICAL_CALENDAR',
  UNDETERMINED: 'UNDETERMINED',
});
export const IMPORT_DECISION = Object.freeze({ HISTORICAL_ONLY: 'historical-only', HISTORICAL_AND_PLAN: 'historical-and-plan' });
export const RECONCILIATION_OUTCOME = Object.freeze({
  UNCHANGED: 'UNCHANGED',
  NEW: 'NEW',
  KEPT_LOCAL: 'KEPT_LOCAL',
  MODIFIED: 'MODIFIED',
  COMPANY_ADOPTED_LOCAL: 'COMPANY_ADOPTED_LOCAL',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
  /** Evidence from an employee calendar replaced a plan-only effective day (plan preserved, evidence explainable). */
  EVIDENCE_APPLIED: 'EVIDENCE_APPLIED',
});

/** `publish` is the pre-rename wire value: it always meant "include the future", never "auto-publish". */
export function normalizeImportDecision(value) {
  if (value === IMPORT_DECISION.HISTORICAL_AND_PLAN || value === 'publish') return IMPORT_DECISION.HISTORICAL_AND_PLAN;
  return IMPORT_DECISION.HISTORICAL_ONLY;
}

export function splitByOperationalDate(rows, today) {
  const historical = [];
  const future = [];
  for (const row of rows) (String(row.date) < today ? historical : future).push(row);
  return { historical, future };
}

export function classifyTemporal(rows, today) {
  const { historical, future } = splitByOperationalDate(rows, today);
  if (historical.length && future.length) return TEMPORAL_CLASS.MIXED;
  return future.length ? TEMPORAL_CLASS.FUTURE : TEMPORAL_CLASS.HISTORICAL;
}

/**
 * Business proposal for what the document IS (the user may correct it when ambiguous).
 * Evidence = temporal coverage, employee count and relation to an existing plan; never the file name.
 */
export function classifyDocument({ temporal, employeeCount, hasExistingPlan = false, rowCount = 0 }) {
  const evidence = [];
  if (!rowCount || !employeeCount) return { documentClass: DOCUMENT_CLASS.UNDETERMINED, confidence: 'none', evidence: ['no-rows'] };
  if (temporal === TEMPORAL_CLASS.HISTORICAL) {
    evidence.push('all-rows-before-today');
    return { documentClass: DOCUMENT_CLASS.HISTORICAL_CALENDAR, confidence: 'high', evidence };
  }
  evidence.push(temporal === TEMPORAL_CLASS.FUTURE ? 'all-rows-from-today' : 'rows-before-and-after-today');
  evidence.push(employeeCount > 1 ? 'multi-employee' : 'single-employee');
  if (hasExistingPlan) {
    evidence.push('overlaps-existing-plan');
    return { documentClass: DOCUMENT_CLASS.COMPANY_PLAN_UPDATE, confidence: 'high', evidence };
  }
  // A single-employee document that straddles today may be a personal calendar rather than the company plan.
  const confidence = temporal === TEMPORAL_CLASS.MIXED && employeeCount === 1 ? 'medium' : 'high';
  return { documentClass: DOCUMENT_CLASS.COMPANY_PLAN, confidence, evidence };
}

/**
 * Which effects a user may choose for a document, derived from role + temporal class.
 * Server-side authority: this is validated again by the API, hiding buttons is not security.
 */
export function resolveImportOptions({ canPlan, temporal }) {
  if (temporal === TEMPORAL_CLASS.HISTORICAL) return { options: [IMPORT_DECISION.HISTORICAL_ONLY], default: IMPORT_DECISION.HISTORICAL_ONLY, futureAllowed: false };
  if (!canPlan) return { options: [IMPORT_DECISION.HISTORICAL_ONLY], default: IMPORT_DECISION.HISTORICAL_ONLY, futureAllowed: false };
  if (temporal === TEMPORAL_CLASS.FUTURE) return { options: [IMPORT_DECISION.HISTORICAL_AND_PLAN], default: IMPORT_DECISION.HISTORICAL_AND_PLAN, futureAllowed: true };
  return { options: [IMPORT_DECISION.HISTORICAL_ONLY, IMPORT_DECISION.HISTORICAL_AND_PLAN], default: IMPORT_DECISION.HISTORICAL_ONLY, futureAllowed: true };
}

/* ----------------------------------------------------------------- row identity */

/** Stable business key of an employee: payroll number first, normalised name as last resort. Never a UUID. */
export function employeeBusinessKey(employee) {
  const external = String(employee?.externalEmployeeId ?? employee?.external_employee_id ?? '').trim().toUpperCase();
  if (external) return `id:${external}`;
  const name = String(employee?.name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return name ? `name:${name}` : null;
}

const hhmm = (value) => {
  const minutes = toMinutes(value);
  if (minutes === null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

/** Normalised business content of one plan row (AJ→Libre etc. come from the effective-calendar classifier). */
export function normalizePlanRow(row) {
  const type = String(row.shiftType ?? row.shift_type ?? row.location ?? '').trim();
  const kind = classifyKind({ shiftType: type, countsAsWork: row.countsAsWork ?? row.counts_as_work ?? null });
  const fullDay = kind.kind === 'FULL_DAY' || kind.kind === 'ABSENCE';
  return {
    date: String(row.date).slice(0, 10),
    type: kind.type,
    start: fullDay ? '' : hhmm(row.startTime ?? row.start_time),
    end: fullDay ? '' : hhmm(row.endTime ?? row.end_time),
    duty: row.dutyRole ?? row.duty_role ?? '',
  };
}

/** `employee|date|type|start|end|duty` — deterministic, tenant/UUID independent. */
export function planRowSignature(employeeKey, row) {
  const n = normalizePlanRow(row);
  return [employeeKey, n.date, n.type, n.start, n.end, n.duty].join('\u001f');
}

/** Ordered canonical lines of a plan; hashing them is done by the server (api/_lib/import-fingerprints.js). */
export function planCanonicalLines(rows) {
  return rows.map((entry) => planRowSignature(entry.employeeKey, entry.row)).sort();
}

/* ----------------------------------------------------------------- baseline + three-way */

const sameContent = (a, b) => {
  if (!a || !b) return false;
  const x = normalizePlanRow(a); const y = normalizePlanRow(b);
  return x.type === y.type && x.start === y.start && x.end === y.end && x.duty === y.duty;
};

/** Rows for a day grouped per employee key -> array of normalised rows. */
const dayKey = (employeeKey, date) => `${employeeKey}\u001f${date}`;

function indexRows(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = dayKey(entry.employeeKey, String(entry.row.date).slice(0, 10));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry.row);
  }
  return map;
}

/**
 * Canonical content of one day for COMPARISON: a whole-day type, or the merged union of the timed work
 * intervals (so Regular 13-20 + Extras 20-21 equals Regular 13-21) plus absence intervals.
 * Provenance and the Regular/Extras split never decide whether two plans differ.
 */
export function daySignature(rows = []) {
  const normalized = rows.map(normalizePlanRow);
  const full = normalized.find((n) => !n.start && !n.end)?.type ?? null;
  if (full) return `full:${full}`;
  const merge = (list) => {
    const sorted = list.map(({ start, end }) => {
      const s = toMinutes(start); let e = toMinutes(end);
      if (e <= s) e += 1440;
      return { s, e };
    }).sort((x, y) => x.s - y.s || x.e - y.e);
    const out = [];
    for (const it of sorted) {
      const last = out[out.length - 1];
      if (last && it.s <= last.e) last.e = Math.max(last.e, it.e); else out.push({ ...it });
    }
    return out.map((i) => `${i.s}-${i.e}`).join(',');
  };
  const absence = normalized.filter((n) => n.type === 'Ausencia' && n.start);
  const work = normalized.filter((n) => n.type !== 'Ausencia' && n.start);
  return `work:${merge(work)}|abs:${merge(absence)}`;
}

const sameDay = (a = [], b = []) => daySignature(a) === daySignature(b);

/**
 * Baseline B for a range: for every date the NEWEST revision covering it wins.
 * `revisions` = [{ revisionNumber, coverageFrom, coverageTo, rows:[{employeeKey,row}] }].
 */
export function resolveBaseline(revisions, { from, to }) {
  const ordered = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
  const claimed = new Set();
  const result = [];
  for (const revision of ordered) {
    const claimedHere = new Set();
    for (const entry of revision.rows) {
      const date = String(entry.row.date).slice(0, 10);
      if (date < from || date > to) continue;
      const day = dayKey(entry.employeeKey, date);
      if (claimed.has(day)) continue; // a newer revision already owns this employee/day
      result.push(entry);
      claimedHere.add(day);
    }
    for (const day of claimedHere) claimed.add(day);
  }
  return result;
}

/**
 * Three-way reconciliation per employee + date.
 *   B == N, E == B  -> UNCHANGED          B == N, E != B -> KEPT_LOCAL (override preserved)
 *   B != N, E == B  -> MODIFIED (future)  B != N, E == N -> COMPANY_ADOPTED_LOCAL (auto-resolved)
 *   B != N, E != B, E != N -> REQUIRES_REVIEW
 *   no B (and no E) -> NEW; no B but E exists: E == N -> UNCHANGED, else REQUIRES_REVIEW
 *   days already awaiting review stay REQUIRES_REVIEW (never silently resolved)
 * Historical dates never become MODIFIED silently: a contradiction with the effective history is REQUIRES_REVIEW.
 */
export function reconcileThreeWay({ baseline, next, effective, today, reviewDays = new Set(), planOnlyDays = new Set() }) {
  const B = indexRows(baseline); const N = indexRows(next); const E = indexRows(effective);
  // Rows flagged `evidence` come from an employee calendar for a past date: they describe what the employee
  // calendar SHOWS (effective evidence), not what the company planned.
  const evidenceDays = new Set(next.filter((entry) => entry.evidence).map((entry) => dayKey(entry.employeeKey, String(entry.row.date).slice(0, 10))));
  const outcomes = [];
  for (const [key, newRows] of N) {
    const [employeeKey, date] = key.split('\u001f');
    const b = B.get(key); const e = E.get(key);
    const retrospective = date < today;
    const evidence = evidenceDays.has(key);
    const base = { employeeKey, date, next: newRows, baseline: b ?? null, effective: e ?? null, retrospective, evidence };
    let outcome;
    if (reviewDays.has(key)) outcome = RECONCILIATION_OUTCOME.REQUIRES_REVIEW; // never resolve a pending day silently
    else if (evidence) {
      // Employee-calendar evidence is compared with the effective day only (the plan baseline is not involved).
      if (!e) outcome = RECONCILIATION_OUTCOME.NEW;
      else if (sameDay(e, newRows)) outcome = RECONCILIATION_OUTCOME.UNCHANGED;
      else outcome = planOnlyDays.has(key) ? RECONCILIATION_OUTCOME.EVIDENCE_APPLIED : RECONCILIATION_OUTCOME.REQUIRES_REVIEW;
    }
    else if (!b && !e) outcome = RECONCILIATION_OUTCOME.NEW;
    // First import (no baseline): a day that already matches the effective calendar is simply UNCHANGED. A past day that
    // differs keeps its effective state (the plan is recorded, the difference stays explainable); a future day that a
    // planner already drafted differently needs a human decision.
    else if (!b && e) {
      if (sameDay(e, newRows)) outcome = RECONCILIATION_OUTCOME.UNCHANGED;
      else outcome = retrospective ? RECONCILIATION_OUTCOME.KEPT_LOCAL : RECONCILIATION_OUTCOME.REQUIRES_REVIEW;
    }
    else if (sameDay(b, newRows)) {
      outcome = !e || sameDay(e, b) ? RECONCILIATION_OUTCOME.UNCHANGED : RECONCILIATION_OUTCOME.KEPT_LOCAL;
    } else if (!e || sameDay(e, b)) {
      outcome = retrospective ? RECONCILIATION_OUTCOME.REQUIRES_REVIEW : RECONCILIATION_OUTCOME.MODIFIED;
    } else if (sameDay(e, newRows)) outcome = RECONCILIATION_OUTCOME.COMPANY_ADOPTED_LOCAL;
    else outcome = RECONCILIATION_OUTCOME.REQUIRES_REVIEW;
    outcomes.push({ ...base, outcome });
  }
  return outcomes.sort((a, b) => a.date.localeCompare(b.date) || a.employeeKey.localeCompare(b.employeeKey));
}

export function summarizeOutcomes(outcomes) {
  const summary = { total: outcomes.length, unchanged: 0, new: 0, keptLocal: 0, modified: 0, companyAdoptedLocal: 0, requiresReview: 0, evidenceApplied: 0 };
  for (const item of outcomes) {
    if (item.outcome === RECONCILIATION_OUTCOME.UNCHANGED) summary.unchanged += 1;
    else if (item.outcome === RECONCILIATION_OUTCOME.NEW) summary.new += 1;
    else if (item.outcome === RECONCILIATION_OUTCOME.KEPT_LOCAL) summary.keptLocal += 1;
    else if (item.outcome === RECONCILIATION_OUTCOME.MODIFIED) summary.modified += 1;
    else if (item.outcome === RECONCILIATION_OUTCOME.COMPANY_ADOPTED_LOCAL) summary.companyAdoptedLocal += 1;
    else if (item.outcome === RECONCILIATION_OUTCOME.EVIDENCE_APPLIED) summary.evidenceApplied += 1;
    else summary.requiresReview += 1;
  }
  return summary;
}

/** Days whose rows must be written into the draft plan (everything else is left alone). */
export const WRITES_TO_PLAN = new Set([
  RECONCILIATION_OUTCOME.NEW,
  RECONCILIATION_OUTCOME.MODIFIED,
  RECONCILIATION_OUTCOME.COMPANY_ADOPTED_LOCAL,
]);

export { sameContent };
export { sameDay };

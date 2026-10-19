/**
 * Calendar import domain (pure, shared by API and client; NO I/O, NO crypto).
 * Temporal class is derived after parsing. Historical input is compared with CURRENT; future input creates or updates Planning drafts.
 */
import { classifyKind, toMinutes } from './effective-calendar.js';

export const TEMPORAL_CLASS = Object.freeze({ HISTORICAL: 'HISTORICAL', FUTURE: 'FUTURE', MIXED: 'MIXED' });
export const DOCUMENT_CLASS = Object.freeze({
  PLANNING_DRAFT: 'PLANNING_DRAFT',
  PLANNING_UPDATE: 'PLANNING_UPDATE',
  HISTORICAL_CALENDAR: 'HISTORICAL_CALENDAR',
  UNDETERMINED: 'UNDETERMINED',
});
export const IMPORT_DECISION = Object.freeze({ HISTORICAL_ONLY: 'historical-only', HISTORICAL_AND_PLAN: 'historical-and-plan' });
export const RECONCILIATION_OUTCOME = Object.freeze({
  UNCHANGED: 'UNCHANGED',
  NEW: 'NEW',
  MODIFIED: 'MODIFIED',
  REQUIRES_REVIEW: 'REQUIRES_REVIEW',
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
export function classifyDocument({ temporal, employeeCount, hasExistingSchedule = false, rowCount = 0 }) {
  const evidence = [];
  if (!rowCount || !employeeCount) return { documentClass: DOCUMENT_CLASS.UNDETERMINED, confidence: 'none', evidence: ['no-rows'] };
  if (temporal === TEMPORAL_CLASS.HISTORICAL) {
    evidence.push('all-rows-before-today');
    return { documentClass: DOCUMENT_CLASS.HISTORICAL_CALENDAR, confidence: 'high', evidence };
  }
  evidence.push(temporal === TEMPORAL_CLASS.FUTURE ? 'all-rows-from-today' : 'rows-before-and-after-today');
  evidence.push(employeeCount > 1 ? 'multi-employee' : 'single-employee');
  if (hasExistingSchedule) {
    evidence.push('overlaps-existing-planning');
    return { documentClass: DOCUMENT_CLASS.PLANNING_UPDATE, confidence: 'high', evidence };
  }
  // A single-employee document that straddles today may be a personal calendar rather than the company plan.
  const confidence = temporal === TEMPORAL_CLASS.MIXED && employeeCount === 1 ? 'medium' : 'high';
  return { documentClass: DOCUMENT_CLASS.PLANNING_DRAFT, confidence, evidence };
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
export function normalizeImportedCalendarRow(row) {
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

/* ----------------------------------------------------------------- day grouping and current/proposal comparison */

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
  const normalized = rows.map(normalizeImportedCalendarRow);
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

/** Business identity of ONE visible row: type + hours. Ids, imports, timestamps, provenance and plan revision never count. */
const visibleRowKey = (row) => {
  const n = normalizeImportedCalendarRow({ date: '2000-01-01', ...row });
  return `${n.type}|${n.start}|${n.end}`;
};

/**
 * Has the day a user-visible change? `true` only when the business state before / after differs (order, ids and
 * technical provenance ignored). A technical event whose before === after (e.g. an automatic reconciliation that confirmed
 * "Vacaciones") is HISTORY, not a change.
 */
export const hasSemanticDayChange = (before = [], after = []) => !sameDay(before, after);

/**
 * Does a day hold history that really differs from what is visible now? `historicRows` = SUPERSEDED / ABSORBED rows,
 * `effectiveRows` = what the calendar shows. Compared as sets of visible row states, so a superseded duplicate of the
 * very same shift is not a change.
 */
export function hasSemanticHistoryChange(effectiveRows = [], historicRows = []) {
  if (historicRows.length === 0) return false;
  const effective = new Set(effectiveRows.map(visibleRowKey));
  const historic = new Set(historicRows.map(visibleRowKey));
  for (const key of historic) if (!effective.has(key)) return true;
  for (const key of effective) if (!historic.has(key)) return true;
  return false;
}

/** Compares imported rows with CURRENT only. Pending alternatives never replace CURRENT silently. */
export function reconcileCurrentProposal({ proposed, current, today, reviewDays = new Set() }) {
  const incoming = indexRows(proposed);
  const existing = indexRows(current);
  const outcomes = [];
  for (const [key, nextRows] of incoming) {
    const [employeeKey, date] = key.split('\u001f');
    const effective = existing.get(key) ?? null;
    const retrospective = date < today;
    const outcome = reviewDays.has(key)
      ? RECONCILIATION_OUTCOME.REQUIRES_REVIEW
      : !effective
        ? RECONCILIATION_OUTCOME.NEW
        : sameDay(effective, nextRows)
          ? RECONCILIATION_OUTCOME.UNCHANGED
          : retrospective ? RECONCILIATION_OUTCOME.REQUIRES_REVIEW : RECONCILIATION_OUTCOME.MODIFIED;
    outcomes.push({ employeeKey, date, next: nextRows, effective, retrospective, evidence: false, outcome });
  }
  return outcomes.sort((a, b) => a.date.localeCompare(b.date) || a.employeeKey.localeCompare(b.employeeKey));
}

export function summarizeOutcomes(outcomes) {
  const summary = { total: outcomes.length, unchanged: 0, new: 0, modified: 0, requiresReview: 0 };
  for (const item of outcomes) {
    if (item.outcome === RECONCILIATION_OUTCOME.UNCHANGED) summary.unchanged += 1;
    else if (item.outcome === RECONCILIATION_OUTCOME.NEW) summary.new += 1;
    else if (item.outcome === RECONCILIATION_OUTCOME.MODIFIED) summary.modified += 1;
    else summary.requiresReview += 1;
  }
  return summary;
}

/** Outcomes that create or update unpublished Planning assignments. */
export const WRITES_TO_DRAFT = new Set([
  RECONCILIATION_OUTCOME.NEW,
  RECONCILIATION_OUTCOME.MODIFIED,
]);
export { sameDay };

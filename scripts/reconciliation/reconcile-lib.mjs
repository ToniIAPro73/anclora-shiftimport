/**
 * Employee calendar reconciliation (pure logic, no I/O).
 *
 * Compares, for one employee and one day:
 *   - the CURRENT company calendar (e.g. the exported Excel),
 *   - the ShiftImport rows (with GroundSync PDF/MAN provenance recovered),
 * and decides whether the day can be migrated to the effective-calendar model
 * automatically (HIGH) or must wait for an administrator (MEDIUM / LOW).
 *
 * Principles
 *  - Nothing is deleted. Rows change `effective_state` only.
 *  - JT ("Jefe de Turno") is a duty role: it never counts as additional work.
 *  - A day the data cannot explain is REQUIRES_REVIEW, never "invented".
 *  - Only HIGH confidence days are applied; the rest are marked
 *    REQUIRES_REVIEW so their hours are not counted until resolved.
 */
import {
  DUTY_ROLE_SHIFT_LEAD,
  resolveDay,
  toMinutes,
} from '../../src/lib/effective-calendar.js';

export const CONFIDENCE = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });

const FULL_DAY = new Set(['Libre', 'Vacaciones', 'Baja']);
const GREEN_FILLS = new Set(['AEFC04']);
const BLUE_FILLS = new Set(['A9D0F5']);

const normFill = (argb) => {
  const value = String(argb ?? '').toUpperCase();
  return value.length === 8 ? value.slice(2) : value;
};

/**
 * Company calendar cell -> canonical record. Confirmed interpretations:
 * DL/AJ -> Libre, green -> Vacaciones, blue -> Baja, "HH:mm / HH:mm" -> Regular.
 * A third line ("!") is carried as an opaque marker; it is never interpreted.
 */
export function classifyCompanyCell({ text, fill }) {
  const parts = String(text ?? '').replace(/\r/g, '').split('\n').map((part) => part.trim()).filter(Boolean);
  const first = (parts[0] ?? '').toUpperCase();
  if (first === 'DL' || first === 'AJ') return { type: 'Libre', code: first };
  const color = normFill(fill);
  if (GREEN_FILLS.has(color)) return { type: 'Vacaciones' };
  if (BLUE_FILLS.has(color)) return { type: 'Baja' };
  if (/^\d{1,2}:\d{2}$/.test(parts[0] ?? '') && /^\d{1,2}:\d{2}$/.test(parts[1] ?? '')) {
    const pad = (value) => value.padStart(5, '0');
    return { type: 'Regular', start: pad(parts[0]), end: pad(parts[1]), marker: parts[2] ?? null };
  }
  if (parts.length === 0 && (color === '' || color === 'FFFFFE' || color === 'FFFFFF')) return null;
  return { type: 'UNKNOWN', text: parts.join(' '), fill: color };
}

export function canonicalType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const map = {
    regular: 'Regular', extras: 'Extras', ausencia: 'Ausencia', libre: 'Libre',
    vacaciones: 'Vacaciones', baja: 'Baja', jt: 'JT',
  };
  return map[normalized] ?? String(value ?? '').trim();
}

const clock = (value) => (value ? String(value).slice(0, 5) : null);

function span(row) {
  const start = toMinutes(row.start);
  const end = toMinutes(row.end);
  if (start === null || end === null) return null;
  return { start, end: end <= start ? end + 1440 : end };
}

const sameRecord = (a, b) => a.type === b.type
  && (FULL_DAY.has(a.type) || (clock(a.start) === clock(b.start) && clock(a.end) === clock(b.end)));

const isChange = (row) => row.legacyOrigin === 'MAN' || row.origin === 'MAN';

function overlapsSpan(a, b) {
  return a.start < b.end && b.start < a.end;
}

function summarize(rows) {
  return rows.map((row) => `${row.type}${row.start ? ` ${clock(row.start)}-${clock(row.end)}` : ''}`).join(' + ');
}

/**
 * @param {{date:string, company: null | {type:string,start?:string,end?:string},
 *          rows: Array<{id:string,type:string,start?:string|null,end?:string|null,
 *                       legacyOrigin?:'PDF'|'MAN'|null, origin?:string}>}} input
 */
export function reconcileDay({ date, company, rows: inputRows }) {
  const rows = inputRows.map((row) => ({ ...row, type: canonicalType(row.type) }));
  const issues = [];
  const dispositions = new Map(rows.map((row) => [row.id, { id: row.id, state: 'EFFECTIVE' }]));
  const insertRows = [];
  let severity = 0; // 0 HIGH, 1 MEDIUM, 2 LOW
  const raise = (level, code, detail) => {
    severity = Math.max(severity, level);
    issues.push({ code, level: level === 2 ? 'LOW' : 'MEDIUM', ...(detail ? { detail } : {}) });
  };

  const duty = rows.filter((row) => row.type === 'JT');
  const body = rows.filter((row) => row.type !== 'JT');
  const result = {
    date,
    company: company && company.type !== 'UNKNOWN' ? company : null,
    sourceRows: rows,
    confidence: CONFIDENCE.HIGH,
    effectiveCandidate: [],
    dispositions: [],
    insertRows,
    issues,
    recommendedAction: 'NONE',
    category: null,
    dutyRows: duty.length,
  };

  if (company?.type === 'UNKNOWN') {
    raise(2, 'UNKNOWN_COMPANY_CELL', company.text || company.fill);
    return finish(result, body, duty, dispositions, [], severity, true);
  }

  // ---- no company information for the day -------------------------------
  if (!company) {
    result.category = 'NO_COMPANY_DATA';
    if (body.length === 0 && duty.length > 0) {
      raise(2, 'JT_ONLY_DAY', 'JT is the only record; its role/hours cannot be separated');
      return finish(result, body, duty, dispositions, [], severity, true);
    }
    const check = resolveDay(date, body.map(toCalendarRow));
    const blocking = check.issues.filter((issue) => issue.blocking);
    if (blocking.length) raise(2, blocking[0].code, 'rows already inconsistent');
    const covered = mergeSpan(body.filter((row) => !FULL_DAY.has(row.type)));
    for (const jt of duty) {
      dispositions.set(jt.id, { id: jt.id, state: 'METADATA_ONLY', dutyRole: DUTY_ROLE_SHIFT_LEAD });
      const jtSpan = span(jt);
      if (!covered || !jtSpan || jtSpan.start < covered.start || jtSpan.end > covered.end) {
        raise(1, 'JT_INTERVAL_OUTSIDE_EFFECTIVE_SPAN', summarize([jt]));
      }
    }
    return finish(result, body, duty, dispositions, body, severity, severity > 0, body.filter((row) => row.type === 'Regular'));
  }

  const matched = body.filter((row) => sameRecord(row, company));
  const others = body.filter((row) => !matched.includes(row));
  const matchedPlan = matched.filter((row) => !isChange(row));
  const matchedChange = matched.filter(isChange);
  const hasPlanRows = body.some((row) => !isChange(row));
  const companyIsFullDay = FULL_DAY.has(company.type);
  const keep = []; // rows that stay EFFECTIVE
  const companySpan = companyIsFullDay ? null : span(company);

  result.category = matched.length === 0
    ? 'NO_EXACT_MATCH'
    : (body.length === 1 && duty.length === 0 ? 'EXACT_MATCH' : 'MATCH_PLUS_OTHER_ROWS');

  if (matched.length > 0) {
    if (matchedPlan.length > 0) {
      keep.push(...matchedPlan);
      for (const change of matchedChange) dispositions.set(change.id, { id: change.id, state: 'ABSORBED' });
    } else {
      // The company's current plan equals a personal change: record the
      // company revision and keep the change for audit as ABSORBED.
      insertRows.push(companyRow(date, company, matchedChange, hasPlanRows ? 2 : 1));
      for (const change of matchedChange) dispositions.set(change.id, { id: change.id, state: 'ABSORBED' });
    }
  }

  const evidence = matchedChange.length > 0;
  for (const row of others) {
    const plan = !isChange(row);
    if (plan) {
      // Older company plan row that differs from the current plan: the later
      // revision supersedes it.
      dispositions.set(row.id, { id: row.id, state: 'SUPERSEDED' });
      if (!evidence) {
        if (company.type === 'Baja' || company.type === 'Vacaciones') {
          if (row.type !== 'Libre' && !FULL_DAY.has(row.type)) raise(2, 'COMPANY_NON_WORK_VS_HISTORICAL_WORK', `${company.type} vs ${summarize([row])}`);
          else raise(1, 'COMPANY_REVISED_PLAN_WITHOUT_EVIDENCE', summarize([row]));
        } else {
          raise(1, 'COMPANY_REVISED_PLAN_WITHOUT_EVIDENCE', `${summarize([row])} -> ${summarize([company])}`);
        }
      }
      continue;
    }
    // Personal change that is not the company's current state.
    if (row.type === 'Extras' && !companyIsFullDay && companySpan) {
      const extra = span(row);
      if (!extra || overlapsSpan(extra, companySpan)) {
        raise(2, 'EXTRAS_OVERLAP_COMPANY_SHIFT', summarize([row]));
      } else {
        keep.push(row);
        const contiguous = extra.start === companySpan.end || extra.end === companySpan.start;
        if (!contiguous) raise(1, 'EXTRAS_NOT_CONTIGUOUS', summarize([row]));
      }
      continue;
    }
    raise(2, 'COMPANY_UPDATE_CONFLICTS_WITH_EFFECTIVE_OVERRIDE', `${summarize([row])} vs company ${summarize([company])}`);
  }

  if (matched.length === 0) {
    if (body.length === 0) {
      // The company calendar is the only source for the day: first revision.
      insertRows.push(companyRow(date, company, [], 1));
    } else {
      // The company revised the day and nothing in the history confirms it.
      if (severity === 0) raise(1, 'COMPANY_CURRENT_NOT_IN_HISTORY', summarize([company]));
      insertRows.push(companyRow(date, company, [], hasPlanRows ? 2 : 1));
    }
  }

  // JT: role metadata. Its interval must be explained by the effective span.
  if (duty.length > 0) {
    const effectiveWork = [...keep, ...insertRows.filter(() => matched.length > 0 && matchedPlan.length === 0)]
      .filter((row) => !FULL_DAY.has(row.type));
    const covered = mergeSpan(effectiveWork.length ? effectiveWork : (companySpan ? [company] : []));
    for (const jt of duty) {
      dispositions.set(jt.id, { id: jt.id, state: 'METADATA_ONLY', dutyRole: DUTY_ROLE_SHIFT_LEAD });
      const jtSpan = span(jt);
      if (!covered) {
        raise(1, 'JT_ON_NON_WORK_DAY', summarize([jt]));
      } else if (!jtSpan || jtSpan.start < covered.start || jtSpan.end > covered.end) {
        raise(1, 'JT_INTERVAL_OUTSIDE_EFFECTIVE_SPAN', `${summarize([jt])} vs ${clock(fromMin(covered.start))}-${clock(fromMin(covered.end))}`);
      }
    }
  }

  const effectiveCandidate = [...keep, ...insertRows];
  return finish(result, body, duty, dispositions, effectiveCandidate, severity, severity > 0, matchedPlan);
}

function fromMin(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function mergeSpan(rows) {
  const spans = rows.map(span).filter(Boolean);
  if (spans.length === 0) return null;
  return { start: Math.min(...spans.map((s) => s.start)), end: Math.max(...spans.map((s) => s.end)) };
}

function toCalendarRow(row) {
  return { date: '', shiftType: row.type, startTime: row.start ?? null, endTime: row.end ?? null };
}

function companyRow(date, company, supportingChanges, planRevision) {
  return {
    id: null,
    date,
    type: company.type,
    start: company.start ?? null,
    end: company.end ?? null,
    layer: 'COMPANY_PLAN',
    provenance: 'COMPANY_IMPORT',
    planRevision,
    supportedBy: supportingChanges.map((change) => change.id),
  };
}

/** Finalizes dispositions according to the confidence policy. */
function finish(result, body, duty, dispositions, effective, severity, needsReview, matchedPlan = []) {
  result.confidence = severity === 2 ? CONFIDENCE.LOW : severity === 1 ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH;
  if (result.confidence === CONFIDENCE.HIGH) {
    const tagged = matchedPlan[0] ?? effective.find((row) => row.type === 'Regular' && row.id);
    if (duty.length && !tagged) {
      const insertedRegular = result.insertRows.find((row) => row.type === 'Regular');
      if (insertedRegular) insertedRegular.dutyRole = DUTY_ROLE_SHIFT_LEAD;
    }
    for (const [id, disposition] of dispositions) {
      const row = [...body, ...duty].find((candidate) => candidate.id === id);
      result.dispositions.push({
        ...disposition,
        legacyOrigin: row?.legacyOrigin ?? null,
        dutyRole: disposition.dutyRole ?? (tagged && tagged.id === id && duty.length ? DUTY_ROLE_SHIFT_LEAD : null),
      });
    }
    result.effectiveCandidate = effective.map((row) => ({ type: row.type, start: clock(row.start), end: clock(row.end) }));
    result.recommendedAction = 'APPLY';
    return result;
  }
  // MEDIUM / LOW: nothing is decided. Rows are parked as REQUIRES_REVIEW so
  // their hours are not counted until an administrator resolves the day.
  for (const row of body) {
    result.dispositions.push({ id: row.id, state: 'REQUIRES_REVIEW', legacyOrigin: row.legacyOrigin ?? null });
  }
  result.insertRows = result.insertRows.map((row) => ({ ...row, state: 'REQUIRES_REVIEW' }));
  result.effectiveCandidate = result.confidence === CONFIDENCE.MEDIUM
    ? effective.map((row) => ({ type: row.type, start: clock(row.start), end: clock(row.end) }))
    : [];
  result.recommendedAction = needsReview ? 'MARK_REQUIRES_REVIEW' : 'NONE';
  return result;
}

/** Minutes of one day: sum of every counting row vs union of intervals. */
export function naiveAndUnionMinutes(rows) {
  const spans = rows
    .filter((row) => !FULL_DAY.has(canonicalType(row.type)) && canonicalType(row.type) !== 'Ausencia')
    .map(span)
    .filter(Boolean);
  const naive = spans.reduce((total, s) => total + (s.end - s.start), 0);
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let union = 0;
  let cursor = null;
  for (const s of sorted) {
    if (!cursor || s.start > cursor.end) {
      if (cursor) union += cursor.end - cursor.start;
      cursor = { ...s };
    } else {
      cursor.end = Math.max(cursor.end, s.end);
    }
  }
  if (cursor) union += cursor.end - cursor.start;
  return { naive, union };
}

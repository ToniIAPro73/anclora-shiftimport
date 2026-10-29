const PERIOD_TYPES = new Set(['ANNUAL', 'WEEKLY', 'MONTHLY', 'CUSTOM']);
const TARGET_KINDS = new Set(['CONTRACTUAL', 'OPERATIONAL']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE_RE.test(String(value ?? ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateOrdinal(value) {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function sameSeries(a, b) {
  return a.organizationId === b.organizationId
    && a.employeeId === b.employeeId
    && a.targetKind === b.targetKind
    && a.periodStart === b.periodStart
    && a.periodEnd === b.periodEnd;
}

export function validateWorktimeTarget(input) {
  const targetKind = String(input?.targetKind ?? 'CONTRACTUAL').toUpperCase();
  const periodType = String(input?.periodType ?? 'ANNUAL').toUpperCase();
  const periodStart = String(input?.periodStart ?? '');
  const periodEnd = String(input?.periodEnd ?? '');
  const effectiveFrom = String(input?.effectiveFrom ?? '');
  const minimumMinutes = input?.minimumMinutes === '' || input?.minimumMinutes === null || input?.minimumMinutes === undefined
    ? Number.NaN : Number(input.minimumMinutes);
  const targetMinutes = input?.targetMinutes === null || input?.targetMinutes === undefined || input?.targetMinutes === ''
    ? null : Number(input.targetMinutes);
  const maximumMinutes = input?.maximumMinutes === '' || input?.maximumMinutes === null || input?.maximumMinutes === undefined
    ? Number.NaN : Number(input.maximumMinutes);

  if (!TARGET_KINDS.has(targetKind)) throw new TypeError('targetKind must be CONTRACTUAL or OPERATIONAL');
  if (!PERIOD_TYPES.has(periodType)) throw new TypeError('periodType must be ANNUAL, WEEKLY, MONTHLY or CUSTOM');
  if (!validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) throw new TypeError('period dates are invalid');
  if (!validDate(effectiveFrom)) throw new TypeError('effectiveFrom is invalid');
  if (!Number.isInteger(minimumMinutes) || minimumMinutes < 0) throw new TypeError('minimumMinutes must be a non-negative integer');
  if (!Number.isInteger(maximumMinutes) || maximumMinutes < minimumMinutes || maximumMinutes > 527040) throw new TypeError('maximumMinutes must be an integer no lower than minimumMinutes and within a calendar year');
  if (targetMinutes !== null && (!Number.isInteger(targetMinutes) || targetMinutes < minimumMinutes || targetMinutes > maximumMinutes)) {
    throw new TypeError('targetMinutes must fall between minimumMinutes and maximumMinutes');
  }
  if (periodType === 'ANNUAL' && (periodStart !== `${periodStart.slice(0, 4)}-01-01` || periodEnd !== `${periodStart.slice(0, 4)}-12-31`)) {
    throw new TypeError('annual target period must cover the calendar year');
  }
  if (periodType === 'MONTHLY' && (periodStart.slice(0, 7) !== periodEnd.slice(0, 7)
    || periodStart.slice(8) !== '01'
    || periodEnd !== `${periodStart.slice(0, 7)}-${String(new Date(Date.UTC(Number(periodStart.slice(0, 4)), Number(periodStart.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`)) {
    throw new TypeError('monthly target period must cover a whole calendar month');
  }
  if (periodType === 'WEEKLY' && dateOrdinal(periodEnd) - dateOrdinal(periodStart) !== 6 * 86400000) {
    throw new TypeError('weekly target period must cover seven calendar days');
  }
  const includedWorkBuckets = input?.includedWorkBuckets ?? input?.includedShiftTypes ?? ['Regular'];
  if (!Array.isArray(includedWorkBuckets) || includedWorkBuckets.length === 0
    || includedWorkBuckets.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new TypeError('includedWorkBuckets must contain at least one work category');
  }
  return {
    ...input,
    targetKind,
    periodType,
    periodStart,
    periodEnd,
    effectiveFrom,
    minimumMinutes,
    targetMinutes,
    maximumMinutes,
    includedWorkBuckets: [...new Set(includedWorkBuckets.map((value) => value.trim()))],
  };
}

/** Resolve the latest eligible immutable revision for each target series. */
export function resolveWorktimeTargets(targets, { asOf, employeeId = null } = {}) {
  if (!validDate(asOf)) throw new TypeError('asOf must be a valid calendar date');
  const eligible = (targets ?? []).filter((target) => target.effectiveFrom <= asOf
    && (!employeeId || target.employeeId === employeeId));
  const series = new Map();
  for (const target of eligible) {
    const key = [target.organizationId, target.employeeId, target.targetKind, target.periodStart, target.periodEnd].join('|');
    const current = series.get(key);
    if (!current || target.effectiveFrom > current.effectiveFrom
      || (target.effectiveFrom === current.effectiveFrom && Number(target.revision) > Number(current.revision))
      || (target.effectiveFrom === current.effectiveFrom && Number(target.revision) === Number(current.revision)
        && String(target.createdAt ?? '') > String(current.createdAt ?? ''))) series.set(key, target);
  }
  const active = [...series.values()].filter((target) => target.periodStart <= asOf && target.periodEnd >= asOf);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (active[i].targetKind === active[j].targetKind && active[i].employeeId === active[j].employeeId
        && active[i].organizationId === active[j].organizationId && !sameSeries(active[i], active[j])) {
        throw new TypeError('Overlapping worktime target series are ambiguous');
      }
    }
  }
  return active;
}

export function evaluateWorktimeTarget({ target, realizedMinutes = 0, plannedMinutes = 0, asOf, calendarRows = null } = {}) {
  const realized = Number.isInteger(realizedMinutes) ? realizedMinutes : 0;
  const planned = Number.isInteger(plannedMinutes) ? plannedMinutes : 0;
  const projected = realized + planned;
  if (!target) return { status: 'UNCONFIGURED', realizedMinutes: realized, plannedMinutes: planned, projectedMinutes: projected };
  const minimum = Number(target.minimumMinutes);
  const maximum = Number(target.maximumMinutes);
  const targetMinutes = target.targetMinutes ?? null;
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) return { status: 'UNCONFIGURED' };
  const periodEnd = target.periodEnd;
  const remainingToMinimumFromRealized = Math.max(0, minimum - realized);
  const projectedGapToMinimum = Math.max(0, minimum - projected);
  const projectedExcessOverMaximum = Math.max(0, projected - maximum);
  const daysRemaining = validDate(asOf) && validDate(periodEnd) && periodEnd >= asOf
    ? Math.floor((dateOrdinal(periodEnd) - dateOrdinal(asOf)) / 86400000) + 1 : 0;
  return {
    status: calendarRows === 0 ? 'NO_DATA' : projected < minimum ? 'BELOW_MINIMUM' : projected > maximum ? 'ABOVE_MAXIMUM' : 'WITHIN_RANGE',
    realizedMinutes: realized,
    plannedMinutes: planned,
    projectedMinutes: projected,
    minimumMinutes: minimum,
    targetMinutes,
    maximumMinutes: maximum,
    marginMinutes: maximum - minimum,
    remainingToMinimumFromRealized,
    projectedGapToMinimum,
    distanceToTarget: Number.isInteger(targetMinutes) ? projected - targetMinutes : null,
    projectedExcessOverMaximum,
    additionalAveragePerRemainingWeek: projectedGapToMinimum > 0 && daysRemaining > 0
      ? Math.ceil(projectedGapToMinimum * 7 / daysRemaining) : null,
  };
}

export const WORKTIME_TARGET_PERIOD_TYPES = Object.freeze([...PERIOD_TYPES]);
export const WORKTIME_TARGET_KINDS = Object.freeze([...TARGET_KINDS]);

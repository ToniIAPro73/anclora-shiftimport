/**
 * Time-off domain (spec §4.2, §4.4.1, OD-08). Pure functions: no database, no clock (callers pass `today`).
 *
 * `request_type` is a closed catalogue in the database (`time_off_requests.request_type`), but which types the API accepts is
 * this allow-list. Enabling a type means adding it here, with its `shift_type` mapping, its contract and its i18n keys: no migration.
 * `SICK_LEAVE` keeps its medical meaning (INV-14) and is NOT enabled; `Baja` is never produced by a time-off request.
 */
import { HttpError } from './auth.js';
import { getOperationalDate, shiftOperationalDate } from './operational-date.js';

export const TIME_OFF_TYPES = Object.freeze(['VACATION', 'SICK_LEAVE', 'PERMISSION', 'OTHER']);
export const ENABLED_TIME_OFF_TYPES = Object.freeze(['VACATION']);
/** request_type → shifts.shift_type written on approval (F3). A type without an entry can be neither created nor materialised. */
export const TIME_OFF_SHIFT_TYPE = Object.freeze({ VACATION: 'Vacaciones' });
export const TIME_OFF_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export const MAX_TIME_OFF_DAYS = 366;
export const MAX_TIME_OFF_COMMENT_LENGTH = 2000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function timeOffError(status, message, code) {
  const error = new HttpError(status, message);
  error.code = code;
  return error;
}

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Inclusive number of days between two ISO dates (start ≤ end). */
export function countDaysInclusive(startDate, endDate) {
  const ms = new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function isTimeOffTypeEnabled(requestType) {
  return ENABLED_TIME_OFF_TYPES.includes(requestType) && Object.hasOwn(TIME_OFF_SHIFT_TYPE, requestType);
}

/**
 * Validates and normalises the body of `POST /api/me/time-off-requests`.
 * 400 INVALID_INPUT · 422 TIME_OFF_TYPE_NOT_ENABLED · 422 TIME_OFF_PAST_DATE · 422 TIME_OFF_RANGE_TOO_LONG.
 * The employee id is never part of the input (INV-01, INV-13): the caller supplies it from the session.
 */
export function validateTimeOffInput(input, today = getOperationalDate()) {
  const body = input && typeof input === 'object' ? input : {};
  const requestType = String(body.requestType ?? '').trim().toUpperCase();
  if (!TIME_OFF_TYPES.includes(requestType)) {
    throw timeOffError(400, 'Invalid time-off request type', 'INVALID_INPUT');
  }
  const startDate = String(body.startDate ?? '').trim();
  const endDate = String(body.endDate ?? '').trim();
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate) {
    throw timeOffError(400, 'Invalid time-off date range', 'INVALID_INPUT');
  }
  const rawComment = body.comment ?? '';
  if (typeof rawComment !== 'string') {
    throw timeOffError(400, 'Invalid time-off comment', 'INVALID_INPUT');
  }
  const comment = rawComment.trim();
  if (comment.length > MAX_TIME_OFF_COMMENT_LENGTH) {
    throw timeOffError(400, `Comment cannot exceed ${MAX_TIME_OFF_COMMENT_LENGTH} characters`, 'INVALID_INPUT');
  }
  if (!isTimeOffTypeEnabled(requestType)) {
    throw timeOffError(422, 'This time-off type is not enabled', 'TIME_OFF_TYPE_NOT_ENABLED');
  }
  if (startDate < today) {
    throw timeOffError(422, 'Time-off cannot start in the past', 'TIME_OFF_PAST_DATE');
  }
  const requestedDays = countDaysInclusive(startDate, endDate);
  if (requestedDays > MAX_TIME_OFF_DAYS) {
    throw timeOffError(422, `A time-off request cannot exceed ${MAX_TIME_OFF_DAYS} days`, 'TIME_OFF_RANGE_TOO_LONG');
  }
  return { requestType, startDate, endDate, requestedDays, comment };
}

/**
 * OD-08 — effect of an approval taken on `today`: only `[max(startDate, today), endDate]` is materialised. Past days are never
 * back-dated and never mutate history; they are reported, not silently dropped.
 *
 * Throws 422 TIME_OFF_START_PASSED_ALL (nothing is approved, no state change) when the whole range is already in the past.
 * Invariant: materializedDays + skippedPastDays === requestedDays.
 */
export function resolveApplicationRange({ startDate, endDate }, today = getOperationalDate()) {
  const requestedDays = countDaysInclusive(startDate, endDate);
  if (endDate < today) {
    throw timeOffError(422, 'The whole requested range is already in the past', 'TIME_OFF_START_PASSED_ALL');
  }
  const effectiveStartDate = startDate < today ? today : startDate;
  const materializedDays = countDaysInclusive(effectiveStartDate, endDate);
  return {
    requestedDays,
    effectiveStartDate,
    materializedDays,
    skippedPastDays: requestedDays - materializedDays,
    alreadyStarted: startDate < today,
  };
}

/** Same computation without throwing, for read models (`alreadyStarted`, `materializableDays`, `skippedPastDays` on pending cards). */
export function previewApplicationRange(range, today = getOperationalDate()) {
  try {
    const applied = resolveApplicationRange(range, today);
    return {
      alreadyStarted: applied.alreadyStarted,
      effectiveStartDate: applied.effectiveStartDate,
      materializableDays: applied.materializedDays,
      skippedPastDays: applied.skippedPastDays,
    };
  } catch (error) {
    if (error?.code === 'TIME_OFF_START_PASSED_ALL') {
      return { alreadyStarted: true, effectiveStartDate: null, materializableDays: 0, skippedPastDays: countDaysInclusive(range.startDate, range.endDate) };
    }
    throw error;
  }
}

/** Year in which a request counts: the year of `start_date` (spec §4.2). */
export function requestYear(startDate) {
  return Number(String(startDate).slice(0, 4));
}

export function parseYearFilter(rawYear, today = getOperationalDate()) {
  if (rawYear === undefined || rawYear === null || String(rawYear).trim() === '') return Number(today.slice(0, 4));
  const year = Number(String(rawYear).trim());
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw timeOffError(400, 'Invalid year', 'INVALID_INPUT');
  }
  return year;
}

export function parseStatusFilter(rawStatus) {
  const status = String(rawStatus ?? '').trim().toUpperCase();
  if (!status) return null;
  if (!TIME_OFF_STATUSES.includes(status)) {
    throw timeOffError(400, 'Invalid time-off status', 'INVALID_INPUT');
  }
  return status;
}

/** Derived timeline (not stored): what the employee sees as the life of the request. */
export function buildHistory(row) {
  const events = [{ type: 'CREATED', at: row.created_at }];
  if (row.status === 'APPROVED') events.push({ type: 'APPROVED', at: row.resolved_at, byName: row.resolved_by_name ?? null });
  if (row.status === 'REJECTED') events.push({ type: 'REJECTED', at: row.resolved_at, byName: row.resolved_by_name ?? null, reason: row.rejection_reason ?? null });
  if (row.status === 'CANCELLED') events.push({ type: 'CANCELLED', at: row.cancelled_at ?? row.resolved_at });
  return events;
}

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));
/** SQL hands dates over as 'YYYY-MM-DD' (TO_CHAR): a driver-built Date would shift the day with the server timezone. */
const dateOnly = (value) => (value ? String(value).slice(0, 10) : null);

/** API shape of a time-off request (`TimeOffRequest`, spec §4.2). Applied-range fields only exist once APPROVED. */
export function mapTimeOffRequestRow(row) {
  const request = {
    id: row.id,
    requestType: row.request_type,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    requestedDays: Number(row.requested_days),
    comment: row.comment ?? '',
    status: row.status,
    createdAt: iso(row.created_at),
    resolvedAt: iso(row.resolved_at),
    resolvedByName: row.resolved_by_name ?? null,
    rejectionReason: row.rejection_reason ?? null,
    history: buildHistory({ ...row, created_at: iso(row.created_at), resolved_at: iso(row.resolved_at), cancelled_at: iso(row.cancelled_at) }),
  };
  if (row.status === 'APPROVED') {
    request.appliedStartDate = dateOnly(row.applied_start_date);
    request.appliedDays = row.applied_days === null || row.applied_days === undefined ? null : Number(row.applied_days);
    request.skippedPastDays = request.appliedDays === null ? null : request.requestedDays - request.appliedDays;
  }
  return request;
}

export { shiftOperationalDate };

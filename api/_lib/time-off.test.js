import { describe, expect, it } from 'vitest';
import {
  buildHistory,
  countDaysInclusive,
  ENABLED_TIME_OFF_TYPES,
  mapTimeOffRequestRow,
  parseStatusFilter,
  parseYearFilter,
  previewApplicationRange,
  resolveApplicationRange,
  TIME_OFF_SHIFT_TYPE,
  validateTimeOffInput,
} from './time-off.js';

const TODAY = '2026-11-02';
const input = (patch = {}) => ({ requestType: 'VACATION', startDate: '2026-11-10', endDate: '2026-11-14', comment: '', ...patch });
const failure = (fn) => { try { fn(); } catch (error) { return error; } throw new Error('expected an error'); };

describe('time-off domain — type allow-list (OD-03, INV-14)', () => {
  it('enables VACATION only and maps it to "Vacaciones", never to "Baja"', () => {
    expect(ENABLED_TIME_OFF_TYPES).toEqual(['VACATION']);
    expect(TIME_OFF_SHIFT_TYPE).toEqual({ VACATION: 'Vacaciones' });
    expect(Object.values(TIME_OFF_SHIFT_TYPE)).not.toContain('Baja');
  });

  it.each(['SICK_LEAVE', 'PERMISSION', 'OTHER'])('%s is in the catalogue but not enabled: 422 TIME_OFF_TYPE_NOT_ENABLED', (type) => {
    const error = failure(() => validateTimeOffInput(input({ requestType: type }), TODAY));
    expect(error).toMatchObject({ status: 422, code: 'TIME_OFF_TYPE_NOT_ENABLED' });
  });

  it('an unknown type is a 400 INVALID_INPUT (not a disabled one)', () => {
    expect(failure(() => validateTimeOffInput(input({ requestType: 'SABBATICAL' }), TODAY))).toMatchObject({ status: 400, code: 'INVALID_INPUT' });
  });
});

describe('time-off domain — input validation (§4.2)', () => {
  it('normalises a valid request and derives requestedDays (inclusive)', () => {
    expect(validateTimeOffInput(input({ requestType: 'vacation', comment: '  playa  ' }), TODAY)).toEqual({
      requestType: 'VACATION', startDate: '2026-11-10', endDate: '2026-11-14', requestedDays: 5, comment: 'playa',
    });
  });

  it('accepts a request that starts today and a one-day request', () => {
    expect(validateTimeOffInput(input({ startDate: TODAY, endDate: TODAY }), TODAY).requestedDays).toBe(1);
  });

  it.each([
    ['impossible calendar date', { startDate: '2026-02-30', endDate: '2026-03-02' }],
    ['not an ISO date', { startDate: '10/11/2026', endDate: '2026-11-14' }],
    ['end before start', { startDate: '2026-11-14', endDate: '2026-11-10' }],
    ['missing end', { endDate: undefined }],
    ['comment not a string', { comment: 42 }],
    ['comment over 2000 chars', { comment: 'x'.repeat(2001) }],
  ])('400 INVALID_INPUT: %s', (_name, patch) => {
    expect(failure(() => validateTimeOffInput(input(patch), TODAY))).toMatchObject({ status: 400, code: 'INVALID_INPUT' });
  });

  it('422 TIME_OFF_PAST_DATE when it starts before today (past absences use the historical "add shift")', () => {
    expect(failure(() => validateTimeOffInput(input({ startDate: '2026-11-01' }), TODAY))).toMatchObject({ status: 422, code: 'TIME_OFF_PAST_DATE' });
  });

  it('422 TIME_OFF_RANGE_TOO_LONG above 366 days, accepts exactly 366', () => {
    expect(validateTimeOffInput(input({ startDate: '2026-11-02', endDate: '2027-11-02' }), TODAY).requestedDays).toBe(366);
    expect(failure(() => validateTimeOffInput(input({ startDate: '2026-11-02', endDate: '2027-11-03' }), TODAY))).toMatchObject({ status: 422, code: 'TIME_OFF_RANGE_TOO_LONG' });
  });

  it('never reads an employee or organisation id from the body (INV-01, INV-13)', () => {
    const normalised = validateTimeOffInput({ ...input(), employeeId: 'victim', organizationId: 'other-org' }, TODAY);
    expect(Object.keys(normalised).sort()).toEqual(['comment', 'endDate', 'requestType', 'requestedDays', 'startDate']);
  });

  it('rejects a non-object body as invalid input', () => {
    expect(failure(() => validateTimeOffInput(null, TODAY))).toMatchObject({ status: 400 });
  });
});

describe('OD-08 — partial effect on approval (never back-dated, never silent)', () => {
  it('a range wholly in the future materialises every day', () => {
    expect(resolveApplicationRange({ startDate: '2026-11-10', endDate: '2026-11-14' }, TODAY)).toEqual({
      requestedDays: 5, effectiveStartDate: '2026-11-10', materializedDays: 5, skippedPastDays: 0, alreadyStarted: false,
    });
  });

  it('a range that started materialises today → endDate and reports the skipped past days', () => {
    const applied = resolveApplicationRange({ startDate: '2026-10-30', endDate: '2026-11-05' }, TODAY);
    expect(applied).toEqual({ requestedDays: 7, effectiveStartDate: TODAY, materializedDays: 4, skippedPastDays: 3, alreadyStarted: true });
    expect(applied.materializedDays + applied.skippedPastDays).toBe(applied.requestedDays);
  });

  it('a range starting today is not "already started"', () => {
    expect(resolveApplicationRange({ startDate: TODAY, endDate: '2026-11-04' }, TODAY)).toMatchObject({ alreadyStarted: false, skippedPastDays: 0, materializedDays: 3 });
  });

  it('a range ending today still materialises that single day', () => {
    expect(resolveApplicationRange({ startDate: '2026-10-30', endDate: TODAY }, TODAY)).toMatchObject({ effectiveStartDate: TODAY, materializedDays: 1, skippedPastDays: 3 });
  });

  it('a range wholly in the past is 422 TIME_OFF_START_PASSED_ALL (nothing is approved)', () => {
    expect(failure(() => resolveApplicationRange({ startDate: '2026-10-20', endDate: '2026-11-01' }, TODAY))).toMatchObject({ status: 422, code: 'TIME_OFF_START_PASSED_ALL' });
  });

  it('the read-model preview never throws and reports all days skipped when everything is past', () => {
    expect(previewApplicationRange({ startDate: '2026-10-20', endDate: '2026-11-01' }, TODAY)).toEqual({
      alreadyStarted: true, effectiveStartDate: null, materializableDays: 0, skippedPastDays: 13,
    });
    expect(previewApplicationRange({ startDate: '2026-10-30', endDate: '2026-11-05' }, TODAY)).toMatchObject({ materializableDays: 4, skippedPastDays: 3 });
  });

  it('counts days across month and year boundaries', () => {
    expect(countDaysInclusive('2026-12-30', '2027-01-02')).toBe(4);
  });
});

describe('time-off domain — read model', () => {
  const row = (patch = {}) => ({
    id: 'r1', request_type: 'VACATION', start_date: '2026-11-10', end_date: '2026-11-14', requested_days: 5, comment: null,
    status: 'PENDING', created_at: '2026-11-02T10:00:00.000Z', resolved_at: null, rejection_reason: null,
    applied_start_date: null, applied_days: null, cancelled_at: null, ...patch,
  });

  it('hides the applied-range fields until APPROVED', () => {
    const pending = mapTimeOffRequestRow(row());
    expect(pending).not.toHaveProperty('appliedDays');
    expect(pending).not.toHaveProperty('skippedPastDays');
    expect(pending.comment).toBe('');
    expect(pending.history).toEqual([{ type: 'CREATED', at: '2026-11-02T10:00:00.000Z' }]);
  });

  it('exposes the really applied range and skippedPastDays = requestedDays − appliedDays once APPROVED', () => {
    const approved = mapTimeOffRequestRow(row({ status: 'APPROVED', resolved_at: '2026-11-12T08:00:00.000Z', resolved_by_name: 'Ana', applied_start_date: '2026-11-12', applied_days: 3 }));
    expect(approved).toMatchObject({ appliedStartDate: '2026-11-12', appliedDays: 3, skippedPastDays: 2, resolvedByName: 'Ana' });
    expect(approved.history.map((e) => e.type)).toEqual(['CREATED', 'APPROVED']);
  });

  it('carries the rejection reason in the timeline and the cancellation moment', () => {
    expect(buildHistory({ ...row({ status: 'REJECTED', rejection_reason: 'Hay cobertura mínima' }), resolved_at: '2026-11-03T00:00:00.000Z' })[1]).toMatchObject({ type: 'REJECTED', reason: 'Hay cobertura mínima' });
    expect(buildHistory({ ...row({ status: 'CANCELLED' }), cancelled_at: '2026-11-04T00:00:00.000Z' })[1]).toEqual({ type: 'CANCELLED', at: '2026-11-04T00:00:00.000Z' });
  });

  it('parses the year and status filters strictly', () => {
    expect(parseYearFilter(undefined, TODAY)).toBe(2026);
    expect(parseYearFilter('2027', TODAY)).toBe(2027);
    expect(failure(() => parseYearFilter('twenty', TODAY))).toMatchObject({ status: 400 });
    expect(parseStatusFilter('')).toBeNull();
    expect(parseStatusFilter('approved')).toBe('APPROVED');
    expect(failure(() => parseStatusFilter('DONE'))).toMatchObject({ status: 400 });
  });
});

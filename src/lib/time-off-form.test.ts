import { describe, expect, it } from 'vitest';
import { isTimeOffUiEnabled } from './flags';
import { countTimeOffDays, describeTimeOffError, validateTimeOffForm } from './time-off-form';

const TODAY = '2026-11-02';
const valid = { startDate: '2026-11-10', endDate: '2026-11-14', comment: '' };

describe('validateTimeOffForm (client mirror of the server rules)', () => {
  it('accepts a valid range, a one-day range and a range starting today', () => {
    expect(validateTimeOffForm(valid, TODAY)).toEqual([]);
    expect(validateTimeOffForm({ ...valid, startDate: TODAY, endDate: TODAY }, TODAY)).toEqual([]);
  });

  it('requires both dates', () => {
    expect(validateTimeOffForm({ ...valid, startDate: '' }, TODAY).map((e) => e.key)).toContain('timeOff.errorStartRequired');
    expect(validateTimeOffForm({ ...valid, endDate: '' }, TODAY).map((e) => e.key)).toContain('timeOff.errorEndRequired');
  });

  it('rejects end before start, a past start and more than 366 days', () => {
    expect(validateTimeOffForm({ ...valid, endDate: '2026-11-09' }, TODAY)).toEqual([{ field: 'endDate', key: 'timeOff.errorRange' }]);
    expect(validateTimeOffForm({ ...valid, startDate: '2026-11-01' }, TODAY)).toEqual([{ field: 'startDate', key: 'timeOff.errorPast' }]);
    expect(validateTimeOffForm({ ...valid, startDate: '2026-11-02', endDate: '2027-11-03' }, TODAY)).toEqual([{ field: 'endDate', key: 'timeOff.errorTooLong' }]);
    expect(validateTimeOffForm({ ...valid, startDate: '2026-11-02', endDate: '2027-11-02' }, TODAY)).toEqual([]);
  });

  it('rejects a comment over 2000 characters', () => {
    expect(validateTimeOffForm({ ...valid, comment: 'x'.repeat(2001) }, TODAY)).toEqual([{ field: 'comment', key: 'timeOff.errorCommentTooLong' }]);
  });

  it('counts calendar days inclusively', () => {
    expect(countTimeOffDays('2026-12-30', '2027-01-02')).toBe(4);
  });
});

describe('describeTimeOffError', () => {
  it('maps every structured server code to a reason and an action, and falls back safely', () => {
    for (const code of ['TIME_OFF_OVERLAP', 'TIME_OFF_TYPE_NOT_ENABLED', 'TIME_OFF_PAST_DATE', 'TIME_OFF_RANGE_TOO_LONG', 'EMPLOYEE_LINK_REQUIRED']) {
      const { whyKey, actionKey } = describeTimeOffError(code);
      expect(whyKey).not.toBe('timeOff.whyGeneric');
      expect(actionKey).not.toBe('timeOff.actionGeneric');
    }
    expect(describeTimeOffError(undefined)).toEqual({ whyKey: 'timeOff.whyGeneric', actionKey: 'timeOff.actionGeneric' });
    expect(describeTimeOffError('SOMETHING_NEW')).toEqual({ whyKey: 'timeOff.whyGeneric', actionKey: 'timeOff.actionGeneric' });
  });
});

describe('isTimeOffUiEnabled (VITE_TIME_OFF_ENABLED)', () => {
  it('is OFF unless the build variable is literally "true"', () => {
    expect(isTimeOffUiEnabled({})).toBe(false);
    for (const value of ['', 'false', '1', 'yes', undefined]) expect(isTimeOffUiEnabled({ VITE_TIME_OFF_ENABLED: value })).toBe(false);
    expect(isTimeOffUiEnabled({ VITE_TIME_OFF_ENABLED: 'true' })).toBe(true);
    expect(isTimeOffUiEnabled({ VITE_TIME_OFF_ENABLED: ' TRUE ' })).toBe(true);
  });
});

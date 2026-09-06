import { describe, expect, it } from 'vitest';
import { getCalendarAction } from './calendar-actions';

const base = { today: '2026-09-06', hasEditableSchedule: false, hasVacation: false };

describe('calendar temporal action policy', () => {
  it('allows historical add for management and employee self scope', () => {
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'OWNER' })).toBe('HISTORICAL_ADD');
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'EMPLOYEE' })).toBe('HISTORICAL_ADD');
  });

  it('requires an editable schedule for management today/future actions', () => {
    expect(getCalendarAction({ ...base, date: '2026-09-06', role: 'ADMIN' })).toBe('DISABLED');
    expect(getCalendarAction({ ...base, date: '2026-09-07', role: 'PLANNER', hasEditableSchedule: true })).toBe('PLAN');
  });

  it('blocks employee today/future and vacation cells', () => {
    expect(getCalendarAction({ ...base, date: '2026-09-06', role: 'EMPLOYEE', hasEditableSchedule: true })).toBe('DISABLED');
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'OWNER', hasVacation: true })).toBe('DISABLED');
  });
});

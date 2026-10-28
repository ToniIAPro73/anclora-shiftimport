import { describe, expect, it } from 'vitest';
import { getCalendarAction } from './calendar-actions';

const base = { today: '2026-09-06', hasEditableSchedule: false, hasVacation: false };

describe('calendar temporal action policy', () => {
  it('allows historical add for management and employee self scope', () => {
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'OWNER' })).toBe('HISTORICAL_ADD');
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'EMPLOYEE' })).toBe('HISTORICAL_ADD');
  });

  it('lets owners and admins add shifts directly on past, today, and future dates', () => {
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'ADMIN' })).toBe('HISTORICAL_ADD');
    expect(getCalendarAction({ ...base, date: '2026-09-06', role: 'ADMIN' })).toBe('DIRECT_ADD');
    expect(getCalendarAction({ ...base, date: '2026-09-07', role: 'OWNER' })).toBe('DIRECT_ADD');
  });

  it('keeps planner future actions tied to an editable schedule', () => {
    expect(getCalendarAction({ ...base, date: '2026-09-07', role: 'PLANNER', hasEditableSchedule: true })).toBe('PLAN');
    expect(getCalendarAction({ ...base, date: '2026-09-07', role: 'PLANNER' })).toBe('DISABLED');
  });

  it('blocks employee today/future and allows eligible management roles to open vacation dates', () => {
    expect(getCalendarAction({ ...base, date: '2026-09-06', role: 'EMPLOYEE', hasEditableSchedule: true })).toBe('DISABLED');
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'OWNER', hasVacation: true })).toBe('HISTORICAL_ADD');
    expect(getCalendarAction({ ...base, date: '2026-09-06', role: 'ADMIN', hasVacation: true })).toBe('DIRECT_ADD');
    expect(getCalendarAction({ ...base, date: '2026-09-05', role: 'PLANNER', hasVacation: true })).toBe('HISTORICAL_ADD');
    expect(getCalendarAction({ ...base, date: '2026-09-06', role: 'PLANNER', hasVacation: true, hasEditableSchedule: true })).toBe('DISABLED');
    expect(getCalendarAction({ ...base, date: '2026-09-06', role: 'EMPLOYEE', hasVacation: true })).toBe('DISABLED');
  });
});

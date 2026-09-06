import type { Role } from './session';
import { isHistoricalDate } from './operational-date';

export type CalendarAction = 'HISTORICAL_ADD' | 'PLAN' | 'DISABLED';

export interface CalendarActionInput {
  date: string;
  today: string;
  role?: Role | null;
  hasEditableSchedule: boolean;
  hasVacation: boolean;
}

/** Shared policy for monthly calendar date actions. */
export function getCalendarAction({ date, today, role, hasEditableSchedule, hasVacation }: CalendarActionInput): CalendarAction {
  if (hasVacation) return 'DISABLED';
  if (isHistoricalDate(date, today)) return role === 'EMPLOYEE' || !role || role === 'OWNER' || role === 'ADMIN' || role === 'PLANNER'
    ? 'HISTORICAL_ADD'
    : 'DISABLED';
  if (role === 'EMPLOYEE') return 'DISABLED';
  // Guests retain the existing route-to-auth behavior.
  return !role || hasEditableSchedule ? 'PLAN' : 'DISABLED';
}

export function calendarActionReason(action: CalendarAction, input: CalendarActionInput): 'vacation' | 'employee_future' | 'no_schedule' | 'historical' | 'plan' {
  if (input.hasVacation) return 'vacation';
  if (action === 'HISTORICAL_ADD') return 'historical';
  if (action === 'PLAN') return 'plan';
  if (input.role === 'EMPLOYEE') return 'employee_future';
  return 'no_schedule';
}

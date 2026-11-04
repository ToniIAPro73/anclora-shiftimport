import type { CalendarScheduleShift, ScheduleSnapshot, ShiftAssignment } from '../../lib/remote';

type Employee = ScheduleSnapshot['employees'][number];

/** How many rows of a day the agenda shows before "show more" (nothing is dropped: the rest is one tap away). */
export const PLANNER_AGENDA_VISIBLE_ROWS = 8;

export type PlannerRowStatus = 'draft' | 'stale' | 'published' | 'excluded';

export interface PlannerDayRow {
  key: string;
  employee: Employee;
  day: string;
  assignment?: ShiftAssignment;
  calendarShift?: CalendarScheduleShift;
}

/** Same reading as `plannerCounts`: a DRAFT holds plans (possibly stale); any other version reports what its publication materialised. */
export function plannerAssignmentStatus(versionStatus: string, assignment: Pick<ShiftAssignment, 'staleAgainstCalendar' | 'excludedFromPublication'>): PlannerRowStatus {
  if (versionStatus === 'DRAFT') return assignment.staleAgainstCalendar ? 'stale' : 'draft';
  return assignment.excludedFromPublication ? 'excluded' : 'published';
}

const sortKey = (assignment: ShiftAssignment): string => `${(assignment.startTime ?? '99:99').slice(0, 5)}|${assignment.id}`;

/** Deterministic rows of one day: employees in snapshot order, their assignments by start time, then their (read-only) calendar shifts. */
export function plannerDayRows(
  day: string,
  employees: Employee[],
  assignmentsByCell: Map<string, ShiftAssignment[]>,
  calendarShiftsByCell: Map<string, CalendarScheduleShift[]>,
): PlannerDayRow[] {
  const rows: PlannerDayRow[] = [];
  for (const employee of employees) {
    const cell = [...(assignmentsByCell.get(`${employee.id}:${day}`) ?? [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    for (const assignment of cell) rows.push({ key: `a:${assignment.id}`, employee, day, assignment });
    for (const calendarShift of calendarShiftsByCell.get(`${employee.id}:${day}`) ?? []) rows.push({ key: `c:${calendarShift.id}`, employee, day, calendarShift });
  }
  return rows;
}

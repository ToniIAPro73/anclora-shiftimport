import { describe, expect, it } from 'vitest';
import { getScheduleSnapshot } from '../_lib/scheduling.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const EMP = { one: 'emp-1', two: 'emp-2', three: 'emp-3' };
const employees = [
  { id: EMP.one, name: 'Uno', external_employee_id: '1', area_id: 'area-a' },
  { id: EMP.two, name: 'Dos', external_employee_id: '2', area_id: 'area-a' },
  { id: EMP.three, name: 'Tres', external_employee_id: '3', area_id: 'area-b' },
];
const assignments = employees.map((e, i) => ({
  id: `as-${i}`, schedule_version_id: VERSION, employee_id: e.id, date: '2026-11-25', start_time: '14:00', end_time: '22:00', location: 'Regular', created_at: '2026', updated_at: '2026',
}));
const calendarShifts = employees.map((e, i) => ({
  id: `cal-${i}`, employee_id: e.id, date: '2026-11-27', start_time: '21:00', end_time: '02:00',
  location: null, shift_type: 'Extras', counts_as_work: true,
}));

// Organization-wide schedule (area_id null) holding three employees: the read model must still respect the planner scope.
const sql = (strings) => {
  const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
  if (text.startsWith('SELECT sv.id AS version_id')) {
    return Promise.resolve([{ version_id: VERSION, schedule_id: SCHEDULE, version_number: 1, status: 'DRAFT', created_at: '2026', published_at: null, organization_id: ORG, area_id: null, period_start: '2026-11-23', period_end: '2026-11-29' }]);
  }
  if (text.startsWith('SELECT id, name, external_employee_id')) return Promise.resolve(employees);
  if (text.startsWith('SELECT sa.id')) return Promise.resolve(assignments);
  if (text.startsWith('SELECT sh.id')) return Promise.resolve(calendarShifts);
  if (text.includes('FROM areas')) return Promise.resolve([{ active_area_count: 0 }]);
  return Promise.resolve([]);
};

const snapshotFor = (ctx) => getScheduleSnapshot(sql, { organizationId: ORG, user: { id: 'u' }, ...ctx }, SCHEDULE, VERSION);

describe('schedule snapshot read model respects the planner scope', () => {
  it('S1: PLANNER EMPLOYEES=[emp-2] receives only that employee and its assignments', async () => {
    const snap = await snapshotFor({ role: 'PLANNER', plannerScopeType: 'EMPLOYEES', scopedEmployeeIds: [EMP.two], scopedAreaIds: [] });
    expect(snap.employees.map((e) => e.id)).toEqual([EMP.two]);
    expect(snap.assignments.map((a) => a.employeeId)).toEqual([EMP.two]);
    expect(snap.calendarShifts.map((shift) => shift.employeeId)).toEqual([EMP.two]);
  });
  it('S2: PLANNER AREAS=[area-a] receives only area-a employees and assignments', async () => {
    const snap = await snapshotFor({ role: 'PLANNER', plannerScopeType: 'AREAS', scopedAreaIds: ['area-a'], scopedAreaId: 'area-a' });
    expect(snap.employees.map((e) => e.id)).toEqual([EMP.one, EMP.two]);
    expect(snap.assignments.map((a) => a.employeeId)).toEqual([EMP.one, EMP.two]);
    expect(snap.calendarShifts.map((shift) => shift.employeeId)).toEqual([EMP.one, EMP.two]);
  });
  it('S3: ORGANIZATION planner and ADMIN keep the whole roster', async () => {
    const planner = await snapshotFor({ role: 'PLANNER', plannerScopeType: 'ORGANIZATION' });
    expect(planner.employees).toHaveLength(3);
    expect(planner.assignments).toHaveLength(3);
    expect(planner.calendarShifts).toHaveLength(3);
    expect((await snapshotFor({ role: 'ADMIN' })).employees).toHaveLength(3);
  });
});

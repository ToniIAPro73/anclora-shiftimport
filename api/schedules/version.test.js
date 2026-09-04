import { describe, expect, it } from 'vitest';
import { getScheduleSnapshot, listScheduleVersions } from '../_lib/scheduling.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const AREA = '22222222-2222-4222-8222-222222222222';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE = '66666666-6666-4666-8666-666666666666';

const planner = {
  user: { id: '77777777-7777-4777-8777-777777777777' },
  organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null,
};

function makeSql() {
  return (strings) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT sv.id AS version_id')) {
      return Promise.resolve([{
        version_id: VERSION,
        schedule_id: SCHEDULE,
        version_number: 1,
        status: 'DRAFT',
        created_at: '2026-09-01T00:00:00.000Z',
        published_at: null,
        organization_id: ORG,
        area_id: AREA,
        period_start: '2026-09-28',
        period_end: '2026-10-04',
      }]);
    }
    if (text.startsWith('SELECT id, name, external_employee_id')) {
      return Promise.resolve([{
        id: EMPLOYEE, name: 'Planner Employee', external_employee_id: 'E001', area_id: AREA,
      }]);
    }
    if (text.startsWith('SELECT sa.id')) {
      return Promise.resolve([{
        id: ASSIGNMENT,
        schedule_version_id: VERSION,
        employee_id: EMPLOYEE,
        date: '2026-09-29',
        start_time: '09:00',
        end_time: '17:00',
        location: 'Front desk',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      }]);
    }
    return Promise.resolve([]);
  };
}

describe('Scheduling snapshot read model', () => {
  it('returns the version, active roster, and assignments in one scoped snapshot', async () => {
    const snapshot = await getScheduleSnapshot(makeSql(), planner, SCHEDULE, VERSION);

    expect(snapshot.version).toMatchObject({
      id: VERSION,
      scheduleId: SCHEDULE,
      areaId: AREA,
      periodStart: '2026-09-28',
      periodEnd: '2026-10-04',
      status: 'DRAFT',
    });
    expect(snapshot.employees).toEqual([{
      id: EMPLOYEE, name: 'Planner Employee', externalEmployeeId: 'E001', areaId: AREA,
    }]);
    expect(snapshot.assignments[0]).toMatchObject({
      id: ASSIGNMENT,
      employeeId: EMPLOYEE,
      date: '2026-09-29',
      startTime: '09:00',
      endTime: '17:00',
      location: 'Front desk',
    });
  });

  it('lists schedule versions for planner draft discovery', async () => {
    const sql = (strings) => {
      const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT s.id AS schedule_id')) {
        return Promise.resolve([{
          schedule_id: SCHEDULE,
          area_id: AREA,
          period_start: '2026-09-28',
          period_end: '2026-10-04',
          version_id: VERSION,
          version_number: 1,
          status: 'DRAFT',
          created_at: '2026-09-01T00:00:00.000Z',
          published_at: null,
        }]);
      }
      return Promise.resolve([]);
    };

    await expect(listScheduleVersions(sql, planner, { areaId: AREA })).resolves.toEqual([expect.objectContaining({
      id: VERSION, scheduleId: SCHEDULE, areaId: AREA, status: 'DRAFT',
    })]);
  });
});

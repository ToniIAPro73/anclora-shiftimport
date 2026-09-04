import { describe, expect, it } from 'vitest';
import {
  createAssignment,
  createNewDraftFromVersion,
  createScheduleDraft,
  deleteAssignment,
  getScheduleSnapshot,
  listScheduleVersionHistory,
  listScheduleVersions,
  publishScheduleVersion,
  updateAssignment,
} from '../_lib/scheduling.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const AREA = '22222222-2222-4222-8222-222222222222';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE = '66666666-6666-4666-8666-666666666666';

const employee = { organizationId: ORG, role: 'EMPLOYEE', employeeId: EMPLOYEE, scopedAreaId: null, user: { id: '77777777-7777-4777-8777-777777777777' } };

function emptySql() {
  const sql = () => Promise.resolve([]);
  sql.transaction = async (build) => Promise.all(build(sql));
  return sql;
}

describe('Scheduling authorization matrix', () => {
  it.each([
    ['create draft', (sql) => createScheduleDraft(sql, employee, { periodStart: '2026-09-07' })],
    ['list schedules', (sql) => listScheduleVersions(sql, employee)],
    ['view snapshot', (sql) => getScheduleSnapshot(sql, employee, SCHEDULE, VERSION)],
    ['view history', (sql) => listScheduleVersionHistory(sql, employee, SCHEDULE)],
    ['create assignment', (sql) => createAssignment(sql, employee, SCHEDULE, VERSION, { employeeId: EMPLOYEE, date: '2026-09-08', startTime: '09:00', endTime: '17:00' })],
    ['update assignment', (sql) => updateAssignment(sql, employee, SCHEDULE, VERSION, ASSIGNMENT, { location: 'Nope' })],
    ['delete assignment', (sql) => deleteAssignment(sql, employee, SCHEDULE, VERSION, ASSIGNMENT)],
    ['publish version', (sql) => publishScheduleVersion(sql, employee, SCHEDULE, VERSION)],
    ['create new draft', (sql) => createNewDraftFromVersion(sql, employee, SCHEDULE, VERSION)],
  ])('rejects EMPLOYEE from %s before data access', async (_action, operation) => {
    const sql = emptySql();
    await expect(operation(sql)).rejects.toMatchObject({ status: 403 });
  });

  it('does not reveal another tenant schedule through snapshot or history', async () => {
    const sql = emptySql();
    await expect(getScheduleSnapshot(sql, { organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA }, SCHEDULE, VERSION))
      .rejects.toMatchObject({ status: 404 });
    await expect(listScheduleVersionHistory(sql, { organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA }, SCHEDULE))
      .rejects.toMatchObject({ status: 404 });
  });
});

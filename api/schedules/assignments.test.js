import { describe, expect, it } from 'vitest';
import { createAssignment, deleteAssignment, updateAssignment } from '../_lib/scheduling.js';

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

function makeSql({ status = 'DRAFT' } = {}) {
  const state = { status, assignments: [] };
  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (text.startsWith('SELECT sv.id AS version_id')) {
      return Promise.resolve([{ version_id: VERSION, schedule_id: SCHEDULE, status: state.status, organization_id: ORG, area_id: AREA, period_start: '2026-09-28', period_end: '2026-10-04' }]);
    }
    if (text.startsWith('SELECT sa.id')) {
      return Promise.resolve([{ id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: EMPLOYEE, date: '2026-09-29', start_time: '09:00', end_time: '17:00', location: 'Original', created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' }]);
    }
    if (text.startsWith('SELECT id, area_id, status')) {
      return Promise.resolve([{ id: EMPLOYEE, area_id: AREA, status: 'active' }]);
    }
    if (text.startsWith('INSERT INTO shift_assignments')) {
      const row = { id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: EMPLOYEE, date: values[2], start_time: values[3], end_time: values[4], location: values[5], created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' };
      state.assignments.push(row);
      return Promise.resolve([row]);
    }
    if (text.startsWith('UPDATE shift_assignments')) {
      return Promise.resolve([{ id: ASSIGNMENT, schedule_version_id: VERSION, employee_id: EMPLOYEE, date: values[1], start_time: values[2], end_time: values[3], location: values[4], created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z' }]);
    }
    if (text.startsWith('DELETE FROM shift_assignments')) return Promise.resolve([{ id: ASSIGNMENT }]);
    return Promise.resolve([]);
  };
  sql.state = state;
  return sql;
}

describe('ShiftAssignment draft CRUD', () => {
  it('creates an assignment inside the schedule period', async () => {
    const assignment = await createAssignment(makeSql(), planner, SCHEDULE, VERSION, {
      employeeId: EMPLOYEE, date: '2026-09-29', startTime: '09:00', endTime: '17:00', location: 'Front desk',
    });
    expect(assignment).toMatchObject({ scheduleVersionId: VERSION, employeeId: EMPLOYEE, date: '2026-09-29', startTime: '09:00', endTime: '17:00', location: 'Front desk' });
  });

  it('updates and deletes an existing assignment', async () => {
    const sql = makeSql();
    const updated = await updateAssignment(sql, planner, SCHEDULE, VERSION, ASSIGNMENT, { location: 'Lobby' });
    expect(updated.location).toBe('Lobby');
    await expect(deleteAssignment(sql, planner, SCHEDULE, VERSION, ASSIGNMENT)).resolves.toBeUndefined();
  });

  it('rejects every mutation on a non-DRAFT version', async () => {
    const sql = makeSql({ status: 'PUBLISHED' });
    await expect(createAssignment(sql, planner, SCHEDULE, VERSION, {
      employeeId: EMPLOYEE, date: '2026-09-29', startTime: '09:00', endTime: '17:00',
    })).rejects.toMatchObject({ status: 409, code: 'VERSION_NOT_EDITABLE' });
    await expect(updateAssignment(sql, planner, SCHEDULE, VERSION, ASSIGNMENT, { location: 'Nope' }))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_NOT_EDITABLE' });
    await expect(deleteAssignment(sql, planner, SCHEDULE, VERSION, ASSIGNMENT))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_NOT_EDITABLE' });
  });

  it('rejects an assignment outside an area planner scope', async () => {
    const sql = makeSql();
    sql.state.status = 'DRAFT';
    sql.__outsideArea = true;
    const original = sql;
    const scopedSql = (strings, ...values) => {
      const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT sv.id AS version_id')) {
        return Promise.resolve([{ version_id: VERSION, schedule_id: SCHEDULE, status: 'DRAFT', organization_id: ORG, area_id: '88888888-8888-4888-8888-888888888888', period_start: '2026-09-28', period_end: '2026-10-04' }]);
      }
      return original(strings, ...values);
    };
    await expect(createAssignment(scopedSql, planner, SCHEDULE, VERSION, {
      employeeId: EMPLOYEE, date: '2026-09-29', startTime: '09:00', endTime: '17:00',
    })).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { publishScheduleVersion } from '../_lib/scheduling.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555';

const ctx = {
  organizationId: ORG,
  role: 'PLANNER',
  scopedAreaId: null,
  user: { id: ACTOR },
};

function makeSql(outcome, { fail = false } = {}) {
  const sql = () => Promise.resolve([]);
  sql.transaction = vi.fn(async (build) => {
    const queries = build(sql);
    expect(queries).toHaveLength(1);
    if (fail) throw new Error('simulated materialization failure');
    return [[outcome]];
  });
  return sql;
}

describe('publishScheduleVersion', () => {
  it('uses one transaction and returns the materialization summary', async () => {
    const sql = makeSql({
      found: true,
      current_status: 'DRAFT',
      error_code: null,
      published_at: '2026-09-04T10:00:00.000Z',
      created_shift_count: 2,
      excluded_count: 1,
      excluded_assignments: [{ assignmentId: ASSIGNMENT, employeeId: '66666666-6666-4666-8666-666666666666' }],
    });

    await expect(publishScheduleVersion(sql, ctx, SCHEDULE, VERSION)).resolves.toEqual({
      status: 'PUBLISHED',
      publishedAt: '2026-09-04T10:00:00.000Z',
      createdShiftCount: 2,
      excludedAssignments: [{ assignmentId: ASSIGNMENT, employeeId: '66666666-6666-4666-8666-666666666666' }],
      excludedAssignmentCount: 1,
    });
    expect(sql.transaction).toHaveBeenCalledTimes(1);
  });

  it('maps a revalidation overlap to a 422 without leaving the transaction', async () => {
    const sql = makeSql({
      found: true,
      current_status: 'DRAFT',
      error_code: 'OVERLAP',
      conflicting_assignment_id: ASSIGNMENT,
      published_at: null,
      created_shift_count: 0,
      excluded_count: 0,
      excluded_assignments: [],
    });

    await expect(publishScheduleVersion(sql, ctx, SCHEDULE, VERSION)).rejects.toMatchObject({
      status: 422, code: 'OVERLAP', conflictingAssignmentId: ASSIGNMENT,
    });
  });

  it('keeps a failed transaction as a failure with no success result', async () => {
    const sql = makeSql(null, { fail: true });

    await expect(publishScheduleVersion(sql, ctx, SCHEDULE, VERSION)).rejects.toThrow('simulated materialization failure');
  });

  it('rejects a non-draft version before reporting publication', async () => {
    const sql = makeSql({
      found: true,
      current_status: 'PUBLISHED',
      error_code: null,
      published_at: '2026-09-04T10:00:00.000Z',
      created_shift_count: 0,
      excluded_count: 0,
      excluded_assignments: [],
    });

    await expect(publishScheduleVersion(sql, ctx, SCHEDULE, VERSION)).rejects.toMatchObject({
      status: 409, code: 'VERSION_NOT_EDITABLE',
    });
  });
});

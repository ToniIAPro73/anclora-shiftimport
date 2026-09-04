import { describe, expect, it, vi } from 'vitest';
import { createNewDraftFromVersion } from '../_lib/scheduling.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const AREA = '22222222-2222-4222-8222-222222222222';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const DRAFT = '55555555-5555-4555-8555-555555555555';
const NEW_VERSION = '66666666-6666-4666-8666-666666666666';

const ctx = {
  organizationId: ORG,
  role: 'PLANNER',
  scopedAreaId: AREA,
  user: { id: '77777777-7777-4777-8777-777777777777' },
};

function makeSql(outcome, { fail = false } = {}) {
  const sql = () => Promise.resolve([]);
  sql.transaction = vi.fn(async (build) => {
    const queries = build(sql);
    expect(queries).toHaveLength(1);
    if (fail) throw new Error('simulated copy failure');
    return [[outcome]];
  });
  return sql;
}

describe('createNewDraftFromVersion', () => {
  it('copies assignments into a new independent draft in one transaction', async () => {
    const sql = makeSql({
      found: true,
      current_status: 'PUBLISHED',
      area_id: AREA,
      draft_version_id: null,
      new_version_id: NEW_VERSION,
      schedule_id: SCHEDULE,
      version_number: 2,
      copied_assignment_count: 3,
    });

    await expect(createNewDraftFromVersion(sql, ctx, SCHEDULE, VERSION)).resolves.toEqual({
      newVersionId: NEW_VERSION,
      scheduleId: SCHEDULE,
      versionNumber: 2,
      copiedAssignmentCount: 3,
    });
    expect(sql.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a second draft and identifies the active draft', async () => {
    const sql = makeSql({
      found: true,
      current_status: 'PUBLISHED',
      area_id: AREA,
      draft_version_id: DRAFT,
      new_version_id: null,
      schedule_id: SCHEDULE,
      version_number: null,
      copied_assignment_count: 0,
    });

    await expect(createNewDraftFromVersion(sql, ctx, SCHEDULE, VERSION)).rejects.toMatchObject({
      status: 409, code: 'SCHEDULE_DRAFT_EXISTS', draftVersionId: DRAFT,
    });
  });

  it('does not fork a version that is still a DRAFT', async () => {
    const sql = makeSql({
      found: true,
      current_status: 'DRAFT',
      area_id: AREA,
      draft_version_id: VERSION,
      new_version_id: null,
      schedule_id: SCHEDULE,
      version_number: null,
      copied_assignment_count: 0,
    });

    await expect(createNewDraftFromVersion(sql, ctx, SCHEDULE, VERSION)).rejects.toMatchObject({
      status: 409, code: 'VERSION_NOT_PUBLISHED',
    });
  });

  it('returns not found without creating a version for another tenant', async () => {
    const sql = makeSql({ found: false });
    await expect(createNewDraftFromVersion(sql, ctx, SCHEDULE, VERSION)).rejects.toMatchObject({ status: 404 });
  });

  it('propagates a failed transaction without reporting a new draft', async () => {
    const sql = makeSql(null, { fail: true });
    await expect(createNewDraftFromVersion(sql, ctx, SCHEDULE, VERSION)).rejects.toThrow('simulated copy failure');
  });
});

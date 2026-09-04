import { describe, expect, it } from 'vitest';
import { listScheduleVersionHistory } from '../_lib/scheduling.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const AREA = '22222222-2222-4222-8222-222222222222';
const OTHER_AREA = '88888888-8888-4888-8888-888888888888';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';

const planner = { organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA };

function makeSql(rows) {
  return () => Promise.resolve(rows);
}

describe('listScheduleVersionHistory', () => {
  it('returns every version with publication metadata, newest first', async () => {
    await expect(listScheduleVersionHistory(makeSql([
      {
        version_id: 'v2', schedule_id: SCHEDULE, version_number: 2, status: 'PUBLISHED', area_id: AREA,
        created_by_user_id: 'u2', created_by_user_name: 'Planner', created_at: '2026-09-02T10:00:00.000Z',
        published_by_user_id: 'u2', published_by_user_name: 'Planner', published_at: '2026-09-02T11:00:00.000Z',
      },
      {
        version_id: 'v1', schedule_id: SCHEDULE, version_number: 1, status: 'DRAFT', area_id: AREA,
        created_by_user_id: 'u1', created_by_user_name: 'Owner', created_at: '2026-09-01T10:00:00.000Z',
        published_by_user_id: null, published_by_user_name: null, published_at: null,
      },
    ]), planner, SCHEDULE)).resolves.toEqual([
      expect.objectContaining({ id: 'v2', versionNumber: 2, status: 'PUBLISHED', publishedByUserName: 'Planner' }),
      expect.objectContaining({ id: 'v1', versionNumber: 1, status: 'DRAFT', publishedAt: null }),
    ]);
  });

  it('rejects a schedule outside an area planner scope', async () => {
    await expect(listScheduleVersionHistory(makeSql([{
      version_id: 'v1', schedule_id: SCHEDULE, version_number: 1, status: 'PUBLISHED', area_id: OTHER_AREA,
    }]), planner, SCHEDULE)).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
  });

  it('validates the schedule id before querying', async () => {
    await expect(listScheduleVersionHistory(makeSql([]), planner, 'invalid')).rejects.toMatchObject({ status: 400 });
  });
});

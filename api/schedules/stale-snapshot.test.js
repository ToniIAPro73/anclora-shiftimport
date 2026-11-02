import { describe, expect, it } from 'vitest';
import { getScheduleSnapshot } from '../_lib/scheduling.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const EMP = '44444444-4444-4444-8444-444444444444';

const ctx = { organizationId: ORG, role: 'ADMIN', user: { id: '55555555-5555-4555-8555-555555555555' } };

function makeSql(status) {
  const queries = [];
  const sql = (strings, ...values) => {
    const text = strings.join(' ').replace(/\s+/g, ' ').trim();
    queries.push({ text, values });
    if (text.includes('FROM schedule_versions sv')) {
      return Promise.resolve([{ version_id: VERSION, schedule_id: SCHEDULE, version_number: 1, status, created_at: '2026-10-30T00:00:00Z', published_at: null, organization_id: ORG, area_id: null, period_start: '2026-10-26', period_end: '2026-11-01' }]);
    }
    if (text.includes('FROM employees') && text.includes('ORDER BY name')) return Promise.resolve([{ id: EMP, name: 'E2E', external_employee_id: 'E1', area_id: null }]);
    if (text.includes('FROM shift_assignments sa')) {
      return Promise.resolve([{ id: 'a1', schedule_version_id: VERSION, import_id: null, employee_id: EMP, date: '2026-11-01', start_time: null, end_time: null, location: 'Libre', shift_type: 'Libre', counts_as_work: false, created_at: 'x', updated_at: 'x', stale_against_calendar: true }]);
    }
    return Promise.resolve([]);
  };
  sql.queries = queries;
  return sql;
}

describe('getScheduleSnapshot: stale draft assignments', () => {
  it('flags an assignment that a later manual change contradicts and keeps it in the draft', async () => {
    const sql = makeSql('DRAFT');
    const snapshot = await getScheduleSnapshot(sql, ctx, SCHEDULE, VERSION);
    expect(snapshot.assignments).toHaveLength(1);
    expect(snapshot.assignments[0]).toMatchObject({ id: 'a1', shiftType: 'Libre', staleAgainstCalendar: true });
    const assignmentQuery = sql.queries.find((q) => q.text.includes('FROM shift_assignments sa'));
    expect(assignmentQuery.text).toContain('AS stale_against_calendar');
    // the flag only exists for a DRAFT version: a published version is history, not a plan to review
    expect(assignmentQuery.values).toContain(true);
  });

  it('a published version only flags what its publication did not materialize', async () => {
    const sql = makeSql('PUBLISHED');
    await getScheduleSnapshot(sql, ctx, SCHEDULE, VERSION);
    const assignmentQuery = sql.queries.find((q) => q.text.includes('FROM shift_assignments sa'));
    expect(assignmentQuery.values).toContain(false);
    expect(assignmentQuery.text).toContain('mat.schedule_version_id = sa.schedule_version_id');
    expect(assignmentQuery.text).toContain('NOT EXISTS');
  });
});

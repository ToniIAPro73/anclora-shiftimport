import { describe, expect, it } from 'vitest';
import { refineHistoryFlags } from './data.js';

const ctx = { organizationId: 'org-1' };
const EMP = 'emp-1';
const shift = (over = {}) => ({ id: 's1', employeeId: EMP, date: '2026-07-16', startTime: '', endTime: '', shiftType: 'Vacaciones', location: 'Vacaciones', countsAsWork: false, effectiveState: 'EFFECTIVE', hasHistory: true, changeId: 'c1', layer: 'COMPANY_PLAN', ...over });
const historic = (rows) => () => Promise.resolve(rows.map((r) => ({ employee_id: EMP, date: '2026-07-16', location: r.shift_type, start_time: null, end_time: null, counts_as_work: null, duty_role: null, ...r })));

describe('refineHistoryFlags (technical history vs visible change; stored rows are never touched)', () => {
  it('16/07 equivalent: superseded Vacaciones behind effective Vacaciones is NOT a visible change', async () => {
    const [out] = await refineHistoryFlags(historic([{ shift_type: 'Vacaciones' }]), ctx, [shift()]);
    expect(out.hasHistory).toBe(false);
    expect(out.changeId).toBe('c1'); // the technical link is preserved for the day detail
  });
  it('a different historic state stays flagged as a change', async () => {
    const [out] = await refineHistoryFlags(historic([{ shift_type: 'Regular', start_time: '09:00', end_time: '17:00' }]), ctx, [shift()]);
    expect(out.hasHistory).toBe(true);
  });
  it('days without history cost no extra query', async () => {
    let calls = 0;
    const sql = () => { calls += 1; return Promise.resolve([]); };
    const rows = [shift({ hasHistory: false })];
    expect(await refineHistoryFlags(sql, ctx, rows)).toBe(rows);
    expect(calls).toBe(0);
  });
});

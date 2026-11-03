import { describe, expect, it, vi } from 'vitest';
import { assertPlannerImportAttribution, assertPlannerOperationalDate, PLANNER_DIRECT_WRITE_FORBIDDEN } from './planner-write-guard.js';

const planner = { role: 'PLANNER', organizationId: 'org-1', user: { id: 'user-1' } };

describe('assertPlannerOperationalDate', () => {
  it('today is NOT history: the prohibition includes it (injected operational date, no UTC guess)', () => {
    expect(() => assertPlannerOperationalDate(planner, '2026-11-02', '2026-11-02')).toThrow(expect.objectContaining({ status: 403, code: PLANNER_DIRECT_WRITE_FORBIDDEN }));
    expect(() => assertPlannerOperationalDate(planner, '2026-11-03', '2026-11-02')).toThrow(expect.objectContaining({ code: PLANNER_DIRECT_WRITE_FORBIDDEN }));
  });
  it('yesterday and earlier are history and pass', () => {
    expect(() => assertPlannerOperationalDate(planner, '2026-11-01', '2026-11-02')).not.toThrow();
  });
  it('the Europe/Madrid day decides, not UTC: 23:30 UTC on Nov 1 is already Nov 2 in Madrid', () => {
    // getOperationalDate is Europe/Madrid; at 2026-11-01T23:30Z Madrid (CET, UTC+1) is 2026-11-02 00:30.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T23:30:00Z'));
    try {
      expect(() => assertPlannerOperationalDate(planner, '2026-11-02')).toThrow(expect.objectContaining({ code: PLANNER_DIRECT_WRITE_FORBIDDEN }));
      expect(() => assertPlannerOperationalDate(planner, '2026-11-01')).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['OWNER', 'ADMIN', 'EMPLOYEE'])('never restricts %s (their own rules apply elsewhere)', (role) => {
    expect(() => assertPlannerOperationalDate({ ...planner, role }, '2099-01-01', '2026-11-02')).not.toThrow();
  });
});

describe('assertPlannerImportAttribution', () => {
  const fakeSql = (rows) => { const calls = []; const sql = (strings, ...values) => { calls.push({ text: strings.join('?').replace(/\s+/g, ' '), values }); return Promise.resolve(rows); }; sql.calls = calls; return sql; };

  it('no import id is a denial and issues no query', async () => {
    const sql = fakeSql([{ found: 1 }]);
    for (const id of [undefined, null, '', '   ']) await expect(assertPlannerImportAttribution(sql, planner, id)).rejects.toMatchObject({ status: 403, code: PLANNER_DIRECT_WRITE_FORBIDDEN });
    expect(sql.calls).toHaveLength(0);
  });
  it('the lookup is bound to the id, the organisation AND the acting user', async () => {
    const sql = fakeSql([{ found: 1 }]);
    await expect(assertPlannerImportAttribution(sql, planner, 'imp-1')).resolves.toBeUndefined();
    expect(sql.calls[0].values).toEqual(['imp-1', 'org-1', 'user-1']);
    expect(sql.calls[0].text).toContain('imported_by_user_id');
  });
  it('an import that does not exist for this organisation/user is denied', async () => {
    await expect(assertPlannerImportAttribution(fakeSql([]), planner, 'imp-9')).rejects.toMatchObject({ code: PLANNER_DIRECT_WRITE_FORBIDDEN });
  });
  it('other roles are not subject to it (and cost no query)', async () => {
    const sql = fakeSql([]);
    await expect(assertPlannerImportAttribution(sql, { ...planner, role: 'ADMIN' }, '')).resolves.toBeUndefined();
    expect(sql.calls).toHaveLength(0);
  });
});

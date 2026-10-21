import { describe, expect, it } from 'vitest';
import { getEffectiveStats } from './calendar.js';

describe('latest published schedule authority', () => {
  it('filters statistics by the latest published version even when it has no assignments', async () => {
    const calls = [];
    const sql = async (strings, ...values) => {
      const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
      calls.push({ text, values });
      if (text.startsWith('SELECT id, status FROM employees')) return [{ id: 'employee-1', status: 'active' }];
      return [];
    };

    await getEffectiveStats(sql, {
      organizationId: 'org-1', role: 'ADMIN', employeeId: null,
    }, 'employee-1', 2026, { today: '2026-10-21' });

    const statsQuery = calls.find((call) => call.text.includes('FROM shifts'));
    expect(statsQuery.text).toContain('newer.version_number > current_version.version_number');
    expect(statsQuery.text).toContain("newer.status IN ('PUBLISHED', 'LOCKED', 'COMPLETED')");
    expect(statsQuery.text).toContain('newer.schedule_id = current_version.schedule_id');
    expect(statsQuery.text).not.toContain('newer_assignment');
    expect(statsQuery.text).toContain('schedule_version_id IS NULL');
  });
});

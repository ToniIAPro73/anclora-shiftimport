import { describe, expect, it } from 'vitest';
import { getEffectiveStats } from './calendar.js';

describe('day-scoped published schedule authority', () => {
  it('filters statistics only when a newer published version contains an assignment for that employee and date', async () => {
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
    expect(statsQuery.text).toContain('newer_assignment.schedule_version_id = newer.id');
    expect(statsQuery.text).toContain('newer_assignment.employee_id = shifts.employee_id');
    expect(statsQuery.text).toContain('newer_assignment.date = shifts.date');
    expect(statsQuery.text).toContain('schedule_version_id IS NULL');
  });
});

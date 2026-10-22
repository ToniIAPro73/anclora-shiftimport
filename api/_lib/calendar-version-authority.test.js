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

  it('excludes the current operational day from the current-month future bucket', async () => {
    const sql = async (strings) => {
      const text = strings.join(' ').replace(/\s+/g, ' ').trim();
      if (text.includes('FROM employees')) return [{ id: 'employee-1', status: 'active' }];
      if (text.includes('FROM shifts')) return [
        ...['23', '24', '25', '26', '27', '28', '29'].map((day) => ({
          id: `shift-${day}`,
          date: `2026-10-${day}`,
          start_time: '05:00',
          end_time: '13:00',
          shift_type: 'Regular',
          counts_as_work: true,
          effective_state: 'EFFECTIVE',
        })),
      ];
      return [];
    };

    const result = await getEffectiveStats(sql, {
      organizationId: 'org-1', role: 'ADMIN', employeeId: null,
    }, 'employee-1', 2026, { today: '2026-10-23', month: 10 });

    expect(result.monthStats.realized.effectiveMinutes).toBe(0);
    expect(result.monthStats.planned.effectiveMinutes).toBe(6 * 8 * 60);
    expect(result.planned.effectiveMinutes).toBe(7 * 8 * 60);
  });
});

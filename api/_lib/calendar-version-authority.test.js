import { describe, expect, it } from 'vitest';
import { getEffectiveStats } from './calendar.js';

describe('day-scoped published schedule authority', () => {
  it('counts Regular only for external employee 84881 inside ShiftImport and preserves the Extras counter', async () => {
    const organizationId = 'a4cf0768-f08d-49e6-bb81-0d3635d58028';
    const shifts = [
      { id: 'regular', date: '2026-02-06', start_time: '08:00', end_time: '15:00', shift_type: 'Regular', location: 'Regular', counts_as_work: true, effective_state: 'EFFECTIVE' },
      { id: 'extras', date: '2026-02-06', start_time: '15:00', end_time: '16:00', shift_type: 'Extras', location: 'Extras', counts_as_work: true, effective_state: 'EFFECTIVE' },
    ];
    const sql = async (strings) => {
      const text = strings.join(' ').replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT id, status FROM employees')) return [{ id: 'employee-1', status: 'active' }];
      if (text.startsWith('SELECT external_employee_id FROM employees')) return [{ external_employee_id: '84881' }];
      if (text.includes('FROM shifts')) return shifts;
      if (text.includes('FROM calendar_changes')) return [];
      if (text.includes('FROM employee_annual_targets')) return [{
        id: 'target-1', employee_id: 'employee-1', year: 2026,
        minimum_annual_minutes: 450, maximum_annual_minutes: 500,
        source: 'ADMIN_UI', notes: '',
      }];
      return [];
    };

    const result = await getEffectiveStats(sql, { organizationId, role: 'ADMIN' }, 'employee-1', 2026, { today: '2026-03-01', month: 2 });
    expect(result.realized).toMatchObject({ effectiveMinutes: 420, regularMinutes: 420, extrasMinutes: 60 });
    expect(result.contract).toMatchObject({ status: 'BELOW_MINIMUM', effectiveMinutes: 420 });
    expect(result.projection.projectedMinutes).toBe(420);
  });

  it('does not apply employee 84881 accounting policy to another organization', async () => {
    const sql = async (strings) => {
      const text = strings.join(' ').replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT id, status FROM employees')) return [{ id: 'employee-1', status: 'active' }];
      if (text.startsWith('SELECT external_employee_id FROM employees')) return [{ external_employee_id: '84881' }];
      if (text.includes('FROM shifts')) return [
        { id: 'regular', date: '2026-02-06', start_time: '08:00', end_time: '15:00', shift_type: 'Regular', location: 'Regular', counts_as_work: true, effective_state: 'EFFECTIVE' },
        { id: 'extras', date: '2026-02-06', start_time: '15:00', end_time: '16:00', shift_type: 'Extras', location: 'Extras', counts_as_work: true, effective_state: 'EFFECTIVE' },
      ];
      if (text.includes('FROM calendar_changes')) return [];
      return [];
    };

    const result = await getEffectiveStats(sql, { organizationId: 'another-organization', role: 'ADMIN' }, 'employee-1', 2026, { today: '2026-03-01' });
    expect(result.realized).toMatchObject({ effectiveMinutes: 480, regularMinutes: 420, extrasMinutes: 60 });
  });

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

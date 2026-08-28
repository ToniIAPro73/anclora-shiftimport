import { describe, expect, it } from 'vitest';
import { normalizeStructuredRows, StructuredShiftRow } from './structured-rows';

function row(partial: Partial<StructuredShiftRow>): StructuredShiftRow {
  return {
    employeeName: 'Ana García',
    externalEmployeeId: 'OPE-001',
    date: '2026-09-01',
    startTime: '06:00',
    endTime: '14:00',
    shiftType: 'M',
    ...partial,
  };
}

describe('normalizeStructuredRows', () => {
  it('groups by external id and preserves a work shift', () => {
    const result = normalizeStructuredRows([row({})]);
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]).toMatchObject({ externalEmployeeId: 'OPE-001', name: 'Ana García' });
    expect(result.employees[0].shifts[0]).toMatchObject({ date: '2026-09-01', startTime: '06:00', endTime: '14:00', shiftType: 'M' });
    expect(result.diagnostics).toHaveLength(0);
  });

  it('does not flag an unrecognized work-shift label (M/T/X1) as an error', () => {
    const result = normalizeStructuredRows([row({ shiftType: 'X1' })]);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.employees[0].shifts[0].shiftType).toBe('X1');
  });

  it('flags an invalid/unparseable date and drops the row', () => {
    const result = normalizeStructuredRows([row({ date: 'not-a-date' })]);
    expect(result.employees).toHaveLength(0);
    expect(result.diagnostics[0]).toMatchObject({ code: 'INVALID_DATE' });
  });

  it('flags an incomplete shift (start with no end) and excludes it', () => {
    const result = normalizeStructuredRows([row({ startTime: '06:00', endTime: '' })]);
    expect(result.employees).toHaveLength(0);
    expect(result.diagnostics[0]).toMatchObject({ code: 'INCOMPLETE_SHIFT' });
  });

  it('treats a row with neither start nor end as a Libre/absence row', () => {
    const result = normalizeStructuredRows([row({ startTime: '', endTime: '', shiftType: 'LIBRE' })]);
    expect(result.employees[0].shifts[0]).toMatchObject({ shiftType: 'Libre', startTime: '', endTime: '' });
  });

  it('flags a same-employee same-date duplicate and keeps only the first', () => {
    const result = normalizeStructuredRows([
      row({ startTime: '06:00', endTime: '14:00' }),
      row({ startTime: '16:00', endTime: '00:00', notes: 'conflicting duplicate' }),
    ]);
    expect(result.employees[0].shifts).toHaveLength(1);
    expect(result.employees[0].shifts[0]).toMatchObject({ startTime: '06:00', endTime: '14:00' });
    expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_RECORD')).toBe(true);
  });

  it('drops a row with no employee name and no external id', () => {
    const result = normalizeStructuredRows([row({ employeeName: '', externalEmployeeId: '' })]);
    expect(result.employees).toHaveLength(0);
    expect(result.diagnostics[0]).toMatchObject({ code: 'INSUFFICIENT_DATA' });
  });

  it('falls back to the external id as the display name when the name is blank', () => {
    const result = normalizeStructuredRows([row({ employeeName: '' })]);
    expect(result.employees[0].name).toBe('OPE-001');
  });

  it('carries an areaName hint onto the employee', () => {
    const result = normalizeStructuredRows([row({ areaName: 'Operaciones', areaCode: 'OPE' })]);
    expect(result.employees[0]).toMatchObject({ areaName: 'Operaciones', areaCode: 'OPE' });
  });
});

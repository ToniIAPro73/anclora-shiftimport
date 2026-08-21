import { describe, expect, it } from 'vitest';
import { reconcileImport } from './import-reconciliation';
import { Shift } from './types';

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 's1',
    date: '2026-09-04',
    startTime: '14:00',
    endTime: '22:00',
    location: '',
    origin: 'IMP',
    ...overrides,
  };
}

describe('reconcileImport', () => {
  it('PASS: every expected shift is found in persisted, identical field-for-field', () => {
    const expected = [shift({ id: 'a' }), shift({ id: 'b', date: '2026-09-05' })];
    const persisted = [shift({ id: 'a' }), shift({ id: 'b', date: '2026-09-05' })];
    const report = reconcileImport(expected, persisted);
    expect(report).toEqual({
      expectedCount: 2,
      persistedCount: 2,
      matchedCount: 2,
      mismatches: [],
      status: 'PASS',
    });
  });

  it('FAIL: a shift the importer expected to be written never shows up in what the server returned (silent loss)', () => {
    const expected = [shift({ id: 'a' }), shift({ id: 'missing', date: '2026-09-07' })];
    const persisted = [shift({ id: 'a' })];
    const report = reconcileImport(expected, persisted);
    expect(report.status).toBe('FAIL');
    expect(report.matchedCount).toBe(1);
    expect(report.mismatches).toEqual([
      {
        id: 'missing',
        date: '2026-09-07',
        reason: 'missing_in_persisted',
        expected: shift({ id: 'missing', date: '2026-09-07' }),
      },
    ]);
  });

  it('FAIL: same id persisted but with different field values (e.g. overnight end time silently corrupted)', () => {
    const expected = [shift({ id: 'a', startTime: '17:00', endTime: '01:00' })];
    const persisted = [shift({ id: 'a', startTime: '17:00', endTime: '00:00' })];
    const report = reconcileImport(expected, persisted);
    expect(report.status).toBe('FAIL');
    expect(report.mismatches).toEqual([
      {
        id: 'a',
        date: '2026-09-04',
        reason: 'field_mismatch',
        expected: shift({ id: 'a', startTime: '17:00', endTime: '01:00' }),
        persisted: shift({ id: 'a', startTime: '17:00', endTime: '00:00' }),
        diffFields: ['endTime'],
      },
    ]);
  });

  it('PASS on an empty import (nothing expected, nothing persisted)', () => {
    expect(reconcileImport([], [])).toEqual({
      expectedCount: 0,
      persistedCount: 0,
      matchedCount: 0,
      mismatches: [],
      status: 'PASS',
    });
  });

  it('extra persisted rows beyond what was expected do not by themselves fail the report', () => {
    const expected = [shift({ id: 'a' })];
    const persisted = [shift({ id: 'a' }), shift({ id: 'unrelated-existing-shift', date: '2026-09-10' })];
    const report = reconcileImport(expected, persisted);
    expect(report.status).toBe('PASS');
    expect(report.persistedCount).toBe(2);
  });
});

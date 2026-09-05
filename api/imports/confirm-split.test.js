import { describe, expect, it, vi } from 'vitest';
import { classifyImportDates, confirmFutureImport } from '../_lib/future-import.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE = '22222222-2222-4222-8222-222222222222';
const AREA = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const FUTURE_DATE = '2099-09-05';
const base = { employeeId: EMPLOYEE, startTime: '09:00', endTime: '17:00', location: 'Regular', origin: 'IMP' };

function request(date) {
  return {
    fileName: 'm14.csv', sourceFormat: 'CSV', fileFingerprint: 'a'.repeat(64),
    employeeId: EMPLOYEE, periodYear: 2026, periodMonth: 9,
    shifts: [{ ...base, date }],
  };
}

describe('R3-M14 future import contract', () => {
  it('classifies historical, future and mixed rows against server time', () => {
    expect(classifyImportDates([{ ...base, date: '2026-09-04' }], new Date('2026-09-04T23:00:00Z')).classification).toBe('HISTORICAL');
    expect(classifyImportDates([{ ...base, date: '2026-09-05' }], new Date('2026-09-04T23:00:00Z')).classification).toBe('FUTURE');
    expect(classifyImportDates([
      { ...base, date: '2026-09-04' },
      { ...base, date: '2026-09-05' },
    ], new Date('2026-09-04T23:00:00Z')).classification).toBe('MIXED');
  });

  it('rejects future imports before opening a transaction without planning capability', async () => {
    const transaction = vi.fn();
    const sql = () => Promise.resolve([]);
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'EMPLOYEE', employeeId: EMPLOYEE, plan: 'team' };

    await expect(confirmFutureImport(sql, ctx, request(FUTURE_DATE))).rejects.toMatchObject({
      status: 403,
      code: 'FUTURE_IMPORT_REQUIRES_PLANNING',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('uses one transaction for every mutation and propagates an intermediate failure', async () => {
    const transaction = vi.fn(async (callback) => {
      const txn = () => Promise.resolve([]);
      await Promise.all(callback(txn));
      throw new Error('induced intermediate failure');
    });
    const sql = (strings) => {
      const text = strings.join(' ').replace(/\s+/g, ' ');
      if (text.includes('FROM areas')) return Promise.resolve([{ id: AREA, name: 'Area' }]);
      if (text.includes('FROM employees')) return Promise.resolve([{ id: EMPLOYEE, status: 'active', area_id: AREA }]);
      if (text.includes('FROM imports')) return Promise.resolve([]);
      return Promise.resolve([]);
    };
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null, plan: 'team' };

    await expect(confirmFutureImport(sql, ctx, { ...request(FUTURE_DATE), areaId: AREA })).rejects.toThrow('induced intermediate failure');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

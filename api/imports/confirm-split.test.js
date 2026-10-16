import { describe, expect, it, vi } from 'vitest';
import { classifyImportDates, confirmFutureImport, previewFutureImport } from '../_lib/future-import.js';

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
    futureConsent: 'historical-and-plan',
    shifts: [{ ...base, date }],
  };
}

describe('R3-M14 future import contract', () => {
  it('classifies historical, future and mixed rows against server time', () => {
    expect(classifyImportDates([{ ...base, date: '2026-09-04' }], new Date('2026-09-04T23:00:00Z')).classification).toBe('HISTORICAL');
    expect(classifyImportDates([{ ...base, date: '2026-09-05' }], new Date('2026-09-04T23:00:00Z')).classification).toBe('FUTURE');
    expect(classifyImportDates([{ ...base, date: '2026-09-04' }], new Date('2026-09-04T10:00:00Z')).classification).toBe('FUTURE');
    expect(classifyImportDates([
      { ...base, date: '2026-09-04' },
      { ...base, date: '2026-09-05' },
    ], new Date('2026-09-04T23:00:00Z')).classification).toBe('MIXED');
  });

  it('rejects future rows without explicit draft consent before opening a transaction', async () => {
    const transaction = vi.fn();
    const sql = () => Promise.resolve([]);
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null, plan: 'team' };

    await expect(confirmFutureImport(sql, ctx, { ...request(FUTURE_DATE), futureConsent: undefined })).rejects.toMatchObject({
      status: 409,
      code: 'FUTURE_IMPORT_CONSENT_REQUIRED',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects any other consent value: the plan decision must be explicit', async () => {
    const transaction = vi.fn();
    const sql = () => Promise.resolve([]);
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'PLANNER', plannerScopeType: 'ORGANIZATION', plan: 'team' };

    await expect(confirmFutureImport(sql, ctx, { ...request(FUTURE_DATE), futureConsent: 'draft' })).rejects.toMatchObject({
      status: 409, code: 'FUTURE_IMPORT_CONSENT_REQUIRED',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects future imports before opening a transaction without planning capability', async () => {
    const transaction = vi.fn();
    const sql = () => Promise.resolve([]);
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'EMPLOYEE', employeeId: EMPLOYEE, plan: 'team' };

    await expect(confirmFutureImport(sql, ctx, request(FUTURE_DATE))).rejects.toMatchObject({
      status: 403,
      code: 'SELF_IMPORT_FUTURE_FORBIDDEN',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a working future shift without times as a controlled validation error', async () => {
    const transaction = vi.fn();
    const sql = () => Promise.resolve([]);
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null, plan: 'team' };

    await expect(confirmFutureImport(sql, ctx, {
      ...request(FUTURE_DATE),
      shifts: [{ ...base, date: FUTURE_DATE, shiftType: 'Regular', countsAsWork: true, startTime: '', endTime: '' }],
    })).rejects.toMatchObject({ status: 400, code: 'SHIFT_TIMES_REQUIRED' });
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

  it('importing never publishes: the transaction contains no publication statement and notifications are not sent', async () => {
    const executed = [];
    const transaction = vi.fn(async (callback) => {
      const txn = (strings) => { executed.push(strings.join(' ').replace(/\s+/g, ' ')); return Promise.resolve([{ id: 'x', inserted: true, revision_number: 1 }]); };
      const results = await Promise.all(callback(txn));
      return results;
    });
    const sql = (strings) => {
      const text = strings.join(' ').replace(/\s+/g, ' ');
      if (text.includes('FROM areas')) return Promise.resolve([{ id: AREA, name: 'Area' }]);
      if (text.includes('FROM employees')) return Promise.resolve([{ id: EMPLOYEE, status: 'active', area_id: AREA, external_employee_id: '84881', name: 'QA' }]);
      return Promise.resolve([]);
    };
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null, plan: 'team' };

    const result = await confirmFutureImport(sql, ctx, { ...request(FUTURE_DATE), areaId: AREA });
    expect(result.plan.autoPublished).toBe(false);
    expect(result.future.publishedWeekCount).toBe(0);
    expect(executed.some((text) => /publish_|PUBLISHED'.*UPDATE|SET status = 'PUBLISHED'|publishScheduleVersion/i.test(text))).toBe(false);
    expect(executed.some((text) => text.includes('company_plan_revisions'))).toBe(true); // the first import establishes the baseline revision
  });

  it('accepts the legacy wire value "publish" as the plan decision (it never meant auto-publication)', async () => {
    const transaction = vi.fn(async (callback) => Promise.all(callback(() => Promise.resolve([{ id: 'x', inserted: true, revision_number: 1 }]))));
    const sql = (strings) => {
      const text = strings.join(' ');
      if (text.includes('FROM areas')) return Promise.resolve([{ id: AREA, name: 'Area' }]);
      if (text.includes('FROM employees')) return Promise.resolve([{ id: EMPLOYEE, status: 'active', area_id: AREA, external_employee_id: '1', name: 'QA' }]);
      return Promise.resolve([]);
    };
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null, plan: 'team' };
    await expect(confirmFutureImport(sql, ctx, { ...request(FUTURE_DATE), areaId: AREA, futureConsent: 'publish' })).resolves.toMatchObject({ decision: 'historical-and-plan' });
  });

  it('preview is read-only (no transaction) and works before any decision is made', async () => {
    const transaction = vi.fn();
    const sql = (strings) => {
      const text = strings.join(' ');
      if (text.includes('FROM areas')) return Promise.resolve([{ id: AREA, name: 'Area' }]);
      if (text.includes('FROM employees')) return Promise.resolve([{ id: EMPLOYEE, status: 'active', area_id: AREA, external_employee_id: '84881', name: 'QA' }]);
      return Promise.resolve([]);
    };
    sql.transaction = transaction;
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'PLANNER', scopedAreaId: AREA, employeeId: null, plan: 'team' };
    const preview = await previewFutureImport(sql, ctx, { ...request(FUTURE_DATE), areaId: AREA, futureConsent: undefined });
    expect(preview.autoPublish).toBe(false);
    expect(preview.classification).toBe('FUTURE');
    expect(preview.plan.changes.new).toBe(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('EMPLOYEE can neither preview nor confirm planning', async () => {
    const sql = () => Promise.resolve([]);
    sql.transaction = vi.fn();
    const ctx = { user: { id: USER }, organizationId: ORG, role: 'EMPLOYEE', employeeId: EMPLOYEE, plan: 'team' };
    await expect(previewFutureImport(sql, ctx, request(FUTURE_DATE))).rejects.toMatchObject({ status: 403, code: 'SELF_IMPORT_FUTURE_FORBIDDEN' });
  });
});

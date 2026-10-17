import { describe, expect, it, vi } from 'vitest';
import { confirmImportReversion, previewImportReversion, revertSingleImport } from './import-reversion.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const IMPORT = '22222222-2222-4222-8222-222222222222';
const ctxOf = (role) => ({ organizationId: ORG, role, user: { id: 'u1' }, employeeId: role === 'EMPLOYEE' ? 'e1' : null });

/** A sql stub that must never be reached by an unauthorized / invalid request. */
const forbiddenSql = () => {
  const sql = vi.fn(() => { throw new Error('database must not be touched'); });
  sql.transaction = vi.fn(() => { throw new Error('no transaction may be opened'); });
  return sql;
};

describe('authorization and validation come BEFORE any database access', () => {
  for (const role of ['EMPLOYEE', 'PLANNER']) {
    it(`${role} can neither preview, confirm nor delete-alias a reversion (no new destructive permission is granted)`, async () => {
      const sql = forbiddenSql();
      await expect(previewImportReversion(sql, ctxOf(role), { importIds: [IMPORT] })).rejects.toMatchObject({ status: 403 });
      await expect(confirmImportReversion(sql, ctxOf(role), { importIds: [IMPORT], planHash: 'a'.repeat(64) })).rejects.toMatchObject({ status: 403 });
      await expect(revertSingleImport(sql, ctxOf(role), IMPORT)).rejects.toMatchObject({ status: 403 });
      expect(sql).not.toHaveBeenCalled();
      expect(sql.transaction).not.toHaveBeenCalled();
    });
  }

  it('OWNER / ADMIN requests are validated: ids required, UUIDs only, bounded, planHash required for confirm', async () => {
    const sql = forbiddenSql();
    await expect(previewImportReversion(sql, ctxOf('ADMIN'), {})).rejects.toMatchObject({ status: 400 });
    await expect(previewImportReversion(sql, ctxOf('OWNER'), { importIds: ['not-a-uuid'] })).rejects.toMatchObject({ status: 400 });
    await expect(previewImportReversion(sql, ctxOf('ADMIN'), { importIds: Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) })).rejects.toMatchObject({ status: 400 });
    await expect(confirmImportReversion(forbiddenSql(), ctxOf('ADMIN'), { importIds: [IMPORT] })).rejects.toMatchObject({ status: 400 });
    await expect(confirmImportReversion(forbiddenSql(), ctxOf('ADMIN'), { importIds: [IMPORT], planHash: 'short' })).rejects.toMatchObject({ status: 400 });
  });

  it('a replayed confirmation (same plan hash) is answered from the ledger without recomputing or opening a transaction', async () => {
    const calls = [];
    const sql = (strings) => {
      calls.push(strings.join('?'));
      return Promise.resolve([{ id: 'r1', summary: { impact: { shiftsRemoved: 2 }, order: [IMPORT] }, requested_import_count: 1, effective_import_count: 1 }]);
    };
    sql.transaction = vi.fn();
    const result = await confirmImportReversion(sql, ctxOf('ADMIN'), { importIds: [IMPORT], planHash: 'b'.repeat(64) });
    expect(result).toMatchObject({ idempotent: true, reversionId: 'r1', status: 'completed', effectiveImportCount: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('FROM import_reversions');
    expect(sql.transaction).not.toHaveBeenCalled();
  });
});

describe('racing confirmation', () => {
  it('when the first lookup misses but the operation completed meanwhile, the second caller gets the SAME operation (never a 409)', async () => {
    let lookups = 0;
    const sql = (strings) => {
      const text = strings.join('?');
      if (text.includes('FROM import_reversions')) {
        lookups += 1;
        return Promise.resolve(lookups === 1 ? [] : [{ id: 'r1', summary: { impact: {}, order: [IMPORT] }, requested_import_count: 1, effective_import_count: 1 }]);
      }
      if (text.includes('FROM imports i LEFT JOIN users')) {
        return Promise.resolve([{ id: IMPORT, file_name: 'a.xlsx', status: 'completed', created_at: new Date(), deleted_at: null, reverted_at: new Date() }]);
      }
      return Promise.resolve([]);
    };
    sql.transaction = vi.fn();
    const result = await confirmImportReversion(sql, ctxOf('ADMIN'), { importIds: [IMPORT], planHash: 'c'.repeat(64) });
    expect(result).toMatchObject({ idempotent: true, reversionId: 'r1' });
    expect(sql.transaction).not.toHaveBeenCalled();
  });
});

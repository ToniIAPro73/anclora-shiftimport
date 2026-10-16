import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PURGE_SCOPE, parseArgs, runPurge, validateRequest } from './purge-calendar-year.mjs';

const ORG = { id: 'a4cf0768-f08d-49e6-bb81-0d3635d58028', name: 'ShiftImport' };

/** Fake pg client: scope counts are driven by `state`; fingerprints by `drift`. */
function fakeClient({ counts, driftOnDelete = false, orgRows = [ORG] } = {}) {
  const state = { inTx: false, deleted: {}, log: [], drifted: false, remaining: { ...counts } };
  return {
    state,
    async query(sql, params = []) {
      const text = String(sql).trim();
      state.log.push(text.split(/\s+/).slice(0, 3).join(' '));
      if (text === 'BEGIN') { state.inTx = true; return { rows: [] }; }
      if (text === 'COMMIT') { state.inTx = false; state.committed = true; return { rows: [] }; }
      if (text === 'ROLLBACK') { state.inTx = false; state.rolledBack = true; return { rows: [] }; }
      if (text.startsWith('SELECT id, name FROM organizations')) return { rows: orgRows };
      if (text.startsWith('SELECT COUNT(*)')) {
        const table = /FROM (\w+) WHERE/.exec(text)[1];
        return { rows: [{ n: state.remaining[table] ?? 0 }] };
      }
      if (text.startsWith('DELETE FROM')) {
        const table = /DELETE FROM (\w+)/.exec(text)[1];
        state.deleted[table] = state.remaining[table] ?? 0;
        state.remaining[table] = 0;
        if (driftOnDelete && table === 'shifts') state.drifted = true;
        return { rowCount: state.deleted[table], rows: [] };
      }
      if (text.startsWith('SELECT *')) {
        const table = /FROM (\w+) WHERE/.exec(text)[1];
        return { rows: Array.from({ length: state.remaining[table] ?? 0 }, (_, i) => ({ id: `${table}-${i}` })) };
      }
      // fingerprints / effective summary inputs
      if (text.includes('FROM shifts WHERE organization_id = $1 AND NOT')) {
        return { rows: state.drifted ? [{ id: 'changed' }] : [{ id: 's1' }] };
      }
      return { rows: [] };
    },
  };
}

const quiet = { log: () => undefined, now: new Date('2026-10-16T00:00:00Z') };

describe('purge-calendar-year guards', () => {
  it('requires organization and a sane year', () => {
    expect(() => validateRequest({ organization: null, year: 2025 })).toThrow(/organization/);
    expect(() => validateRequest({ organization: 'x', year: 25 })).toThrow(/year/);
  });

  it('refuses the current and future years unless explicitly overridden', () => {
    const now = new Date('2026-10-16T00:00:00Z');
    expect(() => validateRequest({ organization: 'x', year: 2026 }, now)).toThrow(/Refusing/);
    expect(() => validateRequest({ organization: 'x', year: 2027 }, now)).toThrow(/Refusing/);
    expect(validateRequest({ organization: 'x', year: 2026, allowCurrentOrFuture: true }, now)).toEqual({ from: '2026-01-01', to: '2027-01-01' });
    expect(validateRequest({ organization: 'x', year: 2025 }, now)).toEqual({ from: '2025-01-01', to: '2026-01-01' });
  });

  it('is dry-run unless --apply is passed', () => {
    expect(parseArgs(['--organization', 'ShiftImport', '--year', '2025'])).toMatchObject({ apply: false, year: 2025 });
    expect(parseArgs(['--organization', 'ShiftImport', '--year', '2025', '--apply']).apply).toBe(true);
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown/);
  });

  it('never targets organizations, employees, targets, memberships or audit events', () => {
    const tables = PURGE_SCOPE.map((entry) => entry.table);
    for (const protectedTable of ['organizations', 'employees', 'employee_annual_targets', 'memberships', 'users', 'organization_audit_events']) {
      expect(tables).not.toContain(protectedTable);
    }
    // children are deleted before their parents
    expect(tables.indexOf('change_requests')).toBeLessThan(tables.indexOf('shifts'));
    expect(tables.indexOf('approval_requests')).toBeLessThan(tables.indexOf('change_requests'));
  });
});

describe('runPurge', () => {
  it('dry-run reports counts and executes no DELETE / transaction', async () => {
    const client = fakeClient({ counts: { shifts: 135 } });
    const report = await runPurge(client, { organization: 'ShiftImport', year: 2025, apply: false }, quiet);
    expect(report.dryRun).toBe('PASS');
    expect(report.rowsToDeleteTotal).toBe(135);
    expect(client.state.log.some((line) => line.startsWith('DELETE'))).toBe(false);
    expect(client.state.inTx).toBe(false);
    expect(client.state.committed).toBeUndefined();
  });

  it('refuses an ambiguous or unknown organization', async () => {
    const client = fakeClient({ counts: {}, orgRows: [] });
    await expect(runPurge(client, { organization: 'Nope', year: 2025 }, quiet)).rejects.toThrow(/matched 0/);
  });

  it('apply: backs up, deletes inside one transaction, verifies and commits', async () => {
    const client = fakeClient({ counts: { shifts: 135 } });
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'purge-test-')), 'backup');
    const report = await runPurge(client, { organization: 'ShiftImport', year: 2025, apply: true, backupDir: dir }, quiet);
    expect(report.purgeApplied).toBe(true);
    expect(report.hashMatch).toBe(true);
    expect(report.after.shifts).toBe(0);
    expect(client.state.committed).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.year).toBe(2025);
    expect(manifest.tables.find((t) => t.table === 'shifts').rows).toBe(135);
    expect(manifest.tables.find((t) => t.table === 'shifts').sha256).toMatch(/^[0-9a-f]{64}$/);
    const order = client.state.log.filter((line) => line.startsWith('DELETE'));
    expect(order.length).toBe(PURGE_SCOPE.length);
  });

  it('apply: rolls back when data outside the year would change', async () => {
    const client = fakeClient({ counts: { shifts: 135 }, driftOnDelete: true });
    const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'purge-test-')), 'backup');
    await expect(runPurge(client, { organization: 'ShiftImport', year: 2025, apply: true, backupDir: dir }, quiet)).rejects.toThrow(/Fingerprint changed/);
    expect(client.state.rolledBack).toBe(true);
    expect(client.state.committed).toBeUndefined();
  });
});

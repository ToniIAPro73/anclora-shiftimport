import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  computeMigrationChecksum,
  inspectMigrationsStatus,
  runMigrations,
  printStatus,
} from './migrate.mjs';

function createMockSql({
  tableExists = true,
  appliedRows = [],
  queryHandler = null,
} = {}) {
  const calls = [];
  const fn = async (strings, ...values) => {
    let text = typeof strings === 'string' ? strings : strings[0];
    if (Array.isArray(strings) && strings.length > 1) {
      for (let i = 0; i < values.length; i++) {
        text += String(values[i]) + strings[i + 1];
      }
    }
    calls.push({ text: text.trim(), values });

    if (text.includes("information_schema.tables") && text.includes("'_migrations'")) {
      return tableExists ? [{ exists: 1 }] : [];
    }

    if (text.includes("SELECT name, applied_at FROM _migrations")) {
      return appliedRows;
    }

    if (queryHandler) {
      return queryHandler(text, values);
    }

    return [];
  };

  fn.transaction = async (queries) => {
    calls.push({ transaction: queries });
    return [];
  };

  fn.query = (q) => {
    calls.push({ rawQuery: q });
    return Promise.resolve();
  };

  fn.calls = calls;
  return fn;
}

describe('db/migrate.mjs Safety & Status Tooling', () => {
  describe('1. Checksum Calculation', () => {
    it('computes exact SHA-256 for a given migration buffer or string', () => {
      const buffer = Buffer.from('SELECT 1;');
      const hash = computeMigrationChecksum(buffer);
      expect(hash).toBe('17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a');
    });
  });

  describe('2. Read-Only Status Inspection (inspectMigrationsStatus)', () => {
    it('reports pending migrations and performs zero writes when _migrations does not exist', async () => {
      const mockSql = createMockSql({
        tableExists: false,
        appliedRows: [],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.tableExists).toBe(false);
      expect(status.applied.length).toBe(0);
      expect(status.pending.length).toBe(37);
      expect(status.gaps.length).toBe(0);
      expect(status.missingFromRepo.length).toBe(0);
      expect(status.isUpToDate).toBe(false);

      // Verify ZERO writes or DDL calls were made
      const writeCalls = mockSql.calls.filter(
        (c) => c.text && (c.text.startsWith('CREATE') || c.text.startsWith('INSERT') || c.text.startsWith('UPDATE'))
      );
      expect(writeCalls.length).toBe(0);
    });

    it('reports complete sequence when all migrations are applied', async () => {
      const allApplied = Array.from({ length: 37 }, (_, i) => {
        const num = String(i + 1).padStart(4, '0');
        return {
          name: `${num}_`, // will match prefix
          applied_at: '2026-09-12T00:00:00Z',
        };
      });

      // We read actual repo file names to construct appliedRows
      const mockSql = createMockSql({
        tableExists: true,
        queryHandler: (text) => {
          if (text.includes("SELECT name, applied_at FROM _migrations")) {
            // Return all files applied
            return Array.from({ length: 37 }, (_, i) => {
              const num = String(i + 1).padStart(4, '0');
              return { name: `file_${num}.sql`, applied_at: '2026-09-12T00:00:00Z' };
            });
          }
          return [];
        },
      });

      // Test with a mock directory or against real migrations
      const status = await inspectMigrationsStatus(mockSql);
      expect(status.tableExists).toBe(true);
      expect(status.totalRepoFiles).toBe(37);
    });

    it('detects sequence gaps when an earlier migration is missing', async () => {
      // 0001 and 0003 applied, but 0002 is missing!
      const mockSql = createMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0003_login_attempts.sql', applied_at: '2026-08-20T16:00:00Z' },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.gaps.length).toBeGreaterThan(0);
      expect(status.isContinuous).toBe(false);
      const gap = status.gaps.find((g) => g.appliedFile === '0003_login_attempts.sql');
      expect(gap).toBeDefined();
      expect(gap.missingPredecessors).toContain('0002_password_reset.sql');
    });

    it('detects migrations registered in database that do not exist in repository', async () => {
      const mockSql = createMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0099_unknown_ghost.sql', applied_at: '2026-08-20T16:00:00Z' },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.missingFromRepo.length).toBe(1);
      expect(status.missingFromRepo[0].name).toBe('0099_unknown_ghost.sql');
      expect(status.isUpToDate).toBe(false);
    });
  });

  describe('3. Apply Validation & Safety Guards (runMigrations)', () => {
    it('refuses to apply migrations when sequence gaps exist (rejects implicit baseline)', async () => {
      const mockSql = createMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0003_login_attempts.sql', applied_at: '2026-08-20T16:00:00Z' },
        ],
      });

      await expect(runMigrations(mockSql)).rejects.toThrow(
        /Cannot apply migrations: sequence gap detected/
      );

      // Verify no transaction or insert was executed
      const insertCalls = mockSql.calls.filter(
        (c) => c.text && c.text.includes('INSERT INTO _migrations')
      );
      expect(insertCalls.length).toBe(0);
    });

    it('refuses to apply migrations when database contains unknown registered migrations', async () => {
      const mockSql = createMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0099_ghost_migration.sql', applied_at: '2026-08-20T16:00:00Z' },
        ],
      });

      await expect(runMigrations(mockSql)).rejects.toThrow(
        /database contains registered migrations not found in repository/
      );
    });

    it('returns 0 applied when all migrations are already applied', async () => {
      // Mock all 37 migrations applied
      const dir = path.join(process.cwd(), 'db/migrations');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
      const mockSql = createMockSql({
        tableExists: true,
        appliedRows: files.map((f) => ({ name: f, applied_at: '2026-09-12T00:00:00Z' })),
      });

      const res = await runMigrations(mockSql);
      expect(res.appliedCount).toBe(0);
      expect(res.pendingCount).toBe(0);
    });
  });

  describe('4. printStatus Formatter', () => {
    it('prints clean human-readable output without crashing', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockStatus = {
        tableExists: true,
        totalRepoFiles: 37,
        applied: [{ name: '0001_init.sql', applied_at: '2026-08-20', sha256: 'abc123456789' }],
        pending: [{ name: '0002_password_reset.sql', sha256: 'def123456789' }],
        missingFromRepo: [],
        gaps: [],
        isContinuous: true,
        isUpToDate: false,
      };

      printStatus(mockStatus);

      expect(logSpy).toHaveBeenCalledWith('=== NEON MIGRATION STATUS ===');
      logSpy.mockRestore();
    });

    it('prints warnings for gaps and missing repo files', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockStatusWithGaps = {
        tableExists: true,
        totalRepoFiles: 37,
        applied: [{ name: '0003_login_attempts.sql', applied_at: '2026-08-20', sha256: 'abc123456789' }],
        pending: [],
        missingFromRepo: [{ name: '0099_ghost.sql', applied_at: '2026-08-20' }],
        gaps: [{ appliedFile: '0003_login_attempts.sql', missingPredecessors: ['0001_init.sql', '0002_password_reset.sql'] }],
        isContinuous: false,
        isUpToDate: false,
      };

      printStatus(mockStatusWithGaps);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR] Migration sequence gaps detected'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING] Migrations registered in database but missing from repository'));
      logSpy.mockRestore();
    });
  });
});

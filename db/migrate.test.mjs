import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  computeMigrationChecksum,
  inspectMigrationsStatus,
  runMigrations,
  printStatus,
  accreditDestinationBranch,
  resolveNeonBranchFromConnectionString,
  loadBaselineManifest,
} from './migrate.mjs';

function createFlexibleMockSql({
  tableExists = false,
  appliedRows = [],
  tables = [],
  columns = [],
  routines = [],
  indexes = [],
  constraints = [],
  onTransaction = null,
} = {}) {
  const calls = [];

  const fn = async (strings, ...values) => {
    let text = typeof strings === 'string' ? strings : strings[0];
    if (Array.isArray(strings) && strings.length > 1) {
      for (let i = 0; i < values.length; i++) {
        text += String(values[i]) + strings[i + 1];
      }
    }
    const trimmed = text.trim();
    calls.push({ text: trimmed, values });

    if (trimmed.includes("information_schema.tables") && trimmed.includes("'_migrations'")) {
      return tableExists ? [{ exists: 1 }] : [];
    }
    if (trimmed.includes("SELECT table_name FROM information_schema.tables")) {
      return tables.map((t) => ({ table_name: t }));
    }
    if (trimmed.includes("SELECT table_name, column_name FROM information_schema.columns")) {
      return columns.map((c) => {
        const [tbl, col] = c.split('.');
        return { table_name: tbl, column_name: col };
      });
    }
    if (trimmed.includes("SELECT routine_name FROM information_schema.routines")) {
      return routines.map((r) => ({ routine_name: r }));
    }
    if (trimmed.includes("SELECT indexname FROM pg_indexes")) {
      return indexes.map((idx) => ({ indexname: idx }));
    }
    if (trimmed.includes("SELECT conname FROM pg_constraint")) {
      return constraints.map((cn) => ({ conname: cn }));
    }
    if (trimmed.includes("SELECT name, applied_at FROM _migrations")) {
      return appliedRows;
    }

    return [];
  };

  fn.transaction = async (queries) => {
    calls.push({ transaction: queries });
    if (onTransaction) {
      return onTransaction(queries);
    }
    return [];
  };

  fn.query = (text, params = []) => {
    calls.push({ queryText: text, params });
    return { text, params };
  };

  fn.calls = calls;
  return fn;
}

describe('db/migrate.mjs Hardened Safety & Reconciliation Tooling', () => {
  describe('1. Checksum Calculation & Baseline Manifest', () => {
    it('computes exact SHA-256 for a given buffer', () => {
      const buffer = Buffer.from('SELECT 1;');
      const hash = computeMigrationChecksum(buffer);
      expect(hash).toBe('17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a');
    });

    it('loads verified baseline manifest and validates 37 entries', async () => {
      const manifest = await loadBaselineManifest();
      expect(manifest).not.toBeNull();
      expect(manifest.size).toBe(37);
      expect(manifest.has('0001_init.sql')).toBe(true);
      expect(manifest.has('0037_temporal_ownership_transfer_and_labor_integrity.sql')).toBe(true);
    });
  });

  describe('2. Read-Only Status & State Classification (inspectMigrationsStatus)', () => {
    it('reports PENDING on clean database (tableExists: false) with exitCode 0', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: false,
        appliedRows: [],
        tables: [],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('READY');
      expect(status.exitCode).toBe(0);
      expect(status.tableExists).toBe(false);
      expect(status.applied.length).toBe(0);
      expect(status.pending.length).toBe(37);
      expect(status.materializedUnregistered.length).toBe(0);
      expect(status.canMigrateNormally).toBe(true);

      // Verify ZERO writes or DDL calls were executed
      const writeCalls = mockSql.calls.filter(
        (c) => c.text && (c.text.startsWith('CREATE') || c.text.startsWith('INSERT') || c.text.startsWith('UPDATE'))
      );
      expect(writeCalls.length).toBe(0);
    });

    it('reports UP_TO_DATE when all 37 migrations are registered in ledger AND materialized in DB', async () => {
      const dir = path.join(process.cwd(), 'db/migrations');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: files.map((f) => ({ name: f, applied_at: '2026-09-12T00:00:00Z' })),
        tables: [
          'organizations',
          'password_reset_tokens',
          'login_attempts',
          'areas',
          'format_profiles',
          'organization_audit_events',
          'schedules',
          'schedule_versions',
          'shift_assignments',
          'shift_comments',
          'change_requests',
          'notifications',
          'oauth_identities',
          'approval_requests',
          'operational_assignments',
          'organization_people',
          'memberships',
        ],
        columns: [
          'organizations.plan',
          'employees.deactivated_at',
          'imports.import_mode',
          'imports.employee_id',
          'memberships.scoped_area_id',
          'shifts.schedule_version_id',
          'shift_assignments.import_id',
          'organizations.approval_policy',
          'approval_requests.approved_by_user_id',
          'approval_requests.rejected_by_user_id',
          'change_requests.requested_start_time',
          'imports.outcome_reason',
          'shifts.shift_type',
        ],
        routines: ['transfer_organization_ownership_temporal'],
        indexes: [
          'format_profiles_org_structurehash_active_idx',
          'memberships_one_owner_per_org_idx',
          'shifts_id_employee_unique_idx',
        ],
        constraints: [
          'employees_status_check',
          'organization_audit_events_event_type_check',
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('UP_TO_DATE');
      expect(status.exitCode).toBe(0);
      expect(status.applied.length).toBe(37);
      expect(status.pending.length).toBe(0);
      expect(status.materializedUnregistered.length).toBe(0);
      expect(status.missingFromDatabase.length).toBe(0);
      expect(status.isUpToDate).toBe(true);
      expect(status.canMigrateNormally).toBe(true);
    });

    it('reports MATERIALIZED_UNREGISTERED and state RECONCILIATION_REQUIRED with exitCode 1', async () => {
      // Simulates Neon main condition: only 0001 in _migrations, but 0003..0037 materialized
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [{ name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' }],
        tables: [
          'organizations',
          // password_reset_tokens is missing!
          'login_attempts', // from 0003
          'areas', // from 0008
          'organization_people', // from 0036
        ],
        routines: ['transfer_organization_ownership_temporal'], // from 0037
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('RECONCILIATION_REQUIRED');
      expect(status.exitCode).toBe(1);
      expect(status.materializedUnregistered.length).toBeGreaterThan(0);
      expect(status.materializedUnregistered.some((m) => m.name === '0003_login_attempts.sql')).toBe(true);
      expect(status.materializedUnregistered.some((m) => m.name === '0036_temporal_organizational_model.sql')).toBe(true);
      expect(status.canMigrateNormally).toBe(false);
    });

    it('reports MISSING_FROM_DATABASE when a migration is in ledger but its objects do not exist', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0002_password_reset.sql', applied_at: '2026-08-20T15:40:00Z' },
        ],
        tables: ['organizations'], // password_reset_tokens NOT in tables
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('RECONCILIATION_REQUIRED');
      expect(status.exitCode).toBe(1);
      expect(status.missingFromDatabase.some((m) => m.name === '0002_password_reset.sql')).toBe(true);
      expect(status.canMigrateNormally).toBe(false);
    });

    it('detects sequence gaps and reports RECONCILIATION_REQUIRED with exitCode 1', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0003_login_attempts.sql', applied_at: '2026-08-20T16:00:00Z' },
        ],
        tables: ['organizations', 'login_attempts'],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('RECONCILIATION_REQUIRED');
      expect(status.exitCode).toBe(1);
      expect(status.gaps.length).toBe(1);
      expect(status.gaps[0].appliedFile).toBe('0003_login_attempts.sql');
      expect(status.gaps[0].missingPredecessors).toContain('0002_password_reset.sql');
      expect(status.canMigrateNormally).toBe(false);
    });

    it('detects unknown migrations in ledger and reports RECONCILIATION_REQUIRED with exitCode 1', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0099_ghost_migration.sql', applied_at: '2026-08-20T16:00:00Z' },
        ],
        tables: ['organizations'],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('RECONCILIATION_REQUIRED');
      expect(status.exitCode).toBe(1);
      expect(status.unknownInLedger.some((m) => m.name === '0099_ghost_migration.sql')).toBe(true);
      expect(status.canMigrateNormally).toBe(false);
    });
  });

  describe('3. Target Branch Accreditation (accreditDestinationBranch)', () => {
    const mockEndpoint = {
      id: 'ep-test-123',
      host: 'ep-test-123.neon.tech',
      branch_id: 'br-ephemeral-123',
    };
    const mockBranch = {
      id: 'br-ephemeral-123',
      name: 'tmp-temporal-test',
      default: false,
      primary: false,
      protected: false,
    };
    const mockMainEndpoint = {
      id: 'ep-main-456',
      host: 'ep-main-456.neon.tech',
      branch_id: 'br-main-456',
    };
    const mockMainBranch = {
      id: 'br-main-456',
      name: 'main',
      default: true,
      primary: true,
      protected: false,
    };

    it('fails if targetBranch is not specified (disallows generic connection)', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
          targetBranch: null,
          endpoints: [mockEndpoint],
          branches: [mockBranch],
        })
      ).toThrow(/Target branch must be explicitly specified/);
    });

    it('fails if connection hostname does not map to any recognized endpoint', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@unknown-host.neon.tech/neondb?sslmode=require',
          targetBranch: 'tmp-temporal-test',
          endpoints: [mockEndpoint],
          branches: [mockBranch],
        })
      ).toThrow(/Could not identify Neon endpoint for host/);
    });

    it('fails if targetBranch does not match the branch resolved from endpoint', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
          targetBranch: 'br-some-other-branch',
          endpoints: [mockEndpoint],
          branches: [mockBranch],
        })
      ).toThrow(/target branch 'br-some-other-branch' does not match resolved branch/);
    });

    it('fails if resolved branch is main and allowMainMigration=false', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-main-456.neon.tech/neondb?sslmode=require',
          targetBranch: 'main',
          allowMainMigration: false,
          endpoints: [mockMainEndpoint],
          branches: [mockMainBranch],
        })
      ).toThrow(/Refusing to apply migrations to production\/main branch 'main'/);
    });

    it('passes for main branch only when allowMainMigration=true', () => {
      const res = accreditDestinationBranch({
        connectionString: 'postgresql://neondb_owner:secret@ep-main-456.neon.tech/neondb?sslmode=require',
        targetBranch: 'main',
        allowMainMigration: true,
        endpoints: [mockMainEndpoint],
        branches: [mockMainBranch],
      });
      expect(res.accredited).toBe(true);
      expect(res.branch.id).toBe('br-main-456');
    });

    it('passes for accredited ephemeral branch matching by name or id', () => {
      const res = accreditDestinationBranch({
        connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
        targetBranch: 'tmp-temporal-test',
        expectedBranchName: 'tmp-temporal-test',
        endpoints: [mockEndpoint],
        branches: [mockBranch],
      });
      expect(res.accredited).toBe(true);
      expect(res.branch.id).toBe('br-ephemeral-123');
    });
  });

  describe('4. Atomic Migration Execution & Rollback', () => {
    it('executes DDL and ledger INSERT in a single atomic transaction', async () => {
      let transactionQueries = [];
      const mockSql = createFlexibleMockSql({
        tableExists: false,
        onTransaction: (queries) => {
          transactionQueries = queries;
          return [];
        },
      });

      // Run single migration 0001
      const res = await runMigrations(mockSql, {
        accreditation: { accredited: true },
      });

      expect(res.appliedCount).toBe(37);
      // The last transaction executed should have included both DDL and INSERT
      expect(transactionQueries.length).toBeGreaterThan(1);
      const hasInsert = transactionQueries.some(
        (q) => q.text && q.text.includes('INSERT INTO _migrations')
      );
      expect(hasInsert).toBe(true);
    });

    it('rolls back completely if the ledger INSERT fails within the transaction', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: false,
        onTransaction: (queries) => {
          const insertQuery = queries.find(
            (q) => q.text && q.text.includes('INSERT INTO _migrations')
          );
          if (insertQuery) {
            throw new Error('Ledger INSERT failed: disk quota exceeded');
          }
          return [];
        },
      });

      await expect(
        runMigrations(mockSql, {
          accreditation: { accredited: true },
        })
      ).rejects.toThrow(/Ledger INSERT failed: disk quota exceeded/);
    });
  });

  describe('5. Safety Guards in runMigrations', () => {
    it('refuses execution when database is in RECONCILIATION_REQUIRED state', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [{ name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' }],
        tables: ['organizations', 'login_attempts'], // 0003 materialized unregistered!
      });

      await expect(
        runMigrations(mockSql, {
          accreditation: { accredited: true },
        })
      ).rejects.toThrow(/database is in RECONCILIATION_REQUIRED state/);
    });

    it('prints informative messages and does not crash when printing status', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockStatus = {
        state: 'RECONCILIATION_REQUIRED',
        tableExists: true,
        totalRepoFiles: 37,
        applied: [{ name: '0001_init.sql' }],
        pending: [{ name: '0002_password_reset.sql', sha256: 'abc1234567890' }],
        materializedUnregistered: [{ name: '0003_login_attempts.sql' }],
        missingFromDatabase: [],
        unknownInLedger: [],
        checksumMismatches: [],
        gaps: [],
      };

      printStatus(mockStatus);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('NEON MIGRATION STATUS'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Result: RECONCILIATION_REQUIRED'));

      logSpy.mockRestore();
    });
  });
});

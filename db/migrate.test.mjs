import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as childProcess from 'node:child_process';
import { describe, it, expect, vi } from 'vitest';
import { Client } from '@neondatabase/serverless';

let mockExecFileSyncImpl = null;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execFileSync: (...args) => {
      if (mockExecFileSyncImpl) {
        return mockExecFileSyncImpl(...args);
      }
      return actual.execFileSync(...args);
    },
  };
});

import {
  computeMigrationChecksum,
  inspectMigrationsStatus,
  runMigrations,
  printStatus,
  accreditDestinationBranch,
  resolveNeonBranchFromConnectionString,
  loadBaselineManifest,
  isMigrationMaterialized,
  normalizeMigrationSql,
  scanSqlTokens,
  validateRepositoryMigrations,
  MIGRATION_SENTINELS,
  MIGRATIONS_DIR,
  BASELINE_MANIFEST_PATH,
} from './migrate.mjs';

function createFlexibleMockSql({
  tableExists = false,
  appliedRows = [],
  tables = [],
  columns = [],
  routines = [],
  indexes = [],
  constraints = [],
  onQuery = null,
} = {}) {
  const calls = [];

  const handleQuery = async (queryText, params = []) => {
    const trimmed = (queryText || '').trim();
    calls.push({ text: trimmed, params });

    if (onQuery) {
      const custom = await onQuery(trimmed, params);
      if (custom !== undefined) return custom;
    }

    if (trimmed.includes("information_schema.tables") && trimmed.includes("'_migrations'")) {
      return tableExists ? [{ exists: 1 }] : [];
    }
    if (trimmed.includes("SELECT 1 FROM information_schema.columns") && trimmed.includes("checksum")) {
      return columns.includes('_migrations.checksum') ? [{ exists: 1 }] : [];
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
    if (trimmed.includes("SELECT conname")) {
      return constraints.map((cn) => {
        if (typeof cn === 'object' && cn !== null) return cn;
        return { conname: cn, def: '', table_name: '' };
      });
    }
    if (trimmed.includes("SELECT name, applied_at")) {
      return appliedRows;
    }

    return [];
  };

  const fn = async (strings, ...values) => {
    let text = typeof strings === 'string' ? strings : strings[0];
    if (Array.isArray(strings) && strings.length > 1) {
      for (let i = 0; i < values.length; i++) {
        text += String(values[i]) + strings[i + 1];
      }
    }
    return handleQuery(text, values);
  };

  fn.query = async (text, params = []) => {
    return handleQuery(text, params);
  };

  fn.calls = calls;
  return fn;
}

describe('db/migrate.mjs Hardened Safety & Reconciliation Tooling', () => {
  const TEST_PROJECT_ID = 'holy-cake-85660318';

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
    branch_id: 'br-solitary-thunder-b1hm9low',
  };
  const mockMainBranch = {
    id: 'br-solitary-thunder-b1hm9low',
    name: 'main',
    default: true,
    primary: true,
    protected: false,
  };

  describe('1. Checksum Calculation & Fail-Closed Baseline Manifest', () => {
    it('computes exact SHA-256 for a given buffer', () => {
      const buffer = Buffer.from('SELECT 1;');
      const hash = computeMigrationChecksum(buffer);
      expect(hash).toBe('17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a');
    });

    it('loads verified baseline manifest and validates 37 entries', async () => {
      const manifest = await loadBaselineManifest();
      expect(manifest).toBeInstanceOf(Map);
      expect(manifest.size).toBe(37);
      expect(manifest.has('0001_init.sql')).toBe(true);
      expect(manifest.has('0037_temporal_ownership_transfer_and_labor_integrity.sql')).toBe(true);
    });

    it('throws error when baseline manifest file is missing (fail-closed)', async () => {
      await expect(
        loadBaselineManifest('/tmp/non_existent_manifest_path.json')
      ).rejects.toThrow(/Baseline manifest file not found or inaccessible/);
    });

    it('throws error when baseline manifest contains invalid JSON', async () => {
      const tmpPath = path.join(process.cwd(), 'scratch_invalid_json.json');
      fs.writeFileSync(tmpPath, '{ invalid json');
      try {
        await expect(loadBaselineManifest(tmpPath)).rejects.toThrow(/Invalid baseline manifest JSON/);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });

    it('throws error when baseline manifest is not an array', async () => {
      const tmpPath = path.join(process.cwd(), 'scratch_not_array.json');
      fs.writeFileSync(tmpPath, '{"version": 1}');
      try {
        await expect(loadBaselineManifest(tmpPath)).rejects.toThrow(/must contain a JSON array/);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });

    it('throws error when baseline manifest contains duplicate migration entries', async () => {
      const tmpPath = path.join(process.cwd(), 'scratch_dup_manifest.json');
      const data = [
        {
          name: '0001_init.sql',
          sha256: 'b269aac2ac783b3ffb983a1d99325d77bf1482218451be6352740287d2a00eff',
          baselineVersion: '0037',
          reconciliationMethod: 'baseline_init',
        },
        {
          name: '0001_init.sql',
          sha256: 'b269aac2ac783b3ffb983a1d99325d77bf1482218451be6352740287d2a00eff',
          baselineVersion: '0037',
          reconciliationMethod: 'baseline_init',
        },
      ];
      fs.writeFileSync(tmpPath, JSON.stringify(data));
      try {
        await expect(loadBaselineManifest(tmpPath)).rejects.toThrow(/Duplicate entry for migration '0001_init.sql'/);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });

    it('throws error when baseline manifest has invalid SHA-256 checksum format', async () => {
      const tmpPath = path.join(process.cwd(), 'scratch_bad_hash.json');
      const data = [
        {
          name: '0001_init.sql',
          sha256: 'not-a-valid-64-char-hex-hash',
          baselineVersion: '0037',
          reconciliationMethod: 'baseline_init',
        },
      ];
      fs.writeFileSync(tmpPath, JSON.stringify(data));
      try {
        await expect(loadBaselineManifest(tmpPath)).rejects.toThrow(/must be a 64-character lowercase hex string/);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });

    it('throws error when baseline manifest has missing version or method', async () => {
      const tmpPath = path.join(process.cwd(), 'scratch_missing_fields.json');
      const data = [
        {
          name: '0001_init.sql',
          sha256: 'b269aac2ac783b3ffb983a1d99325d77bf1482218451be6352740287d2a00eff',
          baselineVersion: '',
          reconciliationMethod: 'baseline_init',
        },
      ];
      fs.writeFileSync(tmpPath, JSON.stringify(data));
      try {
        await expect(loadBaselineManifest(tmpPath)).rejects.toThrow(/missing or empty 'baselineVersion'/);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    });
  });

  describe('2. Specific Sentinels & Constraint Fingerprints', () => {
    it('never detects 0006, 0007, 0013, or 0031 as materialized on a legitimate 0001 database', () => {
      // 0001 schema catalog
      const catalog0001 = {
        tables: new Set(['organizations', 'users', 'memberships', 'employees', 'imports', 'shifts', 'sessions']),
        columns: new Set([
          'organizations.id',
          'organizations.name',
          'memberships.user_id',
          'memberships.role',
          'employees.status',
        ]), // NOTE: employees.deactivated_at does NOT exist in 0001
        indexes: new Set(),
        routines: new Set(),
        constraints: new Set(['employees_status_check', 'memberships_role_check']),
        constraintDefs: new Map([
          ['employees_status_check', "CHECK (status IN ('pending_access', 'active', 'inactive'))"],
          ['memberships_role_check', "CHECK (role IN ('ADMIN', 'EMPLOYEE'))"],
        ]),
      };

      // 0001 is materialized
      expect(isMigrationMaterialized('0001_init.sql', catalog0001)).toBe(true);

      // 0006 requires employees.deactivated_at from 0005 -> FALSE
      expect(isMigrationMaterialized('0006_employee_pending_access.sql', catalog0001)).toBe(false);

      // 0007 requires employees.deactivated_at from 0005 -> FALSE
      expect(isMigrationMaterialized('0007_remove_manager_role.sql', catalog0001)).toBe(false);

      // 0013 requires OWNER and PLANNER in memberships_role_check -> FALSE
      expect(isMigrationMaterialized('0013_membership_roles_owner.sql', catalog0001)).toBe(false);

      // 0031 requires approval_request.created in audit constraint -> FALSE
      expect(isMigrationMaterialized('0031_approval_audit_event_types.sql', catalog0001)).toBe(false);

      // 0038 requires _migrations.checksum and constraint -> FALSE
      expect(isMigrationMaterialized('0038_migration_ledger_checksums.sql', catalog0001)).toBe(false);
    });

    it('correctly detects 0006, 0007, 0013, 0031, and 0038 when their exact fingerprints are materialized', () => {
      const catalogAdvanced = {
        tables: new Set(['organizations', 'memberships', 'employees', 'organization_audit_events']),
        columns: new Set(['employees.deactivated_at', '_migrations.checksum']),
        indexes: new Set(),
        routines: new Set(),
        constraints: new Set([
          'employees_status_check',
          'memberships_role_check',
          'organization_audit_events_event_type_check',
          '_migrations_checksum_format_chk',
        ]),
        constraintDefs: new Map([
          ['employees_status_check', "CHECK (status IN ('pending_access', 'active', 'inactive'))"],
          ['memberships_role_check', "CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))"],
          ['organization_audit_events_event_type_check', "CHECK (event_type IN ('MEMBER_ADDED', 'approval_request.created'))"],
          ['_migrations_checksum_format_chk', "CHECK (checksum ~ '^[0-9a-f]{64}$')"],
        ]),
      };

      expect(isMigrationMaterialized('0006_employee_pending_access.sql', catalogAdvanced)).toBe(true);
      expect(isMigrationMaterialized('0007_remove_manager_role.sql', catalogAdvanced)).toBe(true);
      expect(isMigrationMaterialized('0013_membership_roles_owner.sql', catalogAdvanced)).toBe(true);
      expect(isMigrationMaterialized('0031_approval_audit_event_types.sql', catalogAdvanced)).toBe(true);
      expect(isMigrationMaterialized('0038_migration_ledger_checksums.sql', catalogAdvanced)).toBe(true);
    });
  });

  describe('3. Read-Only Status & State Classification (inspectMigrationsStatus)', () => {
    it('reports READY on clean database (tableExists: false) with 38 pending and exitCode 0', async () => {
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
      expect(status.pending.length).toBe(38);
      expect(status.materializedUnregistered.length).toBe(0);
      expect(status.canMigrateNormally).toBe(true);

      const writeCalls = mockSql.calls.filter(
        (c) => c.text && (c.text.startsWith('CREATE') || c.text.startsWith('INSERT') || c.text.startsWith('UPDATE'))
      );
      expect(writeCalls.length).toBe(0);
    });

    it('reports READY when 0001-0037 are applied and 0038 is pending (matches Neon main state)', async () => {
      const dir = path.join(process.cwd(), 'db/migrations');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && f < '0038_').sort();

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
          'employees',
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
          { conname: 'employees_status_check', def: "CHECK (status IN ('pending_access', 'active', 'inactive'))" },
          { conname: 'memberships_role_check', def: "CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))" },
          { conname: 'organization_audit_events_event_type_check', def: "CHECK (event_type IN ('approval_request.created'))" },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('READY');
      expect(status.exitCode).toBe(0);
      expect(status.applied.length).toBe(37);
      expect(status.pending.length).toBe(1);
      expect(status.pending[0].name).toBe('0038_migration_ledger_checksums.sql');
      expect(status.materializedUnregistered.length).toBe(0);
      expect(status.missingFromDatabase.length).toBe(0);
      expect(status.canMigrateNormally).toBe(true);
    });

    it('reports UP_TO_DATE when all 38 migrations are registered and materialized with checksum column', async () => {
      const dir = path.join(process.cwd(), 'db/migrations');
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: files.map((f) => ({
          name: f,
          applied_at: '2026-09-12T00:00:00Z',
          checksum: computeMigrationChecksum(fs.readFileSync(path.join(dir, f))),
        })),
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
          'employees',
          '_migrations',
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
          '_migrations.checksum',
        ],
        routines: ['transfer_organization_ownership_temporal'],
        indexes: [
          'format_profiles_org_structurehash_active_idx',
          'memberships_one_owner_per_org_idx',
          'shifts_id_employee_unique_idx',
        ],
        constraints: [
          { conname: 'employees_status_check', def: "CHECK (status IN ('pending_access', 'active', 'inactive'))" },
          { conname: 'memberships_role_check', def: "CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))" },
          { conname: 'organization_audit_events_event_type_check', def: "CHECK (event_type IN ('approval_request.created'))" },
          { conname: '_migrations_checksum_format_chk', def: "CHECK (checksum ~ '^[0-9a-f]{64}$')" },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('UP_TO_DATE');
      expect(status.exitCode).toBe(0);
      expect(status.applied.length).toBe(38);
      expect(status.pending.length).toBe(0);
      expect(status.canMigrateNormally).toBe(true);
    });

    it('reports CHECKSUM_UNVERIFIABLE when a registered migration is not in baseline and has no checksum column', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [
          { name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' },
          { name: '0038_migration_ledger_checksums.sql', applied_at: '2026-09-12T05:00:00Z' }, // not in baseline manifest!
        ],
        tables: ['organizations'],
        columns: [], // no _migrations.checksum column!
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('RECONCILIATION_REQUIRED');
      expect(status.exitCode).toBe(1);
      expect(status.checksumUnverifiable.length).toBe(1);
      expect(status.checksumUnverifiable[0].name).toBe('0038_migration_ledger_checksums.sql');
    });

    it('reports MATERIALIZED_UNREGISTERED and state RECONCILIATION_REQUIRED with exitCode 1', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [{ name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' }],
        tables: [
          'organizations',
          'login_attempts', // from 0003
          'areas', // from 0008
          'organization_people', // from 0036
        ],
        columns: [
          'organizations.plan',
          'employees.deactivated_at',
          '_migrations.checksum',
        ],
        indexes: ['format_profiles_org_structurehash_active_idx'],
        routines: ['transfer_organization_ownership_temporal'],
        constraints: [
          { conname: 'employees_status_check', def: "CHECK (status IN ('pending_access', 'active', 'inactive'))" },
          { conname: 'memberships_role_check', def: "CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))" },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('RECONCILIATION_REQUIRED');
      expect(status.exitCode).toBe(1);
      expect(status.materializedUnregistered.some((m) => m.name === '0003_login_attempts.sql')).toBe(true);
      expect(status.materializedUnregistered.some((m) => m.name === '0036_temporal_organizational_model.sql')).toBe(true);
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
    });
  });

  describe('4. Destination Branch Accreditation & Connection Safety', () => {

    it('fails if targetBranch is not specified (disallows generic connection)', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
          targetBranch: null,
          projectId: TEST_PROJECT_ID,
          endpoints: [mockEndpoint],
          branches: [mockBranch],
        })
      ).toThrow(/Target branch must be explicitly specified/);
    });

    it('fails if connection hostname contains -pooler during write operations', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-test-123-pooler.neon.tech/neondb?sslmode=require',
          targetBranch: 'tmp-temporal-test',
          projectId: TEST_PROJECT_ID,
          endpoints: [mockEndpoint],
          branches: [mockBranch],
          forWrite: true,
        })
      ).toThrow(/Migration write operations require a direct unpooled connection/);
    });

    it('fails if projectId is missing and NEON_PROJECT_ID env is unset', () => {
      const orig = process.env.NEON_PROJECT_ID;
      delete process.env.NEON_PROJECT_ID;
      try {
        expect(() =>
          accreditDestinationBranch({
            connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
            targetBranch: 'tmp-temporal-test',
            projectId: null,
            endpoints: [mockEndpoint],
            branches: [mockBranch],
          })
        ).toThrow(/NEON_PROJECT_ID environment variable or --project-id flag is required/);
      } finally {
        if (orig) process.env.NEON_PROJECT_ID = orig;
      }
    });

    it('fails if connection hostname does not map to any recognized endpoint', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@unknown-host.neon.tech/neondb?sslmode=require',
          targetBranch: 'tmp-temporal-test',
          projectId: TEST_PROJECT_ID,
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
          projectId: TEST_PROJECT_ID,
          endpoints: [mockEndpoint],
          branches: [mockBranch],
        })
      ).toThrow(/target branch 'br-some-other-branch' does not match resolved branch/);
    });

    it('fails if resolved branch is main and allowMainMigration=false', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-main-456.neon.tech/neondb?sslmode=require',
          targetBranch: 'br-solitary-thunder-b1hm9low',
          confirmMainBranchId: 'br-solitary-thunder-b1hm9low',
          allowMainMigration: false,
          projectId: TEST_PROJECT_ID,
          endpoints: [mockMainEndpoint],
          branches: [mockMainBranch],
        })
      ).toThrow(/Refusing to apply migrations to production\/main branch 'main'/);
    });

    it('fails if targetBranch is specified as "main" alias instead of exact branch ID', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-main-456.neon.tech/neondb?sslmode=require',
          targetBranch: 'main',
          confirmMainBranchId: 'br-solitary-thunder-b1hm9low',
          allowMainMigration: true,
          projectId: TEST_PROJECT_ID,
          endpoints: [mockMainEndpoint],
          branches: [mockMainBranch],
        })
      ).toThrow(/target branch must be specified by its exact branch ID/);
    });

    it('fails if confirmMainBranchId is missing or does not match branch ID', () => {
      expect(() =>
        accreditDestinationBranch({
          connectionString: 'postgresql://neondb_owner:secret@ep-main-456.neon.tech/neondb?sslmode=require',
          targetBranch: 'br-solitary-thunder-b1hm9low',
          confirmMainBranchId: null,
          allowMainMigration: true,
          projectId: TEST_PROJECT_ID,
          endpoints: [mockMainEndpoint],
          branches: [mockMainBranch],
        })
      ).toThrow(/requires explicit confirmation flag --confirm-main-branch-id=br-solitary-thunder-b1hm9low/);
    });

    it('passes for main branch only when allowMainMigration=true, targetBranch=ID, and confirmMainBranchId=ID', () => {
      const res = accreditDestinationBranch({
        connectionString: 'postgresql://neondb_owner:secret@ep-main-456.neon.tech/neondb?sslmode=require',
        targetBranch: 'br-solitary-thunder-b1hm9low',
        confirmMainBranchId: 'br-solitary-thunder-b1hm9low',
        allowMainMigration: true,
        projectId: TEST_PROJECT_ID,
        endpoints: [mockMainEndpoint],
        branches: [mockMainBranch],
      });
      expect(res.accredited).toBe(true);
      expect(res.branch.id).toBe('br-solitary-thunder-b1hm9low');
    });

    it('passes for accredited ephemeral branch matching by name or id', () => {
      const res = accreditDestinationBranch({
        connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
        targetBranch: 'tmp-temporal-test',
        expectedBranchName: 'tmp-temporal-test',
        projectId: TEST_PROJECT_ID,
        endpoints: [mockEndpoint],
        branches: [mockBranch],
      });
      expect(res.accredited).toBe(true);
      expect(res.branch.id).toBe('br-ephemeral-123');
    });
  });

  describe('5. Legacy Migration Normalizer (normalizeMigrationSql)', () => {
    it('preserves line comments and block comments containing BEGIN/COMMIT without treating them as transaction wrappers', () => {
      const sql = '-- Line comment with BEGIN and COMMIT\n/* Block comment with BEGIN and COMMIT */\nCREATE TABLE comment_test (id INT);';
      const res = normalizeMigrationSql(sql, '0005_test.sql');
      expect(res.hadWrapper).toBe(false);
      expect(res.normalizedSql).toBe(sql);
    });

    it('ignores strings containing BEGIN or COMMIT keywords', () => {
      const sql = "INSERT INTO test_tbl (note) VALUES ('BEGIN test', 'COMMIT test');";
      const res = normalizeMigrationSql(sql, '0005_test.sql');
      expect(res.hadWrapper).toBe(false);
      expect(res.normalizedSql).toBe(sql);
    });

    it('ignores BEGIN inside PL/pgSQL dollar-quoted function definitions', () => {
      const sql = `
        CREATE OR REPLACE FUNCTION test_func() RETURNS void AS $$
        BEGIN
          NULL;
        END;
        $$ LANGUAGE plpgsql;
      `;
      const res = normalizeMigrationSql(sql, '0037_temporal_ownership_transfer_and_labor_integrity.sql');
      expect(res.hadWrapper).toBe(false);
      expect(res.normalizedSql).toBe(sql);
    });

    it('ignores BEGIN inside anonymous DO $$ blocks', () => {
      const sql = `
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'test') THEN
            NULL;
          END IF;
        END $$;
      `;
      const res = normalizeMigrationSql(sql, '0038_migration_ledger_checksums.sql');
      expect(res.hadWrapper).toBe(false);
      expect(res.normalizedSql).toBe(sql);
    });

    it('returns migration without transaction wrapper as-is', () => {
      const sql = 'CREATE TABLE standalone (id UUID PRIMARY KEY);\nCREATE INDEX standalone_idx ON standalone (id);';
      const res = normalizeMigrationSql(sql, '0001_init.sql');
      expect(res.hadWrapper).toBe(false);
      expect(res.normalizedSql).toBe(sql);
    });

    it('correctly removes valid legacy transaction wrapper while preserving surrounding comments and code', () => {
      const sql = `-- Migration 0007: remove manager role
-- Historical context
BEGIN;

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('ADMIN', 'EMPLOYEE'));

COMMIT;
-- End of migration
`;
      const res = normalizeMigrationSql(sql, '0007_remove_manager_role.sql');
      expect(res.hadWrapper).toBe(true);
      expect(res.normalizedSql).not.toContain('BEGIN;');
      expect(res.normalizedSql).not.toContain('COMMIT;');
      expect(res.normalizedSql).toContain('-- Migration 0007: remove manager role');
      expect(res.normalizedSql).toContain('ALTER TABLE memberships ADD CONSTRAINT');
      expect(res.normalizedSql).toContain('-- End of migration');
    });

    it('rejects legacy migration with intermediate COMMIT', () => {
      const sql = `
        BEGIN;
        CREATE TABLE part1 (id INT);
        COMMIT;
        CREATE TABLE part2 (id INT);
        COMMIT;
      `;
      expect(() => normalizeMigrationSql(sql, '0010_test.sql')).toThrow(
        /multiple or unbalanced transaction statements/
      );
    });

    it('rejects multiple transaction blocks', () => {
      const sql = `
        BEGIN;
        CREATE TABLE a (id INT);
        COMMIT;
        BEGIN;
        CREATE TABLE b (id INT);
        COMMIT;
      `;
      expect(() => normalizeMigrationSql(sql, '0010_test.sql')).toThrow(
        /multiple or unbalanced transaction statements/
      );
    });

    it('rejects migration with explicit ROLLBACK', () => {
      const sql = `
        BEGIN;
        CREATE TABLE doomed (id INT);
        ROLLBACK;
      `;
      expect(() => normalizeMigrationSql(sql, '0010_test.sql')).toThrow(
        /contains explicit ROLLBACK statement/
      );
    });

    it('rejects new migrations (>= 0038) if they contain internal transaction control statements', () => {
      const sql = `
        BEGIN;
        ALTER TABLE _migrations ADD COLUMN test INT;
        COMMIT;
      `;
      expect(() => normalizeMigrationSql(sql, '0038_migration_ledger_checksums.sql')).toThrow(
        /forbidden transaction control statement 'BEGIN'.*0038/i
      );
    });
  });

  describe('6. Ineludible Destination Accreditation & Atomic Execution in runMigrations', () => {
    describe('Rejection of forbidden options (fail-closed before Client instantiation or network)', () => {
      const forbiddenOptions = [
        'ClientClass',
        'branchResolver',
        'neonctlExec',
        'endpoints',
        'branches',
        'migrationsDir',
        'baselineManifestPath',
        'client',
        'sql',
        'customInject',
      ];

      for (const forbidden of forbiddenOptions) {
        it(`rejects option '${forbidden}' before Client creation, connect, or queries`, async () => {
          const connectSpy = vi.spyOn(Client.prototype, 'connect');
          const querySpy = vi.spyOn(Client.prototype, 'query');
          let execCalled = false;
          mockExecFileSyncImpl = () => {
            execCalled = true;
          };

          try {
            await expect(
              runMigrations({
                connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
                targetBranch: 'tmp-temporal-test',
                projectId: TEST_PROJECT_ID,
                [forbidden]: 'forbidden_value',
              })
            ).rejects.toThrow(new RegExp(`runMigrations: unknown or forbidden option '${forbidden}'`));

            expect(connectSpy).not.toHaveBeenCalled();
            expect(querySpy).not.toHaveBeenCalled();
            expect(execCalled).toBe(false);
          } finally {
            connectSpy.mockRestore();
            querySpy.mockRestore();
            mockExecFileSyncImpl = null;
          }
        });
      }

      it('rejects multiple arguments to runMigrations', async () => {
        await expect(
          runMigrations(
            { connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require' },
            { targetBranch: 'something' }
          )
        ).rejects.toThrow(/runMigrations accepts only a single options object/);
      });

      it('rejects non-object or null options to runMigrations', async () => {
        await expect(runMigrations(null)).rejects.toThrow(/runMigrations requires an options object/);
        await expect(runMigrations('postgresql://...')).rejects.toThrow(/runMigrations requires an options object/);
      });
    });

    it('rejects write operations on pooled connections (-pooler)', async () => {
      await expect(
        runMigrations({
          connectionString: 'postgresql://neondb_owner:secret@ep-test-pooler.neon.tech/neondb?sslmode=require',
          targetBranch: 'br-ephemeral-123',
          projectId: TEST_PROJECT_ID,
        })
      ).rejects.toThrow(/Migration write operations require a direct unpooled connection/);
    });

    it('rejects execution if target branch does not match accredited destination', async () => {
      mockExecFileSyncImpl = (cmd, args) => {
        if (args.includes(`/projects/${TEST_PROJECT_ID}/endpoints`)) {
          return JSON.stringify([mockEndpoint]);
        }
        if (args.includes('branches') && args.includes('list')) {
          return JSON.stringify([mockBranch]);
        }
        return '[]';
      };

      try {
        await expect(
          runMigrations({
            connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
            targetBranch: 'wrong-target-branch',
            projectId: TEST_PROJECT_ID,
          })
        ).rejects.toThrow(/Destination accreditation failure.*wrong-target-branch/);
      } finally {
        mockExecFileSyncImpl = null;
      }
    });

    it('creates Client internally with accredited connectionString, connects, executes, and closes client', async () => {
      mockExecFileSyncImpl = (cmd, args) => {
        if (args.includes(`/projects/${TEST_PROJECT_ID}/endpoints`)) {
          return JSON.stringify([mockEndpoint]);
        }
        if (args.includes('branches') && args.includes('list')) {
          return JSON.stringify([mockBranch]);
        }
        return '[]';
      };

      let connectCalled = false;
      let endCalled = false;
      const queriesExecuted = [];

      const connectSpy = vi.spyOn(Client.prototype, 'connect').mockImplementation(async function () {
        connectCalled = true;
      });
      const endSpy = vi.spyOn(Client.prototype, 'end').mockImplementation(async function () {
        endCalled = true;
      });

      const querySpy = vi.spyOn(Client.prototype, 'query').mockImplementation(async function (text, params = []) {
        const trimmed = (text || '').trim();
        queriesExecuted.push({ text: trimmed, params });

        if (trimmed.includes("FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_migrations'")) {
          return [{ exists: 1 }];
        }
        if (trimmed.includes("FROM information_schema.columns WHERE table_schema = 'public'")) {
          return [
            { table_name: 'organizations', column_name: 'id' },
            { table_name: '_migrations', column_name: 'name' },
            { table_name: '_migrations', column_name: 'applied_at' },
            { table_name: 'organizations', column_name: 'plan' },
            { table_name: 'employees', column_name: 'deactivated_at' },
            { table_name: 'imports', column_name: 'import_mode' },
            { table_name: 'imports', column_name: 'employee_id' },
            { table_name: 'memberships', column_name: 'scoped_area_id' },
            { table_name: 'shifts', column_name: 'schedule_version_id' },
            { table_name: 'shift_assignments', column_name: 'import_id' },
            { table_name: 'organizations', column_name: 'approval_policy' },
            { table_name: 'approval_requests', column_name: 'approved_by_user_id' },
            { table_name: 'approval_requests', column_name: 'rejected_by_user_id' },
            { table_name: 'change_requests', column_name: 'requested_start_time' },
            { table_name: 'imports', column_name: 'outcome_reason' },
            { table_name: 'shifts', column_name: 'shift_type' },
          ];
        }
        if (trimmed.includes("FROM information_schema.tables WHERE table_schema = 'public'")) {
          return [
            { table_name: 'organizations' },
            { table_name: 'password_reset_tokens' },
            { table_name: 'login_attempts' },
            { table_name: 'areas' },
            { table_name: 'format_profiles' },
            { table_name: 'organization_audit_events' },
            { table_name: 'schedules' },
            { table_name: 'schedule_versions' },
            { table_name: 'shift_assignments' },
            { table_name: 'shift_comments' },
            { table_name: 'change_requests' },
            { table_name: 'notifications' },
            { table_name: 'oauth_identities' },
            { table_name: 'approval_requests' },
            { table_name: 'operational_assignments' },
            { table_name: 'organization_people' },
            { table_name: 'memberships' },
            { table_name: 'employees' },
            { table_name: '_migrations' },
          ];
        }
        if (trimmed.includes('FROM information_schema.routines')) {
          return [{ routine_name: 'transfer_organization_ownership_temporal' }];
        }
        if (trimmed.includes('FROM pg_indexes')) {
          return [
            { indexname: 'format_profiles_org_structurehash_active_idx' },
            { indexname: 'memberships_one_owner_per_org_idx' },
            { indexname: 'shifts_id_employee_unique_idx' },
          ];
        }
        if (trimmed.includes('FROM pg_constraint')) {
          return [
            { conname: 'employees_status_check', def: "CHECK (status IN ('pending_access', 'active', 'inactive'))" },
            { conname: 'memberships_role_check', def: "CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))" },
            { conname: 'organization_audit_events_event_type_check', def: "CHECK (event_type IN ('approval_request.created'))" },
          ];
        }
        if (trimmed.includes('SELECT name, applied_at FROM _migrations')) {
          const rows = [];
          for (let i = 1; i <= 37; i++) {
            const num = String(i).padStart(4, '0');
            const file = fs.readdirSync('db/migrations').find((f) => f.startsWith(num));
            if (file) rows.push({ name: file, applied_at: '2026-09-12T00:00:00Z' });
          }
          return rows;
        }
        if (trimmed.startsWith('INSERT INTO _migrations')) {
          return [{ name: params[0] }];
        }
        return [];
      });

      try {
        const res = await runMigrations({
          connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
          targetBranch: 'tmp-temporal-test',
          projectId: TEST_PROJECT_ID,
        });

        expect(res.appliedCount).toBe(1);
        expect(connectCalled).toBe(true);
        expect(endCalled).toBe(true);

        const beginQueries = queriesExecuted.filter((q) => q.text === 'BEGIN');
        const commitQueries = queriesExecuted.filter((q) => q.text === 'COMMIT');
        expect(beginQueries.length).toBe(1);
        expect(commitQueries.length).toBe(1);
      } finally {
        mockExecFileSyncImpl = null;
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });

    it('rolls back completely on query failure during migration execution', async () => {
      mockExecFileSyncImpl = (cmd, args) => {
        if (args.includes(`/projects/${TEST_PROJECT_ID}/endpoints`)) {
          return JSON.stringify([mockEndpoint]);
        }
        if (args.includes('branches') && args.includes('list')) {
          return JSON.stringify([mockBranch]);
        }
        return '[]';
      };

      const queriesExecuted = [];
      const connectSpy = vi.spyOn(Client.prototype, 'connect').mockImplementation(async () => {});
      const endSpy = vi.spyOn(Client.prototype, 'end').mockImplementation(async () => {});

      const querySpy = vi.spyOn(Client.prototype, 'query').mockImplementation(async function (text, params = []) {
        const trimmed = (text || '').trim();
        queriesExecuted.push({ text: trimmed, params });

        if (trimmed.includes("FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_migrations'")) {
          return [{ exists: 1 }];
        }
        if (trimmed.includes("FROM information_schema.columns WHERE table_schema = 'public'")) {
          return [
            { table_name: 'organizations', column_name: 'id' },
            { table_name: '_migrations', column_name: 'name' },
            { table_name: '_migrations', column_name: 'applied_at' },
            { table_name: 'organizations', column_name: 'plan' },
            { table_name: 'employees', column_name: 'deactivated_at' },
            { table_name: 'imports', column_name: 'import_mode' },
            { table_name: 'imports', column_name: 'employee_id' },
            { table_name: 'memberships', column_name: 'scoped_area_id' },
            { table_name: 'shifts', column_name: 'schedule_version_id' },
            { table_name: 'shift_assignments', column_name: 'import_id' },
            { table_name: 'organizations', column_name: 'approval_policy' },
            { table_name: 'approval_requests', column_name: 'approved_by_user_id' },
            { table_name: 'approval_requests', column_name: 'rejected_by_user_id' },
            { table_name: 'change_requests', column_name: 'requested_start_time' },
            { table_name: 'imports', column_name: 'outcome_reason' },
            { table_name: 'shifts', column_name: 'shift_type' },
          ];
        }
        if (trimmed.includes("FROM information_schema.tables WHERE table_schema = 'public'")) {
          return [
            { table_name: 'organizations' },
            { table_name: 'password_reset_tokens' },
            { table_name: 'login_attempts' },
            { table_name: 'areas' },
            { table_name: 'format_profiles' },
            { table_name: 'organization_audit_events' },
            { table_name: 'schedules' },
            { table_name: 'schedule_versions' },
            { table_name: 'shift_assignments' },
            { table_name: 'shift_comments' },
            { table_name: 'change_requests' },
            { table_name: 'notifications' },
            { table_name: 'oauth_identities' },
            { table_name: 'approval_requests' },
            { table_name: 'operational_assignments' },
            { table_name: 'organization_people' },
            { table_name: 'memberships' },
            { table_name: 'employees' },
            { table_name: '_migrations' },
          ];
        }
        if (trimmed.includes('FROM information_schema.routines')) {
          return [{ routine_name: 'transfer_organization_ownership_temporal' }];
        }
        if (trimmed.includes('FROM pg_indexes')) {
          return [
            { indexname: 'format_profiles_org_structurehash_active_idx' },
            { indexname: 'memberships_one_owner_per_org_idx' },
            { indexname: 'shifts_id_employee_unique_idx' },
          ];
        }
        if (trimmed.includes('FROM pg_constraint')) {
          return [
            { conname: 'employees_status_check', def: "CHECK (status IN ('pending_access', 'active', 'inactive'))" },
            { conname: 'memberships_role_check', def: "CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))" },
            { conname: 'organization_audit_events_event_type_check', def: "CHECK (event_type IN ('approval_request.created'))" },
          ];
        }
        if (trimmed.includes('SELECT name, applied_at FROM _migrations')) {
          const rows = [];
          for (let i = 1; i <= 37; i++) {
            const num = String(i).padStart(4, '0');
            const file = fs.readdirSync('db/migrations').find((f) => f.startsWith(num));
            if (file) rows.push({ name: file, applied_at: '2026-09-12T00:00:00Z' });
          }
          return rows;
        }
        if (trimmed.startsWith('INSERT INTO _migrations')) {
          throw new Error('Trigger failure on ledger insert');
        }
        return [];
      });

      try {
        await expect(
          runMigrations({
            connectionString: 'postgresql://neondb_owner:secret@ep-test-123.neon.tech/neondb?sslmode=require',
            targetBranch: 'tmp-temporal-test',
            projectId: TEST_PROJECT_ID,
          })
        ).rejects.toThrow(/Trigger failure on ledger insert/);

        const rollbackQueries = queriesExecuted.filter((q) => q.text === 'ROLLBACK');
        expect(rollbackQueries.length).toBe(1);
      } finally {
        mockExecFileSyncImpl = null;
        connectSpy.mockRestore();
        endSpy.mockRestore();
        querySpy.mockRestore();
      }
    });
  });

  describe('7. Triple Checksum Validation & Integrity in inspectMigrationsStatus', () => {
    it('passes triple validation when ledger checksum === manifest checksum === file checksum', async () => {
      const canonicalManifest = await loadBaselineManifest();
      const entry0001 = canonicalManifest.get('0001_init.sql');

      const mockSql = createFlexibleMockSql({
        tableExists: true,
        tables: ['organizations'],
        columns: ['organizations.id', '_migrations.name', '_migrations.checksum'],
        appliedRows: [
          {
            name: '0001_init.sql',
            applied_at: '2026-09-12T00:00:00Z',
            checksum: entry0001.sha256,
          },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      const item0001 = status.items.find((i) => i.name === '0001_init.sql');
      expect(item0001.status).toBe('APPLIED');
      expect(item0001.baselineMatches).toBe(true);
    });

    it('fails with CHECKSUM_MISMATCH and RECONCILIATION_REQUIRED when ledger checksum does not match repo file', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        tables: ['organizations'],
        columns: ['organizations.id', '_migrations.name', '_migrations.checksum'],
        appliedRows: [
          {
            name: '0001_init.sql',
            applied_at: '2026-09-12T00:00:00Z',
            checksum: '0000000000000000000000000000000000000000000000000000000000000000', // tampered ledger!
          },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      expect(status.state).toBe('RECONCILIATION_REQUIRED');
      expect(status.exitCode).toBe(1);
      expect(status.checksumMismatches.length).toBeGreaterThan(0);
      expect(status.checksumMismatches[0].source).toBe('triple_validation_mismatch');
    });

    it('validates post-baseline migration (not in manifest) against ledger checksum === repo file', async () => {
      const file0038Body = fs.readFileSync('db/migrations/0038_migration_ledger_checksums.sql', 'utf8');
      const sha0038 = computeMigrationChecksum(file0038Body);

      const mockSql = createFlexibleMockSql({
        tableExists: true,
        tables: ['organizations'],
        columns: ['organizations.id', '_migrations.name', '_migrations.checksum'],
        constraints: ['_migrations_checksum_format_chk'],
        appliedRows: [
          {
            name: '0038_migration_ledger_checksums.sql',
            applied_at: '2026-09-12T00:00:00Z',
            checksum: sha0038,
          },
        ],
      });

      const status = await inspectMigrationsStatus(mockSql);
      const item0038 = status.items.find((i) => i.name === '0038_migration_ledger_checksums.sql');
      expect(item0038.status).toBe('APPLIED');
    });
  });

  describe('8. Status Report Formatting and Fail-Closed Resolution', () => {
    it('prints informative messages and does not crash when printing status', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockStatus = {
        state: 'RECONCILIATION_REQUIRED',
        tableExists: true,
        totalRepoFiles: 38,
        applied: [{ name: '0001_init.sql' }],
        pending: [{ name: '0002_password_reset.sql', sha256: 'abc1234567890' }],
        materializedUnregistered: [{ name: '0003_login_attempts.sql' }],
        missingFromDatabase: [],
        unknownInLedger: [],
        checksumMismatches: [],
        checksumUnverifiable: [{ name: '0099_unverified.sql', reason: 'Missing baseline checksum' }],
        gaps: [],
      };

      printStatus(mockStatus, {
        neonInfo: {
          projectId: 'holy-cake-85660318',
          branchId: 'br-main',
          branchName: 'main',
          endpointId: 'ep-main',
        },
      });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('NEON MIGRATION STATUS'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Neon Project ID: holy-cake-85660318'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Result: RECONCILIATION_REQUIRED'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Registered migrations without verifiable baseline checksum'));

      logSpy.mockRestore();
    });

    it('prints UNRESOLVED when branch resolution fails in status mode', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockStatus = {
        state: 'READY',
        tableExists: true,
        totalRepoFiles: 38,
        applied: [],
        pending: [],
        materializedUnregistered: [],
        missingFromDatabase: [],
        unknownInLedger: [],
        checksumMismatches: [],
        checksumUnverifiable: [],
        gaps: [],
      };

      printStatus(mockStatus, {
        neonInfo: {
          projectId: 'holy-cake-85660318',
          unresolved: true,
          error: 'Endpoint ep-unknown not found in project',
        },
      });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Neon Branch: UNRESOLVED (Endpoint ep-unknown not found in project)'));
      logSpy.mockRestore();
    });
  });

  describe('8. Repository Migration Registry & Sequence Validation (validateRepositoryMigrations)', () => {
    it('passes for canonical repository files and baseline manifest', async () => {
      const result = await validateRepositoryMigrations();
      expect(result.files.length).toBe(38);
      expect(result.files[0]).toBe('0001_init.sql');
      expect(result.files[37]).toBe('0038_migration_ledger_checksums.sql');
      expect(result.baselineMap.size).toBe(37);
      expect(result.fileChecksums.size).toBe(38);
    });

    it('rejects invalid migration filename patterns', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-repo-filename-'));
      try {
        fs.writeFileSync(path.join(tmpDir, '0001_valid.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(tmpDir, 'foo.sql'), 'SELECT 1;');

        await expect(
          validateRepositoryMigrations({ migrationsDir: tmpDir })
        ).rejects.toThrow(/Invalid migration filename 'foo.sql'/);

        fs.unlinkSync(path.join(tmpDir, 'foo.sql'));
        fs.writeFileSync(path.join(tmpDir, '039_example.sql'), 'SELECT 1;');
        await expect(
          validateRepositoryMigrations({ migrationsDir: tmpDir })
        ).rejects.toThrow(/Invalid migration filename '039_example.sql'/);

        fs.unlinkSync(path.join(tmpDir, '039_example.sql'));
        fs.writeFileSync(path.join(tmpDir, '0039-example.sql'), 'SELECT 1;');
        await expect(
          validateRepositoryMigrations({ migrationsDir: tmpDir })
        ).rejects.toThrow(/Invalid migration filename '0039-example.sql'/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rejects duplicate numeric prefixes', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-repo-dup-'));
      try {
        fs.writeFileSync(path.join(tmpDir, '0001_init.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(tmpDir, '0002_first.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(tmpDir, '0002_second.sql'), 'SELECT 2;');

        await expect(
          validateRepositoryMigrations({ migrationsDir: tmpDir })
        ).rejects.toThrow(/Duplicate migration prefix '0002'/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rejects sequence gaps and missing 0001', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-repo-gap-'));
      try {
        // Starts at 0002 instead of 0001
        fs.writeFileSync(path.join(tmpDir, '0002_start.sql'), 'SELECT 1;');
        await expect(
          validateRepositoryMigrations({ migrationsDir: tmpDir })
        ).rejects.toThrow(/Migration sequence gap: expected sequence prefix '0001'/);

        fs.unlinkSync(path.join(tmpDir, '0002_start.sql'));
        // Has 0001 and 0003, missing 0002
        fs.writeFileSync(path.join(tmpDir, '0001_init.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(tmpDir, '0003_after_gap.sql'), 'SELECT 1;');
        await expect(
          validateRepositoryMigrations({ migrationsDir: tmpDir })
        ).rejects.toThrow(/Migration sequence gap: expected sequence prefix '0002'/);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rejects migration files without defined sentinels in MIGRATION_SENTINELS', async () => {
      const restrictedSentinels = {
        '0001_init.sql': () => true,
      };

      await expect(
        validateRepositoryMigrations({ sentinels: restrictedSentinels })
      ).rejects.toThrow(/Migration '0002_password_reset.sql' does not have a defined sentinel in MIGRATION_SENTINELS/);
    });

    it('rejects nonexistent migration files present in MIGRATION_SENTINELS', async () => {
      const extendedSentinels = {
        ...MIGRATION_SENTINELS,
        '9999_nonexistent_migration.sql': () => true,
      };

      await expect(
        validateRepositoryMigrations({ sentinels: extendedSentinels })
      ).rejects.toThrow(
        /MIGRATION_SENTINELS contains sentinel for nonexistent migration file '9999_nonexistent_migration.sql'/
      );
    });

    it('rejects baseline manifest entries that do not exist on disk', async () => {
      const tmpManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'test-manifest-missing-'));
      const manifestPath = path.join(tmpManifest, 'baseline.json');
      try {
        const canonicalRaw = fs.readFileSync(BASELINE_MANIFEST_PATH, 'utf8');
        const list = JSON.parse(canonicalRaw);
        list.push({
          name: '9999_ghost_migration.sql',
          sha256: 'a'.repeat(64),
          baselineVersion: 'v1.0.0',
          reconciliationMethod: 'verified_prior_execution',
        });
        fs.writeFileSync(manifestPath, JSON.stringify(list));

        await expect(
          validateRepositoryMigrations({ baselineManifestPath: manifestPath })
        ).rejects.toThrow(
          /Baseline manifest contains migration '9999_ghost_migration.sql' which does not exist/
        );
      } finally {
        fs.rmSync(tmpManifest, { recursive: true, force: true });
      }
    });

    it('rejects baseline manifest entry if disk checksum does not match manifest', async () => {
      const tmpManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'test-manifest-mismatch-'));
      const manifestPath = path.join(tmpManifest, 'baseline.json');
      try {
        const canonicalRaw = fs.readFileSync(BASELINE_MANIFEST_PATH, 'utf8');
        const list = JSON.parse(canonicalRaw);
        list[0].sha256 = 'f'.repeat(64); // Tamper 0001 hash
        fs.writeFileSync(manifestPath, JSON.stringify(list));

        await expect(
          validateRepositoryMigrations({ baselineManifestPath: manifestPath })
        ).rejects.toThrow(
          /Checksum mismatch for migration '0001_init.sql'/
        );
      } finally {
        fs.rmSync(tmpManifest, { recursive: true, force: true });
      }
    });
  });

  describe('9. Comprehensive Transaction Syntax Control & CASE Expression Safety', () => {
    it('scanSqlTokens fails closed on unclosed string literals, identifiers, comments, and dollar blocks', () => {
      expect(() => scanSqlTokens("SELECT 'unclosed string;")).toThrow(/Unterminated string literal/);
      expect(() => scanSqlTokens('SELECT "unclosed identifier;')).toThrow(/Unterminated quoted identifier/);
      expect(() => scanSqlTokens('SELECT /* unclosed block comment;')).toThrow(/Unterminated block comment/);
      expect(() => scanSqlTokens('SELECT $$ unclosed dollar quote;')).toThrow(/Unterminated dollar-quoted block/);
      expect(() => scanSqlTokens('SELECT $func$ unclosed named dollar;')).toThrow(/Unterminated dollar-quoted block/);
    });

    it('normalizeMigrationSql blocks all 11 transaction control statements for migrations >= 0038', () => {
      const forbiddenVariants = [
        'BEGIN',
        'START TRANSACTION',
        'COMMIT',
        'END',
        'ROLLBACK',
        'ABORT',
        'SAVEPOINT sp_test',
        'RELEASE SAVEPOINT sp_test',
        'RELEASE sp_test',
        "PREPARE TRANSACTION 'test_tx'",
        "COMMIT PREPARED 'test_tx'",
        "ROLLBACK PREPARED 'test_tx'",
      ];

      for (const stmt of forbiddenVariants) {
        const sql = `${stmt};\nCREATE TABLE test_table (id INT);`;
        expect(() => normalizeMigrationSql(sql, '0038_migration_ledger_checksums.sql')).toThrow(
          /forbidden transaction control statement/i
        );
      }
    });

    it('normalizeMigrationSql allows CASE ... END expressions without false positive for END', () => {
      const sqlWithCase = `
        CREATE TABLE shift_eval (
          id INT PRIMARY KEY,
          status TEXT,
          category TEXT GENERATED ALWAYS AS (
            CASE
              WHEN status = 'active' THEN 'CURRENT'
              WHEN status = 'archived' THEN 'OLD'
              ELSE 'UNKNOWN'
            END
          ) STORED
        );
      `;
      const result = normalizeMigrationSql(sqlWithCase, '0038_migration_ledger_checksums.sql');
      expect(result.hadWrapper).toBe(false);
      expect(result.normalizedSql).toBe(sqlWithCase);
    });

    it('normalizeMigrationSql fails closed if normalized SQL is empty', () => {
      expect(() => normalizeMigrationSql('   \n-- only comments\n   ', '0038_test.sql')).toThrow(
        /Normalized migration SQL is empty/
      );
      expect(() => normalizeMigrationSql('BEGIN;\n-- wrapper with nothing inside\nCOMMIT;', '0010_test.sql')).toThrow(
        /Normalized migration SQL is empty/
      );
    });
  });
});

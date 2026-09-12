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
  isMigrationMaterialized,
  ACCREDITATION_TOKEN,
  MIGRATION_SENTINELS,
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

      // 0038 requires _migrations.checksum -> FALSE
      expect(isMigrationMaterialized('0038_migration_ledger_checksums.sql', catalog0001)).toBe(false);
    });

    it('correctly detects 0006, 0007, 0013, 0031, and 0038 when their exact fingerprints are materialized', () => {
      const catalogAdvanced = {
        tables: new Set(['organizations', 'memberships', 'employees', 'organization_audit_events']),
        columns: new Set(['employees.deactivated_at', '_migrations.checksum']),
        indexes: new Set(),
        routines: new Set(),
        constraints: new Set(['employees_status_check', 'memberships_role_check', 'organization_audit_events_event_type_check']),
        constraintDefs: new Map([
          ['employees_status_check', "CHECK (status IN ('pending_access', 'active', 'inactive'))"],
          ['memberships_role_check', "CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))"],
          ['organization_audit_events_event_type_check', "CHECK (event_type IN ('MEMBER_ADDED', 'approval_request.created'))"],
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
        routines: ['transfer_organization_ownership_temporal'], // from 0037
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
      expect(res[ACCREDITATION_TOKEN]).toBe(true);
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
      expect(res[ACCREDITATION_TOKEN]).toBe(true);
      expect(res.branch.id).toBe('br-ephemeral-123');
    });
  });

  describe('5. Atomic Migration Transactions & Unforgeable Accreditation', () => {
    it('rejects execution if accreditation is forged without ACCREDITATION_TOKEN', async () => {
      const mockSql = createFlexibleMockSql({ tableExists: false });
      await expect(
        runMigrations(mockSql, {
          accreditation: { accredited: true }, // forged plain object!
        })
      ).rejects.toThrow(/Invalid accreditation token: destination branch accreditation cannot be forged or bypassed/);
    });

    it('executes DDL and ledger INSERT atomically inside a BEGIN ... COMMIT block', async () => {
      const queries = [];
      const mockSql = createFlexibleMockSql({
        tableExists: false,
        onQuery: (text, params) => {
          queries.push({ text, params });
        },
      });

      const accreditedObj = {
        [ACCREDITATION_TOKEN]: true,
        accredited: true,
        branch: { id: 'br-ephemeral-123', name: 'tmp-test' },
      };

      const res = await runMigrations(mockSql, {
        accreditation: accreditedObj,
      });

      expect(res.appliedCount).toBe(38);

      // Verify BEGIN and COMMIT were invoked for every applied migration
      const beginCount = queries.filter((q) => q.text === 'BEGIN').length;
      const commitCount = queries.filter((q) => q.text === 'COMMIT').length;
      expect(beginCount).toBe(38);
      expect(commitCount).toBe(38);

      // Verify INSERT INTO _migrations occurred within transaction
      const inserts = queries.filter((q) => q.text.startsWith('INSERT INTO _migrations'));
      expect(inserts.length).toBe(38);
    });

    it('rolls back completely if DDL or ledger INSERT fails in transaction', async () => {
      const queries = [];
      const mockSql = createFlexibleMockSql({
        tableExists: false,
        onQuery: (text) => {
          queries.push(text);
          if (text.startsWith('INSERT INTO _migrations')) {
            throw new Error('Disk quota exceeded on ledger insert');
          }
        },
      });

      const accreditedObj = {
        [ACCREDITATION_TOKEN]: true,
        accredited: true,
        branch: { id: 'br-ephemeral-123', name: 'tmp-test' },
      };

      await expect(
        runMigrations(mockSql, {
          accreditation: accreditedObj,
        })
      ).rejects.toThrow(/Disk quota exceeded on ledger insert/);

      expect(queries).toContain('ROLLBACK');
    });

    it('refuses execution when database is in RECONCILIATION_REQUIRED state', async () => {
      const mockSql = createFlexibleMockSql({
        tableExists: true,
        appliedRows: [{ name: '0001_init.sql', applied_at: '2026-08-20T15:35:50Z' }],
        tables: ['organizations', 'login_attempts'], // 0003 materialized unregistered!
      });

      const accreditedObj = {
        [ACCREDITATION_TOKEN]: true,
        accredited: true,
      };

      await expect(
        runMigrations(mockSql, {
          accreditation: accreditedObj,
        })
      ).rejects.toThrow(/database is in RECONCILIATION_REQUIRED state/);
    });

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
  });
});

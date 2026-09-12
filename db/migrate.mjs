// Migration runner & status reporter: manages db/migrations/*.sql in filename order.
// Usage:
//   Apply:  node db/migrate.mjs --target-branch=<branch>
//   Status: node db/migrate.mjs --status (strictly read-only)
//
// Connection string comes from process.env (DATABASE_URL or POSTGRES_URL).
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
export const BASELINE_MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), '../docs/database/migration-baseline-main.json');
export const PROJECT_ID = process.env.NEON_PROJECT_ID || 'holy-cake-85660318';

/**
 * Computes SHA-256 checksum for a migration file buffer or string.
 */
export function computeMigrationChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Loads the baseline manifest JSON if it exists.
 */
export async function loadBaselineManifest(manifestPath = BASELINE_MANIFEST_PATH) {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const entry of parsed) {
      map.set(entry.name, entry);
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Primary object sentinel definitions for migrations 0001 through 0037.
 * Used to detect whether a migration is materialized in the database schema.
 */
export const MIGRATION_SENTINELS = {
  '0001_init.sql': (cat) => cat.tables.has('organizations'),
  '0002_password_reset.sql': (cat) => cat.tables.has('password_reset_tokens'),
  '0003_login_attempts.sql': (cat) => cat.tables.has('login_attempts'),
  '0004_organization_plan.sql': (cat) => cat.columns.has('organizations.plan'),
  '0005_employee_lifecycle.sql': (cat) => cat.columns.has('employees.deactivated_at'),
  '0006_employee_pending_access.sql': (cat) => cat.constraints.has('employees_status_check'),
  '0007_remove_manager_role.sql': (cat) => cat.tables.has('memberships'),
  '0008_areas_optional.sql': (cat) => cat.tables.has('areas'),
  '0009_format_profiles.sql': (cat) => cat.tables.has('format_profiles'),
  '0010_import_history.sql': (cat) => cat.columns.has('imports.import_mode'),
  '0011_import_idempotency.sql': (cat) => cat.columns.has('imports.employee_id'),
  '0012_format_profiles_structurehash_uniqueness.sql': (cat) => cat.indexes.has('format_profiles_org_structurehash_active_idx'),
  '0013_membership_roles_owner.sql': (cat) => cat.tables.has('memberships'),
  '0014_single_owner_per_organization.sql': (cat) => cat.indexes.has('memberships_one_owner_per_org_idx'),
  '0015_membership_scoped_area.sql': (cat) => cat.columns.has('memberships.scoped_area_id'),
  '0016_organization_audit_events.sql': (cat) => cat.tables.has('organization_audit_events'),
  '0017_schedules.sql': (cat) => cat.tables.has('schedules'),
  '0018_schedule_versions.sql': (cat) => cat.tables.has('schedule_versions'),
  '0019_shift_assignments.sql': (cat) => cat.tables.has('shift_assignments'),
  '0020_shifts_schedule_version.sql': (cat) => cat.columns.has('shifts.schedule_version_id'),
  '0021_shift_assignments_import_id.sql': (cat) => cat.columns.has('shift_assignments.import_id'),
  '0022_shift_acknowledgements.sql': (cat) => cat.indexes.has('shifts_id_employee_unique_idx'),
  '0023_shift_comments.sql': (cat) => cat.tables.has('shift_comments'),
  '0024_change_requests.sql': (cat) => cat.tables.has('change_requests'),
  '0025_notifications.sql': (cat) => cat.tables.has('notifications'),
  '0026_oauth_identities.sql': (cat) => cat.tables.has('oauth_identities'),
  '0027_approval_policy.sql': (cat) => cat.columns.has('organizations.approval_policy'),
  '0028_approval_requests.sql': (cat) => cat.tables.has('approval_requests'),
  '0029_approval_decision_metadata.sql': (cat) => cat.columns.has('approval_requests.approved_by_user_id'),
  '0030_approval_rejection_metadata.sql': (cat) => cat.columns.has('approval_requests.rejected_by_user_id'),
  '0031_approval_audit_event_types.sql': (cat) => cat.constraints.has('organization_audit_events_event_type_check'),
  '0032_change_request_application.sql': (cat) => cat.columns.has('change_requests.requested_start_time'),
  '0033_import_outcome.sql': (cat) => cat.columns.has('imports.outcome_reason'),
  '0034_shift_type_semantics.sql': (cat) => cat.columns.has('shifts.shift_type'),
  '0035_operational_assignments.sql': (cat) => cat.tables.has('operational_assignments'),
  '0036_temporal_organizational_model.sql': (cat) => cat.tables.has('organization_people'),
  '0037_temporal_ownership_transfer_and_labor_integrity.sql': (cat) => cat.routines.has('transfer_organization_ownership_temporal'),
};

/**
 * Extracts schema catalog items in a strictly read-only fashion.
 */
export async function extractSchemaCatalog(sql) {
  const [hasMigrationsRes, tablesRes, columnsRes, routinesRes, indexesRes, constraintsRes] = await Promise.all([
    sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_migrations'`,
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    sql`SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public'`,
    sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    sql`SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
  ]);

  const tableExists = hasMigrationsRes.length > 0;
  let appliedRows = [];
  if (tableExists) {
    appliedRows = await sql`SELECT name, applied_at FROM _migrations ORDER BY name`;
  }

  const tables = new Set(tablesRes.map((r) => r.table_name));
  const columns = new Set(columnsRes.map((r) => `${r.table_name}.${r.column_name}`));
  const routines = new Set(routinesRes.map((r) => r.routine_name));
  const indexes = new Set(indexesRes.map((r) => r.indexname));
  const constraints = new Set(constraintsRes.map((r) => r.conname));

  return {
    tableExists,
    appliedRows,
    tables,
    columns,
    routines,
    indexes,
    constraints,
  };
}

/**
 * Checks whether a migration's objects are materialized in the database.
 */
export function isMigrationMaterialized(name, catalog) {
  const sentinel = MIGRATION_SENTINELS[name];
  if (typeof sentinel === 'function') {
    return sentinel(catalog);
  }
  return false;
}

/**
 * Inspects migration status in read-only mode without executing DDL or writes.
 * Validates repository files, ledger, baseline manifest, and materialized database objects.
 */
export async function inspectMigrationsStatus(
  sql,
  {
    migrationsDir = MIGRATIONS_DIR,
    baselineManifestPath = BASELINE_MANIFEST_PATH,
    catalog = null,
  } = {}
) {
  const repoFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const fileChecksums = new Map();
  for (const file of repoFiles) {
    const content = await readFile(join(migrationsDir, file));
    fileChecksums.set(file, computeMigrationChecksum(content));
  }

  const baselineMap = await loadBaselineManifest(baselineManifestPath);
  const dbCatalog = catalog || (await extractSchemaCatalog(sql));

  const appliedMap = new Map(dbCatalog.appliedRows.map((r) => [r.name, r.applied_at]));
  const appliedNames = new Set(appliedMap.keys());

  const items = [];
  const applied = [];
  const pending = [];
  const materializedUnregistered = [];
  const missingFromDatabase = [];
  const unknownInLedger = [];
  const checksumMismatches = [];

  for (const file of repoFiles) {
    const isRegistered = appliedNames.has(file);
    const isMaterialized = isMigrationMaterialized(file, dbCatalog);
    const repoChecksum = fileChecksums.get(file);
    const baselineEntry = baselineMap ? baselineMap.get(file) : null;
    const checksumMatches = baselineEntry ? baselineEntry.sha256 === repoChecksum : true;

    if (!checksumMatches) {
      checksumMismatches.push({
        name: file,
        expectedSha256: baselineEntry.sha256,
        actualSha256: repoChecksum,
      });
    }

    let status = 'UNKNOWN';
    if (isRegistered && isMaterialized) {
      status = checksumMatches ? 'APPLIED' : 'CHECKSUM_MISMATCH';
      applied.push({ name: file, applied_at: appliedMap.get(file), sha256: repoChecksum });
    } else if (isRegistered && !isMaterialized) {
      status = 'MISSING_FROM_DATABASE';
      missingFromDatabase.push({ name: file, applied_at: appliedMap.get(file), sha256: repoChecksum });
    } else if (!isRegistered && isMaterialized) {
      status = 'MATERIALIZED_UNREGISTERED';
      materializedUnregistered.push({ name: file, sha256: repoChecksum });
    } else {
      status = checksumMatches ? 'PENDING' : 'CHECKSUM_MISMATCH';
      pending.push({ name: file, sha256: repoChecksum });
    }

    items.push({
      name: file,
      status,
      isRegistered,
      isMaterialized,
      sha256: repoChecksum,
      baselineMatches: checksumMatches,
    });
  }

  for (const name of appliedNames) {
    if (!fileChecksums.has(name)) {
      unknownInLedger.push({
        name,
        applied_at: appliedMap.get(name),
      });
    }
  }

  // Detect sequence gaps: an applied or materialized file after a pending/unmaterialized predecessor
  const gaps = [];
  let foundPending = false;
  const pendingBeforeApplied = [];
  for (const file of repoFiles) {
    if (!appliedNames.has(file)) {
      foundPending = true;
      pendingBeforeApplied.push(file);
    } else if (foundPending) {
      gaps.push({
        appliedFile: file,
        missingPredecessors: [...pendingBeforeApplied],
      });
    }
  }

  // Determine overall state
  const hasReconciliationIssues =
    materializedUnregistered.length > 0 ||
    missingFromDatabase.length > 0 ||
    unknownInLedger.length > 0 ||
    checksumMismatches.length > 0 ||
    gaps.length > 0;

  let state = 'UNKNOWN';
  if (hasReconciliationIssues) {
    state = 'RECONCILIATION_REQUIRED';
  } else if (pending.length === 0) {
    state = 'UP_TO_DATE';
  } else {
    state = 'READY';
  }

  return {
    state,
    tableExists: dbCatalog.tableExists,
    totalRepoFiles: repoFiles.length,
    items,
    applied,
    pending,
    materializedUnregistered,
    missingFromDatabase,
    unknownInLedger,
    checksumMismatches,
    gaps,
    isContinuous: gaps.length === 0,
    isUpToDate: state === 'UP_TO_DATE',
    canMigrateNormally: state === 'READY' || state === 'UP_TO_DATE',
    exitCode: state === 'RECONCILIATION_REQUIRED' ? 1 : 0,
  };
}

/**
 * Prints formatted human-readable migration status.
 */
export function printStatus(status) {
  console.log('=== NEON MIGRATION STATUS ===');
  console.log(`_migrations table: ${status.tableExists ? 'EXISTS' : 'NOT CREATED'}`);
  console.log(`Total repository migrations: ${status.totalRepoFiles}`);
  console.log(`Applied migrations in ledger: ${status.applied.length}`);
  console.log(`Pending migrations: ${status.pending.length}`);

  if (status.materializedUnregistered.length > 0) {
    console.log(`\n[CRITICAL] Materialized objects without ledger registration (${status.materializedUnregistered.length}):`);
    for (const m of status.materializedUnregistered) {
      console.log(`  ! ${m.name} is materialized in DB but missing from _migrations`);
    }
  }

  if (status.missingFromDatabase.length > 0) {
    console.log(`\n[CRITICAL] Migrations recorded in ledger but missing from DB schema (${status.missingFromDatabase.length}):`);
    for (const m of status.missingFromDatabase) {
      console.log(`  ! ${m.name} is in _migrations but its objects do NOT exist in DB`);
    }
  }

  if (status.unknownInLedger.length > 0) {
    console.log(`\n[ERROR] Migrations registered in database but missing from repository (${status.unknownInLedger.length}):`);
    for (const m of status.unknownInLedger) {
      console.log(`  ! ${m.name} (applied_at: ${m.applied_at})`);
    }
  }

  if (status.checksumMismatches.length > 0) {
    console.log(`\n[ERROR] Checksum mismatches against baseline manifest (${status.checksumMismatches.length}):`);
    for (const m of status.checksumMismatches) {
      console.log(`  ! ${m.name} actual SHA-256 does not match verified baseline`);
    }
  }

  if (status.gaps.length > 0) {
    console.log(`\n[ERROR] Migration sequence gaps detected (${status.gaps.length}):`);
    for (const g of status.gaps) {
      console.log(`  ! ${g.appliedFile} was applied while earlier migrations were skipped: [${g.missingPredecessors.join(', ')}]`);
    }
  }

  if (status.pending.length > 0) {
    console.log(`\nPending migrations (${status.pending.length}):`);
    for (const p of status.pending) {
      console.log(`  - ${p.name} (sha256: ${p.sha256.substring(0, 12)}...)`);
    }
  }

  console.log(`\nResult: ${status.state}`);
  if (status.state === 'RECONCILIATION_REQUIRED') {
    console.log('Action: Do not run db:migrate directly. Database requires formal schema reconciliation.');
  } else if (status.state === 'UP_TO_DATE') {
    console.log('All migrations applied and continuous.');
  } else {
    console.log(`Ready to apply ${status.pending.length} pending migrations.`);
  }
}

/**
 * Resolves destination Neon branch from connection string and validates endpoint mapping.
 */
export function resolveNeonBranchFromConnectionString(
  connectionString,
  {
    projectId = PROJECT_ID,
    neonctlExec = execFileSync,
    endpoints = null,
    branches = null,
    expectedEndpointId = null,
    expectedBranchId = null,
  } = {}
) {
  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch (err) {
    throw new Error(`Invalid connection string: ${err.message}`);
  }

  const hostname = parsedUrl.hostname;
  if (!hostname) {
    throw new Error(`Could not extract hostname from connection string: ${connectionString}`);
  }

  let endpointList = endpoints;
  if (!endpointList) {
    const raw = neonctlExec('npx', ['neonctl', 'api', `/projects/${projectId}/endpoints`], {
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(raw);
    endpointList = Array.isArray(parsed) ? parsed : parsed.endpoints || [];
  }

  const matchedEndpoint = endpointList.find((ep) => {
    if (ep.host === hostname) return true;
    if (ep.hosts?.read_write_host === hostname) return true;
    if (ep.hosts?.read_write_pooled_host === hostname) return true;
    if (ep.id && (hostname.startsWith(ep.id + '.') || hostname.startsWith(ep.id + '-'))) return true;
    return false;
  });

  if (!matchedEndpoint) {
    throw new Error(`Could not identify Neon endpoint for host '${hostname}' in project '${projectId}'. Refusing to connect.`);
  }

  if (expectedEndpointId && matchedEndpoint.id !== expectedEndpointId) {
    throw new Error(
      `Endpoint mismatch: expected endpoint '${expectedEndpointId}', but host '${hostname}' mapped to endpoint '${matchedEndpoint.id}'.`
    );
  }

  const branchId = matchedEndpoint.branch_id;
  if (!branchId) {
    throw new Error(`Neon endpoint '${matchedEndpoint.id}' has no associated branch_id.`);
  }

  if (expectedBranchId && branchId !== expectedBranchId) {
    throw new Error(
      `Branch mismatch: expected branch '${expectedBranchId}', but endpoint '${matchedEndpoint.id}' belongs to branch '${branchId}'.`
    );
  }

  let branchList = branches;
  if (!branchList) {
    const raw = neonctlExec('npx', ['neonctl', 'branches', 'list', '--project-id', projectId, '--output', 'json'], {
      encoding: 'utf-8',
    });
    branchList = JSON.parse(raw);
  }

  const matchedBranch = branchList.find((b) => b.id === branchId);
  if (!matchedBranch) {
    throw new Error(`Branch '${branchId}' associated with endpoint '${matchedEndpoint.id}' was not found in project '${projectId}'.`);
  }

  return {
    branch: matchedBranch,
    endpoint: matchedEndpoint,
  };
}

/**
 * Accredit destination branch before allowing write operations.
 */
export function accreditDestinationBranch({
  connectionString,
  targetBranch = null,
  expectedBranchId = null,
  expectedBranchName = null,
  allowMainMigration = false,
  projectId = PROJECT_ID,
  neonctlExec = execFileSync,
  endpoints = null,
  branches = null,
} = {}) {
  if (!connectionString) {
    throw new Error('connectionString is required for destination accreditation');
  }

  // Require explicit branch or target environment selection for migration write operations
  if (!targetBranch && !expectedBranchId && !expectedBranchName) {
    throw new Error(
      'Target branch must be explicitly specified (e.g. --target-branch=<name_or_id> or TARGET_BRANCH env var). Refusing to migrate generic or default target.'
    );
  }

  const { branch, endpoint } = resolveNeonBranchFromConnectionString(connectionString, {
    projectId,
    neonctlExec,
    endpoints,
    branches,
    expectedBranchId,
  });

  const branchName = branch.name || '';
  const branchId = branch.id || '';
  const isDefault = Boolean(branch.default || branch.is_default || branch.primary);
  const isProtected = Boolean(branch.protected);

  if (targetBranch) {
    const target = targetBranch.trim().toLowerCase();
    const matchesId = branchId.toLowerCase() === target;
    const matchesName = branchName.toLowerCase() === target;
    if (!matchesId && !matchesName) {
      throw new Error(
        `Destination accreditation failure: target branch '${targetBranch}' does not match resolved branch '${branchName}' (${branchId}).`
      );
    }
  }

  if (expectedBranchName && branchName !== expectedBranchName) {
    throw new Error(
      `Destination accreditation failure: expected branch name '${expectedBranchName}', but resolved branch is '${branchName}'.`
    );
  }

  // Safeguard: refuse to run migration against main, primary, or protected branches without explicit flag
  const isMainBranch =
    branchName === 'main' ||
    branchName === 'production' ||
    branchName === 'preview/production' ||
    isDefault ||
    isProtected;

  if (isMainBranch && !allowMainMigration) {
    throw new Error(
      `Refusing to apply migrations to production/main branch '${branchName}' (${branchId}) without explicit authorization flag (--allow-main-migration).`
    );
  }

  return {
    accredited: true,
    branch,
    endpoint,
  };
}

/**
 * Runs migrations forward in filename order with strict safety validations.
 * Each migration DDL and its corresponding ledger INSERT are executed atomically inside a single transaction.
 */
export async function runMigrations(
  sql,
  {
    migrationsDir = MIGRATIONS_DIR,
    baselineManifestPath = BASELINE_MANIFEST_PATH,
    connectionString = null,
    targetBranch = null,
    allowMainMigration = false,
    accreditation = null,
    accreditOptions = {},
  } = {}
) {
  // If connection string is provided, strictly accredit target before running migrations
  if (connectionString && !accreditation) {
    accreditDestinationBranch({
      connectionString,
      targetBranch,
      allowMainMigration,
      ...accreditOptions,
    });
  }

  // Preflight check: analyze state before touching anything
  const status = await inspectMigrationsStatus(sql, {
    migrationsDir,
    baselineManifestPath,
  });

  if (status.state === 'RECONCILIATION_REQUIRED') {
    const reasons = [];
    if (status.materializedUnregistered.length > 0) {
      reasons.push(`${status.materializedUnregistered.length} materialized unregistered migrations`);
    }
    if (status.missingFromDatabase.length > 0) {
      reasons.push(`${status.missingFromDatabase.length} missing migrations recorded in ledger`);
    }
    if (status.unknownInLedger.length > 0) {
      reasons.push(`${status.unknownInLedger.length} unknown migrations in ledger`);
    }
    if (status.checksumMismatches.length > 0) {
      reasons.push(`${status.checksumMismatches.length} checksum mismatches against baseline`);
    }
    if (status.gaps.length > 0) {
      reasons.push(`${status.gaps.length} sequence gaps`);
    }
    throw new Error(
      `Cannot apply migrations: database is in RECONCILIATION_REQUIRED state (${reasons.join(', ')}). Manual or automated reconciliation required.`
    );
  }

  if (status.pending.length === 0) {
    console.log('migrations up to date (0 pending)');
    return { appliedCount: 0, pendingCount: 0 };
  }

  console.log(`Pending migrations to apply (${status.pending.length}):`);
  for (const p of status.pending) {
    console.log(`  - ${p.name}`);
  }

  // Ensure _migrations exists
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  let appliedCount = 0;
  for (const item of status.pending) {
    const file = item.name;
    const body = await readFile(join(migrationsDir, file), 'utf8');
    const statements = body
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    console.log(`apply ${file} (${statements.length} statements)`);

    // ATOMIC EXECUTION: DDL and _migrations INSERT run inside a single transaction
    const transactionQueries = [
      ...statements.map((statement) => sql.query(statement)),
      sql.query('INSERT INTO _migrations (name) VALUES ($1)', [file]),
    ];

    await sql.transaction(transactionQueries);
    console.log(`done ${file}`);
    appliedCount++;
  }

  console.log(`migrations up to date (${appliedCount} applied)`);
  return { appliedCount, pendingCount: 0 };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const isStatusMode = args.includes('--status');
  const allowMainMigration =
    args.includes('--allow-main-migration') || env.ALLOW_MAIN_MIGRATION === 'true';

  let targetBranch = null;
  const targetBranchArg = args.find((a) => a.startsWith('--target-branch='));
  if (targetBranchArg) {
    targetBranch = targetBranchArg.split('=')[1];
  } else if (env.TARGET_BRANCH) {
    targetBranch = env.TARGET_BRANCH;
  } else if (env.MIGRATION_TARGET_BRANCH) {
    targetBranch = env.MIGRATION_TARGET_BRANCH;
  }

  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const sql = neon(connectionString);

  if (isStatusMode) {
    const status = await inspectMigrationsStatus(sql);
    printStatus(status);
    if (status.exitCode !== 0) {
      process.exitCode = status.exitCode;
    }
    return;
  }

  await runMigrations(sql, {
    connectionString,
    targetBranch,
    allowMainMigration,
  });
}

// Direct execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  main().catch((error) => {
    console.error('migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

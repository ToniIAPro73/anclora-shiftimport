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
import { neon, Client } from '@neondatabase/serverless';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
export const BASELINE_MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), '../docs/database/migration-baseline-main.json');

/**
 * Scans SQL string into tokens outside comments, string literals, and dollar-quoted blocks.
 */
export function scanSqlTokens(sql) {
  let i = 0;
  const len = sql.length;
  const tokens = [];

  while (i < len) {
    // Line comment
    if (sql[i] === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n') i++;
      continue;
    }
    // Block comment (support nesting)
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      let depth = 1;
      while (i < len && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }
    // Standard string literal
    if (sql[i] === "'") {
      i++;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      continue;
    }
    // Quoted identifier
    if (sql[i] === '"') {
      i++;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      continue;
    }
    // Dollar-quoted block: $$ or $tag$
    if (sql[i] === '$') {
      const match = sql.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
      if (match) {
        const tag = match[0];
        i += tag.length;
        const closeIdx = sql.indexOf(tag, i);
        if (closeIdx === -1) {
          throw new Error(`Unterminated dollar-quoted block (${tag}) in SQL`);
        }
        i = closeIdx + tag.length;
        continue;
      }
    }
    // Identifier / keyword token
    if (/[a-zA-Z_]/.test(sql[i])) {
      const start = i;
      while (i < len && /[a-zA-Z0-9_]/.test(sql[i])) i++;
      tokens.push({ word: sql.slice(start, i), start, end: i });
      continue;
    }
    // Semicolon
    if (sql[i] === ';') {
      tokens.push({ word: ';', start: i, end: i + 1 });
      i++;
      continue;
    }
    i++;
  }
  return tokens;
}

/**
 * Normalizes migration SQL by safely removing legacy top-level BEGIN and COMMIT wrappers.
 * Enforces that new migrations (>= 0038) contain no internal transaction control.
 */
export function normalizeMigrationSql(sql, migrationName = '') {
  const tokens = scanSqlTokens(sql);
  const txTokens = tokens.filter((t) => /^(BEGIN|COMMIT|ROLLBACK)$/i.test(t.word));

  if (txTokens.length === 0) {
    return { normalizedSql: sql, hadWrapper: false };
  }

  const matchNum = migrationName.match(/^(\d{4})/);
  const num = matchNum ? parseInt(matchNum[1], 10) : null;
  if (num !== null && num >= 38) {
    throw new Error(
      `Migration '${migrationName}' contains forbidden transaction control statement '${txTokens[0].word.toUpperCase()}'. Migrations from 0038 onwards must not manage transactions internally.`
    );
  }

  if (txTokens.some((t) => t.word.toUpperCase() === 'ROLLBACK')) {
    throw new Error(
      `Migration '${migrationName}' contains explicit ROLLBACK statement; cannot normalize legacy transaction wrapper.`
    );
  }

  const beginTokens = txTokens.filter((t) => t.word.toUpperCase() === 'BEGIN');
  const commitTokens = txTokens.filter((t) => t.word.toUpperCase() === 'COMMIT');

  if (beginTokens.length !== 1 || commitTokens.length !== 1) {
    throw new Error(
      `Migration '${migrationName}' contains multiple or unbalanced transaction statements (${beginTokens.length} BEGIN, ${commitTokens.length} COMMIT); cannot normalize legacy transaction wrapper.`
    );
  }

  const beginTok = beginTokens[0];
  const commitTok = commitTokens[0];

  if (beginTok.start >= commitTok.start) {
    throw new Error(`Migration '${migrationName}' has COMMIT before BEGIN; invalid transaction structure.`);
  }

  // Statements before BEGIN?
  const tokensBeforeBegin = tokens.filter((t) => t.start < beginTok.start && t.word !== ';');
  if (tokensBeforeBegin.length > 0) {
    throw new Error(
      `Migration '${migrationName}' contains statements before top-level BEGIN; cannot normalize legacy transaction wrapper.`
    );
  }

  // Find end of BEGIN statement (including optional WORK/TRANSACTION and ;)
  let beginEnd = beginTok.end;
  while (beginEnd < sql.length && /[ \t]/.test(sql[beginEnd])) beginEnd++;
  const afterBegin = sql.slice(beginEnd);
  const optBeginWord = afterBegin.match(/^(WORK|TRANSACTION)\b/i);
  if (optBeginWord) {
    beginEnd += optBeginWord[0].length;
    while (beginEnd < sql.length && /[ \t]/.test(sql[beginEnd])) beginEnd++;
  }
  if (sql[beginEnd] === ';') {
    beginEnd++;
  }
  if (sql[beginEnd] === '\r') beginEnd++;
  if (sql[beginEnd] === '\n') beginEnd++;

  // Find end of COMMIT statement (including optional WORK/TRANSACTION and ;)
  let commitEnd = commitTok.end;
  while (commitEnd < sql.length && /[ \t]/.test(sql[commitEnd])) commitEnd++;
  const afterCommit = sql.slice(commitEnd);
  const optCommitWord = afterCommit.match(/^(WORK|TRANSACTION)\b/i);
  if (optCommitWord) {
    commitEnd += optCommitWord[0].length;
    while (commitEnd < sql.length && /[ \t]/.test(sql[commitEnd])) commitEnd++;
  }
  if (sql[commitEnd] === ';') {
    commitEnd++;
  }
  if (sql[commitEnd] === '\r') commitEnd++;
  if (sql[commitEnd] === '\n') commitEnd++;

  // Check if any statement exists after COMMIT statement
  const tokensAfterCommit = tokens.filter((t) => t.start >= commitEnd && t.word !== ';');
  if (tokensAfterCommit.length > 0) {
    throw new Error(
      `Migration '${migrationName}' contains statements after top-level COMMIT (intermediate COMMIT or trailing statements); cannot normalize legacy transaction wrapper.`
    );
  }

  // Remove COMMIT first, then BEGIN to preserve byte offsets
  let normalized = sql.slice(0, commitTok.start) + sql.slice(commitEnd);
  normalized = normalized.slice(0, beginTok.start) + normalized.slice(beginEnd);

  return { normalizedSql: normalized, hadWrapper: true };
}

/**
 * Resolves the Neon project ID explicitly from args or env without hardcoded fallback.
 */
export function getNeonProjectId(env = process.env, args = []) {
  const arg = args.find((a) => a.startsWith('--project-id='));
  if (arg) {
    return arg.split('=')[1].trim();
  }
  if (env.NEON_PROJECT_ID && env.NEON_PROJECT_ID.trim()) {
    return env.NEON_PROJECT_ID.trim();
  }
  return null;
}

/**
 * Computes SHA-256 checksum for a migration file buffer or string.
 */
export function computeMigrationChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Loads the baseline manifest JSON in a strictly fail-closed manner.
 * Throws on missing file, invalid JSON, duplicate entries, or malformed fields.
 */
export async function loadBaselineManifest(manifestPath = BASELINE_MANIFEST_PATH) {
  let raw;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (err) {
    throw new Error(`Baseline manifest file not found or inaccessible at '${manifestPath}': ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid baseline manifest JSON in '${manifestPath}': ${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Baseline manifest in '${manifestPath}' must contain a JSON array`);
  }

  const map = new Map();
  const hex64Regex = /^[0-9a-f]{64}$/;

  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Invalid baseline manifest entry at index ${i}: entry must be an object`);
    }

    const { name, sha256, baselineVersion, reconciliationMethod } = entry;
    if (!name || typeof name !== 'string' || !/^\d{4}_.*\.sql$/.test(name)) {
      throw new Error(`Invalid baseline manifest entry at index ${i}: invalid or missing migration 'name' ('${name}')`);
    }

    if (map.has(name)) {
      throw new Error(`Duplicate entry for migration '${name}' in baseline manifest '${manifestPath}'`);
    }

    if (!sha256 || typeof sha256 !== 'string' || !hex64Regex.test(sha256)) {
      throw new Error(`Invalid baseline manifest entry for '${name}': 'sha256' must be a 64-character lowercase hex string`);
    }

    if (!baselineVersion || typeof baselineVersion !== 'string' || !baselineVersion.trim()) {
      throw new Error(`Invalid baseline manifest entry for '${name}': missing or empty 'baselineVersion'`);
    }

    if (!reconciliationMethod || typeof reconciliationMethod !== 'string' || !reconciliationMethod.trim()) {
      throw new Error(`Invalid baseline manifest entry for '${name}': missing or empty 'reconciliationMethod'`);
    }

    map.set(name, entry);
  }

  return map;
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
  '0006_employee_pending_access.sql': (cat) =>
    Boolean(cat.constraintDefs?.get('employees_status_check')?.includes('pending_access') && cat.columns.has('employees.deactivated_at')),
  '0007_remove_manager_role.sql': (cat) =>
    Boolean(!cat.constraintDefs?.get('memberships_role_check')?.includes('MANAGER') && cat.columns.has('employees.deactivated_at')),
  '0008_areas_optional.sql': (cat) => cat.tables.has('areas'),
  '0009_format_profiles.sql': (cat) => cat.tables.has('format_profiles'),
  '0010_import_history.sql': (cat) => cat.columns.has('imports.import_mode'),
  '0011_import_idempotency.sql': (cat) => cat.columns.has('imports.employee_id'),
  '0012_format_profiles_structurehash_uniqueness.sql': (cat) => cat.indexes.has('format_profiles_org_structurehash_active_idx'),
  '0013_membership_roles_owner.sql': (cat) => {
    const def = cat.constraintDefs?.get('memberships_role_check') || '';
    return def.includes('OWNER') && def.includes('PLANNER');
  },
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
  '0031_approval_audit_event_types.sql': (cat) =>
    Boolean(cat.constraintDefs?.get('organization_audit_events_event_type_check')?.includes('approval_request.created')),
  '0032_change_request_application.sql': (cat) => cat.columns.has('change_requests.requested_start_time'),
  '0033_import_outcome.sql': (cat) => cat.columns.has('imports.outcome_reason'),
  '0034_shift_type_semantics.sql': (cat) => cat.columns.has('shifts.shift_type'),
  '0035_operational_assignments.sql': (cat) => cat.tables.has('operational_assignments'),
  '0036_temporal_organizational_model.sql': (cat) => cat.tables.has('organization_people'),
  '0037_temporal_ownership_transfer_and_labor_integrity.sql': (cat) => cat.routines.has('transfer_organization_ownership_temporal'),
  '0038_migration_ledger_checksums.sql': (cat) =>
    cat.columns.has('_migrations.checksum') && cat.constraints.has('_migrations_checksum_format_chk'),
};

/**
 * Universal query runner: supports neon tagged template function, client.query, or mock sql.
 */
export async function executeSql(sqlOrClient, queryText, params = []) {
  if (sqlOrClient && typeof sqlOrClient.query === 'function') {
    const res = await sqlOrClient.query(queryText, params);
    return Array.isArray(res) ? res : res.rows || [];
  }
  if (typeof sqlOrClient === 'function') {
    const templateStrings = Object.assign([queryText], { raw: [queryText] });
    const res = await sqlOrClient(templateStrings, ...params);
    return Array.isArray(res) ? res : res.rows || [];
  }
  throw new Error('Invalid SQL client provided: expected function or object with .query()');
}

/**
 * Extracts schema catalog items in a strictly read-only fashion.
 */
export async function extractSchemaCatalog(sqlOrClient) {
  const [hasMigrationsRes, tablesRes, columnsRes, routinesRes, indexesRes, constraintsRes] = await Promise.all([
    executeSql(sqlOrClient, "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_migrations'"),
    executeSql(sqlOrClient, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"),
    executeSql(sqlOrClient, "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"),
    executeSql(sqlOrClient, "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public'"),
    executeSql(sqlOrClient, "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"),
    executeSql(sqlOrClient, "SELECT conname, pg_get_constraintdef(oid) AS def, conrelid::regclass::text AS table_name FROM pg_constraint WHERE connamespace = 'public'::regnamespace"),
  ]);

  const tableExists = hasMigrationsRes.length > 0;
  const hasChecksumCol = columnsRes.some(
    (r) => r.table_name === '_migrations' && r.column_name === 'checksum'
  );

  let appliedRows = [];
  if (tableExists) {
    if (hasChecksumCol) {
      appliedRows = await executeSql(sqlOrClient, 'SELECT name, applied_at, checksum FROM _migrations ORDER BY name');
    } else {
      appliedRows = await executeSql(sqlOrClient, 'SELECT name, applied_at FROM _migrations ORDER BY name');
    }
  }

  const tables = new Set(tablesRes.map((r) => r.table_name));
  const columns = new Set(columnsRes.map((r) => `${r.table_name}.${r.column_name}`));
  const routines = new Set(routinesRes.map((r) => r.routine_name));
  const indexes = new Set(indexesRes.map((r) => r.indexname));
  const constraints = new Set(constraintsRes.map((r) => r.conname));
  const constraintDefs = new Map();
  for (const r of constraintsRes) {
    if (r.conname) {
      constraintDefs.set(r.conname, r.def || '');
      if (r.table_name) {
        constraintDefs.set(`${r.table_name}.${r.conname}`, r.def || '');
      }
    }
  }

  return {
    tableExists,
    appliedRows,
    hasChecksumCol,
    tables,
    columns,
    routines,
    indexes,
    constraints,
    constraintDefs,
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
  sqlOrClient,
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
  if (!baselineMap || !(baselineMap instanceof Map)) {
    throw new Error('Failed to load baseline manifest: expected a Map of verified migration entries');
  }

  const dbCatalog = catalog || (await extractSchemaCatalog(sqlOrClient));

  const appliedMap = new Map(dbCatalog.appliedRows.map((r) => [r.name, r]));
  const appliedNames = new Set(appliedMap.keys());

  const items = [];
  const applied = [];
  const pending = [];
  const materializedUnregistered = [];
  const missingFromDatabase = [];
  const unknownInLedger = [];
  const checksumMismatches = [];
  const checksumUnverifiable = [];

  for (const file of repoFiles) {
    const isRegistered = appliedNames.has(file);
    const isMaterialized = isMigrationMaterialized(file, dbCatalog);
    const repoChecksum = fileChecksums.get(file);
    const baselineEntry = baselineMap.get(file);
    const appliedRow = appliedMap.get(file);

    let status = 'UNKNOWN';
    let baselineMatches = false;

    const hasChecksumCol = Boolean(dbCatalog.hasChecksumCol);

    if (isRegistered) {
      const hasLedgerVal = Boolean(appliedRow && appliedRow.checksum);
      const ledgerChecksum = appliedRow?.checksum || null;

      if (baselineEntry && hasLedgerVal) {
        // TRIPLE VALIDATION: ledger checksum === manifest checksum === file checksum
        const manifestMatchesRepo = baselineEntry.sha256 === repoChecksum;
        const ledgerMatchesRepo = ledgerChecksum === repoChecksum;
        const ledgerMatchesManifest = ledgerChecksum === baselineEntry.sha256;

        if (!manifestMatchesRepo || !ledgerMatchesRepo || !ledgerMatchesManifest) {
          status = 'CHECKSUM_MISMATCH';
          checksumMismatches.push({
            name: file,
            expectedSha256: baselineEntry.sha256,
            actualSha256: repoChecksum,
            ledgerSha256: ledgerChecksum,
            source: 'triple_validation_mismatch',
          });
        } else if (!isMaterialized) {
          status = 'MISSING_FROM_DATABASE';
          missingFromDatabase.push({ name: file, applied_at: appliedRow.applied_at, sha256: repoChecksum });
        } else {
          status = 'APPLIED';
          applied.push({ name: file, applied_at: appliedRow.applied_at, sha256: repoChecksum });
          baselineMatches = true;
        }
      } else if (baselineEntry && !hasLedgerVal) {
        if (hasChecksumCol) {
          status = 'CHECKSUM_UNVERIFIABLE';
          checksumUnverifiable.push({
            name: file,
            reason: 'Migration recorded in ledger but checksum column is NULL or empty',
          });
        } else {
          const manifestMatchesRepo = baselineEntry.sha256 === repoChecksum;
          if (!manifestMatchesRepo) {
            status = 'CHECKSUM_MISMATCH';
            checksumMismatches.push({
              name: file,
              expectedSha256: baselineEntry.sha256,
              actualSha256: repoChecksum,
              source: 'baseline_manifest',
            });
          } else if (!isMaterialized) {
            status = 'MISSING_FROM_DATABASE';
            missingFromDatabase.push({ name: file, applied_at: appliedRow.applied_at, sha256: repoChecksum });
          } else {
            status = 'APPLIED';
            applied.push({ name: file, applied_at: appliedRow.applied_at, sha256: repoChecksum });
            baselineMatches = true;
          }
        }
      } else if (!baselineEntry && hasLedgerVal) {
        // Future / post-baseline migration: verify ledger checksum === file checksum
        const ledgerMatchesRepo = ledgerChecksum === repoChecksum;
        if (!ledgerMatchesRepo) {
          status = 'CHECKSUM_MISMATCH';
          checksumMismatches.push({
            name: file,
            expectedSha256: ledgerChecksum,
            actualSha256: repoChecksum,
            source: 'ledger_checksum',
          });
        } else if (!isMaterialized) {
          status = 'MISSING_FROM_DATABASE';
          missingFromDatabase.push({ name: file, applied_at: appliedRow.applied_at, sha256: repoChecksum });
        } else {
          status = 'APPLIED';
          applied.push({ name: file, applied_at: appliedRow.applied_at, sha256: repoChecksum });
          baselineMatches = true;
        }
      } else {
        // Registered in database but has NO verifiable checksum anywhere!
        status = 'CHECKSUM_UNVERIFIABLE';
        checksumUnverifiable.push({
          name: file,
          reason: 'Migration is recorded in ledger but has no verifiable checksum in baseline manifest or ledger column',
        });
      }
    } else {
      // Not registered
      if (baselineEntry && baselineEntry.sha256 !== repoChecksum) {
        status = 'CHECKSUM_MISMATCH';
        checksumMismatches.push({
          name: file,
          expectedSha256: baselineEntry.sha256,
          actualSha256: repoChecksum,
          source: 'baseline_manifest',
        });
      } else if (isMaterialized) {
        status = 'MATERIALIZED_UNREGISTERED';
        materializedUnregistered.push({ name: file, sha256: repoChecksum });
      } else {
        status = 'PENDING';
        pending.push({ name: file, sha256: repoChecksum });
        baselineMatches = Boolean(baselineEntry && baselineEntry.sha256 === repoChecksum);
      }
    }

    items.push({
      name: file,
      status,
      isRegistered,
      isMaterialized,
      sha256: repoChecksum,
      baselineMatches,
    });
  }

  for (const name of appliedNames) {
    if (!fileChecksums.has(name)) {
      unknownInLedger.push({
        name,
        applied_at: appliedMap.get(name)?.applied_at,
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
    checksumUnverifiable.length > 0 ||
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
    checksumUnverifiable,
    gaps,
    hasChecksumCol: Boolean(dbCatalog.hasChecksumCol),
    isContinuous: gaps.length === 0,
    isUpToDate: state === 'UP_TO_DATE',
    canMigrateNormally: state === 'READY' || state === 'UP_TO_DATE',
    exitCode: state === 'RECONCILIATION_REQUIRED' ? 1 : 0,
  };
}

/**
 * Prints formatted human-readable migration status.
 */
export function printStatus(status, { neonInfo = null } = {}) {
  console.log('=== NEON MIGRATION STATUS ===');
  if (neonInfo) {
    if (neonInfo.unresolved) {
      console.log(`Neon Project ID: ${neonInfo.projectId || 'N/A'}`);
      console.log(`Neon Branch: UNRESOLVED (${neonInfo.error})`);
    } else {
      console.log(`Neon Project ID: ${neonInfo.projectId || 'N/A'}`);
      console.log(`Neon Branch ID: ${neonInfo.branchId || 'N/A'}`);
      console.log(`Neon Branch Name: ${neonInfo.branchName || 'N/A'}`);
      console.log(`Neon Endpoint: ${neonInfo.endpointId || 'N/A'}`);
    }
  }
  console.log(`_migrations table: ${status.tableExists ? 'EXISTS' : 'NOT CREATED'}`);
  console.log(`Total repository migrations: ${status.totalRepoFiles}`);
  console.log(`Applied migrations in ledger: ${status.applied.length}`);
  console.log(`Pending migrations: ${status.pending.length}`);

  if (status.checksumUnverifiable && status.checksumUnverifiable.length > 0) {
    console.log(`\n[CRITICAL] Registered migrations without verifiable baseline checksum (${status.checksumUnverifiable.length}):`);
    for (const m of status.checksumUnverifiable) {
      console.log(`  ! ${m.name}: ${m.reason}`);
    }
  }

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
    console.log(`\n[ERROR] Checksum mismatches detected (${status.checksumMismatches.length}):`);
    for (const m of status.checksumMismatches) {
      if (m.source === 'triple_validation_mismatch') {
        console.log(`  ! ${m.name} triple mismatch: repo=${m.actualSha256}, manifest=${m.expectedSha256}, ledger=${m.ledgerSha256}`);
      } else {
        console.log(`  ! ${m.name} actual SHA-256 does not match verified baseline (source: ${m.source})`);
      }
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
    projectId = null,
    neonctlExec = execFileSync,
    endpoints = null,
    branches = null,
    expectedEndpointId = null,
    expectedBranchId = null,
  } = {}
) {
  const resolvedProjectId = projectId || getNeonProjectId();
  if (!resolvedProjectId) {
    throw new Error('NEON_PROJECT_ID environment variable or --project-id flag is required. Hardcoded default project ID has been removed.');
  }

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
    const raw = neonctlExec('npx', ['neonctl', 'api', `/projects/${resolvedProjectId}/endpoints`], {
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
    throw new Error(`Could not identify Neon endpoint for host '${hostname}' in project '${resolvedProjectId}'. Refusing to connect.`);
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
    const raw = neonctlExec('npx', ['neonctl', 'branches', 'list', '--project-id', resolvedProjectId, '--output', 'json'], {
      encoding: 'utf-8',
    });
    branchList = JSON.parse(raw);
  }

  const matchedBranch = branchList.find((b) => b.id === branchId);
  if (!matchedBranch) {
    throw new Error(`Branch '${branchId}' associated with endpoint '${matchedEndpoint.id}' was not found in project '${resolvedProjectId}'.`);
  }

  return {
    branch: matchedBranch,
    endpoint: matchedEndpoint,
  };
}

/**
 * Accredit destination branch before allowing write operations.
 */
export function accreditDestinationBranch(
  connectionStringOrOptions,
  deprecatedOptions = {}
) {
  let opts = {};
  if (typeof connectionStringOrOptions === 'string') {
    opts = { connectionString: connectionStringOrOptions, ...deprecatedOptions };
  } else if (connectionStringOrOptions && typeof connectionStringOrOptions === 'object') {
    opts = { ...connectionStringOrOptions };
  }

  const {
    connectionString,
    targetBranch = null,
    confirmMainBranchId = null,
    expectedBranchId = null,
    expectedBranchName = null,
    allowMainMigration = false,
    projectId = null,
    branchResolver = null,
    neonctlExec = execFileSync,
    endpoints = null,
    branches = null,
    forWrite = true,
  } = opts;

  if (!connectionString) {
    throw new Error('connectionString is required for destination accreditation');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch (err) {
    throw new Error(`Invalid connection string: ${err.message}`);
  }

  const hostname = parsedUrl.hostname || '';
  if (forWrite && hostname.includes('-pooler')) {
    throw new Error(
      `Migration write operations require a direct unpooled connection (DATABASE_URL_UNPOOLED or direct host without '-pooler'). Host '${hostname}' is pooled. Use direct connection.`
    );
  }

  // Require explicit branch or target environment selection for migration write operations
  if (!targetBranch && !expectedBranchId && !expectedBranchName) {
    throw new Error(
      'Target branch must be explicitly specified (e.g. --target-branch=<name_or_id> or TARGET_BRANCH env var). Refusing to migrate generic or default target.'
    );
  }

  const resolvedProjectId = projectId || getNeonProjectId();
  if (!resolvedProjectId) {
    throw new Error('NEON_PROJECT_ID environment variable or --project-id flag is required. Hardcoded default project ID has been removed.');
  }

  const resolver = branchResolver || resolveNeonBranchFromConnectionString;
  const { branch, endpoint } = resolver(connectionString, {
    projectId: resolvedProjectId,
    neonctlExec,
    endpoints,
    branches,
    expectedBranchId,
  });

  const branchName = branch.name || '';
  const branchId = branch.id || '';
  const isDefault = Boolean(branch.default || branch.is_default || branch.primary);
  const isProtected = Boolean(branch.protected);

  const isMainBranch =
    branchName === 'main' ||
    branchId === 'br-solitary-thunder-b1hm9low' ||
    branchName === 'production' ||
    branchName === 'preview/production' ||
    isDefault ||
    isProtected;

  if (isMainBranch) {
    if (!allowMainMigration) {
      throw new Error(
        `Refusing to apply migrations to production/main branch '${branchName}' (${branchId}) without explicit authorization flag (--allow-main-migration).`
      );
    }
    const target = (targetBranch || '').trim();
    if (target.toLowerCase() === 'main') {
      throw new Error(
        `Refusing to migrate Neon main branch: target branch must be specified by its exact branch ID ('${branchId}'), not the alias 'main'.`
      );
    }
    if (target !== branchId) {
      throw new Error(
        `Refusing to migrate Neon main branch: target branch '${targetBranch}' does not match exact main branch ID '${branchId}'.`
      );
    }
    if (confirmMainBranchId !== branchId) {
      throw new Error(
        `Refusing to migrate Neon main branch: requires explicit confirmation flag --confirm-main-branch-id=${branchId}.`
      );
    }
  } else if (targetBranch) {
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

  return {
    accredited: true,
    branch,
    endpoint,
    targetBranch,
  };
}

/**
 * Runs migrations forward in filename order with strict safety validations.
 * Accredits branch, creates internal Client, executes normalized SQL, and ensures atomic transaction rollback.
 */
export async function runMigrations(
  optionsOrConnectionString = {},
  deprecatedOptions = {}
) {
  let opts = {};
  if (typeof optionsOrConnectionString === 'string') {
    opts = { connectionString: optionsOrConnectionString, ...deprecatedOptions };
  } else if (optionsOrConnectionString && typeof optionsOrConnectionString === 'object') {
    // If an external Client object was passed as first argument, ignore it for security
    if (typeof optionsOrConnectionString.query === 'function') {
      opts = { ...deprecatedOptions };
    } else {
      opts = { ...optionsOrConnectionString };
    }
  }

  const {
    connectionString,
    projectId = null,
    targetBranch = null,
    confirmMainBranchId = null,
    allowMainMigration = false,
    migrationsDir = MIGRATIONS_DIR,
    baselineManifestPath = BASELINE_MANIFEST_PATH,
    ClientClass = Client,
    branchResolver = null,
    endpoints = null,
    branches = null,
    neonctlExec = execFileSync,
  } = opts;

  if (!connectionString) {
    throw new Error('connectionString is required for runMigrations.');
  }

  // 1 & 2 & 3. Accredit branch: resolves URL -> hostname -> endpoint -> branch, validates unpooled host and safeguards
  accreditDestinationBranch(connectionString, {
    targetBranch,
    confirmMainBranchId,
    allowMainMigration,
    projectId,
    branchResolver,
    endpoints,
    branches,
    neonctlExec,
    forWrite: true,
  });

  // 4 & 5. Create Client internally using EXACTLY the accredited connectionString, and connect AFTER accrediting
  const client = new ClientClass(connectionString);
  if (typeof client.connect === 'function') {
    await client.connect();
  }

  try {
    const status = await inspectMigrationsStatus(client, {
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
      if (status.checksumUnverifiable.length > 0) {
        reasons.push(`${status.checksumUnverifiable.length} registered migrations with unverifiable checksums`);
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Check if _migrations already has checksum column
    const colCheckRes = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '_migrations' AND column_name = 'checksum'
    `);
    let hasChecksumCol = (Array.isArray(colCheckRes) ? colCheckRes : colCheckRes?.rows || []).length > 0;

    let appliedCount = 0;
    for (const item of status.pending) {
      const file = item.name;
      const body = await readFile(join(migrationsDir, file), 'utf8');
      const fileChecksum = computeMigrationChecksum(body);
      const { normalizedSql } = normalizeMigrationSql(body, file);

      console.log(`apply ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(normalizedSql);
        if (file === '0038_migration_ledger_checksums.sql') {
          hasChecksumCol = true;
        }
        if (hasChecksumCol || file >= '0038_') {
          await client.query(
            'INSERT INTO _migrations (name, checksum) VALUES ($1, $2)',
            [file, fileChecksum]
          );
        } else {
          await client.query(
            'INSERT INTO _migrations (name) VALUES ($1)',
            [file]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // preserve original error
        }
        throw err;
      }

      console.log(`done ${file}`);
      appliedCount++;
    }

    console.log(`migrations up to date (${appliedCount} applied)`);
    return { appliedCount, pendingCount: 0 };
  } finally {
    if (typeof client.end === 'function') {
      try {
        await client.end();
      } catch {
        // ignore client close error
      }
    }
  }
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

  let confirmMainBranchId = null;
  const confirmMainArg = args.find((a) => a.startsWith('--confirm-main-branch-id='));
  if (confirmMainArg) {
    confirmMainBranchId = confirmMainArg.split('=')[1];
  } else if (env.CONFIRM_MAIN_BRANCH_ID) {
    confirmMainBranchId = env.CONFIRM_MAIN_BRANCH_ID;
  }

  const projectId = getNeonProjectId(env, args);

  if (isStatusMode) {
    // Read-only status allows pooled connections
    const connectionString = env.DATABASE_URL || env.POSTGRES_URL || env.DATABASE_URL_UNPOOLED;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured for status inspection');
    }

    let neonInfo = null;
    let resolutionError = null;
    if (projectId) {
      try {
        const resolved = resolveNeonBranchFromConnectionString(connectionString, { projectId });
        neonInfo = {
          projectId,
          branchId: resolved.branch.id,
          branchName: resolved.branch.name,
          endpointId: resolved.endpoint.id,
        };
      } catch (err) {
        resolutionError = err;
        neonInfo = {
          projectId,
          unresolved: true,
          error: err.message,
        };
      }
    }

    const sql = neon(connectionString);
    const status = await inspectMigrationsStatus(sql);
    printStatus(status, { neonInfo });

    if (resolutionError) {
      console.error(`\n[CRITICAL] Branch resolution failed for project '${projectId}': ${resolutionError.message}`);
      process.exitCode = 1;
      return;
    }

    if (status.exitCode !== 0) {
      process.exitCode = status.exitCode;
    }
    return;
  }

  // Apply mode (db:migrate write): direct unpooled connection required
  const connectionString =
    env.DATABASE_URL_UNPOOLED ||
    env.POSTGRES_URL_NON_POOLING ||
    env.DATABASE_URL ||
    env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is not configured');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch (err) {
    throw new Error(`Invalid connection string: ${err.message}`);
  }

  if (parsedUrl.hostname.includes('-pooler')) {
    throw new Error(
      `Migration write operations require a direct unpooled connection (DATABASE_URL_UNPOOLED or direct host without '-pooler'). Host '${parsedUrl.hostname}' is pooled.`
    );
  }

  await runMigrations({
    connectionString,
    targetBranch,
    confirmMainBranchId,
    allowMainMigration,
    projectId,
  });
}

// Direct execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  main().catch((error) => {
    console.error('migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

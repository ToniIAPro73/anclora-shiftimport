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
 * Fails closed on unclosed string literals, quoted identifiers, block comments, or dollar-quoted blocks.
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
    // Block comment (supports nesting)
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
      if (depth > 0) {
        throw new Error('Unterminated block comment in SQL');
      }
      continue;
    }
    // Standard string literal
    if (sql[i] === "'") {
      i++;
      let closed = false;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          i++;
        }
      }
      if (!closed) {
        throw new Error('Unterminated string literal in SQL');
      }
      continue;
    }
    // Quoted identifier
    if (sql[i] === '"') {
      i++;
      let closed = false;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          i++;
        }
      }
      if (!closed) {
        throw new Error('Unterminated quoted identifier in SQL');
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
 * Splits token stream into statements delimited by semicolons.
 */
function splitStatements(tokens) {
  const statements = [];
  let currentTokens = [];
  let stmtStart = null;

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.word === ';') {
      if (currentTokens.length > 0) {
        statements.push({
          tokens: currentTokens,
          start: stmtStart,
          end: t.end,
        });
        currentTokens = [];
        stmtStart = null;
      }
    } else {
      if (currentTokens.length === 0) {
        stmtStart = t.start;
      }
      currentTokens.push(t);
    }
  }

  if (currentTokens.length > 0) {
    statements.push({
      tokens: currentTokens,
      start: stmtStart,
      end: currentTokens[currentTokens.length - 1].end,
    });
  }

  return statements;
}

/**
 * Identifies if a statement is a transaction control statement.
 * Distinguishes standalone END from CASE ... END expressions.
 */
function getStatementTransactionType(tokens) {
  if (!tokens || tokens.length === 0) return null;

  // Track CASE ... END depth across the statement tokens
  let caseDepth = 0;
  const annotated = tokens.map((tok) => {
    const upper = tok.word.toUpperCase();
    if (upper === 'CASE') {
      caseDepth++;
      return { ...tok, upper, isCaseEnd: false };
    }
    if (upper === 'END') {
      if (caseDepth > 0) {
        caseDepth--;
        return { ...tok, upper, isCaseEnd: true };
      }
      return { ...tok, upper, isCaseEnd: false };
    }
    return { ...tok, upper, isCaseEnd: false };
  });

  const w0 = annotated[0]?.upper;
  const w1 = annotated[1]?.upper;

  if (w0 === 'BEGIN') return 'BEGIN';
  if (w0 === 'START' && w1 === 'TRANSACTION') return 'START TRANSACTION';
  if (w0 === 'COMMIT') {
    if (w1 === 'PREPARED') return 'COMMIT PREPARED';
    return 'COMMIT';
  }
  if (w0 === 'ROLLBACK') {
    if (w1 === 'PREPARED') return 'ROLLBACK PREPARED';
    return 'ROLLBACK';
  }
  if (w0 === 'END') {
    if (!annotated[0].isCaseEnd) return 'END';
  }
  if (w0 === 'ABORT') return 'ABORT';
  if (w0 === 'SAVEPOINT') return 'SAVEPOINT';
  if (w0 === 'RELEASE') {
    if (w1 === 'SAVEPOINT') return 'RELEASE SAVEPOINT';
    return 'RELEASE';
  }
  if (w0 === 'PREPARE' && w1 === 'TRANSACTION') return 'PREPARE TRANSACTION';

  // Check if any non-case transaction keyword appears within the statement
  for (let k = 1; k < annotated.length; k++) {
    const tok = annotated[k];
    if (tok.upper === 'BEGIN') return 'BEGIN';
    if (tok.upper === 'START' && annotated[k + 1]?.upper === 'TRANSACTION') return 'START TRANSACTION';
    if (tok.upper === 'COMMIT') {
      if (annotated[k + 1]?.upper === 'PREPARED') return 'COMMIT PREPARED';
      return 'COMMIT';
    }
    if (tok.upper === 'ROLLBACK') {
      if (annotated[k + 1]?.upper === 'PREPARED') return 'ROLLBACK PREPARED';
      return 'ROLLBACK';
    }
    if (tok.upper === 'END' && !tok.isCaseEnd) return 'END';
    if (tok.upper === 'ABORT') return 'ABORT';
    if (tok.upper === 'SAVEPOINT') return 'SAVEPOINT';
    if (tok.upper === 'RELEASE') return 'RELEASE';
    if (tok.upper === 'PREPARE' && annotated[k + 1]?.upper === 'TRANSACTION') return 'PREPARE TRANSACTION';
  }

  return null;
}

/**
 * Normalizes migration SQL by safely removing legacy top-level BEGIN and COMMIT wrappers.
 * Enforces strict prohibition of internal transaction control for migrations >= 0038.
 * Fails closed on syntax errors, unbalanced wrappers, and empty normalized SQL.
 */
export function normalizeMigrationSql(sql, migrationName = '') {
  // Check empty raw input
  const strippedRaw = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!strippedRaw) {
    throw new Error(`Migration '${migrationName}': Normalized migration SQL is empty.`);
  }

  const tokens = scanSqlTokens(sql);
  const statements = splitStatements(tokens);

  if (statements.length === 0) {
    throw new Error(`Migration '${migrationName}': Normalized migration SQL is empty.`);
  }

  const matchNum = migrationName.match(/^(\d{4})/);
  const num = matchNum ? parseInt(matchNum[1], 10) : null;

  // Identify transaction statements
  const txStatements = [];
  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx];
    const txType = getStatementTransactionType(stmt.tokens);
    if (txType) {
      txStatements.push({
        index: idx,
        type: txType,
        stmt,
      });
    }
  }

  // Enforce prohibition for migrations >= 0038
  if (num !== null && num >= 38) {
    if (txStatements.length > 0) {
      const first = txStatements[0];
      throw new Error(
        `Migration '${migrationName}' contains forbidden transaction control statement '${first.type}'. Migrations from 0038 onwards must not manage transactions internally.`
      );
    }
    return { normalizedSql: sql, hadWrapper: false };
  }

  // For legacy migrations (< 0038):
  if (txStatements.length === 0) {
    return { normalizedSql: sql, hadWrapper: false };
  }

  // Explicit ROLLBACK or ABORT check:
  if (txStatements.some((t) => t.type === 'ROLLBACK' || t.type === 'ABORT' || t.type === 'ROLLBACK PREPARED')) {
    throw new Error(
      `Migration '${migrationName}' contains explicit ROLLBACK statement; cannot normalize legacy transaction wrapper.`
    );
  }

  // Check for unbalanced wrapper: must have exactly BEGIN as first and COMMIT/END as last
  const hasBegin = txStatements.some((t) => t.type === 'BEGIN');
  const hasCommit = txStatements.some((t) => t.type === 'COMMIT' || t.type === 'END');

  if (!hasBegin || !hasCommit || txStatements.length !== 2) {
    if (txStatements.length > 2) {
      throw new Error(
        `Migration '${migrationName}' contains multiple or unbalanced transaction statements (${txStatements.map((t) => t.type).join(', ')}). Legacy migrations may only contain a single outer BEGIN/COMMIT wrapper.`
      );
    }
    const missing = !hasBegin ? 'BEGIN' : 'COMMIT';
    throw new Error(
      `Migration '${migrationName}' contains multiple or unbalanced transaction statements (missing ${missing}).`
    );
  }

  const firstTx = txStatements[0];
  const secondTx = txStatements[1];

  if (firstTx.type !== 'BEGIN') {
    throw new Error(
      `Migration '${migrationName}' has invalid transaction wrapper order: '${firstTx.type}' before 'BEGIN'.`
    );
  }

  if (secondTx.type !== 'COMMIT' && secondTx.type !== 'END') {
    throw new Error(
      `Migration '${migrationName}' has invalid transaction wrapper: expected COMMIT or END as closing statement, found '${secondTx.type}'.`
    );
  }

  // Statements before BEGIN?
  if (firstTx.index !== 0) {
    throw new Error(
      `Migration '${migrationName}' contains statements before top-level BEGIN; cannot normalize legacy transaction wrapper.`
    );
  }

  // Statements after COMMIT?
  if (secondTx.index !== statements.length - 1) {
    throw new Error(
      `Migration '${migrationName}' contains statements after top-level COMMIT; cannot normalize legacy transaction wrapper.`
    );
  }

  // Remove COMMIT first, then BEGIN to preserve byte offsets
  let commitCutEnd = secondTx.stmt.end;
  while (commitCutEnd < sql.length && /[ \t]/.test(sql[commitCutEnd])) commitCutEnd++;
  if (sql[commitCutEnd] === '\r') commitCutEnd++;
  if (sql[commitCutEnd] === '\n') commitCutEnd++;

  let beginCutEnd = firstTx.stmt.end;
  while (beginCutEnd < sql.length && /[ \t]/.test(sql[beginCutEnd])) beginCutEnd++;
  if (sql[beginCutEnd] === '\r') beginCutEnd++;
  if (sql[beginCutEnd] === '\n') beginCutEnd++;

  let normalized = sql.slice(0, secondTx.stmt.start) + sql.slice(commitCutEnd);
  normalized = normalized.slice(0, firstTx.stmt.start) + normalized.slice(beginCutEnd);

  const strippedNormalized = normalized.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!strippedNormalized) {
    throw new Error(`Migration '${migrationName}': Normalized migration SQL is empty.`);
  }

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
 * Validates repository migration files, sequence, sentinels, and baseline manifest
 * strictly before connecting to database or performing any write operations.
 */
export async function validateRepositoryMigrations({
  migrationsDir = MIGRATIONS_DIR,
  baselineManifestPath = BASELINE_MANIFEST_PATH,
  sentinels = MIGRATION_SENTINELS,
} = {}) {
  const dirEntries = await readdir(migrationsDir, { withFileTypes: true });

  const files = [];
  for (const entry of dirEntries) {
    const name = entry.name;
    if (name.startsWith('.')) continue; // ignore hidden files e.g. .DS_Store
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) {
      throw new Error(
        `Invalid migration filename '${name}'. Migration files must match pattern '^\\d{4}_[a-z0-9_]+\\.sql$'`
      );
    }
    files.push(name);
  }

  if (files.length === 0) {
    throw new Error(`No migration files found in '${migrationsDir}'`);
  }

  // Check unique numeric prefixes
  const prefixMap = new Map();
  for (const file of files) {
    const prefixStr = file.substring(0, 4);
    const prefixNum = parseInt(prefixStr, 10);
    if (prefixMap.has(prefixNum)) {
      const existing = prefixMap.get(prefixNum);
      throw new Error(
        `Duplicate migration prefix '${prefixStr}': found both '${existing}' and '${file}'`
      );
    }
    prefixMap.set(prefixNum, file);
  }

  // Sort strictly by numeric value
  files.sort((a, b) => parseInt(a.substring(0, 4), 10) - parseInt(b.substring(0, 4), 10));

  // Check continuous sequence starting from 0001 to N
  for (let i = 0; i < files.length; i++) {
    const expectedNum = i + 1;
    const actualNum = parseInt(files[i].substring(0, 4), 10);
    if (actualNum !== expectedNum) {
      const expectedStr = String(expectedNum).padStart(4, '0');
      const actualStr = String(actualNum).padStart(4, '0');
      throw new Error(
        `Migration sequence gap: expected sequence prefix '${expectedStr}' at index ${i}, but found '${files[i]}' (prefix '${actualStr}')`
      );
    }
  }

  const fileSet = new Set(files);

  // Check sentinels: every file in repo must have a sentinel
  for (const file of files) {
    if (!sentinels || !sentinels[file] || typeof sentinels[file] !== 'function') {
      throw new Error(
        `Migration '${file}' does not have a defined sentinel in MIGRATION_SENTINELS.`
      );
    }
  }

  // Check sentinels: no sentinels for nonexistent files
  if (sentinels) {
    for (const sentinelName of Object.keys(sentinels)) {
      if (!fileSet.has(sentinelName)) {
        throw new Error(
          `MIGRATION_SENTINELS contains sentinel for nonexistent migration file '${sentinelName}'.`
        );
      }
    }
  }

  // Load baseline manifest and verify entries
  const baselineMap = await loadBaselineManifest(baselineManifestPath);
  const fileChecksums = new Map();
  for (const file of files) {
    const content = await readFile(join(migrationsDir, file));
    fileChecksums.set(file, computeMigrationChecksum(content));
  }

  for (const [manifestName, manifestEntry] of baselineMap.entries()) {
    if (!fileSet.has(manifestName)) {
      throw new Error(
        `Baseline manifest contains migration '${manifestName}' which does not exist in repository '${migrationsDir}'.`
      );
    }
    const diskHash = fileChecksums.get(manifestName);
    if (diskHash !== manifestEntry.sha256) {
      throw new Error(
        `Checksum mismatch for migration '${manifestName}': manifest SHA-256 '${manifestEntry.sha256}' does not match disk SHA-256 '${diskHash}'.`
      );
    }
  }

  return {
    files,
    fileChecksums,
    baselineMap,
  };
}

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
    sentinels = MIGRATION_SENTINELS,
  } = {}
) {
  const repoValidation = await validateRepositoryMigrations({
    migrationsDir,
    baselineManifestPath,
    sentinels,
  });
  const repoFiles = repoValidation.files;
  const fileChecksums = repoValidation.fileChecksums;
  const baselineMap = repoValidation.baselineMap;

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
 * Internal helper to execute pending migrations on an already-connected Client.
 */
async function _executeMigrationsOnClient(
  client,
  { migrationsDir = MIGRATIONS_DIR, baselineManifestPath = BASELINE_MANIFEST_PATH } = {}
) {
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
}

/**
 * Runs migrations forward in filename order with strict safety validations.
 * Accepts ONLY 5 permitted options: connectionString, projectId, targetBranch, allowMainMigration, confirmMainBranchId.
 * Rejects any unknown option or injection hook immediately before creating Client or connecting.
 */
export async function runMigrations(options = {}) {
  if (arguments.length > 1) {
    throw new Error('runMigrations accepts only a single options object.');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('runMigrations requires an options object with connectionString.');
  }

  const allowedKeys = new Set([
    'connectionString',
    'projectId',
    'targetBranch',
    'allowMainMigration',
    'confirmMainBranchId',
  ]);

  for (const key of Object.keys(options)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `runMigrations: unknown or forbidden option '${key}'. Injection hooks are strictly forbidden.`
      );
    }
  }

  const {
    connectionString,
    projectId = null,
    targetBranch = null,
    confirmMainBranchId = null,
    allowMainMigration = false,
  } = options;

  if (!connectionString) {
    throw new Error('connectionString is required for runMigrations.');
  }

  // 1. Validate repository migrations before connecting to database
  await validateRepositoryMigrations({
    migrationsDir: MIGRATIONS_DIR,
    baselineManifestPath: BASELINE_MANIFEST_PATH,
    sentinels: MIGRATION_SENTINELS,
  });

  // 2. Accredit destination branch before connecting
  accreditDestinationBranch(connectionString, {
    targetBranch,
    confirmMainBranchId,
    allowMainMigration,
    projectId,
    forWrite: true,
  });

  // 3. Create real Client internally using connectionString and connect AFTER accreditation
  const client = new Client(connectionString);
  await client.connect();

  try {
    return await _executeMigrationsOnClient(client, {
      migrationsDir: MIGRATIONS_DIR,
      baselineManifestPath: BASELINE_MANIFEST_PATH,
    });
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

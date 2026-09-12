// Migration runner & status reporter: manages db/migrations/*.sql in filename order.
// Usage:
//   Apply:  node db/migrate.mjs
//   Status: node db/migrate.mjs --status (strictly read-only)
//
// Connection string comes from process.env (DATABASE_URL or POSTGRES_URL).
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Computes SHA-256 checksum for a migration file buffer or string.
 */
export function computeMigrationChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Inspects migration status in read-only mode without executing DDL or writes.
 */
export async function inspectMigrationsStatus(sql, { migrationsDir = MIGRATIONS_DIR } = {}) {
  // Read repository migration files
  const repoFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const fileChecksums = new Map();
  for (const file of repoFiles) {
    const content = await readFile(join(migrationsDir, file));
    fileChecksums.set(file, computeMigrationChecksum(content));
  }

  // Check if _migrations table exists in DB without creating it (read-only query)
  const hasTableRes = await sql`
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = '_migrations'
  `;
  const tableExists = hasTableRes.length > 0;

  let appliedRows = [];
  if (tableExists) {
    appliedRows = await sql`SELECT name, applied_at FROM _migrations ORDER BY name`;
  }

  const appliedMap = new Map(appliedRows.map((r) => [r.name, r.applied_at]));
  const appliedNames = new Set(appliedMap.keys());

  const applied = [];
  const pending = [];
  const missingFromRepo = [];

  for (const file of repoFiles) {
    if (appliedNames.has(file)) {
      applied.push({
        name: file,
        applied_at: appliedMap.get(file),
        sha256: fileChecksums.get(file),
      });
    } else {
      pending.push({
        name: file,
        sha256: fileChecksums.get(file),
      });
    }
  }

  for (const name of appliedNames) {
    if (!fileChecksums.has(name)) {
      missingFromRepo.push({
        name,
        applied_at: appliedMap.get(name),
      });
    }
  }

  // Detect sequence gaps:
  // An applied file appears after a pending file in the canonical sorted repo sequence
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

  return {
    tableExists,
    totalRepoFiles: repoFiles.length,
    applied,
    pending,
    missingFromRepo,
    gaps,
    isContinuous: gaps.length === 0,
    isUpToDate: pending.length === 0 && gaps.length === 0 && missingFromRepo.length === 0,
  };
}

/**
 * Prints formatted human-readable migration status.
 */
export function printStatus(status) {
  console.log('=== NEON MIGRATION STATUS ===');
  console.log(`_migrations table: ${status.tableExists ? 'EXISTS' : 'NOT CREATED'}`);
  console.log(`Total repository migrations: ${status.totalRepoFiles}`);
  console.log(`Applied migrations: ${status.applied.length}`);
  console.log(`Pending migrations: ${status.pending.length}`);

  if (status.missingFromRepo.length > 0) {
    console.log(`\n[WARNING] Migrations registered in database but missing from repository (${status.missingFromRepo.length}):`);
    for (const m of status.missingFromRepo) {
      console.log(`  ! ${m.name} (applied_at: ${m.applied_at})`);
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

  if (status.isUpToDate) {
    console.log('\nResult: All repository migrations are applied and continuous.');
  } else if (!status.isContinuous) {
    console.log('\nResult: INCONSISTENT (Gaps detected. Do not apply migrations without reconciliation).');
  } else {
    console.log(`\nResult: READY (${status.pending.length} migrations pending).`);
  }
}

/**
 * Runs migrations forward in filename order with strict safety validations.
 */
export async function runMigrations(sql, { migrationsDir = MIGRATIONS_DIR } = {}) {
  // Preflight check: analyze state before touching anything
  const status = await inspectMigrationsStatus(sql, { migrationsDir });

  if (status.missingFromRepo.length > 0) {
    throw new Error(
      `Cannot apply migrations: database contains registered migrations not found in repository: [${status.missingFromRepo.map((m) => m.name).join(', ')}]`
    );
  }

  if (status.gaps.length > 0) {
    const gapDetails = status.gaps
      .map((g) => `${g.appliedFile} is applied but predecessors [${g.missingPredecessors.join(', ')}] are missing`)
      .join('; ');
    throw new Error(`Cannot apply migrations: sequence gap detected. ${gapDetails}`);
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
    await sql.transaction(
      statements.map((statement) => sql.query(statement))
    );
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    console.log(`done ${file}`);
    appliedCount++;
  }

  console.log(`migrations up to date (${appliedCount} applied)`);
  return { appliedCount, pendingCount: 0 };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const isStatusMode = args.includes('--status');
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const sql = neon(connectionString);

  if (isStatusMode) {
    const status = await inspectMigrationsStatus(sql);
    printStatus(status);
    return;
  }

  await runMigrations(sql);
}

// Direct execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  main().catch((error) => {
    console.error('migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

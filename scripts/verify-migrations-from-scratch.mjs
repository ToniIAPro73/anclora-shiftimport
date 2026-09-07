/*
 * Applies every migration to a disposable schema in Neon development.
 * This is a verifier, not the production migration runner: the schema is
 * created with a generated name and is always removed in finally.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'db', 'migrations');
const developmentHostPrefix = 'ep-winter-bird-';

function splitMigration(body) {
  return body
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && statement !== 'BEGIN' && statement !== 'COMMIT');
}

function readDatabaseUrl() {
  const value = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!value) throw new Error('DATABASE_URL is not configured');
  const host = new URL(value).hostname;
  if (!host.startsWith(developmentHostPrefix)) {
    throw new Error(`Refusing non-development Neon host: ${host}`);
  }
  console.log(`database host verified: ${developmentHostPrefix}… (development)`);
  return value;
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

async function main() {
  const sql = neon(readDatabaseUrl());
  const schema = `mvp_migration_check_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const quotedSchema = quoteIdentifier(schema);
  let removed = false;

  await sql.query(`CREATE SCHEMA ${quotedSchema}`);
  try {
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    const statements = [];
    for (const file of files) {
      const body = await readFile(join(migrationsDir, file), 'utf8');
      statements.push(...splitMigration(body));
    }

    await sql.transaction([
      sql.query(`SET LOCAL search_path TO ${quotedSchema}, public`),
      sql.query('CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'),
      ...statements.map((statement) => sql.query(statement)),
    ]);

    const tableRows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schema}
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const expectedTables = [
      '_migrations', 'areas', 'approval_requests', 'area_responsibles',
      'change_requests', 'employees', 'format_profiles', 'imports',
      'login_attempts', 'memberships', 'notifications', 'oauth_identities',
      'operational_assignments', 'organization_audit_events', 'organizations',
      'password_reset_tokens', 'schedule_versions', 'schedules', 'sessions',
      'shift_acknowledgements', 'shift_assignments', 'shift_comments', 'shifts',
      'users',
    ];
    const actualTables = tableRows.map((row) => row.table_name);
    const missing = expectedTables.filter((table) => !actualTables.includes(table));
    if (missing.length > 0) throw new Error(`Missing tables after fresh migration: ${missing.join(', ')}`);

    console.log(`migrations applied from scratch: ${files.length}/${files.length}`);
    console.log(`tables created in disposable schema: ${actualTables.length}`);
  } finally {
    await sql.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
    removed = true;
    console.log(`disposable schema removed: ${schema}`);
  }

  if (!removed) throw new Error('Disposable schema cleanup was not confirmed');
}

main().catch((error) => {
  console.error('fresh migration verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

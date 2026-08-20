// Migration runner: applies db/migrations/*.sql in filename order.
// Usage: node db/migrate.mjs
// Connection string comes from process.env (load .env.development.local
// locally via: node --env-file=.env.development.local db/migrate.mjs).
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const sql = neon(connectionString);

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const appliedRows = await sql`SELECT name FROM _migrations`;
  const applied = new Set(appliedRows.map((row) => row.name));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }

    const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = body
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    console.log(`apply ${file} (${statements.length} statements)`);
    await sql.transaction(
      statements.map((statement) => sql.query(statement)),
    );
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    console.log(`done ${file}`);
  }

  console.log('migrations up to date');
}

main().catch((error) => {
  console.error('migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

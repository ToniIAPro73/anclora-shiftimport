#!/usr/bin/env node
/**
 * Local ShiftImport runtime on the CANONICAL production database (same target as Preview).
 *   node scripts/qa/dev-runtime.mjs            # vercel dev --local --listen 5173
 * The repo's `.env*.local` files point at the Docker Postgres and `vercel dev` lets them win, so the
 * runtime starts from a throw-away overlay directory (a copy of the sources + a 0600 `.env.local` holding the
 * Neon connection from the Vercel Development environment). The overlay is deleted on exit; nothing is printed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, describeDatabase, pullVercelDevelopmentEnv } from './qa-lib.mjs';

const DB_KEYS = ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL_NO_SSL', 'POSTGRES_PRISMA_URL', 'PGHOST', 'PGHOST_UNPOOLED', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DATABASE'];

const dev = pullVercelDevelopmentEnv();
const target = describeDatabase(dev.DATABASE_URL_UNPOOLED || dev.DATABASE_URL); // validates the canonical target

const overlay = mkdtempSync(path.join(os.tmpdir(), 'qa-runtime-'));
// Real copy of the sources (vite refuses files reached through symlinks outside its root);
// only node_modules is linked. No .env*, .git, tests or docs are copied.
execFileSync('rsync', ['-a', '--exclude=node_modules', '--exclude=.env*', '--exclude=.git', '--exclude=.vercel', '--exclude=dist', '--exclude=qa', '--exclude=docs', '--exclude=tmp', '--exclude=sdd', '--exclude=test-data', `${ROOT}/`, `${overlay}/`]);
symlinkSync(path.join(ROOT, 'node_modules'), path.join(overlay, 'node_modules'));
const envBody = `${DB_KEYS.filter((k) => dev[k]).map((k) => `${k}="${dev[k]}"`).join('\n')}\nAUTH_APP_URL=http://localhost:5173\n`;
for (const name of ['.env', '.env.local', '.env.development.local']) {
  const file = path.join(overlay, name);
  writeFileSync(file, envBody, { mode: 0o600 });
  chmodSync(file, 0o600);
}

console.log(`[dev-runtime] database=${target.host}/${target.database} fingerprint=${target.fingerprint}`);
const child = spawn('vercel', ['dev', '--local', '--listen', '5173', '--yes'], { cwd: overlay, stdio: 'inherit' });
const cleanup = () => rmSync(overlay, { recursive: true, force: true });
child.on('exit', (code) => { cleanup(); process.exit(code ?? 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });

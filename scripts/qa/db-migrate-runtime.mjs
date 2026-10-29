#!/usr/bin/env node
/**
 * Run the canonical migration runner with the repository's production-backed
 * Vercel Development environment. Never load `.env*.local` (Docker fallback).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_DB, ROOT, pullVercelDevelopmentEnv } from './qa-lib.mjs';

const DB_ENV_KEYS = [
  'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_URL_POOLED', 'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL_NO_SSL', 'POSTGRES_PRISMA_URL',
  'PGHOST', 'PGHOST_UNPOOLED', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
  'POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DATABASE',
  'QA_DATABASE_URL', 'QA_ALLOW_LOCAL_DOCKER',
];

export function canonicalMigrationTarget(runtimeEnv) {
  const direct = runtimeEnv.DATABASE_URL_UNPOOLED;
  const connectionString = direct || runtimeEnv.DATABASE_URL || runtimeEnv.POSTGRES_URL;
  if (!connectionString) throw new Error('Vercel Development migration database is unavailable');

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Vercel Development migration database URL is invalid');
  }
  const hostname = parsed.hostname.replace('-pooler.', '.');
  if (!hostname.startsWith(`${CANONICAL_DB.endpointPrefix}.`)
      || !hostname.endsWith('.neon.tech')
      || parsed.pathname !== `/${CANONICAL_DB.database}`) {
    throw new Error('Vercel Development migration target is not canonical Neon Production main');
  }
  return { connectionString, directConnectionString: direct || null };
}

export function buildMigrationEnvironment(runtimeEnv, baseEnv = process.env) {
  const target = canonicalMigrationTarget(runtimeEnv);
  const env = { ...baseEnv, ...runtimeEnv };
  for (const key of DB_ENV_KEYS) delete env[key];

  env.DATABASE_URL = target.connectionString;
  env.POSTGRES_URL = target.connectionString;
  if (target.directConnectionString) {
    env.DATABASE_URL_UNPOOLED = target.directConnectionString;
    env.POSTGRES_URL_NON_POOLING = target.directConnectionString;
  }
  return env;
}

export function runMigrationCommand(args, runtimeEnv, baseEnv = process.env) {
  const env = buildMigrationEnvironment(runtimeEnv, baseEnv);
  const runner = path.join(ROOT, 'db/migrate.mjs');
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const runtimeEnv = pullVercelDevelopmentEnv();
    process.exitCode = runMigrationCommand(process.argv.slice(2), runtimeEnv);
  } catch (error) {
    console.error(`[db-migrate] ${error.message}`);
    process.exitCode = 1;
  }
}

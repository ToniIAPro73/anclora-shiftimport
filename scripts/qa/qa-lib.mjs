/**
 * Shared QA infrastructure (persistent QA identity + persistent QA mirror).
 * Contract: .anclora/PRODUCTION_RUNTIME.md (QA_*). Nothing here prints secrets.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QA_IDENTITY = 'qa.shiftimport@anclora.test';
/** Vercel project for this repository; public project identifier, not a credential. */
export const VERCEL_PROJECT_ID = 'prj_ZY5DO2T5dxlDSqFefWEVdVSJenLW';
export const QA_DOMAIN = '@anclora.test';
/** Synthetic EMPLOYEE-role identity used only to prove that employees can never plan (lives in the QA mirror). */
export const QA_EMPLOYEE_IDENTITY = 'qa.employee@anclora.test';
/** The real tenant. READ ONLY for every QA/dev tool: SELECT is the only statement ever allowed against it. */
export const PROTECTED_SOURCE_ORG_ID = 'a4cf0768-f08d-49e6-bb81-0d3635d58028';
/** Product naming drifted ("Safe Import" in briefs, "ShiftImport" in the database): accept both, require exactly one match. */
export const SOURCE_ORG_NAMES = Object.freeze(['Safe Import', 'ShiftImport']);
export const QA_TARGET_NAME_SUFFIX = ' — QA Mirror';
export const ENV_FILES = Object.freeze(['.env.local', '.env.development.local']);

/** Parses KEY=VALUE files without printing or mutating process.env beyond missing keys. */
export function loadEnv(files = ENV_FILES) {
  const loaded = {};
  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match || line.trimStart().startsWith('#')) continue;
      loaded[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
  }
  return { ...loaded, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) };
}

/** Canonical production database (contract: .anclora/PRODUCTION_RUNTIME.md §3). */
export const CANONICAL_DB = Object.freeze({ endpointPrefix: 'ep-lingering-dew-b1atfd0w', database: 'neondb' });

let cachedDevelopmentEnv = null;

/**
 * Pulls the Vercel *Development* environment (the contracted source of the
 * production-backed runtime) into a temp file, parses it and deletes it.
 * Nothing is persisted and nothing is printed.
 */
export function pullVercelDevelopmentEnv() {
  if (cachedDevelopmentEnv) return cachedDevelopmentEnv;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qa-env-'));
  const file = path.join(dir, 'development.env');
  try {
    execFileSync('vercel', ['env', 'pull', file, '--environment=development', '--yes', '--project', VERCEL_PROJECT_ID], { cwd: ROOT, stdio: 'ignore' });
    const parsed = {};
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (match) parsed[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
    cachedDevelopmentEnv = parsed;
    return parsed;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Connection string of the CANONICAL production Neon database.
 * Resolution: QA_DATABASE_URL, else the Vercel Development environment. The local
 * `.env*.local` files are NOT used: they point at the local Docker Postgres, and
 * identities/mirrors provisioned there are invisible to Preview and Production.
 * Fails closed if the target is not the canonical endpoint.
 */
export function databaseUrl() {
  const fromEnv = process.env.QA_DATABASE_URL;
  const dev = fromEnv ? null : pullVercelDevelopmentEnv();
  const url = fromEnv || dev.DATABASE_URL_UNPOOLED || dev.DATABASE_URL;
  if (!url || url === '[SENSITIVE]') throw new Error('Canonical database URL unavailable (set QA_DATABASE_URL or fix the Vercel Development env)');
  const { hostname, pathname } = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  if (local && process.env.QA_ALLOW_LOCAL_DOCKER !== '1') {
    throw new Error('QA GUARD: resolved database is local Docker, not the canonical Neon production database');
  }
  if (!local && (!hostname.startsWith(CANONICAL_DB.endpointPrefix) || pathname.slice(1) !== CANONICAL_DB.database)) {
    throw new Error('QA GUARD: resolved database is not the canonical Neon production endpoint');
  }
  return url;
}

/** Safe description of a connection target: no credentials, only host/db and a short fingerprint. */
export function describeDatabase(url = databaseUrl()) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace('-pooler', '');
  return { host, database: parsed.pathname.slice(1), fingerprint: createHash('sha256').update(`${host}/${parsed.pathname.slice(1)}`).digest('hex').slice(0, 12) };
}

// DATE columns must stay calendar strings: pg would otherwise build a local-midnight Date and a JSON
// round-trip (UTC) would move every date one day back in zones ahead of UTC.
pg.types.setTypeParser(1082, (value) => value);

export async function connect() {
  const url = databaseUrl();
  const local = /localhost|127\.0\.0\.1/.test(url);
  const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** Deterministic UUID (v5-style) so refreshes always rebuild the exact same ids. */
export function deterministicUuid(namespace, key) {
  const bytes = createHash('sha1').update(`${namespace}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function resolveSourceOrganization(client) {
  const { rows } = await client.query(
    'SELECT id, name FROM organizations WHERE name = ANY($1::text[]) AND name NOT LIKE $2',
    [SOURCE_ORG_NAMES, `%${QA_TARGET_NAME_SUFFIX}`],
  );
  if (rows.length !== 1) throw new Error(`Source organization is ambiguous or missing (${rows.length} matches for ${SOURCE_ORG_NAMES.join(' / ')})`);
  return rows[0];
}

export const targetNameFor = (source) => `${source.name}${QA_TARGET_NAME_SUFFIX}`;

export async function findQaUser(client) {
  const { rows } = await client.query('SELECT id, email, password_hash FROM users WHERE lower(email) = lower($1)', [QA_IDENTITY]);
  if (rows.length > 1) throw new Error('Duplicate QA identity rows');
  return rows[0] ?? null;
}

/**
 * Fail-closed guard for ANY QA write. The organization must be exactly the
 * persistent QA mirror: unique name, never the source, QA identity is a member
 * and every member is a synthetic `@anclora.test` account (so a real person
 * can never be inside a QA-writable tenant).
 */
export function assertNotProtectedSource(organizationId) {
  if (!organizationId || String(organizationId).toLowerCase() === PROTECTED_SOURCE_ORG_ID) {
    throw new Error('QA GUARD: the protected source organization is read-only');
  }
}

export async function assertQaOrganization(client, organizationId) {
  if (!organizationId) throw new Error('assertQaOrganization: organization id required');
  assertNotProtectedSource(organizationId);
  const source = await resolveSourceOrganization(client);
  if (source.id === organizationId) throw new Error('QA GUARD: organization is the source organization');
  const org = (await client.query('SELECT id, name FROM organizations WHERE id = $1', [organizationId])).rows[0];
  if (!org) throw new Error('QA GUARD: organization not found');
  if (org.name !== targetNameFor(source)) throw new Error('QA GUARD: organization name is not the QA mirror');
  const members = (await client.query(
    'SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = $1', [organizationId],
  )).rows.map((row) => row.email.toLowerCase());
  if (!members.includes(QA_IDENTITY)) throw new Error('QA GUARD: QA identity is not a member');
  const foreign = members.filter((email) => !email.endsWith(QA_DOMAIN));
  if (foreign.length) throw new Error(`QA GUARD: ${foreign.length} non-synthetic membership(s) present`);
  return org;
}

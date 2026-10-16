/**
 * Shared QA infrastructure (persistent QA identity + persistent QA mirror).
 * Contract: .anclora/PRODUCTION_RUNTIME.md (QA_*). Nothing here prints secrets.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QA_IDENTITY = 'qa.shiftimport@anclora.test';
export const QA_DOMAIN = '@anclora.test';
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

/**
 * Production Neon connection. `.env.development.local` is the local-Docker file
 * and must never provide the database URL, so DB variables come from .env.local.
 */
export function databaseUrl() {
  const env = loadEnv(['.env.local']);
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not available (expected in .env.local)');
  return url;
}

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
export async function assertQaOrganization(client, organizationId) {
  if (!organizationId) throw new Error('assertQaOrganization: organization id required');
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

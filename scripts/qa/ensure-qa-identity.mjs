#!/usr/bin/env node
/**
 * Ensures the persistent QA identity exists and can authenticate locally.
 *   node scripts/qa/ensure-qa-identity.mjs [--rotate]
 * Idempotent. Only ever touches the row for QA_IDENTITY. The password is
 * generated here, hashed with the canonical auth algorithm, stored in
 * .env.development.local (gitignored, 0600) and NEVER printed.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword } from '../../api/_lib/passwords.js';
import { QA_IDENTITY, ROOT, connect, findQaUser, loadEnv } from './qa-lib.mjs';

const LOCAL_ENV = path.join(ROOT, '.env.development.local');

function upsertLocalEnv(entries) {
  const lines = existsSync(LOCAL_ENV) ? readFileSync(LOCAL_ENV, 'utf8').split('\n') : [];
  for (const [key, value] of Object.entries(entries)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`; else lines.push(`${key}=${value}`);
  }
  writeFileSync(LOCAL_ENV, `${lines.filter((l, i, a) => l !== '' || i < a.length - 1).join('\n').replace(/\n*$/, '')}\n`, { mode: 0o600 });
  chmodSync(LOCAL_ENV, 0o600);
}

export async function ensureQaIdentity(client, { rotate = false, log = () => undefined } = {}) {
  const env = loadEnv(['.env.development.local']);
  let user = await findQaUser(client);
  const result = { existed: Boolean(user), created: false, rotated: false, passwordConfigured: false, emailConfigured: false };
  let password = env.MANUAL_QA_PASSWORD;

  if (!user) {
    password = password || randomBytes(24).toString('base64url');
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, 'QA ShiftImport') RETURNING id`,
      [QA_IDENTITY, hashPassword(password)],
    );
    user = { id: rows[0].id, password_hash: null };
    result.created = true;
    result.rotated = true;
    upsertLocalEnv({ MANUAL_QA_EMAIL: QA_IDENTITY, MANUAL_QA_PASSWORD: password });
  } else {
    const works = Boolean(password) && verifyPassword(password, user.password_hash);
    if (rotate || !works) {
      password = randomBytes(24).toString('base64url');
      const updated = await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND lower(email) = lower($3)', [hashPassword(password), user.id, QA_IDENTITY]);
      if (updated.rowCount !== 1) throw new Error('Password rotation touched an unexpected number of rows');
      result.rotated = true;
      upsertLocalEnv({ MANUAL_QA_EMAIL: QA_IDENTITY, MANUAL_QA_PASSWORD: password });
    }
  }
  const after = loadEnv(['.env.development.local']);
  result.emailConfigured = after.MANUAL_QA_EMAIL === QA_IDENTITY;
  result.passwordConfigured = Boolean(after.MANUAL_QA_PASSWORD) && verifyPassword(after.MANUAL_QA_PASSWORD, (await findQaUser(client)).password_hash);
  log(`[qa-identity] existed=${result.existed} created=${result.created} rotated=${result.rotated} configured=${result.passwordConfigured}`);
  return { ...result, userId: user.id };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const client = await connect();
  try {
    const out = await ensureQaIdentity(client, { rotate: process.argv.includes('--rotate'), log: console.log });
    if (!out.passwordConfigured) { console.error('QA password could not be verified'); process.exitCode = 1; }
  } finally { await client.end(); }
}

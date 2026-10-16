/* Persistent QA mirror helpers. Secrets are read from the gitignored local env file and never logged. */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_DIR = join(__dirname, '..', '.qa-state');
export const STATE_FILE = join(STATE_DIR, 'qa-storage-state.json');
export const CONTEXT_FILE = join(STATE_DIR, 'qa-context.json');
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
export const ACTIVE_ORG_KEY = 'anclora_shiftimport_active_org_v1';

export interface QaContext { userId: string; organizationId: string; sourceOrganizationId: string; email: string }

export async function qaLib() {
  return import('../../../scripts/qa/qa-lib.mjs');
}

export function ensureStateDir() { mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 }); }
export function destroyState() { rmSync(STATE_DIR, { recursive: true, force: true }); }

/** Fail-closed write guard: aborts unless the organization is exactly the QA mirror. */
export async function assertQaOrganization(organizationId: string) {
  const lib = await qaLib();
  const client = await lib.connect();
  try { return await lib.assertQaOrganization(client, organizationId); } finally { await client.end(); }
}

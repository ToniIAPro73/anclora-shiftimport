/* Logs in as the persistent QA identity against the local dev server and stores a TEMPORARY storageState. */
import { writeFileSync } from 'node:fs';
import { request } from '@playwright/test';
import { ACTIVE_ORG_KEY, BASE_URL, CONTEXT_FILE, STATE_FILE, ensureStateDir, qaLib, type QaContext } from './helpers/qa-mirror';

export default async function globalSetup() {
  const lib = await qaLib();
  const env = lib.loadEnv(['.env.development.local']);
  const email = env.MANUAL_QA_EMAIL;
  const password = env.MANUAL_QA_PASSWORD;
  if (email !== lib.QA_IDENTITY || !password) {
    throw new Error('QA credentials not configured: run `node scripts/qa/ensure-qa-identity.mjs`');
  }
  const client = await lib.connect();
  let ctx: QaContext;
  try {
    const source = await lib.resolveSourceOrganization(client);
    const target = (await client.query('SELECT id FROM organizations WHERE name = $1', [lib.targetNameFor(source)])).rows[0];
    if (!target) throw new Error('QA mirror missing: run `node scripts/qa/refresh-qa-mirror.mjs --apply`');
    await lib.assertQaOrganization(client, target.id);
    const user = await lib.findQaUser(client);
    ctx = { userId: user.id, organizationId: target.id, sourceOrganizationId: source.id, email };
  } finally { await client.end(); }

  ensureStateDir();
  const api = await request.newContext({ baseURL: BASE_URL });
  const login = await api.post('/api/auth/login', { data: { email, password } });
  if (!login.ok()) throw new Error(`QA login failed (${login.status()})`);
  const state = await api.storageState();
  // Select the QA mirror as active organization (client-side preference keyed by user id).
  state.origins = [{ origin: BASE_URL, localStorage: [
    { name: ACTIVE_ORG_KEY, value: JSON.stringify({ [ctx.userId]: ctx.organizationId }) },
    { name: 'anclora_shiftimport_locale_v1', value: 'es' },
    // Dismiss first-visit overlays so they never cover the UI under test.
    { name: 'anclora-cookie-consent-v1', value: JSON.stringify({ necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1' }) },
    { name: 'anclora_shiftimport_onboarding_v1', value: JSON.stringify({ version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED' }) },
  ] }];
  writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
  writeFileSync(CONTEXT_FILE, JSON.stringify(ctx), { mode: 0o600 });
  await api.dispose();
}

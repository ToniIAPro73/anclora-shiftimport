/* QA EMPLOYEE browser session (qa.employee@anclora.test) for the QA mirror only. Secrets come from the gitignored env file. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, request as pwRequest } from '@playwright/test';
import { ACTIVE_ORG_KEY, BASE_URL, STATE_DIR, ensureStateDir, qaLib, type QaContext } from './qa-mirror';

export const EMPLOYEE_STATE = join(STATE_DIR, 'qa-employee-storage-state.json');

export async function prepareEmployeeState(ctx: QaContext): Promise<{ employeeId: string }> {
  const lib = await qaLib();
  const env = lib.loadEnv(['.env.development.local']);
  ensureStateDir();
  const api = await pwRequest.newContext({ baseURL: BASE_URL });
  const res = await api.post('/api/auth/login', { data: { email: lib.QA_EMPLOYEE_IDENTITY, password: env.MANUAL_QA_EMPLOYEE_PASSWORD } });
  if (!res.ok()) throw new Error(`QA employee login failed (${res.status()})`);
  const me = await (await api.get('/api/session/me', { headers: { 'x-organization-id': ctx.organizationId } })).json();
  const employeeId = me.session?.employeeId ?? me.employeeId;
  expect(employeeId).toBeTruthy();
  const state = await api.storageState();
  state.origins = [{ origin: BASE_URL, localStorage: [
    { name: ACTIVE_ORG_KEY, value: JSON.stringify({ [me.user?.id ?? me.userId]: ctx.organizationId }) },
    { name: 'anclora_shiftimport_locale_v1', value: 'es' },
    { name: 'anclora-cookie-consent-v1', value: JSON.stringify({ necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1' }) },
    { name: 'anclora_shiftimport_onboarding_v1', value: JSON.stringify({ version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED' }) },
  ] }];
  writeFileSync(EMPLOYEE_STATE, JSON.stringify(state), { mode: 0o600 });
  await api.dispose();
  return { employeeId };
}

#!/usr/bin/env node
/**
 * QA login/mirror smoke for a running ShiftImport deployment. Never prints secrets.
 *   node scripts/qa/qa-smoke.mjs --local                 # http://localhost:5173 (see dev-runtime.mjs)
 *   node scripts/qa/qa-smoke.mjs --preview [--url <u>]   # development Preview (auto-discovered via GitHub deployments)
 * Checks: QA login, session, QA mirror membership, 62-employee pseudonymised roster, populated stats and reconciliation.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QA_IDENTITY, describeDatabase, loadEnv } from './qa-lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

function discoverPreviewUrl() {
  const gh = (a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  const sha = gh(['api', `repos/${repo}/branches/development`, '--jq', '.commit.sha']);
  const id = gh(['api', `repos/${repo}/deployments`, '--jq', `[.[]|select(.environment=="Preview" and .sha=="${sha}")][0].id`]);
  if (!id) throw new Error(`No Preview deployment for development@${sha.slice(0, 7)} yet`);
  const url = gh(['api', `repos/${repo}/deployments/${id}/statuses`, '--jq', '.[0].environment_url // .[0].target_url']);
  return { url, sha: sha.slice(0, 7) };
}

export async function runSmoke(baseUrl) {
  const env = loadEnv(['.env.development.local']);
  if (env.MANUAL_QA_EMAIL !== QA_IDENTITY || !env.MANUAL_QA_PASSWORD) throw new Error('QA credentials not configured (run ensure-qa-identity.mjs)');
  const result = { baseUrl, database: describeDatabase().fingerprint };
  const json = async (res) => res.json().catch(() => ({}));

  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: QA_IDENTITY, password: env.MANUAL_QA_PASSWORD }) });
  result.login = login.ok ? 'PASS' : `FAIL(${login.status})`;
  if (!login.ok) return result;
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const call = (p, org) => fetch(`${baseUrl}${p}`, { headers: { cookie, ...(org ? { 'x-organization-id': org } : {}) } });

  const me = await json(await call('/api/session/me'));
  result.session = me.user?.email === QA_IDENTITY ? 'PASS' : 'FAIL';
  const mirror = (me.memberships ?? []).find((m) => String(m.organizationName).endsWith(' — QA Mirror'));
  result.qaMirrorVisible = mirror ? 'PASS' : 'FAIL';
  if (!mirror) return result;
  result.mirrorOrganization = mirror.organizationName;

  const employees = (await json(await call('/api/employees', mirror.organizationId))).employees ?? [];
  result.employees = employees.length;
  const synthetic = (e) => /^Empleado QA \d{3}$/.test(e.name) || e.name === 'Sebastián Pozo Mendoza — QA';
  result.pseudonymised = employees.every(synthetic) ? 'PASS' : 'FAIL';
  const pilot = employees.find((e) => e.externalEmployeeId === '84881');
  result.pilotEmployee = pilot ? 'PASS' : 'FAIL';
  result.pilotUnlinkedFromUser = pilot && !pilot.userId ? 'PASS' : 'FAIL';
  if (!pilot) return result;
  const stats = (year) => call(`/api/calendar/stats?employeeId=${pilot.id}&year=${year}`, mirror.organizationId).then(json);
  const s2026 = await stats(2026);
  result.statisticsPopulated = (s2026.calendarRows ?? 0) > 0 ? 'PASS' : 'FAIL';
  result.effectiveMinutes2026 = s2026.realized?.effectiveMinutes;
  result.target2026 = s2026.target?.minimumAnnualMinutes === 91740 && s2026.target?.maximumAnnualMinutes === 92400 ? 'PASS' : 'FAIL';
  const s2025 = await stats(2025);
  result.calendar2025Empty = (s2025.calendarRows ?? -1) === 0 && !s2025.target ? 'PASS' : 'FAIL';
  const recon = await json(await call(`/api/calendar/reconciliation?employeeId=${pilot.id}&year=2026`, mirror.organizationId));
  result.reconciliationPending = recon.pendingCount ?? 0;
  result.reconciliationVisible = result.reconciliationPending > 0 ? 'PASS' : 'NOT_APPLICABLE';
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let base = option('--url');
  let sha = null;
  if (!base && flag('--local')) base = 'http://localhost:5173';
  if (!base && flag('--preview')) ({ url: base, sha } = discoverPreviewUrl());
  if (!base) { console.error('Use --local, --preview or --url <base>'); process.exit(2); }
  const out = await runSmoke(base);
  if (sha) out.deploymentSha = sha;
  console.log(JSON.stringify(out, null, 2));
  const failed = Object.values(out).some((v) => typeof v === 'string' && v.startsWith('FAIL'));
  process.exit(failed ? 1 : 0);
}

import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../../api/_lib/passwords.js';

/**
 * Seeds a synthetic organization (admin who is also an employee + a plain
 * employee) directly in the local Docker PostgreSQL and removes it afterwards.
 * Data mirrors the canonical acceptance days without using real people.
 */
type Sql = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>) & { end?: () => Promise<void> };

const PASSWORD = 'E2e-pass-1234';
const run = randomUUID().slice(0, 8);
const ids = { org: randomUUID(), admin: randomUUID(), employeeUser: randomUUID(), adminEmp: randomUUID(), plainEmp: randomUUID() };
const email = (key: string) => `effcal-${key}-${run}@e2e.test`;
let sql: Sql;

async function shift(employeeId: string, date: string, type: string, start: string | null, end: string | null, extra: { layer?: string; state?: string; revision?: number } = {}) {
  const work = ['Regular', 'Extras'].includes(type);
  await sql`
    INSERT INTO shifts (id, organization_id, employee_id, date, start_time, end_time, location, origin, shift_type, counts_as_work,
                        layer, provenance, effective_state, plan_revision)
    VALUES (${randomUUID()}, ${ids.org}, ${employeeId}, ${date}, ${start}, ${end}, ${type}, 'IMP', ${type}, ${work},
            ${extra.layer ?? 'COMPANY_PLAN'}, 'COMPANY_IMPORT', ${extra.state ?? 'EFFECTIVE'}, ${extra.revision ?? 1})`;
}

test.beforeAll(async () => {
  const url = process.env.EFFECTIVE_CALENDAR_DATABASE_URL;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('EFFECTIVE_CALENDAR_DATABASE_URL must point at the local Docker database');
  }
  const { createTaggedSql } = await import('../../../db/connection.mjs');
  sql = createTaggedSql(url) as unknown as Sql;
  const hash = hashPassword(PASSWORD);
  await sql`INSERT INTO organizations (id, name, plan, type) VALUES (${ids.org}, ${`E2E-EFFCAL-${run}`}, 'team', 'company')`;
  await sql`INSERT INTO users (id, email, password_hash, display_name) VALUES (${ids.admin}, ${email('admin')}, ${hash}, 'Effcal Admin')`;
  await sql`INSERT INTO users (id, email, password_hash, display_name) VALUES (${ids.employeeUser}, ${email('emp')}, ${hash}, 'Effcal Employee')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${ids.admin}, ${ids.org}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${ids.employeeUser}, ${ids.org}, 'EMPLOYEE')`;
  await sql`INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status) VALUES (${ids.adminEmp}, ${ids.org}, ${`A${run}`}, 'Effcal Admin', ${ids.admin}, 'active')`;
  await sql`INSERT INTO employees (id, organization_id, external_employee_id, name, user_id, status) VALUES (${ids.plainEmp}, ${ids.org}, ${`E${run}`}, 'Effcal Employee', ${ids.employeeUser}, 'active')`;

  const e = ids.adminEmp;
  // 2026-01-01: original Libre (superseded) -> company revision Regular 11-19 (+ absorbed personal change)
  await shift(e, '2026-01-01', 'Libre', null, null, { state: 'SUPERSEDED' });
  await shift(e, '2026-01-01', 'Regular', '11:00', '19:00', { layer: 'CHANGE', state: 'ABSORBED' });
  await shift(e, '2026-01-01', 'Regular', '11:00', '19:00', { revision: 2 });
  // 2026-02-06 / 02-18: JT summaries never add hours
  await shift(e, '2026-02-06', 'Regular', '13:00', '20:00');
  await shift(e, '2026-02-06', 'Extras', '20:00', '21:00', { layer: 'CHANGE' });
  await shift(e, '2026-02-06', 'JT', '13:00', '21:00', { layer: 'CHANGE', state: 'METADATA_ONLY' });
  await shift(e, '2026-02-18', 'Regular', '13:00', '21:00');
  await shift(e, '2026-02-18', 'Extras', '21:00', '23:15', { layer: 'CHANGE' });
  await shift(e, '2026-02-18', 'JT', '13:00', '23:15', { layer: 'CHANGE', state: 'METADATA_ONLY' });
  // 2026-06-02: company Baja vs historical Regular -> pending reconciliation
  await shift(e, '2026-06-02', 'Baja', null, null, { revision: 2, state: 'REQUIRES_REVIEW' });
  await shift(e, '2026-06-02', 'Regular', '14:00', '22:00', { state: 'REQUIRES_REVIEW' });
  await shift(ids.plainEmp, '2026-02-02', 'Regular', '08:00', '16:00');
});

test.afterAll(async () => {
  if (!sql) return;
  await sql`DELETE FROM organizations WHERE id = ${ids.org}`;
  await sql`DELETE FROM users WHERE id IN (${ids.admin}, ${ids.employeeUser})`;
  const left = await sql`SELECT COUNT(*)::int AS n FROM organizations WHERE id = ${ids.org}`;
  expect(left[0].n).toBe(0);
  await sql.end?.();
});

async function login(page: Page, who: 'admin' | 'emp') {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  });
  const response = await page.request.post('/api/auth/login', { data: { email: email(who), password: PASSWORD } });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
}

async function goToMonth(page: Page, year: number, monthIndex: number) {
  const now = new Date();
  let delta = (year - now.getFullYear()) * 12 + (monthIndex - now.getMonth());
  const label = delta < 0 ? 'Mes anterior' : 'Mes siguiente';
  delta = Math.abs(delta);
  for (let i = 0; i < delta; i += 1) {
    await page.getByRole('button', { name: label }).click();
  }
}

test('legacy "Propios" / "Empresa" statistics are gone and effective stats are shown', async ({ page }) => {
  await login(page, 'admin');
  const panel = page.getByTestId('effective-stats-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Propios')).toHaveCount(0);
  await expect(page.getByTestId('stats-bar-desktop')).toHaveCount(0);
  await expect(page.getByTestId('eff-month')).toBeVisible();
  await expect(page.getByTestId('eff-year')).toBeVisible();
});

test('February: JT adds no hours (8h + 10h15 = 18h15) and days with changes are marked', async ({ page }) => {
  await login(page, 'admin');
  await goToMonth(page, 2026, 1);
  await expect(page.getByTestId('eff-month-effective')).toContainText('18 h 15 min');
  await expect(page.getByTestId('eff-month-extras')).toContainText('3 h 15 min');
  await expect(page.getByTestId('day-history-btn-2026-02-06')).toBeVisible();
  await page.getByTestId('day-history-btn-2026-02-18').click();
  const history = page.getByTestId('day-history');
  await expect(history).toContainText('Regular');
  await expect(history).toContainText('13:00–21:00');
  await expect(history).toContainText('21:00–23:15');
});

test('2026-01-01: effective Regular 11-19 with the original Libre kept in history', async ({ page }) => {
  await login(page, 'admin');
  await goToMonth(page, 2026, 0);
  await expect(page.getByTestId('eff-month-effective')).toContainText('8 h');
  await expect(page.getByTestId('eff-month-free-days')).toContainText('0 d');
  await page.getByTestId('day-history-btn-2026-01-01').click();
  const history = page.getByTestId('day-history');
  await expect(history).toContainText('Plan empresa original');
  await expect(history).toContainText('Libre');
  await expect(history).toContainText('Plan empresa vigente');
});

test('2026-06-02: pending reconciliation is reported, does not add hours and an admin can resolve it', async ({ page }) => {
  await login(page, 'admin');
  await goToMonth(page, 2026, 5);
  await expect(page.getByTestId('eff-unresolved-alert')).toContainText('1 día pendiente de reconciliación');
  await expect(page.getByTestId('eff-month-effective')).toContainText('0 h');
  await page.getByTestId('day-history-btn-2026-06-02').click();
  const pending = page.getByTestId('day-history-pending');
  await expect(pending).toBeVisible();
  await pending.getByRole('checkbox').first().check();
  await pending.getByRole('textbox').fill('Company calendar says leave');
  await pending.getByRole('button', { name: 'Guardar decisión' }).click();
  await expect(page.getByTestId('day-history-pending')).toHaveCount(0);
  const audit = await sql`SELECT change_type, actor_role, self_change, reason FROM calendar_changes WHERE organization_id = ${ids.org} AND date = '2026-06-02'`;
  expect(audit[0]).toMatchObject({ change_type: 'RECONCILIATION', actor_role: 'ADMIN', self_change: true, reason: 'Company calendar says leave' });
});

test('annual target is configured per year; other years stay unconfigured', async ({ page }) => {
  await login(page, 'admin');
  await expect(page.getByTestId('eff-contract-unconfigured')).toContainText('Objetivo anual no configurado');
  await page.getByTestId('eff-contract-configure').click();
  await page.getByTestId('annual-target-minimum').fill('1529');
  await page.getByTestId('annual-target-maximum').fill('1540');
  await expect(page.getByTestId('annual-target-margin')).toContainText('11 h');
  await page.getByTestId('annual-target-save').click();
  await expect(page.getByTestId('eff-contract-status')).toBeVisible();
  await expect(page.getByTestId('eff-contract-minimum')).toContainText('1529 h');
  await expect(page.getByTestId('eff-contract-margin')).toContainText('11 h');
  const rows = await sql`SELECT year, minimum_annual_minutes, maximum_annual_minutes FROM employee_annual_targets WHERE organization_id = ${ids.org}`;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ minimum_annual_minutes: 91740, maximum_annual_minutes: 92400 });
  // The target belongs to 2026 only: the previous year stays unconfigured.
  await goToMonth(page, 2025, 5);
  await expect(page.getByTestId('eff-contract-unconfigured')).toContainText('Objetivo anual no configurado');
});

test('admin self-change is recorded as an auditable administrative action', async ({ page }) => {
  await login(page, 'admin');
  const response = await page.request.post('/api/calendar/changes', {
    data: {
      employeeId: ids.adminEmp, date: '2026-03-03', changeType: 'ADD_SHIFT', reason: 'Controlled QA fixture',
      after: [{ shiftType: 'Regular', startTime: '08:00', endTime: '16:00' }],
    },
  });
  expect(response.status()).toBe(201);
  const [change] = await sql`SELECT actor_user_id, actor_role, self_change, reason, change_type, approval_status, employee_id FROM calendar_changes WHERE organization_id = ${ids.org} AND date = '2026-03-03'`;
  expect(change).toMatchObject({ actor_user_id: ids.admin, actor_role: 'ADMIN', self_change: true, reason: 'Controlled QA fixture', approval_status: 'APPLIED', employee_id: ids.adminEmp });
  await sql`DELETE FROM calendar_changes WHERE organization_id = ${ids.org} AND date = '2026-03-03'`;
  await sql`DELETE FROM shifts WHERE organization_id = ${ids.org} AND date = '2026-03-03'`;
});

test('an employee-role session gets no administrative privileges', async ({ page }) => {
  await login(page, 'emp');
  await expect(page.getByTestId('eff-contract-configure')).toHaveCount(0);
  const write = await page.request.put('/api/calendar/annual-targets', {
    data: { employeeId: ids.plainEmp, year: 2026, minimumAnnualMinutes: 1, maximumAnnualMinutes: 2 },
  });
  expect(write.status()).toBe(403);
  const change = await page.request.post('/api/calendar/changes', {
    data: { employeeId: ids.plainEmp, date: '2026-03-04', changeType: 'ADD_SHIFT', reason: 'nope', after: [{ shiftType: 'Regular', startTime: '08:00', endTime: '16:00' }] },
  });
  expect(change.status()).toBe(403);
  const other = await page.request.get(`/api/calendar/stats?employeeId=${ids.adminEmp}&year=2026`);
  expect(other.ok()).toBe(true);
  // An EMPLOYEE can only ever read their own data: the server forces the employee.
  expect((await other.json()).employeeId).toBe(ids.plainEmp);
});

test('layout has no horizontal overflow', async ({ page }) => {
  await login(page, 'admin');
  await expect(page.getByTestId('effective-stats-panel')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CONTEXT_FILE, assertQaOrganization, qaLib, type QaContext } from '../helpers/qa-mirror';

/**
 * "This day changed" is a VISIBLE change (QA mirror, read-only). The mirror holds the real-life 16/07 case: effective
 * Vacaciones next to an absorbed Vacaciones and a system RECONCILIATION whose stored reason is the legacy
 * "Reconciled (HIGH): consistent with company calendar". It must NOT be flagged as a changed day; days whose history
 * really differs still are; the audit data is untouched.
 */
let ctx: QaContext;
let pilotId = '';

test.beforeAll(async () => {
  ctx = JSON.parse(readFileSync(CONTEXT_FILE, 'utf8')) as QaContext;
  await assertQaOrganization(ctx.organizationId);
  const lib = await qaLib();
  const db = await lib.connect();
  try { pilotId = String((await db.query(`SELECT id FROM employees WHERE organization_id = $1 AND external_employee_id = '84881'`, [ctx.organizationId])).rows[0].id); } finally { await db.end(); }
});
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test.skip(({ viewport }) => (viewport?.width ?? 1440) < 900, 'desktop project only');

async function pilotJuly(page: Page) {
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: /Mes anterior|Previous month/ }).click();
  await expect(page.locator('.month-nav-label')).toContainText('Julio 2026');
}

test('16/07: technical history (Vacaciones → Vacaciones) is not a changed day; the audit trail is intact', async ({ page }) => {
  const headers = { 'x-organization-id': ctx.organizationId };
  const shifts = (await (await page.request.get(`/api/shifts?employeeId=${pilotId}`, { headers })).json()).shifts as Array<{ date: string; hasHistory: boolean; layer: string; effectiveState: string }>;
  const day = shifts.filter((s) => s.date === '2026-07-16');
  expect(day.length).toBeGreaterThan(0);
  expect(day.every((s) => s.hasHistory === false)).toBe(true); // the server no longer calls it a visible change
  // …but the stored audit trail is exactly what it was
  const history = await (await page.request.get(`/api/calendar/changes?employeeId=${pilotId}&date=2026-07-16`, { headers })).json();
  expect(history.changes.some((c: { changeType: string; actorRole: string; reason: string }) => c.changeType === 'RECONCILIATION' && c.actorRole === 'SYSTEM' && /Reconciled \(HIGH\)/.test(c.reason))).toBe(true);

  await pilotJuly(page);
  await expect(page.locator('.month-day-cell', { has: page.locator('.month-day-number', { hasText: /^16$/ }) }).first()).toBeVisible();
  await expect(page.getByTestId('day-history-btn-2026-07-16')).toHaveCount(0); // no "Este día ha cambiado" icon
});

test('days whose history really differs keep the indicator (and it opens the day)', async ({ page }) => {
  const headers = { 'x-organization-id': ctx.organizationId };
  const shifts = (await (await page.request.get(`/api/shifts?employeeId=${pilotId}`, { headers })).json()).shifts as Array<{ date: string; hasHistory: boolean; layer: string; effectiveState: string }>;
  const visible = [...new Set(shifts.filter((s) => (s.hasHistory || s.layer === 'CHANGE') && s.effectiveState === 'EFFECTIVE').map((s) => s.date))];
  expect(visible.length).toBeLessThan(57); // the previous rule flagged 57 days of this pilot
  test.skip(visible.length === 0, 'the mirror has no day with a real visible change');

  const target = visible.sort()[0];
  const [year, month] = target.split('-').map(Number);
  await page.goto('/app');
  const filter = page.getByTestId('calendar-employee-filter');
  await filter.getByRole('combobox').or(filter.getByRole('button')).first().click();
  await page.getByRole('option', { name: /Sebastián Pozo Mendoza — QA/ }).first().click();
  await expect(page.getByTestId('calendar-stats-button')).toBeVisible();
  const nowMonths = 2026 * 12 + 9; // the app opens on the operational month (Oct 2026 in the mirror)
  const delta = nowMonths - (year * 12 + (month - 1));
  const button = page.getByRole('button', { name: delta > 0 ? /Mes anterior|Previous month/ : /Mes siguiente|Next month/ });
  for (let i = 0; i < Math.abs(delta); i += 1) await button.click();
  const icon = page.getByTestId(`day-history-btn-${target}`);
  await expect(icon).toBeVisible();
  await icon.click();
  await expect(page.getByTestId('day-detail-dialog')).toBeVisible();
});

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { qaLib } from '../helpers/qa-mirror';

/**
 * F4-M04 mobile E2E (375×812, touch). Real server + real Neon with run-scoped synthetic tenants (see f4-mobile-setup.ts).
 * Scenarios: A requests center + bulk approval, B copy week, C publish pending, D bulk reconciliation, E shift modal, F session/bfcache.
 */
const here = __dirname;
const fx = JSON.parse(readFileSync(join(here, '..', 'artifacts', 'f4-mobile-fixture.json'), 'utf8'));
const EVIDENCE = join(here, '..', 'artifacts', 'F4-MOBILE', 'e2e-mobile-375');
mkdirSync(EVIDENCE, { recursive: true });

async function signIn(context: BrowserContext, page: Page) {
  const res = await context.request.post('/api/auth/login', { data: { email: fx.ownerEmail, password: fx.password } });
  expect(res.ok()).toBeTruthy();
  await page.addInitScript(() => {
    const set = (k: string, v: unknown) => window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    set('anclora-cookie-consent-v1', { necessary: true, analytics: false, marketing: false, updatedAt: new Date().toISOString(), version: 'v1' });
    set('anclora_shiftimport_onboarding_v1', { version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED' });
    set('anclora_shiftimport_locale_v1', 'es');
    set('anclora_theme_mode', 'dark');
  });
}

/** No document-level horizontal scroll, and the topmost dialog fits the viewport. */
async function expectFits(page: Page) {
  const m = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role=dialog]')];
    const d = dialogs[dialogs.length - 1];
    const r = d?.getBoundingClientRect();
    return {
      docX: document.documentElement.scrollWidth > innerWidth,
      fits: !r || (r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight),
      dialogX: d ? d.scrollWidth > d.clientWidth + 1 : false,
    };
  });
  expect(m.docX, 'document horizontal overflow').toBe(false);
  expect(m.fits, 'dialog inside viewport').toBe(true);
  expect(m.dialogX, 'dialog horizontal overflow').toBe(false);
}

async function expectAxeClean(page: Page) {
  const result = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map((v) => `${v.id}:${v.nodes.length}`)).toEqual([]);
}

/** Tab through the topmost dialog: focus must stay inside it and be visible. */
async function expectFocusTrapped(page: Page, steps = 8) {
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('[role=dialog]')];
      const d = dialogs[dialogs.length - 1];
      const a = document.activeElement as HTMLElement | null;
      const cs = a ? getComputedStyle(a) : null;
      const r = a?.getBoundingClientRect();
      return {
        inside: !!d && !!a && d.contains(a),
        visibleFocus: !!cs && (cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' || a?.matches(':focus-visible')),
        onScreen: !!r && r.width > 0 && r.bottom > 0 && r.top < innerHeight,
      };
    });
    expect(state.inside, `Tab #${i + 1} stays inside dialog`).toBe(true);
    expect(state.onScreen, `Tab #${i + 1} focus is on screen`).toBe(true);
  }
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`) });
}

async function openRequestCenter(page: Page) {
  const topbar = page.getByTestId('topbar-pending-requests');
  if (await topbar.isVisible().catch(() => false)) {
    await topbar.click();
  } else {
    await page.getByTestId('app-shell-mobile-menu').click();
    await page.getByTestId('sidebar-approvals').click();
  }
  await expect(page.getByTestId('request-center')).toBeVisible();
  await expect(page.locator('[data-testid^="approve-btn-"]').first()).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page, context }) => {
  await signIn(context, page);
  page.on('dialog', (d) => { throw new Error(`unexpected native dialog: ${d.message()}`); });
});

test('A · Requests center: tabs, history, bulk approval with per-item results', async ({ page }) => {
  await page.goto('/app');
  await openRequestCenter(page);
  await expectFits(page);

  const pendingTab = page.getByRole('tab', { name: /Pendientes/ });
  await expect(pendingTab).toContainText('4');
  await expect(page.getByRole('tab', { name: /Historial/ })).toBeVisible();
  // The owner has no linked employee: «Mis solicitudes» must not be offered.
  await expect(page.getByRole('tab', { name: /Mis solicitudes/ })).toHaveCount(0);

  await page.getByRole('tab', { name: /Historial/ }).click();
  await expect(page.locator('[data-testid^="approval-resolution-"]')).toHaveCount(1);
  await shot(page, 'A1-history');
  await pendingTab.click();

  await expectAxeClean(page);
  await shot(page, 'A2-pending');

  await page.getByTestId('approval-select-all').check();
  await expect(page.getByTestId('approval-bulk-bar')).toBeVisible();
  await expectFocusTrapped(page, 6);
  await page.getByTestId('approval-bulk-approve').click();
  await expect(page.getByTestId('approval-bulk-result')).toContainText('4');
  await shot(page, 'A3-bulk-result');
  await expectFits(page);
  await expect(pendingTab).not.toContainText('(');
  await page.getByRole('tab', { name: /Historial/ }).click();
  await expect(page.locator('[data-testid^="approval-resolution-"]')).toHaveCount(5);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('request-center')).toHaveCount(0);
});

test('B · Copy week: preview, cancel, confirm, repeat without duplicates', async ({ page }) => {
  await page.goto(`/app/schedule?date=${fx.copyTargetWeek}`);
  await expect(page.getByTestId('weekly-planner')).toBeVisible();
  await expect(page.getByTestId('planner-count')).toContainText('0');

  await page.getByTestId('copy-week-open').click();
  await expect(page.getByTestId('copy-week-dialog')).toBeVisible();
  await expect(page.getByTestId('copy-week-candidates')).toBeVisible();
  await expectFits(page);
  await expectAxeClean(page);
  await expectFocusTrapped(page, 6);
  await shot(page, 'B1-copy-preview');

  // Cancel changes nothing.
  await page.getByTestId('copy-week-cancel').click();
  await expect(page.getByTestId('copy-week-dialog')).toHaveCount(0);
  await expect(page.getByTestId('planner-count')).toContainText('0');

  await page.getByTestId('copy-week-open').click();
  await page.getByTestId('copy-week-confirm').click();
  await expect(page.getByTestId('copy-week-done')).toContainText('3');
  await expect(page.getByTestId('copy-week-cancel')).toBeFocused(); // focus must not fall to <body> when the results arrive
  await shot(page, 'B2-copy-done');
  await page.getByTestId('copy-week-cancel').click();
  await expect(page.getByTestId('planner-count')).toContainText('3');

  // Idempotent: nothing left to copy, still 3 assignments.
  await page.getByTestId('copy-week-open').click();
  await expect(page.getByTestId('copy-week-nothing')).toBeVisible();
  await page.getByTestId('copy-week-cancel').click();
  await expect(page.getByTestId('planner-count')).toContainText('3');
});

test('C · Publish pending weeks: per-week results and planner counter', async ({ page }) => {
  await page.goto(`/app/schedule?date=${fx.copyTargetWeek}`);
  await expect(page.getByTestId('weekly-planner')).toBeVisible();
  await page.getByTestId('publish-pending-open').click();
  await expect(page.getByTestId('publish-pending-dialog')).toBeVisible();
  await expect(page.locator('[data-testid^="publish-pending-row-"]')).toHaveCount(3);
  await expectFits(page);
  await expectAxeClean(page);
  await shot(page, 'C1-publish-preview');

  await page.getByTestId('publish-pending-select-all').check();
  await page.getByTestId('publish-pending-confirm').click();
  await expect(page.locator('[data-testid^="publish-pending-result-"]')).toHaveCount(3);
  await expect(page.getByTestId('publish-pending-results')).toContainText(/Publicad/);
  await expect(page.getByTestId('publish-pending-cancel')).toBeFocused();
  await expectFits(page);
  await shot(page, 'C2-publish-results');
  await page.getByTestId('publish-pending-cancel').click();

  await page.goto(`/app/schedule?date=${fx.pendingWeeks[0]}`);
  await expect(page.getByTestId('planner-count')).toContainText(/publicad/i);
});

test('D · Bulk reconciliation «Mantener actual»: reason, per-day results, no duplicates', async ({ page }) => {
  await page.goto(`/app?date=${fx.reconDates[0]}`);
  await page.getByTestId('calendar-employee-filter').getByRole('button').click();
  await page.getByText(/E2E Uno/).first().click();
  const recon = page.getByTestId('calendar-reconciliation-button');
  await expect(recon).toBeVisible();
  await recon.click();
  await expect(page.getByTestId('reconciliation-modal')).toBeVisible();
  await expectFits(page);
  await expectAxeClean(page);
  await shot(page, 'D1-reconciliation');

  await page.getByTestId('recon-select-all').check();
  await page.getByTestId('recon-keep-current').click();
  await expect(page.getByTestId('keep-current-dialog')).toBeVisible();
  await expect(page.locator('[data-testid^="keep-current-day-"]')).toHaveCount(4);
  await expectFits(page);
  await expectAxeClean(page);
  await shot(page, 'D2-keep-preview');

  const confirm = page.getByTestId('keep-current-confirm');
  await expect(confirm).toBeDisabled(); // a reason is mandatory
  await page.getByTestId('keep-current-reason').fill('E2E móvil: mantener turno actual');
  await confirm.click();
  await expect(page.locator('[data-testid^="keep-current-result-"]')).toHaveCount(4);
  await expect(page.getByTestId('keep-current-cancel')).toBeFocused();
  await shot(page, 'D3-keep-results');

  // Exactly one effective row per day and no pending proposal left.
  const lib = await qaLib();
  const db = await lib.connect();
  let rows: Array<{ date: string; effective: number; pending: number }>;
  try {
    rows = (await db.query(
      `SELECT date::text AS date, COUNT(*) FILTER (WHERE effective_state = 'EFFECTIVE')::int AS effective,
         COUNT(*) FILTER (WHERE effective_state = 'REQUIRES_REVIEW')::int AS pending
       FROM shifts WHERE organization_id = $1 AND employee_id = $2 AND date = ANY($3::date[]) GROUP BY date`,
      [fx.orgA, fx.empA1, fx.reconDates])).rows;
  } finally { await db.end(); }
  expect(rows).toHaveLength(4);
  for (const row of rows) {
    expect(row.effective, `effective rows on ${row.date}`).toBe(1);
    expect(row.pending, `pending rows on ${row.date}`).toBe(0);
  }
});

test('E · Shift modal on mobile: selector stable, times side-by-side or stacked without overlap, validation inside', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('app-shell-mobile-menu').click();
  await page.getByTestId('sidebar-add-shift').click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  await expectFits(page);
  await expectAxeClean(page);

  const top = async () => (await dialog.boundingBox())!.y;
  const before = await top();
  await dialog.locator('button[aria-haspopup=listbox]').click();
  const menu = page.locator('.modal-select-menu');
  await expect(menu).toBeVisible();
  expect(Math.abs((await top()) - before), 'modal does not move when the selector opens').toBeLessThanOrEqual(1);
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(812);
  await shot(page, 'E1-selector-open');

  // Escape closes the menu first, not the modal.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await dialog.locator('button[aria-haspopup=listbox]').click();
  await page.locator('.modal-select-menu [role=option]').filter({ hasText: 'Extras' }).click();
  await expect(menu).toHaveCount(0);

  const [start, end] = [dialog.locator('input[type=time]').nth(0), dialog.locator('input[type=time]').nth(1)];
  await start.fill('18:00');
  await end.fill('21:00');
  const a = (await start.boundingBox())!;
  const b = (await end.boundingBox())!;
  const overlap = !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  expect(overlap, 'time fields do not overlap').toBe(false);
  await expectFits(page);

  // Validation error is shown INSIDE the modal and is reachable.
  await start.fill('');
  await dialog.locator('.shift-modal__confirm').click();
  const alert = dialog.getByTestId('shift-modal-feedback');
  await expect(alert).toBeVisible();
  await expect(alert).toBeInViewport();
  await shot(page, 'E2-validation');
  await start.fill('18:00');
  await expectFocusTrapped(page, 8);

  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toHaveCount(0);
});

test('F · Session: a dead session restored from bfcache leaves the app; a valid one stays', async ({ page, context }) => {
  await page.goto('/app');
  await expect(page.getByTestId('calendar-toolbar')).toBeVisible();

  // Valid session: a (synthetic) persisted pageshow re-validates and keeps the app.
  await page.evaluate(() => {
    const e = new Event('pageshow');
    Object.defineProperty(e, 'persisted', { value: true });
    window.dispatchEvent(e);
  });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('calendar-toolbar')).toBeVisible();

  // Dead session: the cookie is invalidated server-side, then the page is "restored".
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
  await page.evaluate(() => {
    const e = new Event('pageshow');
    Object.defineProperty(e, 'persisted', { value: true });
    window.dispatchEvent(e);
  });
  await expect(page.locator('#auth-email')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId('calendar-toolbar')).toHaveCount(0);
  expect((await context.cookies()).some((c) => c.name.includes('session') && c.value)).toBe(false);
  await shot(page, 'F1-dead-session-login');
});

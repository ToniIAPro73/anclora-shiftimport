import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fase 1.1 local E2E: critical authenticated flows against the real
 * Neon dev branch via `vercel dev`. Fixtures from local-setup.ts.
 */

const here = __dirname;
const fixture = JSON.parse(readFileSync(join(here, '..', 'artifacts', 'local-fixture.json'), 'utf8'));

// First-run overlays (cookie consent + onboarding guide) are contractual UX
// but noise for flow tests: pre-seed both as already handled.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  });
});

async function loginAs(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(fixture.password);
  await page.locator('form .auth-submit').click();
}

test.describe('Caso 1 — Employee', () => {
  test('login, sees only own shifts, cannot reach another employee, logout', async ({ page }) => {
    await loginAs(page, fixture.emails.emp);

    // "Mis turnos" — no team selector for EMPLOYEE role.
    await expect(page.getByText('Mis turnos')).toBeVisible();
    await expect(page.locator('.team-bar select')).toHaveCount(0);

    // Own shifts visible (2 this month), not the other employee's.
    await expect(page.locator('.month-shift-badge')).toHaveCount(2);

    // Forced isolation: asking for another employee returns own rows only.
    const response = await page.request.get(`/api/shifts?employeeId=${fixture.empA2}`);
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.shifts.length).toBeGreaterThan(0);
    expect(payload.shifts.every((s: { employeeId: string }) => s.employeeId === fixture.empA1)).toBe(true);

    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('EMPLOYEE without linked employee gets a safe blocked state', async ({ page }) => {
    await loginAs(page, fixture.emails.unlinked);
    await expect(page.getByText('Cuenta no vinculada')).toBeVisible();
    // No calendar data rendered.
    await expect(page.locator('.month-shift-badge')).toHaveCount(0);
    await page.getByRole('button', { name: 'Salir' }).click();
  });
});

test.describe('Caso 2 — Admin', () => {
  test('sees team, switches employees, manages members', async ({ page }) => {
    await loginAs(page, fixture.emails.admin);

    // Team selector with both employees (alphabetical order).
    const teamSelect = page.locator('.team-bar select');
    await expect(teamSelect).toBeVisible();
    await expect(teamSelect.locator('option')).toHaveText([/E2E Dos/, /E2E Uno/]);

    // Default employee (first): E2E Dos → 1 shift. Switch to E2E Uno → 2 shifts.
    await expect(page.locator('.month-shift-badge')).toHaveCount(1);
    await teamSelect.selectOption({ label: 'E2E Uno (ID E001)' });
    await expect(page.locator('.month-shift-badge')).toHaveCount(2);

    // Membership management: add + remove a user.
    await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
    const membersModal = page.locator('.modal-overlay');
    await expect(membersModal.getByText('admin@e2e.test')).toBeVisible();
    await membersModal.getByPlaceholder('Email del usuario').fill('nuevo-miembro@e2e.test');
    await membersModal.getByPlaceholder('Contraseña inicial (solo usuarios nuevos)').fill('Temporal-1234');
    await membersModal.getByRole('button', { name: 'Añadir' }).click();
    await expect(membersModal.getByText('nuevo-miembro@e2e.test')).toBeVisible();
    const row = membersModal.locator('div', { hasText: 'nuevo-miembro@e2e.test' }).last();
    await row.getByRole('button', { name: 'Quitar' }).click();
    await expect(membersModal.getByText('nuevo-miembro@e2e.test')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(membersModal).toHaveCount(0);

    await page.getByRole('button', { name: 'Salir' }).click();
  });
});

test.describe('Caso 3 — Multi-org', () => {
  test('explicit selector, org A data only, switch to B, B data only', async ({ page }) => {
    await loginAs(page, fixture.emails.multi);

    // Blocking selector: no silent first-membership fallback.
    await expect(page.getByText('Selecciona organización')).toBeVisible();
    await page.getByRole('button', { name: /E2E Org A/ }).click();

    // In org A the user is EMPLOYEE → own shifts only (1).
    await expect(page.getByText('Mis turnos')).toBeVisible();
    await expect(page.locator('.month-shift-badge')).toHaveCount(1);

    // Switch to org B → ADMIN, empty team calendar, no org A shifts.
    await page.locator('.team-bar select').first().selectOption({ label: fixture.orgBName });
    await expect(page.getByText('Equipo:')).toBeVisible();
    await expect(page.locator('.month-shift-badge')).toHaveCount(0);

    // Back to A via header switcher.
    await page.locator('.team-bar select').first().selectOption({ label: fixture.orgAName });
    await expect(page.locator('.month-shift-badge')).toHaveCount(1);

    await page.getByRole('button', { name: 'Salir' }).click();
  });
});

test.describe('Caso 4 — Local migration', () => {
  test('explicit confirmation: cancel does not migrate, accept migrates, no duplicates', async ({ page }) => {
    // Fixed days of the current month; the month grid renders all of them.
    const now = new Date();
    const day = (d: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const localShifts = [
      { id: crypto.randomUUID(), date: day(5), startTime: '07:00', endTime: '15:00', location: 'Regular', origin: 'MAN' },
      { id: crypto.randomUUID(), date: day(6), startTime: '07:00', endTime: '15:00', location: 'Regular', origin: 'MAN' },
    ];
    await page.addInitScript((shifts) => {
      window.localStorage.setItem('anclora_shifts_v1', JSON.stringify(shifts));
    }, localShifts);

    await loginAs(page, fixture.emails.fresh);

    // Explicit flow with preview (count + target).
    await expect(page.getByText('Turnos locales encontrados')).toBeVisible();
    await expect(page.locator('.modal-overlay').getByText('E2E Fresh').first()).toBeVisible();

    // Cancel: nothing migrates, prompt comes back next time.
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.month-shift-badge')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Turnos locales encontrados')).toBeVisible();

    // Accept: migrates exactly 2.
    await page.getByRole('button', { name: 'Importar a mi cuenta' }).click();
    await expect(page.locator('.month-shift-badge')).toHaveCount(2);

    // Idempotent: reload, no prompt, still exactly 2 remote.
    await page.reload();
    await expect(page.getByText('Turnos locales encontrados')).toHaveCount(0);
    await expect(page.locator('.month-shift-badge')).toHaveCount(2);

    const response = await page.request.get('/api/shifts');
    const payload = await response.json();
    expect(payload.shifts).toHaveLength(2);
  });
});

test.describe('Caso 5 — Unauthorized', () => {
  test('manual org/employee manipulation is rejected by the backend', async ({ page }) => {
    await loginAs(page, fixture.emails.emp);
    await expect(page.getByText('Mis turnos')).toBeVisible();

    // Not a member of org B → header spoof rejected.
    const crossOrg = await page.request.get('/api/shifts', {
      headers: { 'x-organization-id': fixture.orgB },
    });
    expect(crossOrg.status()).toBe(400);

    // Cross-tenant write attempt → 403.
    const write = await page.request.patch('/api/shifts', {
      headers: { 'x-organization-id': fixture.orgB },
      data: { employeeId: fixture.empA2, upserts: [{ employeeId: fixture.empA2, date: '2026-01-01', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'MAN' }] },
    });
    expect([400, 403]).toContain(write.status());

    // EMPLOYEE role escalation attempt → 403.
    const esc = await page.request.post('/api/memberships', {
      data: { email: 'escalate@e2e.test', role: 'ADMIN', password: 'Temporal-1234' },
    });
    expect(esc.status()).toBe(403);
  });
});

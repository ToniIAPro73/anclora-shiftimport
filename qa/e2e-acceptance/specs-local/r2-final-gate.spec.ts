import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = __dirname;
const fixture = JSON.parse(readFileSync(join(here, '..', 'artifacts', 'local-fixture.json'), 'utf8'));

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
  await page.request.post('/api/auth/logout');
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(fixture.password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.ok(),
  );
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

test('R2 audit emits and reads a real AREA_CREATED event', async ({ page }) => {
  await loginAs(page, fixture.emails?.admin ?? 'admin@e2e.test');
  const headers = { 'x-organization-id': fixture.orgA };
  const name = `R2 Gate Audit Probe ${Date.now()}`;
  const created = await page.request.post('/api/areas', {
    headers,
    data: { name, code: `R2-${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const area = (await created.json()).area;

  const audit = await page.request.get('/api/organizations/audit-events', {
    headers, params: { eventType: 'AREA_CREATED' },
  });
  expect(audit.status()).toBe(200);
  const payload = await audit.json();
  expect(payload.events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      organizationId: fixture.orgA,
      eventType: 'AREA_CREATED',
      targetType: 'AREA',
      targetId: area.id,
      metadata: expect.objectContaining({ name }),
    }),
  ]));

  await page.getByRole('button', { name: 'Salir' }).click();
});

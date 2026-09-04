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

const sourceRoles = [
  { label: 'OWNER', email: 'owner@e2e.test' },
  { label: 'ADMIN', email: 'admin@e2e.test' },
  { label: 'PLANNER', email: 'planner@e2e.test' },
  { label: 'EMPLOYEE', email: 'emp@e2e.test' },
];

for (const source of sourceRoles) {
  test(`API isolation — ${source.label} cannot access Org B through Org A`, async ({ page }) => {
    await loginAs(page, fixture.emails?.[source.label.toLowerCase()] ?? source.email);
    const headers = { 'x-organization-id': fixture.orgA };

    const employeeMatch = await page.request.get('/api/employees', {
      headers, params: { match: '1', externalEmployeeId: 'B001' },
    });
    expect(employeeMatch.status()).toBe(200);
    expect((await employeeMatch.json()).employees).toEqual([]);

    const areas = await page.request.get('/api/areas', { headers });
    expect(areas.status()).toBe(200);
    const areaPayload = await areas.json();
    expect(areaPayload.areas.every((area: { id: string; name: string }) => (
      area.id === fixture.areaA && area.name !== 'E2E Area B'
    ))).toBe(true);

    const imports = await page.request.get('/api/imports', { headers });
    expect(imports.status()).toBe(200);
    const importPayload = await imports.json();
    expect(importPayload.imports.every((item: { organizationId: string; fileName: string }) => (
      item.organizationId === fixture.orgA && item.fileName !== 'org-b.csv'
    ))).toBe(true);

    const shifts = await page.request.get('/api/shifts', {
      headers, params: { employeeId: fixture.empB1 },
    });
    expect([200, 403, 404]).toContain(shifts.status());
    if (shifts.status() === 200) {
      const shiftPayload = await shifts.json();
      expect(shiftPayload.shifts.every((shift: { organizationId: string; location: string }) => (
        shift.organizationId === fixture.orgA && shift.location !== 'Org B only'
      ))).toBe(true);
    }

    const members = await page.request.get('/api/memberships', { headers });
    if (['OWNER', 'ADMIN'].includes(source.label)) {
      expect(members.status()).toBe(200);
      const memberPayload = await members.json();
      expect(memberPayload.members.every((member: { email: string }) => (
        !['owner-b@e2e.test', 'planner-b@e2e.test', 'employee-b@e2e.test'].includes(member.email)
      ))).toBe(true);
    } else {
      expect(members.status()).toBe(403);
    }

    const audit = await page.request.get('/api/organizations/audit-events', { headers });
    if (['OWNER', 'ADMIN'].includes(source.label)) {
      expect(audit.status()).toBe(200);
      const auditPayload = await audit.json();
      expect(auditPayload.events).toEqual([]);
      expect(JSON.stringify(auditPayload)).not.toContain('org-b-only');
    } else {
      expect(audit.status()).toBe(403);
    }

    const employeeWrite = await page.request.patch('/api/employees', {
      headers, data: { id: fixture.empB1, name: 'Cross Tenant Attempt' },
    });
    expect([403, 404]).toContain(employeeWrite.status());

    const areaWrite = await page.request.patch('/api/areas', {
      headers, data: { id: fixture.areaB, name: 'Cross Tenant Area', code: 'NOPE' },
    });
    expect([403, 404]).toContain(areaWrite.status());

    const importDelete = await page.request.delete('/api/imports', {
      headers, data: { id: fixture.importB },
    });
    expect([403, 404]).toContain(importDelete.status());

    const shiftDelete = await page.request.patch('/api/shifts', {
      headers,
      data: { employeeId: fixture.empB1, deleteIds: [fixture.shiftB] },
    });
    expect([200, 403, 404]).toContain(shiftDelete.status());
    if (shiftDelete.status() === 200) {
      expect((await shiftDelete.json()).deleted).toBe(0);
    }

    await page.getByRole('button', { name: 'Salir' }).click();
  });
}

test('UI confirmation — Org A does not render Org B data', async ({ page }) => {
  await loginAs(page, fixture.emails?.admin ?? 'admin@e2e.test');
  await expect(page.getByRole('button', { name: 'Empleado:' })).toBeVisible();
  await page.getByRole('button', { name: 'Empleado:' }).click();
  await expect(page.getByRole('option', { name: /E2E Uno/ })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('E2E Org B');
  await expect(page.locator('body')).not.toContainText('E2E B Employee');
  await expect(page.locator('body')).not.toContainText('Org B only');
  await page.screenshot({ path: test.info().outputPath('org-a-isolation.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salir' }).click();
});

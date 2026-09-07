import { Browser, expect, Page, test } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../../api/_lib/passwords.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'local-fixture.json'), 'utf8')) as {
  password: string;
  orgA: string;
  areaA: string;
  emails: Record<string, string>;
};

function loadDatabaseUrl(): string {
  const envFile = readFileSync(join(__dirname, '..', '..', '..', '.env.development.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) {
      return match[1].trim().replace(/^"|"$/g, '');
    }
  }
  throw new Error('DATABASE_URL not found in .env.development.local');
}

async function loginAs(page: Page, email: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function createLoggedInPage(browser: Browser, email: string) {
  const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.localStorage.setItem('anclora-cookie-consent-v1', JSON.stringify({
      necessary: true, analytics: false, marketing: false,
      updatedAt: new Date().toISOString(), version: 'v1',
    }));
    window.localStorage.setItem('anclora_shiftimport_onboarding_v1', JSON.stringify({
      version: 1, completed: true, completedAt: new Date().toISOString(), step: 'CONFIRMED',
    }));
  });
  const page = await context.newPage();
  await loginAs(page, email);
  return { context, page };
}

test.describe('P5.5-R16 Approval Inbox Load Failure & Solicitudes UX', () => {
  const artifactsDir = join(__dirname, '..', 'artifacts', 'p5-5-r16');

  test.beforeAll(() => {
    mkdirSync(artifactsDir, { recursive: true });
  });

  test('Sebastian ADMIN loads pending Marina request, excludes self-request, and displays empty state', async ({ browser }) => {
    const sql = neon(loadDatabaseUrl());
    const passHash = hashPassword(fixture.password);

    // 1. Ensure Anclora Group / Org A has approval_policy = NO_APPROVAL
    await sql`UPDATE organizations SET approval_policy = 'NO_APPROVAL' WHERE id = ${fixture.orgA}`;

    // 2. Setup Sebastian User & Admin Membership & Employee
    const sebEmail = 'sebastianpozomendoza@gmail.com';
    let sebUserRows = await sql`SELECT id FROM users WHERE email = ${sebEmail}`;
    let sebUserId: string;
    if (sebUserRows.length === 0) {
      sebUserId = (await sql`
        INSERT INTO users (email, password_hash, display_name)
        VALUES (${sebEmail}, ${passHash}, 'Sebastián Pozo Mendoza')
        RETURNING id
      `)[0].id;
    } else {
      sebUserId = sebUserRows[0].id;
      await sql`UPDATE users SET password_hash = ${passHash} WHERE id = ${sebUserId}`;
    }

    // Membership in Org A
    await sql`
      INSERT INTO memberships (user_id, organization_id, role)
      VALUES (${sebUserId}, ${fixture.orgA}, 'ADMIN')
      ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'ADMIN'
    `;

    // Employee for Sebastian
    let sebEmpRows = await sql`SELECT id FROM employees WHERE organization_id = ${fixture.orgA} AND user_id = ${sebUserId}`;
    let sebEmpId: string;
    if (sebEmpRows.length === 0) {
      sebEmpId = (await sql`
        INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id, status)
        VALUES (${fixture.orgA}, 'Sebastián Pozo Mendoza', ${sebUserId}, '84881', ${fixture.areaA}, 'active')
        RETURNING id
      `)[0].id;
    } else {
      sebEmpId = sebEmpRows[0].id;
    }

    // 3. Setup Marina Employee
    let marinaEmpRows = await sql`SELECT id FROM employees WHERE organization_id = ${fixture.orgA} AND name = 'Grimalt Moreno, Marina'`;
    let marinaEmpId: string;
    if (marinaEmpRows.length === 0) {
      marinaEmpId = (await sql`
        INSERT INTO employees (organization_id, name, external_employee_id, area_id, status)
        VALUES (${fixture.orgA}, 'Grimalt Moreno, Marina', '84882', ${fixture.areaA}, 'active')
        RETURNING id
      `)[0].id;
    } else {
      marinaEmpId = marinaEmpRows[0].id;
    }

    // 4. Setup published shifts for both Marina and Sebastian
    const marinaShift = (await sql`
      INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin)
      VALUES (${fixture.orgA}, ${marinaEmpId}, ${fixture.areaA}, '2027-02-05', '08:00', '16:00', 'Hotel Central', 'schedule')
      RETURNING id
    `)[0].id;

    const sebShift = (await sql`
      INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin)
      VALUES (${fixture.orgA}, ${sebEmpId}, ${fixture.areaA}, '2027-02-05', '14:00', '22:00', 'Hotel Central', 'schedule')
      RETURNING id
    `)[0].id;

    // Clean up any old pending requests for these employees
    await sql`
      DELETE FROM approval_requests
      WHERE organization_id = ${fixture.orgA}
        AND change_request_id IN (
          SELECT id FROM change_requests WHERE employee_id IN (${marinaEmpId}, ${sebEmpId})
        )
    `;
    await sql`
      DELETE FROM change_requests
      WHERE organization_id = ${fixture.orgA} AND employee_id IN (${marinaEmpId}, ${sebEmpId})
    `;

    // 5. Create Marina's ChangeRequest and ApprovalRequest (policy_snapshot = ORGANIZATION_ADMIN)
    const marinaCr = (await sql`
      INSERT INTO change_requests (organization_id, employee_id, shift_id, request_type, reason, status)
      VALUES (${fixture.orgA}, ${marinaEmpId}, ${marinaShift}, 'OTHER', 'Solicitud de permiso Marina', 'PENDING')
      RETURNING id
    `)[0].id;

    const marinaAr = (await sql`
      INSERT INTO approval_requests (organization_id, change_request_id, status, policy_snapshot)
      VALUES (${fixture.orgA}, ${marinaCr}, 'PENDING', 'ORGANIZATION_ADMIN')
      RETURNING id
    `)[0].id;

    // 6. Create Sebastian's own ChangeRequest and ApprovalRequest (policy_snapshot = ORGANIZATION_ADMIN)
    const sebCr = (await sql`
      INSERT INTO change_requests (organization_id, employee_id, shift_id, request_type, reason, requested_start_time, requested_end_time, status)
      VALUES (${fixture.orgA}, ${sebEmpId}, ${sebShift}, 'TIME_CHANGE', 'Ajuste propio de Sebastian', '15:00', '23:00', 'PENDING')
      RETURNING id
    `)[0].id;

    const sebAr = (await sql`
      INSERT INTO approval_requests (organization_id, change_request_id, status, policy_snapshot)
      VALUES (${fixture.orgA}, ${sebCr}, 'PENDING', 'ORGANIZATION_ADMIN')
      RETURNING id
    `)[0].id;

    // 7. Log in as Sebastian ADMIN
    const { context, page } = await createLoggedInPage(browser, sebEmail);

    try {
      // 8. Open "Solicitudes" modal from the sidebar
      const sidebarItem = page.getByTestId('sidebar-approvals');
      await expect(sidebarItem).toContainText('Solicitudes');
      await sidebarItem.click();

      // 9. Verify modal title "Solicitudes"
      const modal = page.getByRole('dialog', { name: 'Solicitudes' });
      await expect(modal).toBeVisible();

      const inbox = page.getByTestId('approval-inbox');
      await expect(inbox).toBeVisible();

      // 10. SCREENSHOT 1: Pending Marina request is visible
      await expect(inbox).toContainText('Grimalt Moreno, Marina');
      await expect(inbox).toContainText('Solicitud de permiso Marina');
      await expect(inbox).toContainText('Pendiente');
      await expect(inbox.getByRole('button', { name: 'Aprobar' })).toBeVisible();
      await expect(inbox.getByRole('button', { name: 'Rechazar' })).toBeVisible();

      await page.screenshot({
        path: join(artifactsDir, 'screenshot-1-admin-pending-marina.png'),
        fullPage: true,
      });

      // 11. SCREENSHOT 2: Sebastian's own request is EXCLUDED (self-approval protection)
      await expect(inbox).not.toContainText('Ajuste propio de Sebastian');
      await expect(inbox).not.toContainText('Sebastián Pozo Mendoza');

      await page.screenshot({
        path: join(artifactsDir, 'screenshot-2-own-sebastian-excluded.png'),
        fullPage: true,
      });

      // 12. Approve Marina's request
      await inbox.getByRole('button', { name: 'Aprobar' }).click();

      // 13. SCREENSHOT 3: Legitimate empty state
      await expect(inbox).toContainText('No tienes solicitudes pendientes');
      await expect(inbox).toContainText('Las solicitudes que requieran tu intervención aparecerán aquí.');
      await expect(inbox).not.toContainText('No se pudieron cargar las aprobaciones');

      await page.screenshot({
        path: join(artifactsDir, 'screenshot-3-empty-state.png'),
        fullPage: true,
      });

      // 14. Verify Retry behavior in frontend
      // Mock a transient 500 network failure on the next GET /api/approval-requests
      let mockedFailure = true;
      await page.route('**/api/approval-requests?status=*', async (route) => {
        if (mockedFailure && route.request().method() === 'GET') {
          mockedFailure = false;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Transient error' }) });
        } else {
          await route.continue();
        }
      });

      // Trigger load again by closing and reopening modal
      await modal.getByRole('button', { name: 'Cerrar' }).click();
      await expect(modal).toHaveCount(0);
      await sidebarItem.click();
      await expect(modal).toBeVisible();

      // Should show error state with retry button
      const errorBox = page.getByTestId('approval-inbox-error');
      await expect(errorBox).toBeVisible();
      await expect(errorBox).toContainText('No se pudieron cargar las aprobaciones');

      // Click "Reintentar" -> reloads approvals without full page reload
      const retryBtn = errorBox.getByRole('button', { name: 'Reintentar' });
      await retryBtn.click();

      // Resolves to empty state
      await expect(page.getByTestId('approval-inbox-empty')).toBeVisible();
      await expect(inbox).toContainText('No tienes solicitudes pendientes');

    } finally {
      // Clean up test records from dev DB
      await sql`DELETE FROM approval_requests WHERE id IN (${marinaAr}, ${sebAr})`;
      await sql`DELETE FROM change_requests WHERE id IN (${marinaCr}, ${sebCr})`;
      await sql`DELETE FROM shifts WHERE id IN (${marinaShift}, ${sebShift})`;
      await context.close();
    }
  });
});

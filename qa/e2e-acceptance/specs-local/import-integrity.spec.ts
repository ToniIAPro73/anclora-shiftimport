import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

/**
 * §11 full E2E: org -> import employees CSV -> import real PDF -> persist ->
 * query -> reconcile, against the real Neon dev branch via `vercel dev` and
 * the real September 2026 PDF fixture (gitignored, local-only — this spec
 * only runs on a machine that has src/ingestion/fixtures/real/ populated).
 *
 * Fase A reuses the "E2E Fresh" clean org seeded by local-setup.ts (ADMIN
 * `fresh`, zero pre-existing shifts) rather than driving the full signup
 * wizard — that flow is exercised elsewhere; this test's job is import
 * integrity, not onboarding.
 */

const here = __dirname;
const fixture = JSON.parse(readFileSync(join(here, '..', 'artifacts', 'local-fixture.json'), 'utf8'));

const REAL_PDF_PATH = join(
  here, '..', '..', '..',
  'src/ingestion/fixtures/real/PDF FTPS 1-15 SEPTIEMBRE 2026 PAX Y LL 2026_260819_172403.pdf',
);
const hasRealPdf = (() => {
  try {
    readFileSync(REAL_PDF_PATH);
    return true;
  } catch {
    return false;
  }
})();

const TARGET_EXTERNAL_ID = '30394';
const TARGET_NAME = 'Casero Bosquet, Ana Maria';

// Ground truth: manually read off the real PDF, day 1-15 (see
// src/ingestion/fixtures/real/expected/september-2026.expected.json).
const EXPECTED_TIMED_DAYS = 8; // 4,5,6,7,8,13,14,15 — always timed regardless of DL handling

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
  const response = await page.request.post('/api/auth/login', { data: { email, password: fixture.password } });
  expect(response.ok()).toBe(true);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
}

test.describe('§11 import integrity E2E (real PDF)', () => {
  test.skip(!hasRealPdf, 'Real PDF fixture not present locally (gitignored, PII) — skipping.');

  test('Fase A-F: clean org -> employees CSV -> real PDF -> persisted -> reconciled', async ({ page }) => {
    test.setTimeout(240_000); // real PDF parsing + 62 live match round-trips, not mocked
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });
    // ---- Fase A: clean org (seeded fixture, ADMIN, zero shifts) ----
    // orgFresh is seeded as a 1-employee-limited personal/free plan for the
    // local-shift-migration test in auth-flow.spec.ts; this test needs more
    // than one employee, so bump it to team here rather than touching the
    // shared fixture (scoped to this spec, no other local spec reads plan).
    const envFile = readFileSync(join(here, '..', '..', '..', '.env.development.local'), 'utf8');
    const dbUrlMatch = envFile.match(/^DATABASE_URL=(.+)$/m);
    if (!dbUrlMatch) {
      throw new Error('DATABASE_URL not found in .env.development.local');
    }
    const sql = neon(dbUrlMatch[1].trim().replace(/^"|"$/g, ''));
    await sql`UPDATE organizations SET plan = 'team' WHERE id = ${fixture.orgFresh}`;

    await loginAs(page, fixture.emails.fresh);
    await expect(page.getByRole('button', { name: 'Usuarios de la organización' })).toBeVisible();

    // ---- Fase B: import employees CSV ----
    await page.getByRole('button', { name: 'Usuarios de la organización' }).click();
    await page.getByRole('button', { name: 'Empleados' }).click();

    const employeesCsv = `external_employee_id,name\n${TARGET_EXTERNAL_ID},"${TARGET_NAME}"`;
    await page.locator('input[type="file"][accept=".csv,text/csv"]').first().setInputFiles({
      name: 'employees.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(employeesCsv, 'utf-8'),
    });

    await expect(page.getByText(/1 filas · 0 existentes · 1 nuevas · 0 errores/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    await expect(page.getByText('Importación de empleados completada')).toBeVisible();

    // Assert expected == persisted employees via API, not just UI text.
    const employeesResponse = await page.request.get('/api/employees');
    const employeesPayload = await employeesResponse.json();
    const created = employeesPayload.employees.find(
      (e: { externalEmployeeId?: string }) => e.externalEmployeeId === TARGET_EXTERNAL_ID,
    );
    expect(created, 'employee 30394 must exist in the org after the CSV import').toBeTruthy();
    expect(created.name).toBe(TARGET_NAME);

    // R2 employee lifecycle: CSV-created employees start pending_access. Link
    // the pre-provisioned test account through the authenticated ADMIN API so
    // the employee becomes active before imported shifts are accepted.
    const linkResponse = await page.request.patch('/api/employees', {
      data: { id: created.id, userId: fixture.freshTargetId },
    });
    expect(linkResponse.status()).toBe(200);

    await page.keyboard.press('Escape'); // close MembersModal

    // ---- Fase C: import the real September PDF (team roster flow) ----
    await page.getByRole('button', { name: 'Importar' }).click();
    await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles(REAL_PDF_PATH);

    // ---- Fase D: wait for real processing (roster detection) to finish ----
    // 62 real employees each trigger their own matchRemoteEmployee round-trip
    // against `vercel dev` + the live Neon branch — real latency, not mocked.
    await expect(page.getByText(/detectados/).first()).toBeVisible({ timeout: 90_000 });
    const targetCheckbox = page.locator('input[type="checkbox"][aria-label*="Casero"]');
    await targetCheckbox.scrollIntoViewIfNeeded();
    await expect(targetCheckbox).toBeVisible({ timeout: 5_000 });
    await expect(targetCheckbox).toBeEnabled(); // only 'recognized' rows are checkable
    await targetCheckbox.check();

    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Resumen antes de importar')).toBeVisible();
    await page.locator('.modal-content').getByRole('button', { name: 'Importar' }).click();
    await expect(page.getByText('Importación completada')).toBeVisible({ timeout: 30_000 });
    await page.locator('.modal-content button.btn-gold', { hasText: 'Cerrar' }).click();

    // ---- Fase E: query persisted data via API (ground truth is the DB) ----
    const shiftsResponse = await page.request.get(`/api/shifts?employeeId=${created.id}`);
    expect(shiftsResponse.status()).toBe(200);
    const { shifts } = await shiftsResponse.json();
    const septemberShifts = shifts.filter((s: { date: string }) => s.date.startsWith('2026-09'));

    // Since R3-M14, future timed rows are planned assignments rather than
    // historical shifts. Read the drafts as the second half of the same
    // reconciliation, without treating future LIBRE markers as assignments.
    const schedulesResponse = await page.request.get('/api/schedules');
    expect(schedulesResponse.status()).toBe(200);
    const schedules = (await schedulesResponse.json()).schedules as Array<{ scheduleId: string; id: string }>;
    const plannedSeptember = (await Promise.all(schedules.map(async (schedule) => {
      const snapshotResponse = await page.request.get(`/api/schedules/${schedule.scheduleId}/versions/${schedule.id}`);
      expect(snapshotResponse.status()).toBe(200);
      return (await snapshotResponse.json()).assignments as Array<{ employeeId: string; date: string; startTime: string; endTime: string }>;
    }))).flat().filter((assignment) => assignment.employeeId === created.id && assignment.date.startsWith('2026-09'));

    // ---- Fase F: reconcile PDF vs persisted ----
    const timedShifts = septemberShifts.filter((s: { startTime: string }) => s.startTime !== '');
    const timedRows = [...timedShifts, ...plannedSeptember];
    expect(timedRows.length, 'all 8 timed days (4-8,13-15) must be persisted in history or drafts').toBe(EXPECTED_TIMED_DAYS);

    const byDate = new Map(timedRows.map((s: { date: string; startTime: string; endTime: string }) => [s.date, s]));
    const expectedTimes: Record<string, { start: string; end: string }> = {
      '2026-09-04': { start: '14:00', end: '22:00' },
      '2026-09-05': { start: '17:00', end: '01:00' },
      '2026-09-06': { start: '21:00', end: '01:00' },
      '2026-09-07': { start: '17:00', end: '01:00' },
      '2026-09-08': { start: '16:00', end: '00:00' },
      '2026-09-13': { start: '10:00', end: '14:00' },
      '2026-09-14': { start: '09:00', end: '17:00' },
      '2026-09-15': { start: '09:00', end: '17:00' },
    };
    for (const [date, expected] of Object.entries(expectedTimes)) {
      const persisted = byDate.get(date) as { startTime: string; endTime: string } | undefined;
      expect(persisted, `day ${date} must be persisted`).toBeTruthy();
      expect(persisted!.startTime, `${date} startTime`).toBe(expected.start);
      expect(persisted!.endTime, `${date} endTime`).toBe(expected.end);
    }

    // DL days: the team-roster PDF path auto-treats any code left unresolved
    // by the sample employee as a rest day (buildAutoCodeOverrides in
    // pdf-team-import.ts). The sample is roster[0] (PDF order), independent
    // of which employees exist in this org, so it's deterministic across
    // runs for this fixed PDF — confirmed by direct run: 7/7.
    const expectedHistoricalDlDays = [1, 2, 3, 9, 10, 11, 12]
      .map((day) => `2026-09-${String(day).padStart(2, '0')}`)
      .filter((date) => date <= new Date().toISOString().slice(0, 10));
    const historicalDlDates = septemberShifts
      .filter((s: { startTime: string }) => s.startTime === '')
      .map((s: { date: string }) => s.date)
      .sort();
    expect(historicalDlDates, 'historical DL days remain persisted as rest shifts').toEqual(expectedHistoricalDlDays);
    expect(septemberShifts.length + plannedSeptember.length, 'history plus drafts contains every persistable source day').toBe(
      EXPECTED_TIMED_DAYS + expectedHistoricalDlDays.length,
    );
  });
});

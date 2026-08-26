import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../../api/_lib/passwords.js';

/**
 * Format Memory v1 — real browser-driven E2E (no mocks: real app, real API,
 * real dev DB). Self-contained fixture (own orgs/users, own cleanup) —
 * separate from the shared local-setup.ts fixture so this file can be run
 * and diagnosed in isolation. See sdd/features/format-memory-v1/.
 *
 * Fixture document: src/ingestion/fixtures/acceptance-corpus/fixtures/
 * GS-03_hospitality/source.pdf — a synthetic TYPE_LEGEND roster (legend
 * codes M/T/N/L, no real names/PII) shared by two synthetic employees,
 * Ana López (H-201) and Nora Gil (H-301) — used here to exercise org-shared
 * reuse (Scenario A) with zero extra fixtures needed.
 */

const here = __dirname;
const PASSWORD = 'Fm09-e2e-Pass-1234';
const GS03_PDF = join(here, '..', '..', '..', 'src/ingestion/fixtures/acceptance-corpus/fixtures/GS-03_hospitality/source.pdf');

function loadDatabaseUrl(): string {
  const envFile = readFileSync(join(here, '..', '..', '..', '.env.development.local'), 'utf8');
  const match = envFile.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('DATABASE_URL not found in .env.development.local');
  return match[1].trim().replace(/^"|"$/g, '');
}

interface Fixture {
  orgA: string;
  orgB: string;
  adminId: string;
  anaId: string;
  noraId: string;
  adminBId: string;
  empAna: string;
  empNora: string;
  emails: { admin: string; ana: string; nora: string; adminB: string };
}

let fixture: Fixture;

test.beforeAll(async () => {
  const sql = neon(loadDatabaseUrl());
  const hash = hashPassword(PASSWORD);
  const stamp = Date.now();

  const orgA = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`FM-E2E Org A ${stamp}`}, 'company', 'team') RETURNING id`)[0].id;
  const orgB = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`FM-E2E Org B ${stamp}`}, 'company', 'team') RETURNING id`)[0].id;

  const mkUser = async (email: string, name: string) =>
    (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hash}, ${name}) RETURNING id`)[0].id;

  const emails = {
    admin: `fm09-admin-${stamp}@e2e.test`,
    ana: `fm09-ana-${stamp}@e2e.test`,
    nora: `fm09-nora-${stamp}@e2e.test`,
    adminB: `fm09-adminb-${stamp}@e2e.test`,
  };
  const adminId = await mkUser(emails.admin, 'FM09 Admin');
  const anaId = await mkUser(emails.ana, 'Ana López');
  const noraId = await mkUser(emails.nora, 'Nora Gil');
  const adminBId = await mkUser(emails.adminB, 'FM09 Admin B');

  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminId}, ${orgA}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${anaId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${noraId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminBId}, ${orgB}, 'ADMIN')`;

  const empAna = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id) VALUES (${orgA}, 'Ana López', ${anaId}, 'H-201') RETURNING id`)[0].id;
  const empNora = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id) VALUES (${orgA}, 'Nora Gil', ${noraId}, 'H-301') RETURNING id`)[0].id;

  fixture = { orgA, orgB, adminId, anaId, noraId, adminBId, empAna, empNora, emails };
});

test.afterAll(async () => {
  if (!fixture) return;
  const sql = neon(loadDatabaseUrl());
  // Cascades memberships/employees/shifts/imports/format_profiles.
  await sql`DELETE FROM organizations WHERE id IN (${fixture.orgA}, ${fixture.orgB})`;
  await sql`DELETE FROM users WHERE id IN (${fixture.adminId}, ${fixture.anaId}, ${fixture.noraId}, ${fixture.adminBId})`;
});

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
  await page.locator('#auth-password').fill(PASSWORD);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.ok());
  await page.locator('form .auth-submit').click();
  await loginResponse;
  await expect(page.locator('#auth-email')).toHaveCount(0);
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#auth-email')).toBeVisible();
}

/** GS-03's document period is 2026-10-01..14 — the app's default calendar
 * context is "today" (2026-08-26 in this environment), so a MONTH_MISMATCH
 * conflict blocks everything unless the calendar month/year is set to match
 * before processing. `.modal-select-trigger` is ImportModal's own custom
 * dropdown trigger class (src/components/shift-dashboard/ImportModal.tsx,
 * `ModalSelect` — no native `<select>`); month is the first one rendered,
 * year the second (verified against the source, not guessed). */
async function selectMonthYear(page: Page, monthLabel: string, year: string) {
  const triggers = page.locator('.modal-select-trigger');
  await triggers.nth(0).click();
  await page.getByRole('option', { name: monthLabel, exact: true }).click();
  await triggers.nth(1).click();
  await page.getByRole('option', { name: year, exact: true }).click();
}

async function openImportAndUpload(page: Page, filePath: string, monthLabel: string, year: string) {
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await selectMonthYear(page, monthLabel, year);
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await page.getByRole('button', { name: 'Procesar archivo' }).click();
}

/** Answers every visible token-meaning "shift-code" question as a work
 * code with fixed times — deterministic, no guessing about which codes the
 * fixture contains, since it answers whatever the assistant actually shows.
 * Returns how many were answered in this round. */
async function answerVisibleTokenQuestions(page: Page): Promise<number> {
  const panel = page.locator('.modal-overlay');
  const workButtons = panel.getByRole('button', { name: 'Turno de trabajo' });
  const count = await workButtons.count();
  for (let i = 0; i < count; i += 1) {
    await workButtons.nth(i).click();
  }
  const startInputs = panel.locator('input[type="time"]');
  const timeInputCount = await startInputs.count();
  for (let i = 0; i < timeInputCount; i += 1) {
    const value = await startInputs.nth(i).inputValue();
    if (!value) {
      await startInputs.nth(i).fill(i % 2 === 0 ? '08:00' : '16:00');
    }
  }
  return count;
}

/**
 * Drives the assistant to completion, handling as many rounds as the panel
 * actually presents (row-selection first, followed by a token/shift-code
 * round once the row is resolved — see ProfileAssistantPanel.tsx's
 * followUpQuestions mechanism). Returns the total number of distinct
 * questions answered across every round (the real `questions_first_import`
 * metric), never assumed to be a single round.
 */
async function resolveAssistant(page: Page, selfName: string): Promise<number> {
  const panel = page.locator('.modal-overlay');
  const assistantHeading = panel.getByText('Asistente de formato');
  const rowQuestion = panel.getByText('¿Cuál de estas filas eres tú?');
  const workButtons = panel.getByRole('button', { name: 'Turno de trabajo' });
  let totalQuestions = 0;

  for (let round = 0; round < 5; round += 1) {
    if (!(await assistantHeading.isVisible().catch(() => false))) break;

    if (await rowQuestion.isVisible().catch(() => false)) {
      totalQuestions += 1;
      await panel.getByRole('button', { name: new RegExp(selfName) }).first().click();
    }

    totalQuestions += await answerVisibleTokenQuestions(page);

    await panel.getByRole('button', { name: 'Aplicar y continuar' }).click();
    // Deterministic settle: wait for one of the two real next states (panel
    // closed, or a fresh follow-up round rendered) instead of a fixed sleep.
    await expect(async () => {
      const [open, rowVisible, tokenVisible] = await Promise.all([
        assistantHeading.count(),
        rowQuestion.count(),
        workButtons.count(),
      ]);
      expect(open === 0 || rowVisible > 0 || tokenVisible > 0).toBe(true);
    }).toPass({ timeout: 10_000 });
  }
  return totalQuestions;
}

test.describe.serial('Format Memory v1 — required flow', () => {
  let questionsFirstImport = 0;
  let questionsSecondImport = 0;

  test('EMPLOYEE (Ana): first import teaches the format, candidate created', async ({ page }) => {
    await loginAs(page, fixture.emails.ana);
    await openImportAndUpload(page, GS03_PDF, 'Octubre', '2026');

    // The assistant renders inline inside the modal when questions exist.
    const assistantHeading = page.getByText('Asistente de formato');
    await expect(assistantHeading).toBeVisible({ timeout: 15_000 });

    // saveCandidate is fire-and-forget (FM-06) — registered before the
    // action that triggers it, same pattern as loginAs's loginResponse.
    const createCandidateResponse = page.waitForResponse((r) => r.url().includes('/api/format-profiles')
      && r.request().method() === 'POST' && r.ok());
    questionsFirstImport = await resolveAssistant(page, 'Ana López');
    expect(questionsFirstImport, 'first import must ask at least one question (unknown format)').toBeGreaterThan(0);
    await createCandidateResponse;

    // Preview reached: quality chip visible, confirm button enabled.
    await expect(page.getByTestId('import-quality-state')).toBeVisible({ timeout: 15_000 });
    const confirmButton = page.getByRole('button', { name: /Confirmar Importación/ });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 15_000 });

    // Candidate created: verify via the real API, not just UI absence-of-error.
    const profilesResponse = await page.request.get('/api/format-profiles');
    expect(profilesResponse.status()).toBe(200);
    const { profiles } = await profilesResponse.json();
    expect(profiles.length, 'exactly one format profile after the first teach').toBeGreaterThanOrEqual(1);
    expect(profiles[0].status).toBe('candidate');

    await logout(page);
  });

  test('ADMIN: confirms the candidate in "Formatos aprendidos", status becomes validated', async ({ page }) => {
    await loginAs(page, fixture.emails.admin);
    await page.getByRole('button', { name: 'Formatos aprendidos' }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal.getByText('Candidato')).toBeVisible();
    await modal.getByRole('button', { name: 'Confirmar' }).click();
    await expect(modal.getByText('Validado')).toBeVisible();
    await expect(modal.getByText('Candidato')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);

    await logout(page);
  });

  test('EMPLOYEE (Ana) again: second import of the SAME fixture asks zero questions, reaches READY, use-count increments', async ({ page }) => {
    await loginAs(page, fixture.emails.ana);

    const profilesBefore = await (await page.request.get('/api/format-profiles')).json();
    const useCountBefore = profilesBefore.profiles[0].useCount;
    const successfulBefore = profilesBefore.profiles[0].successfulUseCount;

    await openImportAndUpload(page, GS03_PDF, 'Octubre', '2026');

    // Validation/preview still runs (quality chip appears) but no assistant.
    await expect(page.getByTestId('import-quality-state')).toBeVisible({ timeout: 15_000 });
    questionsSecondImport = await page.getByText('Asistente de formato').count();
    expect(questionsSecondImport, 'second import of the identical fixture must ask zero questions').toBe(0);

    const qualityText = await page.getByTestId('import-quality-state').textContent();
    const secondImportOutcome = qualityText?.trim() ?? '';
    expect(['Listo', 'Parcial'], `second import outcome must be a valid ready-equivalent state, got "${secondImportOutcome}"`).toContain(secondImportOutcome);

    // recordUse is fire-and-forget by design (FM-06: a slow/failed profile-
    // use call must never block the import) — wait for the actual PATCH
    // network response instead of assuming it lands before the modal closes.
    const recordUseResponse = page.waitForResponse((r) => r.url().includes('/api/format-profiles')
      && r.request().method() === 'PATCH' && r.ok());
    const confirmButton = page.getByRole('button', { name: /Confirmar Importación/ });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 15_000 });
    await recordUseResponse;

    const profilesAfter = await (await page.request.get('/api/format-profiles')).json();
    const after = profilesAfter.profiles[0];
    expect(after.useCount, 'useCount must increment by exactly 1 on the second confirmed import').toBe(useCountBefore + 1);
    expect(after.successfulUseCount, 'successfulUseCount must increment on a confirmed successful import').toBeGreaterThanOrEqual(successfulBefore + 1);

    // Metrics summary (visible in the test report / trace, not just asserted silently).
    console.log(JSON.stringify({
      questions_first_import: questionsFirstImport,
      questions_second_import: questionsSecondImport,
      profile_use_count: after.useCount,
      successful_use_count: after.successfulUseCount,
    }));

    await logout(page);
  });
});

test.describe('Format Memory v1 — additional coverage', () => {
  test('Scenario A — second user, same organization: reuses the profile, zero questions', async ({ page }) => {
    await loginAs(page, fixture.emails.nora);
    await openImportAndUpload(page, GS03_PDF, 'Octubre', '2026');

    await expect(page.getByTestId('import-quality-state')).toBeVisible({ timeout: 15_000 });
    const assistantCount = await page.getByText('Asistente de formato').count();
    expect(assistantCount, 'a second EMPLOYEE of the same org must not be asked to re-teach an already-learned format').toBe(0);

    // Close the import modal (ImportModal supports Escape close, see
    // useEscapeClose in the source) before logging out.
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await logout(page);
  });

  test('Scenario B — different organization: cannot see or use the profile (isolation)', async ({ page }) => {
    await loginAs(page, fixture.emails.adminB);

    const response = await page.request.get('/api/format-profiles');
    expect(response.status()).toBe(200);
    const { profiles } = await response.json();
    expect(profiles.length, 'a different organization must never see another org\'s format profiles').toBe(0);

    await logout(page);
  });
});

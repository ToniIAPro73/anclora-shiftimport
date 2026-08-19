import { BrowserContext, expect, Page } from '@playwright/test';
import path from 'node:path';
import { CaseArtifacts } from './artifacts';
import { CLEARED_KEYS, SHIFTS_STORAGE_KEY, TARGET_URL } from './env';
import { FilteredExpectation } from './expected';

export interface ImportCaseSpec {
  caseId: string;
  /** Absolute path of the file to upload. */
  fixtureFile: string;
  employeeName?: string;
  employeeId?: string;
  /** Spanish month label, e.g. 'Septiembre'. */
  monthLabel: string;
  /** e.g. '2026'. */
  yearLabel: string;
  /** e.g. '2026-09' — the month all imported dates must belong to. */
  monthKey: string;
  /** If true (default), resolve the assistant panel when it appears. */
  answerAssistant?: boolean;
  /** Wait budget for the processing step (OCR needs minutes). */
  processTimeoutMs?: number;
  /** Skip opening the modal (caller already opened it, e.g. responsive checks). */
  skipOpenModal?: boolean;
}

export interface PreviewRow {
  date: string;
  origin: string;
  type: string;
  start: string;
  end: string;
}

export interface ImportOutcome {
  errorText: string | null;
  qualityState: string | null;
  detectedCount: number | null;
  monthAfterAnalysis: string | null;
  yearAfterAnalysis: string | null;
  assistantAppeared: boolean;
  assistantQuestions: string[];
  previewRows: PreviewRow[];
  confirmLabel: string | null;
  confirmDisabled: boolean;
  saw61Dias: boolean;
  importedShifts: Array<{ date: string; startTime: string; endTime: string; location: string }> | null;
  badgeCount: number | null;
}

const NOISE_PATTERNS = [
  /vercel\.live/i,
  /va\.vercel/i,
  /vitals\.vercel/i,
  /favicon/i,
  /Download the React DevTools/i,
  /Third-party cookie/i,
  /preload/i,
];

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

/** Seed onboarding + cookie consent and clear per-case keys BEFORE any app script runs. */
export async function seedContext(context: BrowserContext): Promise<void> {
  await context.addInitScript((clearedKeys: string[]) => {
    window.localStorage.setItem(
      'anclora_shiftimport_onboarding_v1',
      JSON.stringify({ version: 1, completed: true, step: 'CONFIRMED' }),
    );
    window.localStorage.setItem(
      'anclora-cookie-consent-v1',
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
    for (const key of clearedKeys) {
      window.localStorage.removeItem(key);
    }
  }, CLEARED_KEYS);
}

export function attachTelemetry(page: Page, artifacts: CaseArtifacts): void {
  page.on('console', (message) => {
    const line = `${message.type()}: ${message.text()}`;
    if (!isNoise(line)) {
      artifacts.consoleLines.push(line);
    }
  });
  page.on('pageerror', (error) => {
    const line = String(error);
    if (!isNoise(line)) {
      artifacts.pageErrors.push(line);
    }
  });
  page.on('requestfailed', (request) => {
    const line = `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown'}`;
    if (!isNoise(line)) {
      artifacts.failedRequests.push(line);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const line = `${response.status()} ${response.url()}`;
      if (!isNoise(line)) {
        artifacts.failedRequests.push(line);
      }
    }
  });
}

const GOTO_ATTEMPTS = 15;
const GOTO_RETRY_WAIT_MS = 60_000;

export async function gotoApp(page: Page): Promise<void> {
  // Block third-party noise (Vercel analytics / live) to cut request volume —
  // the deployment sits behind a rate-triggered Vercel Security Checkpoint.
  await page.route(/vercel\.live|va\.vercel-scripts\.com/, (route) => route.abort());

  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= GOTO_ATTEMPTS; attempt += 1) {
    const response = await page
      .goto(TARGET_URL, { waitUntil: 'domcontentloaded' })
      .catch(() => null);
    lastStatus = response?.status() ?? null;
    if (page.url().includes('vercel.com/sso-api')) {
      throw new Error('DEPLOYMENT_PROBLEM: redirected to Vercel SSO');
    }
    if (response && response.ok()) {
      const importButton = page.getByRole('button', { name: 'Importar' });
      try {
        await importButton.waitFor({ state: 'visible', timeout: 30_000 });
        return;
      } catch {
        // 200 but app shell never rendered (e.g. checkpoint HTML) — retry.
      }
    }
    if (attempt < GOTO_ATTEMPTS) {
      // Security-checkpoint / transient failure: wait for mitigation to decay.
      await page.waitForTimeout(GOTO_RETRY_WAIT_MS);
    }
  }
  throw new Error(`DEPLOYMENT_PROBLEM: target unreachable after ${GOTO_ATTEMPTS} attempts (last status ${lastStatus})`);
}

export async function openImportModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByRole('heading', { name: 'Importar cuadrante' })).toBeVisible();
}

async function selectModalOption(page: Page, triggerIndex: number, optionLabel: string): Promise<void> {
  const trigger = page.locator('button.modal-select-trigger').nth(triggerIndex);
  await trigger.click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

export async function setPeriod(page: Page, monthLabel: string, yearLabel: string): Promise<void> {
  await selectModalOption(page, 0, monthLabel);
  await selectModalOption(page, 1, yearLabel);
}

export async function fillEmployee(page: Page, name?: string, id?: string): Promise<void> {
  if (name !== undefined) {
    await page.getByPlaceholder('Nombre del empleado').fill(name);
  }
  if (id !== undefined) {
    await page.getByPlaceholder('ID de empleado').fill(id);
  }
}

const ASSISTANT_SECTION = 'section[aria-label="Asistente de formato"]';

interface AssistantReport {
  appeared: boolean;
  questions: string[];
}

/**
 * Resolves the inline format assistant if it is shown: picks the employee row,
 * classifies tokens per expected.json statuses, confirms day mappings, unchecks
 * the save-profile checkbox and applies.
 */
async function resolveAssistant(
  page: Page,
  spec: ImportCaseSpec,
  expectation: FilteredExpectation | null,
): Promise<AssistantReport> {
  const section = page.locator(ASSISTANT_SECTION);
  const visible = await section.isVisible().catch(() => false);
  if (!visible) {
    return { appeared: false, questions: [] };
  }
  const questions: string[] = [];
  const bodyText = await section.innerText();
  if (bodyText.includes('¿Cuál de estas filas eres tú?')) {
    questions.push('row-selection');
    const wanted = spec.employeeId ?? spec.employeeName ?? '';
    // Candidate buttons carry the row text (name/id + tokens). Match on the
    // employee identifier first, then the full name.
    let picked = false;
    for (const needle of [wanted, spec.employeeName ?? ''].filter(Boolean)) {
      const match = section.getByRole('button', { name: new RegExp(escapeRegExp(needle)) }).first();
      if (await match.count()) {
        await match.click();
        picked = true;
        break;
      }
    }
    if (!picked) {
      throw new Error(`TEST_AUTOMATION_PROBLEM: no assistant row candidate matched "${wanted}"`);
    }
  }
  // Token questions: each is a block with a title and a Trabajo/Descanso group.
  const groups = section.locator('[role="group"]');
  const groupCount = await groups.count();
  for (let i = 0; i < groupCount; i += 1) {
    const group = groups.nth(i);
    const block = group.locator('..');
    const title = (await block.locator('p').first().innerText()).trim();
    const tokenMatch = title.match(/¿Qué (?:significa|turno representa) (.+?)\?/);
    if (!tokenMatch) {
      continue;
    }
    const token = tokenMatch[1].trim();
    const status = expectation?.codeStatus.get(token) ?? null;
    // free/vacation/sick/absence/unknown codes → Descanso; work → Trabajo.
    const isWork = status === 'work' || (status === null && /\d{1,2}:\d{2}/.test(token));
    await group.getByRole('button', { name: isWork ? 'Trabajo' : 'Descanso', exact: true }).click();
    questions.push(`token:${token}→${isWork ? 'work' : 'rest'}`);
  }
  if (bodyText.includes('¿Esta columna corresponde al día')) {
    questions.push('day-mapping');
    await section.getByRole('button', { name: 'Sí', exact: true }).click();
  }
  // Never persist format profiles across cases.
  const saveCheckbox = section.getByRole('checkbox');
  if (await saveCheckbox.isChecked()) {
    await saveCheckbox.click();
  }
  const apply = section.getByRole('button', { name: 'Aplicar y continuar' });
  await expect(apply).toBeEnabled({ timeout: 10_000 });
  await apply.click();
  await expect(section).toBeHidden({ timeout: 15_000 });
  return { appeared: true, questions };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function readPreviewRows(page: Page): Promise<PreviewRow[]> {
  return page.locator('.modal-content table tbody tr').evaluateAll((rows) =>
    rows.map((row) => {
      const inputs = Array.from(row.querySelectorAll('input')).map(
        (input) => (input as HTMLInputElement).value,
      );
      return {
        date: inputs[0] ?? '',
        origin: inputs[1] ?? '',
        type: inputs[2] ?? '',
        start: inputs[3] ?? '',
        end: inputs[4] ?? '',
      };
    }),
  );
}

/**
 * Full positive flow up to the preview state (no confirm). Returns the outcome
 * so far; caller asserts and may call confirmImport().
 */
export async function runImportToPreview(
  page: Page,
  spec: ImportCaseSpec,
  expectation: FilteredExpectation | null,
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = {
    errorText: null,
    qualityState: null,
    detectedCount: null,
    monthAfterAnalysis: null,
    yearAfterAnalysis: null,
    assistantAppeared: false,
    assistantQuestions: [],
    previewRows: [],
    confirmLabel: null,
    confirmDisabled: true,
    saw61Dias: false,
    importedShifts: null,
    badgeCount: null,
  };

  if (!spec.skipOpenModal) {
    await openImportModal(page);
  }
  await page.locator('.modal-content input[type=file]').setInputFiles(spec.fixtureFile);
  await fillEmployee(page, spec.employeeName, spec.employeeId);
  await setPeriod(page, spec.monthLabel, spec.yearLabel);

  const processTimeout = spec.processTimeoutMs ?? 120_000;
  const errorBox = page.getByText(/^⚠️ Error:/);
  const qualityChip = page.locator('[data-testid="import-quality-state"]');

  await page.getByRole('button', { name: 'Procesar archivo', exact: true }).click();

  await Promise.race([
    errorBox.waitFor({ state: 'visible', timeout: processTimeout }),
    qualityChip.waitFor({ state: 'visible', timeout: processTimeout }),
  ]).catch(() => {
    throw new Error(`TEST_AUTOMATION_PROBLEM: neither error box nor quality chip appeared within ${processTimeout}ms`);
  });

  if (await errorBox.isVisible().catch(() => false)) {
    outcome.errorText = (await errorBox.innerText()).trim();
    outcome.confirmDisabled = await page
      .getByRole('button', { name: /Confirmar Importación/ })
      .isDisabled()
      .catch(() => true);
    outcome.saw61Dias = (await page.locator('body').innerText()).includes('61 días');
    return outcome;
  }

  // Positive path: record period (auto-detect may overwrite the user choice).
  const triggers = page.locator('button.modal-select-trigger');
  outcome.monthAfterAnalysis = (await triggers.nth(0).innerText()).trim();
  outcome.yearAfterAnalysis = (await triggers.nth(1).innerText()).trim();

  if (spec.answerAssistant !== false) {
    // The assistant panel mounts asynchronously (lazy item extraction).
    await page
      .locator(ASSISTANT_SECTION)
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => undefined);
    const report = await resolveAssistant(page, spec, expectation);
    outcome.assistantAppeared = report.appeared;
    outcome.assistantQuestions = report.questions;
    if (report.appeared) {
      // Re-check for an error after assistant resolution.
      if (await errorBox.isVisible().catch(() => false)) {
        outcome.errorText = (await errorBox.innerText()).trim();
        return outcome;
      }
    }
  }

  outcome.qualityState = (await qualityChip.innerText()).trim();
  const counter = await page
    .locator('.modal-content')
    .getByText(/encontrados/)
    .first()
    .innerText()
    .catch(() => '');
  const counterMatch = counter.match(/(\d+)\s+encontrados/);
  outcome.detectedCount = counterMatch ? Number(counterMatch[1]) : null;

  // Assistant may re-render rows asynchronously; wait until the detected
  // counter is stable and rows exist (or none will).
  await page.waitForTimeout(1_000);
  outcome.previewRows = await readPreviewRows(page);

  const confirmButton = page.getByRole('button', { name: /Confirmar Importación/ });
  outcome.confirmLabel = (await confirmButton.innerText()).trim();
  outcome.confirmDisabled = await confirmButton.isDisabled();
  outcome.saw61Dias = (await page.locator('body').innerText()).includes('61 días');
  return outcome;
}

/** Clicks Confirmar Importación, skips conflicts, verifies persistence + badges. */
export async function confirmImport(page: Page, outcome: ImportOutcome): Promise<void> {
  await page.getByRole('button', { name: /Confirmar Importación/ }).click();

  // Re-import over existing data may raise the conflict resolution modal.
  const conflictModal = page.getByText('Conflicto de importación');
  for (let i = 0; i < 50; i += 1) {
    if (!(await conflictModal.isVisible().catch(() => false))) {
      break;
    }
    await page.getByRole('button', { name: 'Omitir turno' }).first().click();
    await page.waitForTimeout(200);
  }

  await expect(page.getByRole('heading', { name: 'Importar cuadrante' })).toBeHidden({
    timeout: 15_000,
  });

  outcome.importedShifts = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Array<{ date: string; startTime: string; endTime: string; location: string }>;
  }, SHIFTS_STORAGE_KEY);

  // The calendar auto-navigates to the imported month; count its day badges.
  await page.locator('.month-shift-badge').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  outcome.badgeCount = await page.locator('.month-shift-badge').count();
}

export interface AssertionLog {
  name: string;
  pass: boolean;
  detail: string;
}

export function check(assertions: AssertionLog[], name: string, pass: boolean, detail: string): void {
  assertions.push({ name, pass, detail });
}

export async function screenshot(page: Page, artifacts: CaseArtifacts, name: string): Promise<void> {
  await page.screenshot({ path: path.join(artifacts.dir, `${name}.png`), fullPage: false });
}

import { expect, test } from '@playwright/test';
import { createCaseArtifacts } from './artifacts';
import { SHIFTS_STORAGE_KEY } from './env';
import {
  AssertionLog,
  attachTelemetry,
  check,
  fillEmployee,
  gotoApp,
  openImportModal,
  screenshot,
  seedContext,
  setPeriod,
} from './flow';

export interface NegativeCase {
  caseId: string;
  fixtureFile: string;
  employeeName?: string;
  employeeId?: string;
  monthLabel: string;
  yearLabel: string;
  /** Any of these substrings in the error box satisfies the message assertion. */
  acceptableErrorSubstrings: string[];
  processTimeoutMs?: number;
}

/**
 * Safe-failure flow: process the file, then assert (a) an explicit
 * error/degraded state and (b) the zero-import invariant (nothing persisted,
 * confirm disabled). The exact error wording is recorded for classification.
 */
export function defineNegativeCase(spec: NegativeCase): void {
  test(spec.caseId, async ({ page, context }) => {
    const artifacts = createCaseArtifacts(spec.caseId);
    const failures: AssertionLog[] = [];
    const actual: Record<string, unknown> = {};
    try {
      attachTelemetry(page, artifacts);
      await seedContext(context);
      await gotoApp(page);
      await openImportModal(page);
      await page.locator('.modal-content input[type=file]').setInputFiles(spec.fixtureFile);
      await fillEmployee(page, spec.employeeName, spec.employeeId);
      await setPeriod(page, spec.monthLabel, spec.yearLabel);

      const processTimeout = spec.processTimeoutMs ?? 120_000;
      const errorBox = page.getByText(/^⚠️ Error:/);
      const qualityChip = page.locator('[data-testid="import-quality-state"]');
      const assistant = page.locator('section[aria-label="Asistente de formato"]');

      await page.getByRole('button', { name: 'Procesar archivo', exact: true }).click();
      await Promise.race([
        errorBox.waitFor({ state: 'visible', timeout: processTimeout }),
        qualityChip.waitFor({ state: 'visible', timeout: processTimeout }),
        assistant.waitFor({ state: 'visible', timeout: processTimeout }),
      ]).catch(() => {
        throw new Error('TEST_AUTOMATION_PROBLEM: no error, quality chip or assistant after processing');
      });
      await page.waitForTimeout(1_000);

      const errorText = (await errorBox.isVisible().catch(() => false))
        ? (await errorBox.innerText()).trim()
        : null;
      const qualityState = (await qualityChip.isVisible().catch(() => false))
        ? (await qualityChip.innerText()).trim()
        : null;
      const assistantVisible = await assistant.isVisible().catch(() => false);
      const rowCount = await page.locator('.modal-content table tbody tr').count();
      const confirmButton = page.getByRole('button', { name: /Confirmar Importación/ });
      const confirmLabel = (await confirmButton.innerText()).trim();
      const confirmDisabled = await confirmButton.isDisabled();
      const stored = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        SHIFTS_STORAGE_KEY,
      );

      Object.assign(actual, {
        errorText,
        qualityState,
        assistantVisible,
        previewRowCount: rowCount,
        confirmLabel,
        confirmDisabled,
        storedShiftsRaw: stored,
      });
      await screenshot(page, artifacts, '01-negative-state');

      const explicitFailure =
        errorText !== null || qualityState === 'No reconocido' || assistantVisible;
      check(
        failures,
        'explicit error or degraded state shown',
        explicitFailure,
        `error=${errorText}, quality=${qualityState}, assistant=${assistantVisible}`,
      );
      if (errorText !== null) {
        const matches = spec.acceptableErrorSubstrings.some((substring) =>
          errorText.includes(substring),
        );
        check(
          failures,
          'error message acceptable',
          matches,
          `error=${errorText}; acceptable=${JSON.stringify(spec.acceptableErrorSubstrings)}`,
        );
      }
      check(failures, 'no importable preview rows', rowCount === 0, `rows=${rowCount}`);
      check(failures, 'confirm disabled', confirmDisabled, `label=${confirmLabel}`);
      check(
        failures,
        'zero-import invariant (localStorage untouched)',
        stored === null,
        `anclora_shifts_v1=${stored === null ? 'absent' : 'PRESENT (silent import!)'}`,
      );
      check(
        failures,
        'no uncaught page errors',
        artifacts.pageErrors.length === 0,
        `pageErrors=${JSON.stringify(artifacts.pageErrors.slice(0, 3))}`,
      );
    } finally {
      artifacts.writeResult({
        caseId: spec.caseId,
        expected: { acceptableErrorSubstrings: spec.acceptableErrorSubstrings },
        actual,
        assertions: failures,
        consoleErrorLines: artifacts.consoleLines.filter((line) => line.startsWith('error')),
        pageErrors: artifacts.pageErrors,
        failedRequests: artifacts.failedRequests,
      });
      artifacts.flush();
    }

    expect(failures.filter((a) => !a.pass), JSON.stringify(failures, null, 2)).toEqual([]);
  });
}

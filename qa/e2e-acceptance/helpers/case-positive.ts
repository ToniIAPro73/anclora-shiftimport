import { expect, test } from '@playwright/test';
import { createCaseArtifacts } from './artifacts';
import { expectationsFor, FilteredExpectation } from './expected';
import {
  AssertionLog,
  attachTelemetry,
  check,
  confirmImport,
  gotoApp,
  ImportCaseSpec,
  ImportOutcome,
  runImportToPreview,
  screenshot,
  seedContext,
} from './flow';

export interface PositiveCase extends ImportCaseSpec {
  fixtureDir: string;
  expectedCount: number;
  /** Tolerant lower bound for degraded/OCR variants (default = expectedCount). */
  minCount?: number;
  /** Per-date presence assertions (default true; disable for tolerant OCR variants). */
  exactDates?: boolean;
  /** Extra screenshots to take (e.g. responsive cases). */
  extraScreenshots?: string[];
}

export function definePositiveCase(spec: PositiveCase): void {
  test(spec.caseId, async ({ page, context }) => {
    const artifacts = createCaseArtifacts(spec.caseId);
    const failures: AssertionLog[] = [];
    const expectation: FilteredExpectation = expectationsFor(
      spec.fixtureDir,
      spec.employeeId ?? '',
      spec.monthKey,
    );
    const minCount = spec.minCount ?? spec.expectedCount;
    let outcome: ImportOutcome | null = null;
    try {
      attachTelemetry(page, artifacts);
      await seedContext(context);
      await gotoApp(page);
      outcome = await runImportToPreview(page, spec, expectation);
      await screenshot(page, artifacts, '01-preview');

      check(failures, 'no error box', outcome.errorText === null, `errorText=${outcome.errorText}`);
      check(
        failures,
        'quality chip present',
        outcome.qualityState !== null,
        `qualityState=${outcome.qualityState}`,
      );
      check(
        failures,
        'preview count',
        outcome.previewRows.length >= minCount && outcome.previewRows.length <= spec.expectedCount,
        `previewRows=${outcome.previewRows.length}, expected=${spec.expectedCount}, min=${minCount}`,
      );
      const previewDates = outcome.previewRows.map((row) => row.date);
      const outside = previewDates.filter((date) => !date.startsWith(spec.monthKey));
      check(
        failures,
        'all preview dates in target month',
        outside.length === 0,
        `outside=${JSON.stringify(outside.slice(0, 5))}`,
      );
      check(
        failures,
        'no "61 días" diagnostic',
        !outcome.saw61Dias,
        `saw61Dias=${outcome.saw61Dias}`,
      );
      check(
        failures,
        'user-selected month preserved',
        outcome.monthAfterAnalysis === spec.monthLabel && outcome.yearAfterAnalysis === spec.yearLabel,
        `month=${outcome.monthAfterAnalysis}, year=${outcome.yearAfterAnalysis} (selected ${spec.monthLabel} ${spec.yearLabel})`,
      );
      if (spec.exactDates !== false) {
        const missing = expectation.dates.filter((date) => !previewDates.includes(date));
        check(
          failures,
          'expected dates all present in preview',
          missing.length === 0,
          `missing=${JSON.stringify(missing.slice(0, 5))} (of ${expectation.count})`,
        );
      }

      if (outcome.confirmDisabled) {
        check(failures, 'confirm enabled', false, `confirmLabel=${outcome.confirmLabel}`);
      } else {
        await confirmImport(page, outcome);
        await screenshot(page, artifacts, '02-after-import');
        const imported = outcome.importedShifts ?? [];
        check(failures, 'shifts persisted', outcome.importedShifts !== null, 'anclora_shifts_v1 empty');
        const importedDates = imported.map((shift) => shift.date);
        const leaked = importedDates.filter((date) => !date.startsWith(spec.monthKey));
        check(
          failures,
          'zero cross-month leakage after import',
          leaked.length === 0,
          `leaked=${JSON.stringify(leaked.slice(0, 5))}`,
        );
        check(
          failures,
          'imported count',
          imported.length >= minCount && imported.length <= spec.expectedCount,
          `imported=${imported.length}, expected=${spec.expectedCount}, min=${minCount}`,
        );
        const fabricated = importedDates.filter((date) => !previewDates.includes(date));
        check(
          failures,
          'no fabricated dates',
          fabricated.length === 0,
          `fabricated=${JSON.stringify(fabricated.slice(0, 5))}`,
        );
        const distinctImportedDays = new Set(importedDates).size;
        check(
          failures,
          'calendar badges match imported days',
          outcome.badgeCount !== null
            && outcome.badgeCount >= Math.min(distinctImportedDays, minCount)
            && outcome.badgeCount <= Math.max(imported.length, 1),
          `badges=${outcome.badgeCount}, distinctDays=${distinctImportedDays}, imported=${imported.length}`,
        );
      }

      check(
        failures,
        'no uncaught page errors',
        artifacts.pageErrors.length === 0,
        `pageErrors=${JSON.stringify(artifacts.pageErrors.slice(0, 3))}`,
      );
    } finally {
      artifacts.writeResult({
        caseId: spec.caseId,
        expected: {
          count: spec.expectedCount,
          minCount,
          monthKey: spec.monthKey,
          dates: expectation.dates,
          employeeId: spec.employeeId,
        },
        actual: outcome,
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

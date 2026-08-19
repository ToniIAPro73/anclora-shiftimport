import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createCaseArtifacts } from '../helpers/artifacts';
import { FIXTURE_ROOT } from '../helpers/env';
import { expectationsFor } from '../helpers/expected';
import {
  AssertionLog,
  attachTelemetry,
  check,
  confirmImport,
  gotoApp,
  ImportCaseSpec,
  ImportOutcome,
  openImportModal,
  runImportToPreview,
  screenshot,
  seedContext,
} from '../helpers/flow';

interface ResponsiveCase extends ImportCaseSpec {
  fixtureDir: string;
  expectedCount: number;
}

const GS01_DIR = path.join(FIXTURE_ROOT, 'GS-01_multi-month');
const GS03_DIR = path.join(FIXTURE_ROOT, 'GS-03_hospitality');

const CASES: ResponsiveCase[] = [
  {
    caseId: 'GS-01-SEP-CARLOS-MOBILE',
    fixtureDir: GS01_DIR,
    fixtureFile: path.join(GS01_DIR, 'source.pdf'),
    employeeName: 'Carlos Ruiz',
    employeeId: 'EMP-102',
    monthLabel: 'Septiembre',
    yearLabel: '2026',
    monthKey: '2026-09',
    expectedCount: 30,
    skipOpenModal: true,
  },
  {
    caseId: 'GS-03-ANA-MOBILE',
    fixtureDir: GS03_DIR,
    fixtureFile: path.join(GS03_DIR, 'source.pdf'),
    employeeName: 'Ana López',
    employeeId: 'H-201',
    monthLabel: 'Octubre',
    yearLabel: '2026',
    monthKey: '2026-10',
    expectedCount: 14,
    skipOpenModal: true,
  },
];

test.describe('mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const spec of CASES) {
    test(spec.caseId, async ({ page, context }) => {
      const artifacts = createCaseArtifacts(spec.caseId);
      const failures: AssertionLog[] = [];
      const expectation = expectationsFor(spec.fixtureDir, spec.employeeId ?? '', spec.monthKey);
      let outcome: ImportOutcome | null = null;
      try {
        attachTelemetry(page, artifacts);
        await seedContext(context);
        await gotoApp(page);

        // Mobile-specific: modal must fit the viewport.
        await openImportModal(page);
        const modalBox = await page.locator('.modal-content').boundingBox();
        check(
          failures,
          'modal fits viewport width',
          modalBox !== null && modalBox.x >= 0 && modalBox.x + modalBox.width <= 390.5,
          `box=${JSON.stringify(modalBox)}`,
        );
        check(
          failures,
          'modal fits viewport height',
          modalBox !== null && modalBox.y >= 0 && modalBox.y + modalBox.height <= 844.5,
          `box=${JSON.stringify(modalBox)}`,
        );
        await screenshot(page, artifacts, '00-modal-open');

        outcome = await runImportToPreview(page, spec, expectation);

        // Employee selector usable: values actually landed in the inputs.
        const nameValue = await page.getByPlaceholder('Nombre del empleado').inputValue();
        const idValue = await page.getByPlaceholder('ID de empleado').inputValue();
        check(
          failures,
          'employee inputs usable',
          nameValue === (spec.employeeName ?? '') && idValue === (spec.employeeId ?? ''),
          `name=${nameValue}, id=${idValue}`,
        );

        // Internal scroll works on the preview table when content overflows.
        const scrollable = await page.evaluate(() => {
          const container = document.querySelector('.modal-content table')?.parentElement ?? null;
          if (!container) {
            return null;
          }
          const before = container.scrollTop;
          container.scrollTop = container.scrollTop + 200;
          return {
            before,
            after: container.scrollTop,
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight,
          };
        });
        check(
          failures,
          'internal scroll works',
          scrollable === null
            || scrollable.scrollHeight <= scrollable.clientHeight
            || scrollable.after > scrollable.before,
          `scroll=${JSON.stringify(scrollable)}`,
        );
        await screenshot(page, artifacts, '02-preview');

        check(failures, 'no error box', outcome.errorText === null, `errorText=${outcome.errorText}`);
        check(
          failures,
          'preview count',
          outcome.previewRows.length === spec.expectedCount,
          `previewRows=${outcome.previewRows.length}, expected=${spec.expectedCount}`,
        );
        const outside = outcome.previewRows.map((row) => row.date).filter((date) => !date.startsWith(spec.monthKey));
        check(failures, 'all preview dates in target month', outside.length === 0, `outside=${JSON.stringify(outside.slice(0, 5))}`);
        check(failures, 'no "61 días" diagnostic', !outcome.saw61Dias, `saw61Dias=${outcome.saw61Dias}`);

        if (outcome.confirmDisabled) {
          check(failures, 'confirm enabled', false, `confirmLabel=${outcome.confirmLabel}`);
        } else {
          // Confirm button must be reachable (Playwright clicks only visible,
          // actionable elements — a clipped button would fail here).
          await confirmImport(page, outcome);
          await screenshot(page, artifacts, '03-after-import');
          const imported = outcome.importedShifts ?? [];
          const leaked = imported.map((shift) => shift.date).filter((date) => !date.startsWith(spec.monthKey));
          check(failures, 'zero cross-month leakage', leaked.length === 0, `leaked=${JSON.stringify(leaked.slice(0, 5))}`);
          check(
            failures,
            'imported count',
            imported.length === spec.expectedCount,
            `imported=${imported.length}, expected=${spec.expectedCount}`,
          );
          check(
            failures,
            'calendar badges present',
            outcome.badgeCount !== null && outcome.badgeCount > 0,
            `badges=${outcome.badgeCount}`,
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
          expected: { count: spec.expectedCount, monthKey: spec.monthKey, dates: expectation.dates },
          actual: outcome,
          assertions: failures,
          pageErrors: artifacts.pageErrors,
          failedRequests: artifacts.failedRequests,
        });
        artifacts.flush();
      }

      expect(failures.filter((a) => !a.pass), JSON.stringify(failures, null, 2)).toEqual([]);
    });
  }
});

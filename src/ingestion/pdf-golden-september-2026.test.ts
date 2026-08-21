// @vitest-environment node
/**
 * P0.8 golden regression: proves "what the source PDF says" equals "what
 * ShiftImport's parser determines should be stored" for the real September
 * 2026 roster (fixtures/real/, gitignored — PII, local-only). The golden
 * JSON was derived by directly reading the real PDF page-by-page and
 * cross-checking every one of employee 30394's 15 days against this parser's
 * output, not assumed. Runs (and is only meaningful) on a machine that has
 * the real fixture checked out locally; elsewhere it skips with an explicit
 * reason rather than silently reporting green.
 *
 * The document's "DL" (día libre) code has no legend entry the parser's
 * parseLegendCodes pattern can learn (that pattern only matches
 * "CODE HH:MM-HH:MM", never a bare rest code) and isn't in the generic
 * DEFAULT_CODE_PROFILE (M/T/N/L) either, so a first-time import of this
 * exact document does NOT resolve DL — by design, until the user teaches it
 * via guided recovery (an ambiguous company code must never be guessed).
 * Two scenarios are both real and both tested: "steady state" (DL already
 * taught, via codeOverrides — matches an org that has imported before) must
 * match the golden fixture exactly; "cold" (nothing taught yet) must still
 * surface the loss (UNKNOWN_SHIFT_TOKEN + PARTIAL_EXTRACTION) and must NOT
 * be silently graded CORRECT.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractDocumentItems } from './parsers/file';
import { parseShiftsFromItems } from './parsers/parse-items';
import { analyzeShiftsFromItems } from './analysis';
import { ParsedCalendarShift } from '../lib/import-types';
import { ShiftCodeMapping } from './core/shift-code-profile';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const PDF_PATH = path.join(
  __dirname,
  'fixtures/real/PDF FTPS 1-15 SEPTIEMBRE 2026 PAX Y LL 2026_260819_172403.pdf',
);
const GOLDEN_PATH = path.join(__dirname, 'fixtures/real/expected/september-2026.expected.json');

const hasFixtures = existsSync(PDF_PATH) && existsSync(GOLDEN_PATH);

type GoldenDay = 'DL' | { start: string; end: string; overnight: boolean };
interface GoldenEmployee {
  name: string;
  days: Record<string, GoldenDay>;
}
type GoldenFile = Record<string, GoldenEmployee>;

function isOvernight(start: string, end: string): boolean {
  return end <= start;
}

async function loadItems() {
  const file = new File([readFileSync(PDF_PATH)], path.basename(PDF_PATH), { type: 'application/pdf' });
  return extractDocumentItems(file);
}

const DL_TAUGHT: Map<string, ShiftCodeMapping> = new Map([
  ['DL', { code: 'DL', startTime: null, endTime: null, status: 'free' }],
]);

describe.runIf(hasFixtures)('golden regression: real September 2026 PDF (P0.8)', () => {
  const golden: GoldenFile = hasFixtures
    ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8'))
    : {};

  for (const [externalId, employee] of Object.entries(golden)) {
    it(`employee ${externalId} (${employee.name}): steady state (DL taught) matches the golden fixture exactly, day 1-15`, async () => {
      const items = await loadItems();
      const shifts = parseShiftsFromItems(
        items,
        { month: 8, year: 2026 },
        { employeeName: employee.name, employeeIdentifiers: [externalId] },
        DL_TAUGHT,
      );

      const byDay = new Map<number, ParsedCalendarShift[]>();
      for (const shift of shifts) {
        const day = Number.parseInt(shift.date.slice(-2), 10);
        const list = byDay.get(day) ?? [];
        list.push(shift);
        byDay.set(day, list);
      }

      for (const [dayKey, expected] of Object.entries(employee.days)) {
        const day = Number.parseInt(dayKey, 10);
        const actual = byDay.get(day) ?? [];

        if (expected === 'DL') {
          expect(actual, `day ${day}: expected a single Libre (DL) shift`).toHaveLength(1);
          expect(actual[0].shiftType).toBe('Libre');
          expect(actual[0].startTime).toBe('');
          expect(actual[0].endTime).toBe('');
          continue;
        }

        expect(actual, `day ${day}: expected exactly one timed shift`).toHaveLength(1);
        expect(actual[0].startTime, `day ${day} startTime`).toBe(expected.start);
        expect(actual[0].endTime, `day ${day} endTime`).toBe(expected.end);
        expect(actual[0].isValid, `day ${day} isValid`).toBe(true);
        expect(isOvernight(actual[0].startTime, actual[0].endTime), `day ${day} overnight`).toBe(expected.overnight);
      }
    });

    it(`employee ${externalId}: cold import (DL not yet taught) surfaces the loss and is never silently graded CORRECT`, async () => {
      const items = await loadItems();
      const result = analyzeShiftsFromItems(
        items,
        { month: 8, year: 2026 },
        { employeeName: employee.name, employeeIdentifiers: [externalId] },
      );

      const dlDayCount = Object.values(employee.days).filter((day) => day === 'DL').length;
      expect(dlDayCount, 'golden fixture sanity check: this employee must have DL days for this test to mean anything').toBeGreaterThan(0);

      expect(result.quality.warnings).toContainEqual({ code: 'UNKNOWN_SHIFT_TOKEN', context: { token: 'DL' } });
      expect(result.quality.state).not.toBe('CORRECT');
    });
  }
});

if (!hasFixtures) {
  describe('golden regression: real September 2026 PDF (P0.8)', () => {
    it.skip(
      'SKIPPED — real PDF fixture and/or golden JSON not present locally (both gitignored: real schedules must never be committed, PII). '
        + 'This test only runs on a machine with src/ingestion/fixtures/real/ populated.',
      () => {},
    );
  });
}

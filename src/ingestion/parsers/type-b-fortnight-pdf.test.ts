// @vitest-environment node
/**
 * Regression coverage for Fase 1.2F-PDF: the reference synthetic PDF
 * (test-data/synthetic/shiftimport-v1/03_cuadrante_agosto_2026.pdf) splits
 * one employee's month across TWO pages, one per fortnight (quincena), with
 * weekday-initial day headers in an alphabet that doesn't match the old
 * Spanish-only L/M/X/J/V/S/D pattern. This file proves both fixes:
 * - dayHeader.pattern now accepts any locale's weekday-initial convention;
 * - findAllEmployeeRowItems/buildShiftsFromEmployeeRows aggregate both
 *   fortnight pages into one full month, instead of stopping at the first.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractDocumentItems } from './file';
import { analyzeShiftsFromItems } from '../analysis';
import { ShiftCodeMapping } from '../core/shift-code-profile';
import { CalendarImportContext } from '../../lib/import-types';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const FIXTURE_PATH = new URL(
  '../../../test-data/synthetic/shiftimport-v1/03_cuadrante_agosto_2026.pdf',
  import.meta.url,
);
const CONTEXT: CalendarImportContext = { month: 7, year: 2026 }; // August 2026
const AUGUST_DAYS = 31;

// Learned from the assistant answers a real user would give (DL/AJ are
// off-work codes, no times) — the same mapping the interactive flow ends up
// with, applied directly so this test is deterministic.
const CODE_OVERRIDES = new Map<string, ShiftCodeMapping>([
  ['DL', { code: 'DL', startTime: null, endTime: null, status: 'free' }],
  ['AJ', { code: 'AJ', startTime: null, endTime: null, status: 'free' }],
]);

async function loadPdfFile(): Promise<File> {
  const bytes = await readFile(FIXTURE_PATH);
  return new File([bytes], '03_cuadrante_agosto_2026.pdf', { type: 'application/pdf' });
}

describe('TYPE_B two-quincena PDF: extraction completeness (Fase 1.2F-PDF)', () => {
  it('Adriana Molina Serra (SI120001): recognizes essentially all 31 August days', async () => {
    const file = await loadPdfFile();
    const items = await extractDocumentItems(file);
    const selector = { employeeName: 'Adriana Molina Serra', employeeIdentifiers: ['SI120001'] };

    const { shifts, analysis } = analyzeShiftsFromItems(items, CONTEXT, selector, undefined, CODE_OVERRIDES);

    const distinctDays = new Set(shifts.map((shift) => shift.date)).size;
    const completeness = distinctDays / AUGUST_DAYS;

    expect(analysis.employeeMatch).toBe('strong');
    expect(completeness).toBeGreaterThanOrEqual(0.95);
    // No cross-quincena gap: both fortnights present (day 1 AND day 31).
    expect(shifts.some((shift) => shift.date === '2026-08-01')).toBe(true);
    expect(shifts.some((shift) => shift.date === '2026-08-31')).toBe(true);
  });

  it('Andrés Costa Ferrer (SI120005): overnight shifts and AJ both extracted', async () => {
    const file = await loadPdfFile();
    const items = await extractDocumentItems(file);
    const selector = { employeeName: 'Andrés Costa Ferrer', employeeIdentifiers: ['SI120005'] };

    const { shifts } = analyzeShiftsFromItems(items, CONTEXT, selector, undefined, CODE_OVERRIDES);
    const distinctDays = new Set(shifts.map((shift) => shift.date)).size;

    expect(distinctDays / AUGUST_DAYS).toBeGreaterThanOrEqual(0.95);
    const overnight = shifts.filter(
      (shift) => shift.startTime && shift.endTime && shift.startTime > shift.endTime,
    );
    expect(overnight.length).toBeGreaterThan(0);
    const restDays = shifts.filter((shift) => !shift.startTime && !shift.endTime);
    expect(restDays.length).toBeGreaterThan(0);
  });

  it('employee boundary: two different employees never share identical shift sets (no row bleeding)', async () => {
    const file = await loadPdfFile();
    const items = await extractDocumentItems(file);

    const a = analyzeShiftsFromItems(
      items, CONTEXT, { employeeName: 'Adriana Molina Serra', employeeIdentifiers: ['SI120001'] }, undefined, CODE_OVERRIDES,
    ).shifts;
    const b = analyzeShiftsFromItems(
      items, CONTEXT, { employeeName: 'Andrés Costa Ferrer', employeeIdentifiers: ['SI120005'] }, undefined, CODE_OVERRIDES,
    ).shifts;

    const signature = (shifts: typeof a) =>
      shifts.map((s) => `${s.date}|${s.startTime}|${s.endTime}`).sort().join(',');
    expect(signature(a)).not.toBe(signature(b));
  });

  it('day-header regex is locale-agnostic: matches this fixture\'s weekday-initial convention without breaking the day-number capture', async () => {
    const file = await loadPdfFile();
    const items = await extractDocumentItems(file);
    const selector = { employeeName: 'Adriana Molina Serra', employeeIdentifiers: ['SI120001'] };
    const { shifts } = analyzeShiftsFromItems(items, CONTEXT, selector, undefined, CODE_OVERRIDES);

    // Every produced date must fall inside August 2026 — a locale-agnostic
    // header match must never fabricate an out-of-range day.
    for (const shift of shifts) {
      expect(shift.date.startsWith('2026-08-')).toBe(true);
    }
  });
});

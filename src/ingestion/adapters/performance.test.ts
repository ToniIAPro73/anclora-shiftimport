// @vitest-environment jsdom
/**
 * Lightweight performance smoke tests (SHIFTIMPORT_MULTIFORMAT_INGESTION
 * Part Q) — not a benchmark suite, just a guard against an accidental O(n²)
 * (e.g. re-scanning the whole employee list per row instead of using the
 * Map-based grouping in structured-rows.ts) and a rough number logged for
 * the record.
 */
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseJsonTeamRoster } from './json-adapter';
import { parseXmlTeamRoster } from './xml-adapter';
import { parseXlsxTeamWorkbook } from './xlsx-workbook';

function buildRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    employeeId: `E-${i % 60}`,
    employeeName: `Employee ${i % 60}`,
    date: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
    shiftType: 'M',
    startTime: '06:00',
    endTime: '14:00',
  }));
}

describe('multi-format ingestion performance smoke tests', () => {
  it('parses 1000 JSON shift records in well under a second', () => {
    const text = JSON.stringify({ shifts: buildRecords(1000) });
    const start = performance.now();
    const result = parseJsonTeamRoster(text);
    const elapsedMs = performance.now() - start;
    expect(result.employees.length).toBe(60);
    expect(elapsedMs).toBeLessThan(1000);
    console.log(`[perf] JSON 1000 records: ${elapsedMs.toFixed(1)}ms`);
  });

  it('parses 1000 XML <shift> elements in well under a few seconds', () => {
    const records = buildRecords(1000);
    const xml = `<shifts>${records.map((r) => `<shift><employeeId>${r.employeeId}</employeeId><employeeName>${r.employeeName}</employeeName><date>${r.date}</date><shiftType>${r.shiftType}</shiftType><startTime>${r.startTime}</startTime><endTime>${r.endTime}</endTime></shift>`).join('')}</shifts>`;
    const start = performance.now();
    const result = parseXmlTeamRoster(xml);
    const elapsedMs = performance.now() - start;
    expect(result.employees.length).toBe(60);
    expect(elapsedMs).toBeLessThan(5000);
    console.log(`[perf] XML 1000 records: ${elapsedMs.toFixed(1)}ms`);
  });

  it('parses a 10-sheet XLSX workbook without re-reading the file per sheet', async () => {
    const wb = new ExcelJS.Workbook();
    for (let s = 0; s < 10; s += 1) {
      const sheet = wb.addWorksheet(`Sheet${s}`);
      sheet.addRow(['employeeId', 'employeeName', 'date', 'shiftType', 'startTime', 'endTime']);
      for (let i = 0; i < 50; i += 1) {
        sheet.addRow([`S${s}-E${i}`, `Employee ${s}-${i}`, '2026-09-01', 'M', '06:00', '14:00']);
      }
    }
    const buffer = await wb.xlsx.writeBuffer();
    const file = new File([buffer as unknown as BlobPart], 'perf.xlsx');

    const start = performance.now();
    const result = await parseXlsxTeamWorkbook(file);
    const elapsedMs = performance.now() - start;
    expect(result.employees.length).toBe(500);
    expect(elapsedMs).toBeLessThan(5000);
    console.log(`[perf] XLSX 10 sheets x 50 rows: ${elapsedMs.toFixed(1)}ms`);
  });
});

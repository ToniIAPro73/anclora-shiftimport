import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { jsPDF } from 'jspdf';
import { ParsedCalendarShift } from '../../lib/import-types';
import { detectCalendarContext, parseEmployeeShiftsFromFile } from './file';

setupLocalStorageMock();

// Node has no DOM Worker: point PDF.js at the legacy worker module resolved
// from disk so the integration test runs without a browser.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

/**
 * Integration test: generates a real vector PDF (jsPDF) replicating the
 * TYPE_A layout and runs the full ingestion pipeline (PDF.js extraction ->
 * profile detection -> parse). This proves the file router and the
 * extraction layer work end-to-end without committing any real schedule.
 *
 * Layout geometry is chosen so helvetica 10pt runs never collide: name and
 * parenthesized id sit on separate lines in the marker column, and the long
 * split-shift cell is the last column (nothing follows it on its line).
 */
function buildTypeAPdf(): File {
  // A4 landscape in points (842x595): wide enough for all five day columns
  // and the long split-shift cell without clipping.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(10);

  // jsPDF y grows DOWN; PDF.js y grows UP from the page bottom, so the
  // vertical ordering (header above rows) is inverted on purpose.
  doc.text('PERIODO: AGOSTO 2026', 500, 60);
  doc.text('01/08', 120, 110);
  doc.text('02/08', 260, 110);
  doc.text('03/08', 400, 110);
  doc.text('04/08', 540, 110);
  doc.text('05/08', 680, 110);
  doc.text('Carlos Ruiz', 20, 210);
  doc.text('(1002)', 20, 215);
  doc.text('Ana Martinez', 20, 310);
  doc.text('(1001)', 20, 315);
  doc.text('17:00-01:00', 120, 310);
  doc.text('OFF', 260, 310);
  doc.text('OFF', 400, 310);
  doc.text('OFF', 540, 310);
  doc.text('08:00-12:00 -- 16:00-20:00', 680, 310);

  const bytes = doc.output('arraybuffer');
  return new File([bytes], 'cuadrante-tipo-a.pdf', { type: 'application/pdf' });
}

const SELECTOR = { employeeName: 'Ana Martinez', employeeIdentifiers: ['1001'] };

const summarize = (shifts: ParsedCalendarShift[]) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

describe('pdf integration (synthetic vector PDF through the real pipeline)', () => {
  it('detects the calendar context of the generated TYPE_A document', async () => {
    const file = buildTypeAPdf();
    const context = await detectCalendarContext(file);
    expect(context).toEqual({ month: 7, year: 2026 });
  });

  it('parses the generated TYPE_A document into the golden set', async () => {
    const file = buildTypeAPdf();
    const context = await detectCalendarContext(file);
    const shifts = await parseEmployeeShiftsFromFile(file, context, SELECTOR);
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', isValid: true },
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
      { date: '2026-08-03', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
      { date: '2026-08-04', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
      { date: '2026-08-05', startTime: '08:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
      { date: '2026-08-05', startTime: '16:00', endTime: '20:00', shiftType: 'Regular', isValid: true },
    ]);
  });
});
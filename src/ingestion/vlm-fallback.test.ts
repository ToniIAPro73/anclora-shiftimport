import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { jsPDF } from 'jspdf';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { analyzeDocumentFile } from './parsers/file';
import { buildImportDiagnosis } from './diagnostics';
import { analyzeWithVlmFallback, isVlmFallbackAvailable, VlmRecords } from './vlm-client';

// The VLM client (fetch + browser rasterization) is mocked: this suite tests
// the pipeline integration — when the fallback fires, how records are mapped
// and how failures degrade to the deterministic result.
vi.mock('./vlm-client', () => ({
  analyzeWithVlmFallback: vi.fn(),
  isVlmFallbackAvailable: vi.fn(() => true),
  setVlmFallbackSessionActive: vi.fn(),
}));

const mockedVlm = vi.mocked(analyzeWithVlmFallback);
const mockedAvailable = vi.mocked(isVlmFallbackAvailable);

setupLocalStorageMock();

// Node has no DOM Worker: point PDF.js at the legacy worker module resolved
// from disk (same setup as parsers/pdf.integration.test.ts).
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const SELECTOR = { employeeName: 'Ana Martinez', employeeIdentifiers: ['1001'] };
const CONTEXT = { month: 7, year: 2026 }; // August 2026

/** TYPE_A layout, all cells recognized → deterministic CORRECT. */
function buildGoodPdf(): File {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(10);
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
  doc.text('08:00-16:00', 680, 310);
  return new File([doc.output('arraybuffer')], 'cuadrante.pdf', { type: 'application/pdf' });
}

/** A real PDF with no text layer at all → zero extracted items. */
function buildEmptyPdf(): File {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  return new File([doc.output('arraybuffer')], 'escaneado.pdf', { type: 'application/pdf' });
}

const VLM_RECORDS: VlmRecords = {
  employeeName: 'Ana Martinez',
  externalEmployeeId: null,
  areaName: null,
  entries: [
    { date: '2026-08-03', shiftType: null, startTime: '08:00', endTime: '16:00', notes: null },
    { date: '2026-08-04', shiftType: 'Libre', startTime: null, endTime: null, notes: null },
  ],
};

describe('VLM fallback integration in analyzeDocumentFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAvailable.mockReturnValue(true);
  });

  it('a good deterministic PDF (CORRECT) never calls the VLM endpoint', async () => {
    const onStage = vi.fn();
    const result = await analyzeDocumentFile(buildGoodPdf(), SELECTOR, undefined, CONTEXT, { onStage });

    expect(result.quality.state).toBe('CORRECT');
    expect(result.shifts.length).toBeGreaterThan(0);
    expect(mockedVlm).not.toHaveBeenCalled();
    expect(onStage).not.toHaveBeenCalled();
    expect(result.vlmError).toBeUndefined();
  });

  it('an empty PDF (no items) triggers one VLM call and maps the records', async () => {
    mockedVlm.mockResolvedValue({ ok: true, records: VLM_RECORDS });
    const onStage = vi.fn();
    const result = await analyzeDocumentFile(buildEmptyPdf(), SELECTOR, undefined, CONTEXT, { onStage });

    expect(mockedVlm).toHaveBeenCalledTimes(1);
    // The user's selected period is authoritative context (1-based month).
    expect(mockedVlm.mock.calls[0]?.[1]).toMatchObject({ month: 8, year: 2026 });
    expect(onStage).toHaveBeenCalledWith('analyzing');

    expect(result.shifts).toHaveLength(2);
    expect(result.shifts.every((shift) => shift.sourceFormat === 'pdf+vlm')).toBe(true);
    expect(result.shifts[0]).toMatchObject({
      date: '2026-08-03', startTime: '08:00', endTime: '16:00', isValid: true,
    });
    expect(result.shifts[1]).toMatchObject({ date: '2026-08-04', shiftType: 'Libre', isValid: true });
    // Model output always requires human review — never CORRECT.
    expect(result.quality.state).toBe('REVIEW');
    expect(result.structure).toBeNull();
    expect(result.questions).toEqual([]);
    expect(result.detectedContext).toEqual({ month: 7, year: 2026 });
    expect(result.vlmError).toBeUndefined();
  });

  it('a null employeeName preserves the ambiguity (employeeMatch none → UNRECOGNIZED)', async () => {
    mockedVlm.mockResolvedValue({ ok: true, records: { ...VLM_RECORDS, employeeName: null } });
    const result = await analyzeDocumentFile(buildEmptyPdf(), SELECTOR, undefined, CONTEXT);

    expect(result.quality.state).toBe('UNRECOGNIZED');
    expect(result.quality.warnings.length).toBe(0); // no fake warnings; the state says it
    expect(result.shifts).toHaveLength(2); // the rows are still shown for review
  });

  it('a VLM failure preserves the deterministic result and marks vlmError', async () => {
    mockedVlm.mockResolvedValue({ ok: false, code: 'VLM_TIMEOUT' });
    const result = await analyzeDocumentFile(buildEmptyPdf(), SELECTOR, undefined, CONTEXT);

    // Deterministic outcome untouched: zero shifts, UNRECOGNIZED quality.
    expect(result.shifts).toEqual([]);
    expect(result.quality.state).toBe('UNRECOGNIZED');
    expect(result.vlmError).toEqual({ code: 'VLM_TIMEOUT' });

    // The diagnosis keeps the deterministic diagnostics and appends a
    // non-blocking VLM one.
    const diagnosis = buildImportDiagnosis(result, { selectedContext: CONTEXT });
    const vlmDiagnostic = diagnosis.diagnostics.find((diagnostic) => diagnostic.code === 'VLM_TIMEOUT');
    expect(vlmDiagnostic).toBeDefined();
    expect(vlmDiagnostic?.blocking).toBe(false);
    expect(vlmDiagnostic?.severity).toBe('warning');
    expect(diagnosis.diagnostics.length).toBeGreaterThan(1);
  });

  it('guests never trigger the fallback, even with empty items', async () => {
    mockedAvailable.mockReturnValue(false);
    const onStage = vi.fn();
    const result = await analyzeDocumentFile(buildEmptyPdf(), SELECTOR, undefined, CONTEXT, { onStage });

    expect(mockedVlm).not.toHaveBeenCalled();
    expect(onStage).not.toHaveBeenCalled();
    expect(result.vlmError).toBeUndefined();
  });

  it('a retry after a failure does not duplicate anything', async () => {
    mockedVlm.mockResolvedValueOnce({ ok: false, code: 'VLM_RATE_LIMITED' });
    const file = buildEmptyPdf();

    const first = await analyzeDocumentFile(file, SELECTOR, undefined, CONTEXT);
    expect(first.shifts).toEqual([]);
    expect(first.vlmError).toEqual({ code: 'VLM_RATE_LIMITED' });

    mockedVlm.mockResolvedValueOnce({ ok: true, records: VLM_RECORDS });
    const second = await analyzeDocumentFile(file, SELECTOR, undefined, CONTEXT);
    // Exactly the mapped entries — no accumulation across attempts.
    expect(second.shifts).toHaveLength(2);
    expect(second.vlmError).toBeUndefined();
    expect(mockedVlm).toHaveBeenCalledTimes(2);
  });
});

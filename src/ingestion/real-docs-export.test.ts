// @vitest-environment node
/**
 * LOCAL QA HELPER (skipped unless QA_REAL_DOCS_OUT is set). Parses the two real documents with the
 * production parsers and writes ONLY normalised rows (no names, no file contents) to a temp JSON that
 * scripts/qa/plan-import-e2e.mjs consumes. Real documents are never committed.
 *
 *   QA_REAL_DOCS_OUT=/tmp/real-parsed.json npx vitest run src/ingestion/real-docs-export.test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { detectPdfTeamRoster } from './pdf-team-import';
import { analyzeDocumentFile, detectCalendarContext } from './parsers/file';

const out = process.env.QA_REAL_DOCS_OUT;
const dir = process.env.QA_REAL_DOCS_DIR ?? path.join(os.homedir(), 'Documents', 'Shiftimport-assets');
const XLSX_NAME = 'Copia no Controlada si se Imprime - Calendario empleado84881.xlsx';
const PDF_NAME = 'PDF FTPS 16-31 OCTUBRE PAX Y LL 2026.pdf';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const row = (s: { date: string; shiftType?: string | null; location?: string | null; startTime?: string; endTime?: string }) => ({
  date: s.date, shiftType: s.shiftType ?? s.location ?? '', startTime: s.startTime ?? '', endTime: s.endTime ?? '',
});

describe.skipIf(!out || !existsSync(path.join(dir, XLSX_NAME)) || !existsSync(path.join(dir, PDF_NAME)))('real documents export (local only)', () => {
  it('exports normalised rows of the individual XLSX and the team PDF', async () => {
    const xlsxBytes = readFileSync(path.join(dir, XLSX_NAME));
    const pdfBytes = readFileSync(path.join(dir, PDF_NAME));
    const xlsx = new File([xlsxBytes], XLSX_NAME, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const pdf = new File([pdfBytes], PDF_NAME, { type: 'application/pdf' });

    const context = await detectCalendarContext(xlsx);
    // Individual workbook: the identity is the payroll number the user would select; no name is needed.
    const analysis = await analyzeDocumentFile(xlsx, { employeeName: '', employeeIdentifiers: ['84881'] }, undefined, context);
    const team = await detectPdfTeamRoster(pdf);
    expect(team).not.toBeNull();

    writeFileSync(out as string, JSON.stringify({
      xlsx: { fileFingerprint: sha(xlsxBytes), sourceFormat: 'excel', externalEmployeeId: '84881', rows: analysis.shifts.map(row) },
      pdf: {
        fileFingerprint: sha(pdfBytes), sourceFormat: 'pdf',
        employees: (team?.employees ?? []).map((e) => ({ externalEmployeeId: e.externalEmployeeId, rows: e.shifts.map(row) })),
      },
    }), { mode: 0o600 });
  }, 180000);
});

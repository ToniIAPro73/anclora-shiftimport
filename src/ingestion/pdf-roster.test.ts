// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractDocumentItems } from './parsers/file';
import { detectPdfRoster } from './pdf-roster';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const FIXTURE_PATH = new URL(
  '../../test-data/synthetic/shiftimport-v1/03_cuadrante_agosto_2026.pdf',
  import.meta.url,
);

async function loadFixtureItems() {
  const bytes = await readFile(FIXTURE_PATH);
  const file = new File([bytes], '03_cuadrante_agosto_2026.pdf', { type: 'application/pdf' });
  return extractDocumentItems(file);
}

describe('detectPdfRoster (Fase 1.2F-PDF, real reference fixture)', () => {
  it('enumerates exactly the 40 distinct employees, deduped across both fortnight pages', async () => {
    const items = await loadFixtureItems();
    const roster = detectPdfRoster(items);

    expect(roster).not.toBeNull();
    expect(roster?.employees).toHaveLength(40);

    const ids = roster!.employees.map((employee) => employee.externalEmployeeId).sort();
    expect(new Set(ids).size).toBe(40); // no duplicates
    expect(ids[0]).toBe('SI120001');
    expect(ids[ids.length - 1]).toBe('SI120040');
  });

  it('first-half page (Q1) and second-half page (Q2) contribute the same 40 people, not 80', async () => {
    const items = await loadFixtureItems();
    const roster = detectPdfRoster(items);
    // 8 pages total (4 per fortnight, 10 employees per page) — if page
    // dedup were broken this would be 80, not 40.
    expect(roster?.employees).toHaveLength(40);
  });

  it('every roster entry has both a non-empty id and a non-empty name', async () => {
    const items = await loadFixtureItems();
    const roster = detectPdfRoster(items);
    for (const employee of roster!.employees) {
      expect(employee.externalEmployeeId.length).toBeGreaterThan(0);
      expect(employee.name.length).toBeGreaterThan(0);
    }
  });

  it('names are correctly paired to their own id, not a neighbour\'s (spot check)', async () => {
    const items = await loadFixtureItems();
    const roster = detectPdfRoster(items);
    const byId = new Map(roster!.employees.map((employee) => [employee.externalEmployeeId, employee.name]));
    expect(byId.get('SI120001')).toBe('Adriana Molina Serra');
    expect(byId.get('SI120005')).toBe('Andrés Costa Ferrer');
    expect(byId.get('SI120040')).toBe('Zulema Martín Vidal');
  });

  it('returns null for a document with no recognizable roster', () => {
    expect(detectPdfRoster([])).toBeNull();
  });
});

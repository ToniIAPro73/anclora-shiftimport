// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractDocumentItems } from './parsers/file';
import { detectPdfRoster } from './pdf-roster';
import { PdfTextItem } from './core/text-items';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

const FIXTURE_PATH = new URL(
  '../../test-data/fixtures/parser-regression/03_cuadrante_agosto_2026.pdf',
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

// Reduced positional fixture reproducing the real-world TYPE_B id/name drift
// bug: PDF FTPS 1-15 SEPTIEMBRE 2026 PAX Y LL 2026 prints each employee's
// name on the id marker's own line, but its start x varies with the id's
// digit width — some names land a few points past markerMaxX (100). The
// roster enumerator used to scan for names only up to markerMaxX, silently
// dropping those names from the candidate pool; the nearest-Δy fallback
// then attached the PREVIOUS row's name to the id instead. This fixture is
// hand-built from the real document's actual x/y coordinates (dumped via
// extractDocumentItems against the source PDF, never committed — it's
// gitignored, PII) — never a name-specific exception, purely positional.
function textItem(text: string, x: number, y: number): PdfTextItem {
  return { text, x, y, width: 10, height: 10, page: 1 };
}

const TYPE_B_DRIFT_FIXTURE: PdfTextItem[] = [
  // Document-type detection anchors (TYPE_B: a weekday+day header, "Nomina").
  textItem('Nomina', 21.3, 503.0),
  textItem('L5', 300.0, 600.0),
  // Row 1: name well inside markerMaxX (100) — the control case, always worked.
  textItem('38248', 28.1, 423.9),
  textItem('Bosch Noguera, Roberto Jaime', 87.9, 423.9),
  // Row 2: name starts PAST markerMaxX (110.1 > 100) — the drift bug.
  textItem('85919', 28.1, 401.1),
  textItem('Cerda Cerda, Joan', 110.1, 401.1),
  // Row 3: back inside markerMaxX.
  textItem('89622', 28.1, 378.3),
  textItem('Garau Femenia, Maria Mercedes', 85.1, 378.3),
  // Row 4: drift again (101.8 > 100).
  textItem('52495', 28.1, 355.5),
  textItem('Grimalt Moreno, Marina', 101.8, 355.5),
  // Row 5: drift again (109.6 > 100).
  textItem('33408', 28.1, 332.7),
  textItem('Leon Perez, Esther', 109.6, 332.7),
];

describe('detectPdfRoster (TYPE_B id/name drift regression — reduced positional fixture)', () => {
  it('never attaches a neighbouring row\'s name when the own name lands a few points past markerMaxX', () => {
    const roster = detectPdfRoster(TYPE_B_DRIFT_FIXTURE);
    expect(roster).not.toBeNull();
    const byId = new Map(roster!.employees.map((employee) => [employee.externalEmployeeId, employee.name]));

    expect(byId.get('38248')).toBe('Bosch Noguera, Roberto Jaime');
    expect(byId.get('85919')).toBe('Cerda Cerda, Joan'); // previously inherited row 1's name
    expect(byId.get('89622')).toBe('Garau Femenia, Maria Mercedes');
    expect(byId.get('52495')).toBe('Grimalt Moreno, Marina'); // previously inherited row 3's name
    expect(byId.get('33408')).toBe('Leon Perez, Esther'); // previously inherited row 3's name

    // No name value is reused across two different ids — the exact failure
    // signature reported (one name attached to 2-3 distinct ids).
    const names = [...byId.values()];
    expect(new Set(names).size).toBe(names.length);
  });
});

// Real production regression: a wider export variant of this report prints
// names past BOTH markerMaxX and dataMinX (x~162, dataMinX=150) — no real
// name qualifies as a candidate band at all. The only remaining pure-letter
// text near the marker column was the "Nomina" column header itself, which
// got attached to every id as its "name" (nearest band by |Δy| finds
// whatever is available). That wrong name then round-tripped into
// analyzeShiftsFromItems as the row-anchor, whose row band stretched from
// the header at the top of the table down to the target id — pulling in
// every employee's cells in between into one person's shifts.
const TYPE_B_WIDE_NAME_FIXTURE: PdfTextItem[] = [
  textItem('Nomina Empleado', 21.3, 700.0),
  textItem('L5', 300.0, 600.0),
  // Both employees' names sit past dataMinX (150) — outside the zone any
  // real name could be recognized in. Only the header above qualifies as a
  // letters-only label anywhere near the marker column.
  textItem('38248', 28.1, 423.9),
  textItem('Bosch Noguera, Roberto Jaime', 162.1, 423.9),
  textItem('85919', 28.1, 401.1),
  textItem('Cerda Cerda, Joan', 162.1, 401.1),
];

describe('detectPdfRoster (structural-header misattribution regression)', () => {
  it('never assigns the "Nomina" column header as an employee name', () => {
    const roster = detectPdfRoster(TYPE_B_WIDE_NAME_FIXTURE);
    // Safe outcome: no reliable name band exists for either id, so the
    // roster is either null or simply omits these ids — never "Nomina".
    const names = roster?.employees.map((employee) => employee.name) ?? [];
    expect(names).not.toContain('Nomina');
    expect(names).not.toContain('Nomina Empleado');
  });
});

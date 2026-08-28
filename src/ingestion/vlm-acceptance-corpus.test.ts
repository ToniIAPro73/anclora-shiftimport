// @vitest-environment node
/**
 * VLM fallback acceptance corpus (spec Parte 17) — node-verifiable slice.
 *
 * Fixtures live in test-data/scenarios/anclora-group-shift-ingestion/vlm/
 * (regenerate with `node scripts/generate-vlm-fixtures.mjs`; see the README
 * there for the full A–G contract). This suite asserts, with the REAL
 * deterministic pipeline, the decisions that do not require OCR or a browser:
 *
 * - A (legible PDF): deterministic extraction wins → VLM never eligible.
 * - B (scanned PDF, no text layer): zero items → VLM_ELIGIBLE when
 *   authenticated, never for guests.
 * - C/D (rotated / low-contrast images): classified as image; the trigger
 *   fires on empty items. The OCR/VLM extraction itself is NOT_RUN in node
 *   (OCR_NOT_RUN_NODE convention from acceptance-corpus.test.ts): Tesseract
 *   spa and the server VLM run in browser/E2E with VLM_PROVIDER=fake or real
 *   credentials.
 * - E (illegible noise PNG): valid image, same NOT_RUN convention — what
 *   matters (no invented data, VLM_* diagnostics on failure) is covered by
 *   vlm-fallback.test.ts against a fake provider.
 * - F/G (ambiguous employee / unknown area): behavior of the matcher over
 *   VLM output, already covered by vlm-fallback.test.ts unit tests (null
 *   employeeName → UNRECOGNIZED, ambiguity preserved); documented in the
 *   corpus README, not re-tested here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { analyzeDocumentFile, classifyDocument, extractDocumentItems } from './parsers/file';
import { classifyVlmTrigger } from './vlm-trigger';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

setupLocalStorageMock();

const VLM_CORPUS = join(process.cwd(), 'test-data/scenarios/anclora-group-shift-ingestion/vlm');
const SEPTEMBER_2026 = { month: 8, year: 2026 }; // 0-indexed internally
const SELECTOR = { employeeName: 'Ana Martinez', employeeIdentifiers: ['1001'] };

function fileFromCorpus(name: string, type: string): File {
  return new File([readFileSync(join(VLM_CORPUS, name))], name, { type });
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('VLM acceptance corpus (Parte 17) — node-verifiable cases', () => {
  it('A: A_legible.pdf — deterministic extraction wins; VLM never eligible even authenticated', async () => {
    const file = fileFromCorpus('A_legible.pdf', 'application/pdf');
    const items = await extractDocumentItems(file);
    expect(items.length).toBeGreaterThan(0);

    const result = await analyzeDocumentFile(file, SELECTOR, undefined, SEPTEMBER_2026);
    expect(result.quality.state).toBe('CORRECT');
    expect(result.shifts.length).toBeGreaterThan(0);
    expect(result.shifts.every((shift) => shift.date.startsWith('2026-09'))).toBe(true);
    expect(result.vlmError).toBeUndefined();

    const decision = classifyVlmTrigger({
      kind: 'pdf', itemCount: items.length, quality: result.quality, authenticated: true,
    });
    expect(decision).toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'reliable-result' });
  });

  it('B: B_scanned_no_text.pdf — zero text items → VLM_ELIGIBLE (authenticated only)', async () => {
    const file = fileFromCorpus('B_scanned_no_text.pdf', 'application/pdf');
    const items = await extractDocumentItems(file);
    expect(items).toHaveLength(0);

    // Node has no active session, so analyzeDocumentFile never attempts the
    // fallback — the deterministic (empty) result stands untouched.
    const result = await analyzeDocumentFile(file, SELECTOR, undefined, SEPTEMBER_2026);
    expect(result.shifts).toHaveLength(0);
    expect(result.quality.state).toBe('UNRECOGNIZED');
    expect(result.vlmError).toBeUndefined();

    const authenticated = classifyVlmTrigger({
      kind: 'pdf', itemCount: items.length, quality: result.quality, authenticated: true,
    });
    expect(authenticated).toEqual({ kind: 'VLM_ELIGIBLE', reason: 'empty-items' });

    const guest = classifyVlmTrigger({
      kind: 'pdf', itemCount: items.length, quality: result.quality, authenticated: false,
    });
    expect(guest).toEqual({ kind: 'VLM_NOT_ELIGIBLE', reason: 'unauthenticated' });
  });

  it.each([
    ['C_rotated.jpg', 'image/jpeg'],
    ['D_low_contrast.jpg', 'image/jpeg'],
  ])('C/D: %s — image kind; VLM-eligible on empty items; OCR extraction NOT_RUN in node', (name, type) => {
    const file = fileFromCorpus(name, type);
    expect(classifyDocument(file)).toBe('image');

    // The trigger decision over an image the deterministic pipeline could not
    // read (zero positioned items) is pure and verifiable here.
    const decision = classifyVlmTrigger({
      kind: 'image',
      itemCount: 0,
      quality: { shifts: [], confidence: 0, warnings: [], state: 'UNRECOGNIZED' },
      authenticated: true,
    });
    expect(decision).toEqual({ kind: 'VLM_ELIGIBLE', reason: 'empty-items' });

    // OCR_NOT_RUN_NODE: Tesseract spa (extractImageItems) and the server VLM
    // run in browser/E2E (VLM_PROVIDER=fake or real credentials), not here.
  });

  it('E: E_illegible.png — valid noise image, image kind; OCR/VLM outcome NOT_RUN in node', () => {
    const bytes = readFileSync(join(VLM_CORPUS, 'E_illegible.png'));
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);

    const file = new File([bytes], 'E_illegible.png', { type: 'image/png' });
    expect(classifyDocument(file)).toBe('image');

    // OCR_NOT_RUN_NODE: whether the VLM fails (VLM_* diagnostic) or returns
    // unusable records, the contract is "never invent data" — covered against
    // the fake provider in vlm-fallback.test.ts; real-provider behavior is
    // E2E/QA-visual (see the corpus README).
  });
});

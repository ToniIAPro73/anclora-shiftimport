// @vitest-environment node
/**
 * LOCAL QA HELPER (skipped unless QA_TRYP_OUT is set and the gitignored real files exist). Parses the real TRYP
 * exports with the production parser and writes ONLY normalised rows + annotation shape (no names) for
 * scripts/qa/source-aware-import-e2e.mjs. Real documents are never committed.
 *
 *   QA_TRYP_OUT=/tmp/tryp.json npx vitest run src/ingestion/tryp-real-export.test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrypCalendarExport } from './adapters/tryp-calendar-export';

const out = process.env.QA_TRYP_OUT;
const dir = path.join(__dirname, 'fixtures', 'real');
const files = { emp: path.join(dir, 'emp.xlsx'), pub: path.join(dir, 'pub.xlsx') };

describe.skipIf(!out || !existsSync(files.emp) || !existsSync(files.pub))('TRYP real exports (local only)', () => {
  it('exports normalised rows and annotations', async () => {
    const result: Record<string, unknown> = {};
    for (const [key, file] of Object.entries(files)) {
      const bytes = readFileSync(file);
      const parsed = await parseTrypCalendarExport(new File([bytes], `${key}.xlsx`));
      expect(parsed).not.toBeNull();
      result[key] = {
        fileFingerprint: createHash('sha256').update(bytes).digest('hex'),
        sourceKind: parsed!.sourceKind,
        sourceSystem: parsed!.sourceSystem,
        sourceIdentifier: parsed!.sourceIdentifier,
        rows: parsed!.rows.map((r) => ({ date: r.date, shiftType: r.shiftType, startTime: r.startTime ?? '', endTime: r.endTime ?? '' })),
        annotations: parsed!.rows.flatMap((r) => [
          ...(r.dcf ? [{ date: r.date, kind: 'DCF', startTime: null, endTime: null }] : []),
          ...(r.comment ? [{ date: r.date, kind: 'COMMENT', text: r.comment }] : []),
        ]),
      };
    }
    writeFileSync(out as string, JSON.stringify(result), { mode: 0o600 });
  }, 60000);
});

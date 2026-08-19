/**
 * Aggregates artifacts/<CASE_ID>/result.json into a compact report table.
 * A result is only valid when the case actually executed assertions
 * (clobbered artifacts from aborted runs have assertions: [] and actual null).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_ROOT } from './env';

export interface AggregatedCase {
  caseId: string;
  status: 'VALID' | 'STALE';
  failedAssertions: number;
  assertionNames: string[];
  actual: unknown;
}

export function aggregate(): AggregatedCase[] {
  const dirs = fs
    .readdirSync(ARTIFACTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const out: AggregatedCase[] = [];
  for (const dir of dirs) {
    const resultPath = path.join(ARTIFACTS_ROOT, dir, 'result.json');
    if (!fs.existsSync(resultPath)) {
      out.push({ caseId: dir, status: 'STALE', failedAssertions: -1, assertionNames: [], actual: null });
      continue;
    }
    const json = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    const assertions = json.assertions ?? [];
    const failed = assertions.filter((a: { pass: boolean }) => !a.pass);
    const valid = assertions.length > 0 && json.actual !== null;
    out.push({
      caseId: dir,
      status: valid ? 'VALID' : 'STALE',
      failedAssertions: failed.length,
      assertionNames: failed.map((a: { name: string }) => a.name),
      actual: json.actual,
    });
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('aggregate.ts')) {
  for (const row of aggregate()) {
    console.log(
      `${row.status}\t${row.failedAssertions === 0 ? 'PASS' : row.failedAssertions > 0 ? 'FAIL' : '—'}\t${row.caseId}${row.assertionNames.length ? '\t' + row.assertionNames.join(', ') : ''}`,
    );
  }
}

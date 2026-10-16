import { createHash } from 'node:crypto';
import { daySignature, normalizePlanRow, planCanonicalLines } from '../../src/lib/company-plan.js';

/**
 * Three-level fingerprints. None of them depends on a tenant UUID:
 *  FILE     exact bytes (SHA-256 supplied by the client)
 *  DOCUMENT normalised parse result + period/mode context (ignores file metadata, row order, format noise)
 *  PLAN     pure business content of the plan rows, keyed by the employee BUSINESS KEY (payroll number)
 */
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function planFingerprint(entries) {
  return sha256(planCanonicalLines(entries).join('\n'));
}

/** entries = [{ employeeKey, row }] for the WHOLE document (historical + future). */
export function documentFingerprint(entries, context = {}) {
  const byEmployee = new Map();
  for (const entry of entries) {
    const n = normalizePlanRow(entry.row);
    if (!byEmployee.has(entry.employeeKey)) byEmployee.set(entry.employeeKey, []);
    // Annotations (DCF, observation text) are part of the DOCUMENT, never of the business PLAN.
    const notes = (entry.annotations ?? []).map((a) => (a.kind === 'COMMENT' ? `C:${String(a.text ?? '').trim()}` : `D:${a.startTime ?? ''}-${a.endTime ?? ''}`)).sort().join(',');
    byEmployee.get(entry.employeeKey).push(`${n.date}|${n.type}|${n.start}|${n.end}|${n.duty}|${notes}`);
  }
  const employees = [...byEmployee.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => [key, rows.sort()]);
  return sha256(JSON.stringify({
    employees,
    mode: context.importMode ?? '',
    periodKind: context.periodKind ?? '',
    periodYear: context.periodYear ?? null,
    periodMonth: context.periodMonth ?? null,
  }));
}

/** Per-day comparison signature (Regular/Extras split insensitive) — used to detect plan equality per day. */
export function dayFingerprint(rows) {
  return sha256(daySignature(rows));
}

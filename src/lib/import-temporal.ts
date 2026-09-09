import { getOperationalDate } from './operational-date';

/**
 * The temporal decision is applied after every source adapter has produced
 * normalized records. It deliberately knows nothing about file formats.
 */
export type FutureImportDecision = 'draft' | 'historical-only';

export interface TemporalImportSplit<T> {
  historical: T[];
  future: T[];
}

export function splitImportByOperationalDate<T extends { date: string }>(
  records: T[],
  today = getOperationalDate(),
): TemporalImportSplit<T> {
  return records.reduce<TemporalImportSplit<T>>((split, record) => {
    split[record.date < today ? 'historical' : 'future'].push(record);
    return split;
  }, { historical: [], future: [] });
}

/**
 * The detected future count is not the effective destination: role and the
 * user's draft/historical-only decision can exclude every future row from
 * ever becoming a draft (D-P5.5-05, PD-2026-09-06-D03). Badges and summaries
 * must render this, never the raw detected count, to avoid promising drafts
 * that will not be created.
 */
export interface TemporalEffectiveSummary {
  detected: number;
  includedAsDraft: number;
  excludedByRole: number;
}

export function deriveEffectiveTemporalSummary(
  split: TemporalImportSplit<{ date: string }>,
  context: { identityLocked: boolean; decision: FutureImportDecision },
): TemporalEffectiveSummary {
  const detected = split.future.length;
  if (context.identityLocked || context.decision === 'historical-only') {
    return { detected, includedAsDraft: 0, excludedByRole: detected };
  }
  return { detected, includedAsDraft: detected, excludedByRole: 0 };
}

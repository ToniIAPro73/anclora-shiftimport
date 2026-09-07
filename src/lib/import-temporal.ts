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

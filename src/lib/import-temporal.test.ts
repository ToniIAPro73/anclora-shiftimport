import { describe, expect, it } from 'vitest';
import { splitImportByOperationalDate } from './import-temporal';

describe('format-agnostic temporal import policy', () => {
  it.each(['pdf', 'xlsx', 'csv', 'json', 'xml', 'image'])(
    'splits normalized %s records at the same operational boundary',
    (sourceFormat) => {
      const records = [
        { sourceFormat, date: '2026-09-05' },
        { sourceFormat, date: '2026-09-06' },
        { sourceFormat, date: '2026-09-07' },
      ];

      const split = splitImportByOperationalDate(records, '2026-09-06');

      expect(split.historical).toHaveLength(1);
      expect(split.future).toHaveLength(2);
      expect(split.historical[0].sourceFormat).toBe(sourceFormat);
      expect(split.future.map((record) => record.date)).toEqual(['2026-09-06', '2026-09-07']);
    },
  );
});

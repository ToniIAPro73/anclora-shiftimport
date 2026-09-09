import { describe, expect, it } from 'vitest';
import { deriveEffectiveTemporalSummary, splitImportByOperationalDate } from './import-temporal';

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

describe('deriveEffectiveTemporalSummary', () => {
  const futureSplit = {
    historical: [{ date: '2026-09-01' }],
    future: [{ date: '2026-09-10' }, { date: '2026-09-11' }, { date: '2026-09-12' }],
  };
  const noFutureSplit = { historical: [{ date: '2026-09-01' }], future: [] };

  // AC-1 (UXR-F2-M03): EMPLOYEE (identityLocked) never gets drafts from future rows,
  // regardless of decision — D-P5.5-05.
  it('excludes every detected future row for a locked identity (EMPLOYEE)', () => {
    const summary = deriveEffectiveTemporalSummary(futureSplit, {
      identityLocked: true,
      decision: 'draft',
    });
    expect(summary).toEqual({ detected: 3, includedAsDraft: 0, excludedByRole: 3 });
  });

  it('excludes every detected future row for a locked identity even with historical-only decision', () => {
    const summary = deriveEffectiveTemporalSummary(futureSplit, {
      identityLocked: true,
      decision: 'historical-only',
    });
    expect(summary).toEqual({ detected: 3, includedAsDraft: 0, excludedByRole: 3 });
  });

  // AC-2 (UXR-F2-M03): ADMIN/PLANNER with historical-only decision also gets 0 drafts —
  // the badge must never show a nonzero draft count that the confirmation will not create.
  it('excludes every detected future row for an unlocked identity choosing historical-only', () => {
    const summary = deriveEffectiveTemporalSummary(futureSplit, {
      identityLocked: false,
      decision: 'historical-only',
    });
    expect(summary).toEqual({ detected: 3, includedAsDraft: 0, excludedByRole: 3 });
  });

  it('includes every detected future row as draft for an unlocked identity choosing draft', () => {
    const summary = deriveEffectiveTemporalSummary(futureSplit, {
      identityLocked: false,
      decision: 'draft',
    });
    expect(summary).toEqual({ detected: 3, includedAsDraft: 3, excludedByRole: 0 });
  });

  it('reports zero detected/included/excluded when there are no future rows', () => {
    const summary = deriveEffectiveTemporalSummary(noFutureSplit, {
      identityLocked: false,
      decision: 'draft',
    });
    expect(summary).toEqual({ detected: 0, includedAsDraft: 0, excludedByRole: 0 });
  });
});

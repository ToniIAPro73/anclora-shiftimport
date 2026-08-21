import { describe, expect, it } from 'vitest';
import { getDayColumnsForPage, DayHeaderRule } from './day-columns';
import { PdfTextItem } from './text-items';

const context = { month: 8, year: 2026 };

const rule: DayHeaderRule = {
  pattern: /^(\d{1,2})$/,
  dayGroup: 1,
};

function headerItems(page: number, days: number[]): PdfTextItem[] {
  return days.map((day, index) => ({
    text: String(day),
    x: index * 20,
    y: 100,
    width: 10,
    height: 10,
    page,
  }));
}

describe('getDayColumnsForPage', () => {
  it('returns the page own day columns when present', () => {
    const items = headerItems(1, [1, 2, 3]);
    expect(getDayColumnsForPage(items, 1, context, rule)).toEqual([
      { day: 1, x: 0 },
      { day: 2, x: 20 },
      { day: 3, x: 40 },
    ]);
  });

  it('returns nothing for a headerless page when fallback is disabled (default)', () => {
    const items = headerItems(1, [1, 2, 3]);
    expect(getDayColumnsForPage(items, 2, context, rule)).toEqual([]);
  });

  it(
    'reuses another page\'s header grid when this page has none and fallback is enabled — ' +
      'the real-world bug: a multi-page roster prints the day-header row only on page 1, ' +
      'but every following page uses the identical x-column grid without reprinting it',
    () => {
      const items = headerItems(1, [1, 2, 3]);
      expect(getDayColumnsForPage(items, 2, context, rule, true)).toEqual([
        { day: 1, x: 0 },
        { day: 2, x: 20 },
        { day: 3, x: 40 },
      ]);
    },
  );

  it('prefers its own columns over the fallback when both exist', () => {
    const items = [...headerItems(1, [1, 2, 3]), ...headerItems(2, [4, 5])];
    expect(getDayColumnsForPage(items, 2, context, rule, true)).toEqual([
      { day: 4, x: 0 },
      { day: 5, x: 20 },
    ]);
  });

  it('returns nothing when no page in the document has a header row, even with fallback enabled', () => {
    const items: PdfTextItem[] = [
      { text: 'not-a-day', x: 0, y: 100, width: 10, height: 10, page: 1 },
    ];
    expect(getDayColumnsForPage(items, 1, context, rule, true)).toEqual([]);
  });
});

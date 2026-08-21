/**
 * Day-header detection: turns header text items into day columns.
 * The header pattern is declared by each ingestion profile.
 */
import { CalendarImportContext } from '../../lib/import-types';
import { DayColumn } from './clustering';
import { PdfTextItem } from './text-items';

export interface DayHeaderRule {
  /** Regex matched against the raw item text; must capture the day. */
  pattern: RegExp;
  /** Capture group index holding the day of month. */
  dayGroup: number;
  /**
   * Optional capture group index holding the month (1-based in the document).
   * When present, only headers of `context.month` are kept.
   */
  monthGroup?: number;
}

function extractDayColumnsForPage(
  items: PdfTextItem[],
  page: number,
  context: CalendarImportContext,
  rule: DayHeaderRule,
): DayColumn[] {
  return items
    .filter((item) => item.page === page)
    .map((item) => {
      const match = item.text.match(rule.pattern);
      if (!match) {
        return null;
      }

      const day = Number.parseInt(match[rule.dayGroup], 10);
      if (rule.monthGroup !== undefined) {
        const month = Number.parseInt(match[rule.monthGroup], 10) - 1;
        if (month !== context.month) {
          return null;
        }
      }

      return { day, x: item.x };
    })
    .filter((item): item is DayColumn => Boolean(item))
    .sort((left, right) => left.x - right.x);
}

export function getDayColumnsForPage(
  items: PdfTextItem[],
  page: number,
  context: CalendarImportContext,
  rule: DayHeaderRule,
  /**
   * When true and this page has no day-header row of its own, reuse the
   * header row (same x grid) from whichever OTHER page in the document does
   * have one. Some real multi-page rosters print the day-header row only
   * once — the page carrying the FIRST batch of employees — and repeat the
   * identical x-column grid on every following page without re-printing the
   * header text (confirmed against a real fixture: page 1 has 15 day
   * columns, pages 2-5 have 0 of their own, yet all 5 pages' shift data
   * sits at the exact same x positions as page 1's columns). Without this,
   * every employee whose row only appears on a headerless page resolves
   * zero day columns and silently loses 100% of their shifts.
   *
   * Defaults to false: callers that count/hash true per-page header
   * occurrences (structure-signature / drift detection) must NOT receive
   * duplicated fallback columns for every headerless page.
   */
  fallbackToOtherPages = false,
): DayColumn[] {
  const ownColumns = extractDayColumnsForPage(items, page, context, rule);
  if (ownColumns.length > 0 || !fallbackToOtherPages) {
    return ownColumns;
  }

  const otherPages = Array.from(new Set(items.map((item) => item.page)))
    .filter((candidate) => candidate !== page)
    .sort((left, right) => left - right);
  for (const otherPage of otherPages) {
    const fallback = extractDayColumnsForPage(items, otherPage, context, rule);
    if (fallback.length > 0) {
      return fallback;
    }
  }
  return [];
}

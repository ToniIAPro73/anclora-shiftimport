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

export function getDayColumnsForPage(
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

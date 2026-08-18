/**
 * Calendar context (month/year) detection strategies.
 * Each profile picks one strategy; the year always comes from
 * deduceYearFromItems.
 */
import { CalendarImportContext } from '../../lib/import-types';
import { DayHeaderRule } from './day-columns';
import { normalizeText } from './normalize';
import { deduceYearFromItems, PdfTextItem } from './text-items';

export type CalendarContextRule =
  | { mode: 'day-header-month-vote' }
  | { mode: 'month-name-scan'; monthNames: string[]; monthShortNames: string[] };

/**
 * Month = the month that appears most often in the day headers
 * (ties resolve to the first month seen in extraction order).
 */
function detectByDayHeaderVote(
  items: PdfTextItem[],
  dayHeader: DayHeaderRule,
): CalendarImportContext {
  const header = items
    .map((item) => {
      const match = item.text.match(dayHeader.pattern);
      if (!match || dayHeader.monthGroup === undefined) {
        return null;
      }

      return {
        day: Number.parseInt(match[dayHeader.dayGroup], 10),
        month: Number.parseInt(match[dayHeader.monthGroup], 10) - 1,
      };
    })
    .filter((item): item is { day: number; month: number } => Boolean(item));

  if (header.length === 0) {
    return {
      month: new Date().getMonth(),
      year: deduceYearFromItems(items),
    };
  }

  const monthCounts = new Map<number, number>();
  for (const item of header) {
    monthCounts.set(item.month, (monthCounts.get(item.month) ?? 0) + 1);
  }

  const detectedMonth = Array.from(monthCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? new Date().getMonth();
  return {
    month: detectedMonth,
    year: deduceYearFromItems(items),
  };
}

/**
 * Month = first item (in extraction order) exactly matching a month name,
 * then first item containing a full month name. Falls back to current month.
 */
function detectByMonthNameScan(
  items: PdfTextItem[],
  monthNames: string[],
  monthShortNames: string[],
): CalendarImportContext {
  const year = deduceYearFromItems(items);

  for (const item of items) {
    const normalized = normalizeText(item.text);
    for (let i = 0; i < 12; i += 1) {
      if (normalized === monthNames[i] || normalized === monthShortNames[i]) {
        return { month: i, year };
      }
    }
  }

  for (const item of items) {
    const normalized = normalizeText(item.text);
    for (let i = 0; i < 12; i += 1) {
      if (normalized.includes(monthNames[i])) {
        return { month: i, year };
      }
    }
  }

  return {
    month: new Date().getMonth(),
    year,
  };
}

export function detectCalendarContext(
  items: PdfTextItem[],
  rule: CalendarContextRule,
  dayHeader: DayHeaderRule,
): CalendarImportContext {
  switch (rule.mode) {
    case 'day-header-month-vote':
      return detectByDayHeaderVote(items, dayHeader);
    case 'month-name-scan':
      return detectByMonthNameScan(items, rule.monthNames, rule.monthShortNames);
  }
}

/**
 * Section-aware walker for TYPE_MULTI documents (one repeated monthly
 * table per `Month YYYY` section on the same page). The generic engine
 * (parse-items.ts) assumes a single calendar context per document, which
 * does not fit a document that legitimately spans several months — this
 * walker detects every section, then reuses the same generic row/column
 * primitives band-restricted to the section matching the caller's selected
 * month/year (the same context.month/year the user picked in the UI, or
 * the auto-detected one). When no section matches that month/year, every
 * detected section is used as a defensive fallback instead of silently
 * returning nothing.
 */
import { CalendarImportContext, ParsedCalendarShift } from '../../lib/import-types';
import { IngestionError } from '../../lib/ingestion-errors';
import { getDaysInMonth } from '../../lib/week';
import { clusterByX, mapColumnGroupsToDays } from '../core/clustering';
import {
  countEmployeeNameCandidates,
  EmployeeSelector,
  findEmployeeRowItems,
} from '../core/row-detection';
import { buildShiftEntriesForDay } from '../core/shift-builder';
import { buildCodeProfile } from '../core/shift-code-profile';
import { PdfTextItem } from '../core/text-items';
import { IngestionProfile } from '../profiles/types';

const MONTH_NAMES_EN = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

interface Section {
  month: number;
  year: number;
  page: number;
  topY: number;
  bottomY: number;
}

export function detectSections(items: PdfTextItem[]): Section[] {
  const headers = items
    .map((item) => {
      const match = item.text.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
      if (!match) return null;
      const month = MONTH_NAMES_EN.indexOf(match[1].toLowerCase());
      if (month < 0) return null;
      return { page: item.page, month, year: Number.parseInt(match[2], 10), y: item.y };
    })
    .filter((item): item is { page: number; month: number; year: number; y: number } => Boolean(item))
    .sort((left, right) => left.page - right.page || right.y - left.y);

  return headers.map((header, index) => {
    const next = headers[index + 1];
    const bottomY = next && next.page === header.page ? next.y : Number.NEGATIVE_INFINITY;
    return { month: header.month, year: header.year, page: header.page, topY: header.y, bottomY };
  });
}

/**
 * Sections matching the requested month/year. Falls back to every detected
 * section when none matches — the auto-detected/selected context should
 * always line up with one of the document's sections, but a mismatch must
 * degrade to the old all-sections behavior rather than silently vanish.
 */
export function selectSectionsForContext(sections: Section[], context: CalendarImportContext): Section[] {
  const matching = sections.filter((section) => section.month === context.month && section.year === context.year);
  return matching.length > 0 ? matching : sections;
}

/** Bare 1-2 digit day headers: the y shared by the most such items is the header row. */
function detectDayColumns(bandItems: PdfTextItem[]): Array<{ day: number; x: number }> {
  const byY = new Map<number, PdfTextItem[]>();
  for (const item of bandItems) {
    if (!/^\d{1,2}$/.test(item.text.trim())) continue;
    const key = Math.round(item.y * 10) / 10;
    const list = byY.get(key) ?? [];
    list.push(item);
    byY.set(key, list);
  }

  let bestY: number | null = null;
  let bestCount = 0;
  for (const [y, list] of byY) {
    if (list.length > bestCount) {
      bestCount = list.length;
      bestY = y;
    }
  }
  if (bestY === null) {
    return [];
  }

  return byY.get(bestY)!
    .map((item) => ({ day: Number.parseInt(item.text.trim(), 10), x: item.x }))
    .sort((left, right) => left.x - right.x);
}

export function parseMultiSectionShifts(
  allItems: PdfTextItem[],
  selector: EmployeeSelector,
  profile: IngestionProfile,
  context: CalendarImportContext,
): ParsedCalendarShift[] {
  const allSections = detectSections(allItems);
  if (allSections.length === 0) {
    throw new IngestionError('UNSUPPORTED_LAYOUT', profile.errors.noDayHeaders);
  }
  const sections = selectSectionsForContext(allSections, context);

  const codeProfile = buildCodeProfile(allItems);
  const targetIds = selector.employeeIdentifiers.map((value) => value.replace(/\D/g, '')).filter(Boolean);

  let foundAny = false;
  let nameCandidateTotal = 0;
  let shifts: ParsedCalendarShift[] = [];

  for (const section of sections) {
    const bandItems = allItems.filter(
      (item) => item.page === section.page && item.y <= section.topY && item.y > section.bottomY,
    );
    if (bandItems.length === 0) continue;

    if (targetIds.length === 0) {
      nameCandidateTotal += countEmployeeNameCandidates(bandItems, selector.employeeName, profile.rowWindow.markerMaxX);
    }

    const row = findEmployeeRowItems(bandItems, selector, profile.rowWindow);
    if (!row) continue;
    foundAny = true;

    const columnGroups = clusterByX(row.rowItems, profile.clusterTolerance);
    const dayColumns = detectDayColumns(bandItems);
    if (dayColumns.length === 0) continue;

    const mappedColumns = mapColumnGroupsToDays(columnGroups, dayColumns, profile.columnMatchMaxDistance);
    const daysInMonth = getDaysInMonth(section.year, section.month);

    for (const { day, items } of mappedColumns) {
      if (day < 1 || day > daysInMonth) continue;

      const date = `${section.year}-${String(section.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const tokens = items
        .sort((left, right) => right.y - left.y || left.x - right.x)
        .map((item) => item.text.trim())
        .filter(Boolean);

      shifts.push(...buildShiftEntriesForDay(date, tokens, codeProfile));
    }
  }

  if (!foundAny) {
    if (targetIds.length === 0) {
      if (nameCandidateTotal === 0) {
        throw new IngestionError(
          'UNKNOWN_EMPLOYEE',
          profile.errors.employeeNotFound.replace('{name}', selector.employeeName).replace('{id}', ''),
        );
      }
      if (nameCandidateTotal > 1) {
        throw new IngestionError(
          'AMBIGUOUS_EMPLOYEE',
          `El nombre ${selector.employeeName} coincide con varias filas del documento. Indica el identificador de empleado para desambiguar.`,
        );
      }
    }
    throw new IngestionError(
      'UNKNOWN_EMPLOYEE',
      profile.errors.employeeNotFound.replace('{name}', selector.employeeName).replace('{id}', targetIds[0] ?? ''),
    );
  }

  if (profile.dropIncompleteShifts) {
    shifts = shifts.filter((shift) => Boolean(shift.shiftType) || shift.startTime !== '??:??' || shift.endTime !== '??:??');
  }

  if (profile.sortResult) {
    shifts = shifts.sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }
      return left.startTime.localeCompare(right.startTime);
    });
  }

  return shifts;
}

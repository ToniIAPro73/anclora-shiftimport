/**
 * Pure parsing pipeline over extracted text items: detects the document
 * type, resolves the ingestion profile and runs the generic core with the
 * profile's rules. No PDF.js dependency — tests drive this directly with
 * synthetic fixtures.
 */
import { CalendarImportContext, ParsedCalendarShift } from '../../lib/import-types';
import { IngestionError } from '../../lib/ingestion-errors';
import { getDaysInMonth } from '../../lib/week';
import { detectCalendarContext } from '../core/calendar-context';
import { clusterByX, mapColumnGroupsToDays } from '../core/clustering';
import { getDayColumnsForPage } from '../core/day-columns';
import {
  countEmployeeNameCandidates,
  EmployeeRow,
  EmployeeSelector,
  findEmployeeRowItems,
} from '../core/row-detection';
import { buildShiftEntriesForDay } from '../core/shift-builder';
import { buildCodeProfile } from '../core/shift-code-profile';
import { deduceYearFromItems, PdfTextItem } from '../core/text-items';
import { getIngestionProfile } from '../profiles';
import { IngestionProfile } from '../profiles/types';
import { detectPdfDocumentTypeFromItems } from './detect';
import { parseMultiSectionShifts } from './multi-section';

export function detectCalendarContextFromItems(items: PdfTextItem[]): CalendarImportContext {
  const profile = getIngestionProfile(detectPdfDocumentTypeFromItems(items));
  if (!profile) {
    return {
      month: new Date().getMonth(),
      year: deduceYearFromItems(items),
    };
  }

  return detectCalendarContext(items, profile.calendarContext, profile.dayHeader);
}

export function parseShiftsFromItems(
  allItems: PdfTextItem[],
  context: CalendarImportContext,
  selector: EmployeeSelector,
): ParsedCalendarShift[] {
  if (allItems.length === 0) {
    throw new IngestionError('EMPTY_DOCUMENT', 'El documento no contiene texto extraíble.');
  }

  const profile = getIngestionProfile(detectPdfDocumentTypeFromItems(allItems));
  if (!profile) {
    throw new IngestionError(
      'UNSUPPORTED_LAYOUT',
      'No se ha podido identificar el formato del documento para procesarlo correctamente.',
    );
  }

  // Multi-month documents (one section per "Month YYYY" table) have no
  // single calendar context to gate on — the section-aware walker returns
  // shifts spanning every section where the employee appears.
  if (profile.id === 'TYPE_MULTI') {
    return parseMultiSectionShifts(allItems, selector, profile);
  }

  const targetIds = selector.employeeIdentifiers
    .map((value) => value.replace(/\D/g, ''))
    .filter((value) => value.length > 0);

  // Without a disambiguating id, an unambiguous name match is required:
  // zero candidates = UNKNOWN_EMPLOYEE, several candidates = we must not
  // auto-pick one silently (corpus GN-01/GN-02).
  if (targetIds.length === 0) {
    const nameCandidates = countEmployeeNameCandidates(allItems, selector.employeeName, profile.rowWindow.markerMaxX);
    if (nameCandidates === 0) {
      throw new IngestionError(
        'UNKNOWN_EMPLOYEE',
        profile.errors.employeeNotFound
          .replace('{name}', selector.employeeName)
          .replace('{id}', ''),
      );
    }
    if (nameCandidates > 1) {
      throw new IngestionError(
        'AMBIGUOUS_EMPLOYEE',
        `El nombre ${selector.employeeName} coincide con varias filas del documento. Indica el identificador de empleado para desambiguar.`,
      );
    }
  }

  const row = findEmployeeRowItems(allItems, selector, profile.rowWindow);
  if (!row) {
    throw new IngestionError(
      'UNKNOWN_EMPLOYEE',
      profile.errors.employeeNotFound
        .replace('{name}', selector.employeeName)
        .replace('{id}', targetIds[0] ?? ''),
    );
  }

  return buildShiftsFromEmployeeRow(allItems, row, context, profile);
}

/**
 * Generic row→shifts pipeline (steps 5–10 of parseShiftsFromItems): cluster
 * the located row's cells into columns, align them with the page's day
 * columns and build the normalized shifts. Extracted so the format
 * assistant's manual-row re-parse (src/ingestion/assistant.ts) reuses the
 * exact same logic instead of a copy.
 */
export function buildShiftsFromEmployeeRow(
  allItems: PdfTextItem[],
  row: EmployeeRow,
  context: CalendarImportContext,
  profile: IngestionProfile,
): ParsedCalendarShift[] {
  const columnGroups = clusterByX(row.rowItems, profile.clusterTolerance);
  if (profile.errors.noColumnGroups && columnGroups.length === 0) {
    throw new IngestionError('UNSUPPORTED_LAYOUT', profile.errors.noColumnGroups);
  }

  const dayColumns = getDayColumnsForPage(allItems, row.page, context, profile.dayHeader);
  if (dayColumns.length === 0) {
    throw new IngestionError('UNSUPPORTED_LAYOUT', profile.errors.noDayHeaders);
  }

  const mappedColumns = mapColumnGroupsToDays(columnGroups, dayColumns, profile.columnMatchMaxDistance);
  if (profile.errors.noMappedColumns && mappedColumns.length === 0) {
    throw new IngestionError('UNSUPPORTED_LAYOUT', profile.errors.noMappedColumns);
  }

  const codeProfile = profile.useShiftCodeProfile ? buildCodeProfile(allItems) : undefined;

  let shifts: ParsedCalendarShift[] = [];
  for (const { day, items } of mappedColumns) {
    if (profile.validateDayInMonth && (day < 1 || day > getDaysInMonth(context.year, context.month))) {
      continue;
    }

    const date = `${context.year}-${String(context.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const tokens = items
      .sort((left, right) => right.y - left.y || left.x - right.x)
      .map((item) => item.text.trim())
      .filter(Boolean);

    shifts.push(...buildShiftEntriesForDay(date, tokens, codeProfile));
  }

  if (profile.dropIncompleteShifts) {
    shifts = shifts.filter(
      (shift) => Boolean(shift.shiftType) || shift.startTime !== '??:??' || shift.endTime !== '??:??',
    );
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

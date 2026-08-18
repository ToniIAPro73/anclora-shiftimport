import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CalendarImportContext, ParsedCalendarShift, PdfDocumentType } from './import-types';
import { resolveShiftTypeId } from './shift-types';
import { getDaysInMonth } from './week';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

interface EmployeeSelector {
  employeeName: string;
  employeeId: string;
}

interface RawPdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

function deduceYearFromItems(items: PdfTextItem[]): number {
  const yearTokens = items
    .map((item) => item.text.match(/\b(20\d{2})\b/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number.parseInt(match[1], 10))
    .filter((year) => year >= 2020 && year <= 2100);

  if (yearTokens.length > 0) {
    return yearTokens[0];
  }

  return new Date().getFullYear();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeEmployeeId(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeTimeToken(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return value.trim();
  }

  return `${String(Number.parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}`;
}

function isTimeToken(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value.trim());
}

function isOffToken(value: string): boolean {
  // "Off" tokens are aliases that resolve to the Libre shift type
  return resolveShiftTypeId(value) === 'Libre';
}

function isSeparatorToken(value: string): boolean {
  return /^--+$/.test(value.trim());
}

function expandShiftTokens(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (isOffToken(trimmed)) {
    return ['OFF'];
  }

  if (isSeparatorToken(trimmed)) {
    return ['--'];
  }

  const segments = trimmed.split(/(--+)/).filter(Boolean);
  const expanded: string[] = [];

  for (const segment of segments) {
    if (isSeparatorToken(segment)) {
      expanded.push('--');
      continue;
    }

    const times = Array.from(segment.matchAll(/\b(\d{1,2}:\d{2})\b/g), (match) => normalizeTimeToken(match[1]));
    if (times.length > 0) {
      expanded.push(...times);
      continue;
    }

    if (isOffToken(segment)) {
      expanded.push('OFF');
    }
  }

  return expanded;
}

function isEmployeeIdToken(value: string): boolean {
  return /^\(\d+\)$/.test(value.trim());
}

function looksLikeEmployeeLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isTimeToken(trimmed) || isOffToken(trimmed) || isSeparatorToken(trimmed)) return false;
  if (isEmployeeIdToken(trimmed)) return true;
  return /^[A-Za-zÁÉÍÓÚÜÑ.,' -]+$/.test(trimmed);
}

function isEmployeeNameLabel(value: string): boolean {
  const trimmed = value.trim();
  return looksLikeEmployeeLabel(trimmed) && !isEmployeeIdToken(trimmed);
}

function clusterByX(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((left, right) => left.x - right.x);
  const groups: PdfTextItem[][] = [];

  for (const item of sorted) {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([item]);
      continue;
    }

    const center = lastGroup.reduce((sum, current) => sum + current.x, 0) / lastGroup.length;
    if (Math.abs(item.x - center) <= 8) {
      lastGroup.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups;
}

async function extractPdfTextItems(file: File): Promise<PdfTextItem[]> {
  const buffer = await file.arrayBuffer();
  const document = await getDocument({ data: buffer }).promise;
  const items: PdfTextItem[] = [];

  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const content = await page.getTextContent();

    for (const rawItem of content.items as RawPdfTextItem[]) {
      const text = String(rawItem.str ?? '').trim();
      if (!text) {
        continue;
      }

      items.push({
        text,
        x: rawItem.transform?.[4] ?? 0,
        y: rawItem.transform?.[5] ?? 0,
        width: rawItem.width ?? 0,
        height: rawItem.height ?? 0,
        page: pageIndex,
      });
    }
  }

  return items;
}

function sortPdfItemsForReading(items: PdfTextItem[]): PdfTextItem[] {
  return [...items].sort((left, right) => {
    if (Math.abs(left.y - right.y) > 1) {
      return right.y - left.y;
    }
    return left.x - right.x;
  });
}

function detectPdfDocumentTypeFromItems(items: PdfTextItem[]): PdfDocumentType {
  const hasDayHeaders = items.some((item) => /^\d{2}\/\d{2}$/.test(item.text));
  const hasEmployeeIds = items.some((item) => isEmployeeIdToken(item.text));
  if (hasDayHeaders && hasEmployeeIds) {
    return 'TYPE_A';
  }

  const hasWeekHeaders = items.some((item) => /^[LMXJVSD]\d{1,2}$/.test(item.text));
  const hasNominaHeader = items.some((item) => normalizeText(item.text).includes('nomina'));
  if (hasWeekHeaders && hasNominaHeader) {
    return 'TYPE_B';
  }

  return 'UNKNOWN';
}

export async function detectPdfDocumentType(file: File): Promise<PdfDocumentType> {
  const items = await extractPdfTextItems(file);
  return detectPdfDocumentTypeFromItems(items);
}

function detectTypeBCalendarContext(items: PdfTextItem[]): CalendarImportContext {
  const year = deduceYearFromItems(items);
  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const monthShortNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

function getDayColumnsForPageTypeB(items: PdfTextItem[], page: number) {
  return items
    .filter((item) => item.page === page)
    .map((item) => {
      const match = item.text.match(/^[LMXJVSD](\d{1,2})$/);
      if (!match) {
        return null;
      }

      const day = Number.parseInt(match[1], 10);
      return { day, x: item.x };
    })
    .filter((item): item is { day: number; x: number } => Boolean(item))
    .sort((left, right) => left.x - right.x);
}

function findEmployeeRowItemsTypeB(
  items: PdfTextItem[],
  selector: EmployeeSelector,
): { rowItems: PdfTextItem[]; page: number; category: string } {
  const targetId = normalizeEmployeeId(selector.employeeId);

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((left, right) => left - right);
  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));

    // In TYPE_B, the ID is often a plain number at the start of the row.
    const idIndex = pageItems.findIndex((item) => normalizeEmployeeId(item.text) === targetId && item.x < 100);

    if (idIndex >= 0) {
      const marker = pageItems[idIndex];

      // Find category before the employee row
      let category = 'Regular';
      for (let i = idIndex - 1; i >= 0; i -= 1) {
        const text = normalizeText(pageItems[i].text);
        if (text.includes('jtu')) {
          category = 'Jefe de Turno';
          break;
        }
        if (text.includes('supervisor') || text.includes('sup aea')) {
          category = 'Regular';
          break;
        }
      }

      // Find next employee or end of data area to bound the row height strictly
      let nextMarkerY = -1000; // Bottom of page
      for (let i = idIndex + 1; i < pageItems.length; i += 1) {
        const item = pageItems[i];
        // Next ID usually starts at x < 100 and is a number
        if (item.x < 100 && /^\d{4,6}$/.test(normalizeEmployeeId(item.text))) {
          nextMarkerY = item.y + 2;
          break;
        }
        // If we see a header, it's also a boundary
        const text = normalizeText(item.text);
        if (text.includes('supervisor') || text.includes('sup aea')) {
          nextMarkerY = item.y + 2;
          break;
        }
      }

      const rowItems = pageItems.filter(
        (item) => item.x > 150 && item.y <= marker.y + 12 && item.y >= nextMarkerY,
      );

      if (rowItems.length > 0) {
        return { rowItems, page, category };
      }
    }
  }

  throw new Error(`No se encontró la fila de ${selector.employeeName} (${selector.employeeId}) en el PDF.`);
}

function parseTypeBPdfItems(
  allItems: PdfTextItem[],
  context: CalendarImportContext,
  selector: EmployeeSelector,
): ParsedCalendarShift[] {
  const { rowItems, page } = findEmployeeRowItemsTypeB(allItems, selector);
  const columnGroups = clusterByX(rowItems);
  const dayColumns = getDayColumnsForPageTypeB(allItems, page);

  if (dayColumns.length === 0) {
    throw new Error('No se pudieron detectar los encabezados de días en la página del PDF (Tipo B).');
  }

  const mappedColumns = mapColumnGroupsToDays(columnGroups, dayColumns);
  const shifts: ParsedCalendarShift[] = [];

  for (const { day, items } of mappedColumns) {
    const date = `${context.year}-${String(context.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const tokens = items
      .sort((left, right) => right.y - left.y || left.x - right.x)
      .map((item) => item.text.trim())
      .filter(Boolean);

    shifts.push(...buildShiftEntriesForDay(date, tokens));
  }

  return shifts;
}

function findEmployeeRowItemsTypeA(
  items: PdfTextItem[],
  selector: EmployeeSelector,
): { rowItems: PdfTextItem[]; page: number } {
  const targetId = normalizeEmployeeId(selector.employeeId);
  const normalizedName = normalizeText(selector.employeeName);
  const nameTokens = normalizedName.split(' ').filter((token) => token.length >= 3);
  const hasTargetId = targetId.length > 0;

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((left, right) => left - right);
  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
    const idIndex = pageItems.findIndex((item) => normalizeEmployeeId(item.text) === targetId && item.x < 80);
    const nameIndex = pageItems.findIndex((item) => {
      if (item.x >= 80 || !isEmployeeNameLabel(item.text)) {
        return false;
      }
      const normalized = normalizeText(item.text);
      const words = normalized.split(' ');
      const matchingTokens = nameTokens.filter((token) =>
        words.some((word) => word.startsWith(token) || token.startsWith(word)),
      );
      return matchingTokens.length >= Math.min(2, nameTokens.length);
    });

    if (hasTargetId && idIndex < 0) {
      continue;
    }

    const markerIndexes = [nameIndex, idIndex].filter((index) => index >= 0);
    if (markerIndexes.length === 0) {
      continue;
    }

    const currentMarkers = markerIndexes.map((index) => pageItems[index]);
    const rowFloorY = Math.min(...currentMarkers.map((item) => item.y)) - 0.5;

    let rowCeilingY = Number.POSITIVE_INFINITY;
    for (let index = Math.min(...markerIndexes) - 1; index >= 0; index -= 1) {
      const candidate = pageItems[index];
      if (candidate.x < 80 && looksLikeEmployeeLabel(candidate.text)) {
        rowCeilingY = candidate.y - 0.5;
        break;
      }
    }

    const rowItems = pageItems.filter(
      (item) => item.x > 80 && item.y < rowCeilingY && item.y >= rowFloorY,
    );

    if (rowItems.length > 0) {
      return { rowItems, page };
    }
  }

  throw new Error(`No se encontro la fila de ${selector.employeeName} (${selector.employeeId}) en el PDF.`);
}

function getDayColumnsForPageTypeA(items: PdfTextItem[], page: number, context: CalendarImportContext) {
  return items
    .filter((item) => item.page === page)
    .map((item) => {
      const match = item.text.match(/^(\d{2})\/(\d{2})$/);
      if (!match) {
        return null;
      }

      const day = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10) - 1;
      if (month !== context.month) {
        return null;
      }

      return { day, x: item.x };
    })
    .filter((item): item is { day: number; x: number } => Boolean(item))
    .sort((left, right) => left.x - right.x);
}

function detectTypeACalendarContext(items: PdfTextItem[]): CalendarImportContext {
  const header = items
    .map((item) => {
      const match = item.text.match(/^(\d{2})\/(\d{2})$/);
      if (!match) {
        return null;
      }

      return {
        day: Number.parseInt(match[1], 10),
        month: Number.parseInt(match[2], 10) - 1,
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

function mapColumnGroupsToDays(
  columnGroups: PdfTextItem[][],
  dayColumns: Array<{ day: number; x: number }>,
): Array<{ day: number; items: PdfTextItem[] }> {
  const usedDays = new Set<number>();
  const mapped = columnGroups
    .map((group) => {
      const centerX = group.reduce((sum, item) => sum + item.x, 0) / group.length;
      let bestMatch: { day: number; x: number } | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const dayColumn of dayColumns) {
        if (usedDays.has(dayColumn.day)) {
          continue;
        }

        const distance = Math.abs(dayColumn.x - centerX);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = dayColumn;
        }
      }

      if (!bestMatch || bestDistance > 12) {
        return null;
      }

      usedDays.add(bestMatch.day);
      return {
        day: bestMatch.day,
        items: group,
      };
    })
    .filter((item): item is { day: number; items: PdfTextItem[] } => Boolean(item))
    .sort((left, right) => left.day - right.day);

  return mapped;
}

function buildShiftEntriesForDay(date: string, tokens: string[]): ParsedCalendarShift[] {
  const meaningful = tokens.flatMap((token) => expandShiftTokens(token)).map((token) => token.trim()).filter(Boolean);
  if (meaningful.length === 0) {
    return [];
  }

  // Strictly map AJ and DL to Libre with NO times
  if (meaningful.every(isOffToken)) {
    return [{
      date,
      startTime: '',
      endTime: '',
      origin: 'PDF',
      isValid: true,
      confidence: 1.0,
      rawText: meaningful.join(' '),
      shiftType: 'Libre',
      notes: null,
      color: 'red',
    }];
  }

  const shifts: ParsedCalendarShift[] = [];
  const segments: string[][] = [];
  let currentSegment: string[] = [];

  for (const token of meaningful) {
    if (token === '--') {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }
    currentSegment.push(token);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const effectiveSegments = segments.length > 0 ? segments : [meaningful];
  for (const segment of effectiveSegments) {
    if (segment.every(isOffToken)) {
      shifts.push({
        date,
        startTime: '',
        endTime: '',
        origin: 'PDF',
        isValid: true,
        confidence: 1.0,
        rawText: segment.join(' '),
        shiftType: 'Libre',
        notes: null,
        color: 'red',
      });
      continue;
    }

    const times = segment.filter(isTimeToken).map(normalizeTimeToken);
    for (let index = 0; index < times.length; index += 2) {
      const startTime = times[index] ?? '??:??';
      const endTime = times[index + 1] ?? '??:??';
      shifts.push({
        date,
        startTime,
        endTime,
        origin: 'PDF',
        isValid: startTime !== '??:??' && endTime !== '??:??',
        confidence: 0.9,
        rawText: segment.join(' '),
        shiftType: 'Regular', // Always Regular for work shifts
        notes: null,
        color: 'blue',
      });
    }
  }

  return shifts;
}

function parseTypeAPdfItems(
  allItems: PdfTextItem[],
  context: CalendarImportContext,
  selector: EmployeeSelector,
): ParsedCalendarShift[] {
  const { rowItems, page } = findEmployeeRowItemsTypeA(allItems, selector);
  const columnGroups = clusterByX(rowItems);

  if (columnGroups.length === 0) {
    throw new Error('No se pudieron detectar columnas de dias en el PDF.');
  }

  const dayColumns = getDayColumnsForPageTypeA(allItems, page, context);
  if (dayColumns.length === 0) {
    throw new Error('No se pudieron detectar los encabezados de dias en la pagina del PDF.');
  }

  const mappedColumns = mapColumnGroupsToDays(columnGroups, dayColumns);
  if (mappedColumns.length === 0) {
    throw new Error('No se pudieron alinear las columnas de turnos con los dias del PDF.');
  }

  const shifts: ParsedCalendarShift[] = [];
  for (const { day, items } of mappedColumns) {
    if (day < 1 || day > getDaysInMonth(context.year, context.month)) {
      continue;
    }

    const date = `${context.year}-${String(context.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const tokens = items
      .sort((left, right) => right.y - left.y || left.x - right.x)
      .map((item) => item.text.trim())
      .filter(Boolean);

    shifts.push(...buildShiftEntriesForDay(date, tokens));
  }

  return shifts
    .filter((shift) => Boolean(shift.shiftType) || shift.startTime !== '??:??' || shift.endTime !== '??:??')
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }
      return left.startTime.localeCompare(right.startTime);
    });
}

export async function detectPdfCalendarContext(file: File): Promise<CalendarImportContext> {
  const items = await extractPdfTextItems(file);
  const documentType = detectPdfDocumentTypeFromItems(items);

  switch (documentType) {
    case 'TYPE_A':
      return detectTypeACalendarContext(items);
    case 'TYPE_B':
      return detectTypeBCalendarContext(items);
    default:
      return {
        month: new Date().getMonth(),
        year: deduceYearFromItems(items),
      };
  }
}

export async function parseEmployeeShiftsFromPdf(
  file: File,
  context: CalendarImportContext,
  selector: EmployeeSelector,
): Promise<ParsedCalendarShift[]> {
  const allItems = await extractPdfTextItems(file);
  const documentType = detectPdfDocumentTypeFromItems(allItems);

  switch (documentType) {
    case 'TYPE_A':
      return parseTypeAPdfItems(allItems, context, selector);
    case 'TYPE_B':
      return parseTypeBPdfItems(allItems, context, selector);
    default:
      throw new Error('No se ha podido identificar el formato del PDF para procesarlo correctamente.');
  }
}


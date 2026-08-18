/**
 * Employee row detection.
 *
 * A single generic algorithm parameterized by RowWindowRules; each ingestion
 * profile declares the concrete thresholds and tokens (see
 * ingestion/profiles/). The window is always a vertical band
 * [floorY, ceilingY) (or inclusive ceiling, per profile) over the items to
 * the right of the marker column.
 */
import { looksLikeEmployeeLabel, isEmployeeNameLabel } from './tokens';
import { normalizeEmployeeId, normalizeText } from './normalize';
import { PdfTextItem, sortPdfItemsForReading } from './text-items';

export interface EmployeeSelector {
  employeeName: string;
  /**
   * Candidate employee identifiers (from UserProfile.employeeIdentifiers),
   * in priority order. The first identifier matching a row marker wins.
   */
  employeeIdentifiers: string[];
}

export interface RowBoundaryScan {
  /** Shape of the next row's id (tested against the digit-only text). */
  idPattern?: RegExp;
  /** Normalized-text tokens that also bound the row (e.g. section headers). */
  tokens: string[];
  /** Added to the boundary item's y to obtain the floor. */
  padY: number;
  /** Floor used when no boundary is found (page bottom). */
  fallback: number;
}

export interface RowWindowRules {
  /** Marker column bound: id/name markers sit at x < markerMaxX. */
  markerMaxX: number;
  /** Whether the employee name may locate the row when no id matches. */
  nameMatching: boolean;
  /** Row data items sit at x > dataMinX. */
  dataMinX: number;
  /** Upper bound of the row band. */
  ceiling:
    | { mode: 'previous-employee-label' }
    | { mode: 'offset'; offset: number; inclusive: boolean };
  /** Lower bound of the row band. */
  floor:
    | { mode: 'offset'; offset: number }
    | { mode: 'next-row-boundary'; scan: RowBoundaryScan };
  /**
   * Section labels scanned upward from the row marker; the first match wins.
   * Purely informational (the parsed shifts do not consume the category).
   */
  categoryHints: Array<{ tokens: string[]; category: string }>;
  defaultCategory: string;
}

export interface EmployeeRow {
  rowItems: PdfTextItem[];
  page: number;
  category: string;
}

export function findNameMarkerIndex(pageItems: PdfTextItem[], nameTokens: string[], markerMaxX: number): number {
  return pageItems.findIndex((item) => {
    if (item.x >= markerMaxX || !isEmployeeNameLabel(item.text)) {
      return false;
    }
    return matchesNameTokens(item.text, nameTokens);
  });
}

/** True when the item text prefix-matches at least min(2, tokens) name tokens. */
export function matchesNameTokens(text: string, nameTokens: string[]): boolean {
  const normalized = normalizeText(text);
  const words = normalized.split(' ');
  const matchingTokens = nameTokens.filter((token) =>
    words.some((word) => word.startsWith(token) || token.startsWith(word)),
  );
  return matchingTokens.length >= Math.min(2, nameTokens.length);
}

/**
 * Counts distinct employee-name label items that match the selector name
 * across all pages (same matching rule as findNameMarkerIndex). Used to
 * detect AMBIGUOUS_EMPLOYEE before any row is selected: more than one
 * candidate with no disambiguating id means we must not auto-pick.
 */
export function countEmployeeNameCandidates(
  items: PdfTextItem[],
  employeeName: string,
  markerMaxX: number,
): number {
  const nameTokens = normalizeText(employeeName).split(' ').filter((token) => token.length >= 3);
  if (nameTokens.length === 0) {
    return 0;
  }
  const pages = Array.from(new Set(items.map((item) => item.page)));
  let candidates = 0;
  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
    for (const item of pageItems) {
      if (item.x < markerMaxX && isEmployeeNameLabel(item.text) && matchesNameTokens(item.text, nameTokens)) {
        candidates += 1;
      }
    }
  }
  return candidates;
}

function resolveCeiling(
  pageItems: PdfTextItem[],
  markers: PdfTextItem[],
  firstMarkerIndex: number,
  rules: RowWindowRules,
): { ceilingY: number; inclusive: boolean } {
  if (rules.ceiling.mode === 'offset') {
    return { ceilingY: markers[0].y + rules.ceiling.offset, inclusive: rules.ceiling.inclusive };
  }

  for (let index = firstMarkerIndex - 1; index >= 0; index -= 1) {
    const candidate = pageItems[index];
    if (candidate.x < rules.markerMaxX && looksLikeEmployeeLabel(candidate.text)) {
      return { ceilingY: candidate.y - 0.5, inclusive: false };
    }
  }

  return { ceilingY: Number.POSITIVE_INFINITY, inclusive: false };
}

function resolveFloor(
  pageItems: PdfTextItem[],
  markers: PdfTextItem[],
  lastMarkerIndex: number,
  rules: RowWindowRules,
): number {
  if (rules.floor.mode === 'offset') {
    return Math.min(...markers.map((item) => item.y)) + rules.floor.offset;
  }

  const { scan } = rules.floor;
  for (let index = lastMarkerIndex + 1; index < pageItems.length; index += 1) {
    const item = pageItems[index];
    if (item.x < rules.markerMaxX && scan.idPattern && scan.idPattern.test(normalizeEmployeeId(item.text))) {
      return item.y + scan.padY;
    }
    const text = normalizeText(item.text);
    if (scan.tokens.some((token) => text.includes(token))) {
      return item.y + scan.padY;
    }
  }

  return scan.fallback;
}

function resolveCategory(pageItems: PdfTextItem[], firstMarkerIndex: number, rules: RowWindowRules): string {
  for (let index = firstMarkerIndex - 1; index >= 0; index -= 1) {
    const text = normalizeText(pageItems[index].text);
    for (const hint of rules.categoryHints) {
      if (hint.tokens.some((token) => text.includes(token))) {
        return hint.category;
      }
    }
  }

  return rules.defaultCategory;
}

/**
 * Locates the employee's row band on the first page where a marker matches.
 * Returns null when the employee is not found in the document.
 */
export function findEmployeeRowItems(
  items: PdfTextItem[],
  selector: EmployeeSelector,
  rules: RowWindowRules,
): EmployeeRow | null {
  const targetIds = selector.employeeIdentifiers
    .map((value) => normalizeEmployeeId(value))
    .filter((value) => value.length > 0);
  const normalizedName = normalizeText(selector.employeeName);
  const nameTokens = normalizedName.split(' ').filter((token) => token.length >= 3);
  const hasTargetId = targetIds.length > 0;

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((left, right) => left - right);
  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
    const idIndex = pageItems.findIndex(
      (item) => hasTargetId && targetIds.includes(normalizeEmployeeId(item.text)) && item.x < rules.markerMaxX,
    );
    const nameIndex = rules.nameMatching
      ? findNameMarkerIndex(pageItems, nameTokens, rules.markerMaxX)
      : -1;

    if (hasTargetId && idIndex < 0) {
      continue;
    }

    const markerIndexes = [nameIndex, idIndex].filter((index) => index >= 0);
    if (markerIndexes.length === 0) {
      continue;
    }

    const markers = markerIndexes.map((index) => pageItems[index]);
    const { ceilingY, inclusive } = resolveCeiling(pageItems, markers, Math.min(...markerIndexes), rules);
    const floorY = resolveFloor(pageItems, markers, Math.max(...markerIndexes), rules);
    const category = resolveCategory(pageItems, Math.min(...markerIndexes), rules);

    const rowItems = pageItems.filter(
      (item) =>
        item.x > rules.dataMinX &&
        (inclusive ? item.y <= ceilingY : item.y < ceilingY) &&
        item.y >= floorY,
    );

    if (rowItems.length > 0) {
      return { rowItems, page, category };
    }
  }

  return null;
}

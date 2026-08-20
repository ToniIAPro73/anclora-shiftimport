/**
 * Employee row detection.
 *
 * A single generic algorithm parameterized by RowWindowRules; each ingestion
 * profile declares the concrete thresholds and tokens (see
 * ingestion/profiles/). The window is always a vertical band
 * [floorY, ceilingY) (or inclusive ceiling, per profile) over the items to
 * the right of the marker column.
 */
import { isEmployeeIdToken, isEmployeeNameLabel, looksLikeEmployeeLabel } from './tokens';
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

/** Bare numeric employee ids (nómina-style, 4–6 digits) — day numbers are 1–2. */
export const isBareEmployeeId = (text: string): boolean => /^\d{4,6}$/.test(text.trim());

/**
 * Name-label items that may locate an employee row, under ONE rule shared by
 * direct matching, candidate counting and the assistant's candidate listing
 * (findEmployeeRowCandidates): a name belongs to a marker row either inside
 * the marker column, or — dense real layouts nudge the name a few points
 * right of markerMaxX — in the extended zone up to dataMinX when it shares
 * the line (tolerance 1, same as the reading-order clustering) with an id
 * marker in the marker column.
 */
function nameMarkerLabelItems(pageItems: PdfTextItem[], rules: RowWindowRules): PdfTextItem[] {
  const anchorYs = pageItems
    .filter(
      (item) => item.x < rules.markerMaxX && (isEmployeeIdToken(item.text) || isBareEmployeeId(item.text)),
    )
    .map((item) => item.y);
  return pageItems.filter((item) => {
    if (!isEmployeeNameLabel(item.text)) {
      return false;
    }
    if (item.x < rules.markerMaxX) {
      return true;
    }
    return item.x < rules.dataMinX && anchorYs.some((anchorY) => Math.abs(anchorY - item.y) <= 1);
  });
}

/** Clusters label items (reading order) into visual line bands, tolerance 1. */
function clusterLineBands(labelItems: PdfTextItem[]): PdfTextItem[][] {
  const bands: PdfTextItem[][] = [];
  for (const item of labelItems) {
    const last = bands[bands.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= 1) {
      last.push(item);
    } else {
      bands.push([item]);
    }
  }
  return bands;
}

/** Display text of a line band: items left to right, space-joined. */
export function nameMarkerBandText(band: PdfTextItem[]): string {
  return [...band]
    .sort((left, right) => left.x - right.x)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Line bands whose joined label matches the typed name tokens. Matching runs
 * on the WHOLE band text, not per item: PDF text extraction may split one
 * printed name across several items, and no single item then holds enough
 * tokens to match on its own.
 */
export function findNameMarkerBands(
  pageItems: PdfTextItem[],
  nameTokens: string[],
  rules: RowWindowRules,
): PdfTextItem[][] {
  if (nameTokens.length === 0) {
    return [];
  }
  return clusterLineBands(nameMarkerLabelItems(pageItems, rules))
    .filter((band) => matchesNameTokens(nameMarkerBandText(band), nameTokens));
}

export function findNameMarkerIndex(pageItems: PdfTextItem[], nameTokens: string[], rules: RowWindowRules): number {
  const band = findNameMarkerBands(pageItems, nameTokens, rules)[0];
  return band ? pageItems.indexOf(band[0]) : -1;
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
 * Counts distinct employee-name line bands that match the selector name
 * across all pages (same matching rule as findNameMarkerIndex — one visual
 * line counts once, even when extraction split the name across items). Used
 * to detect AMBIGUOUS_EMPLOYEE before any row is selected: more than one
 * candidate with no disambiguating id means we must not auto-pick.
 */
export function countEmployeeNameCandidates(
  items: PdfTextItem[],
  employeeName: string,
  rules: RowWindowRules,
): number {
  const nameTokens = normalizeText(employeeName).split(' ').filter((token) => token.length >= 3);
  if (nameTokens.length === 0) {
    return 0;
  }
  const pages = Array.from(new Set(items.map((item) => item.page)));
  let candidates = 0;
  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
    candidates += findNameMarkerBands(pageItems, nameTokens, rules).length;
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
      // A label sharing the marker's own line is the employee's own name
      // (e.g. id-only selectors: the name is not among the markers), never
      // the previous employee's boundary.
      if (Math.abs(candidate.y - markers[0].y) <= 1) {
        continue;
      }
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
 * True when any of the given (digit-normalized) ids appears as a marker item
 * in the document. An id that appears nowhere cannot gate the row search —
 * callers fall back to the name path in that case.
 */
export function idResolvesInDocument(
  items: PdfTextItem[],
  targetIds: string[],
  markerMaxX: number,
): boolean {
  return items.some(
    (item) => targetIds.includes(normalizeEmployeeId(item.text)) && item.x < markerMaxX,
  );
}

/**
 * Identity cross-check between the typed name and the typed id.
 *
 * Returns true only when BOTH resolve and they point to different employees:
 * the id marker is found in the document, the typed name matches at least one
 * printed row label, and the name label that owns the id marker does not
 * match the typed name.
 *
 * "Owns" means: falls inside the SAME row band findEmployeeRowItems would
 * compute for that id marker alone (reusing resolveCeiling/resolveFloor).
 * This is layout-direction-agnostic on purpose — some profiles print the
 * name above the id (TYPE_A), others print it below (TYPE_B's id-then-name
 * marker column) — hardcoding "above" or "below" made this function correct
 * for one direction and silently wrong for the other (every non-first
 * employee on a TYPE_B page falsely mismatched, because their own name,
 * printed below their id, was mistaken for a boundary and skipped in favor
 * of the row above).
 *
 * An unresolvable name never blocks an id-backed match (false), and an id
 * that appears nowhere never blocks a name-backed match (false) — those are
 * the legitimate id-only / name-only resolutions.
 */
export function detectIdentityMismatch(
  items: PdfTextItem[],
  selector: EmployeeSelector,
  rules: RowWindowRules,
): boolean {
  const targetIds = selector.employeeIdentifiers
    .map((value) => normalizeEmployeeId(value))
    .filter((value) => value.length > 0);
  if (targetIds.length === 0) {
    return false;
  }
  const nameTokens = normalizeText(selector.employeeName)
    .split(' ')
    .filter((token) => token.length >= 3);
  if (nameTokens.length === 0) {
    return false;
  }

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((left, right) => left - right);
  const sortedPages = pages.map((page) => sortPdfItemsForReading(items.filter((item) => item.page === page)));

  const nameResolves = sortedPages.some(
    (pageItems) => findNameMarkerBands(pageItems, nameTokens, rules).length > 0,
  );
  if (!nameResolves) {
    return false;
  }

  for (const pageItems of sortedPages) {
    const idIndex = pageItems.findIndex(
      (item) => targetIds.includes(normalizeEmployeeId(item.text)) && item.x < rules.markerMaxX,
    );
    if (idIndex < 0) {
      continue;
    }
    const idItem = pageItems[idIndex];

    const { ceilingY, inclusive } = resolveCeiling(pageItems, [idItem], idIndex, rules);
    const floorY = resolveFloor(pageItems, [idItem], idIndex, rules);

    // Closest band wins, not first-in-range: the ceiling/floor band is sized
    // generously for row DATA (which lives past dataMinX and never sees a
    // neighbour's name), but a name label in the marker column can fall
    // inside that same slack — e.g. the previous employee's name a few
    // points above this id. Proximity to the id's own line disambiguates.
    const bands = clusterLineBands(nameMarkerLabelItems(pageItems, rules));
    let owner: PdfTextItem[] | null = null;
    let ownerDistance = Infinity;
    for (const band of bands) {
      const y = band[0].y;
      const inBand = (inclusive ? y <= ceilingY : y < ceilingY) && y >= floorY;
      if (!inBand) {
        continue;
      }
      const distance = Math.abs(y - idItem.y);
      if (distance < ownerDistance) {
        owner = band;
        ownerDistance = distance;
      }
    }

    // Without a name label owning the id there is nothing to cross-check
    // against; the id stands.
    return owner !== null && !matchesNameTokens(nameMarkerBandText(owner), nameTokens);
  }

  return false;
}

/** Locates the employee's row band on ONE page, or null when no marker
 * matches there. Shared by findEmployeeRowItems (first match wins) and
 * findAllEmployeeRowItems (every match is kept — a document where one
 * employee's data spans several pages, e.g. one page per fortnight). */
function locateRowOnPage(
  pageItems: PdfTextItem[],
  page: number,
  idFound: boolean,
  targetIds: string[],
  nameTokens: string[],
  rules: RowWindowRules,
): EmployeeRow | null {
  const idIndex = pageItems.findIndex(
    (item) => idFound && targetIds.includes(normalizeEmployeeId(item.text)) && item.x < rules.markerMaxX,
  );
  const nameIndex = rules.nameMatching
    ? findNameMarkerIndex(pageItems, nameTokens, rules)
    : -1;

  if (idFound && idIndex < 0) {
    return null;
  }

  const markerIndexes = [nameIndex, idIndex].filter((index) => index >= 0);
  if (markerIndexes.length === 0) {
    return null;
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

  return rowItems.length > 0 ? { rowItems, page, category } : null;
}

/**
 * Locates the employee's row band on the first page where a marker matches.
 * Returns null when the employee is not found in the document.
 *
 * A typed id that appears nowhere in the document does not gate the search:
 * the name path then applies (id-only gating would silently turn a valid
 * name match into UNKNOWN_EMPLOYEE). When the id IS present and the typed
 * name points to a different employee, callers must run
 * detectIdentityMismatch first — this function never arbitrates conflicts.
 */
export function findEmployeeRowItems(
  items: PdfTextItem[],
  selector: EmployeeSelector,
  rules: RowWindowRules,
): EmployeeRow | null {
  const targetIds = selector.employeeIdentifiers
    .map((value) => normalizeEmployeeId(value))
    .filter((value) => value.length > 0);
  const nameTokens = normalizeText(selector.employeeName).split(' ').filter((token) => token.length >= 3);
  const idFound = targetIds.length > 0 && idResolvesInDocument(items, targetIds, rules.markerMaxX);

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((left, right) => left - right);
  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
    const row = locateRowOnPage(pageItems, page, idFound, targetIds, nameTokens, rules);
    if (row) {
      return row;
    }
  }

  return null;
}

/**
 * Same matching rule as findEmployeeRowItems, but collects EVERY matching
 * page instead of stopping at the first — for documents where one employee's
 * data is split across several pages (e.g. one page per fortnight in a
 * two-quincena monthly layout). Returns an empty array when not found, same
 * meaning as findEmployeeRowItems returning null.
 */
export function findAllEmployeeRowItems(
  items: PdfTextItem[],
  selector: EmployeeSelector,
  rules: RowWindowRules,
): EmployeeRow[] {
  const targetIds = selector.employeeIdentifiers
    .map((value) => normalizeEmployeeId(value))
    .filter((value) => value.length > 0);
  const nameTokens = normalizeText(selector.employeeName).split(' ').filter((token) => token.length >= 3);
  const idFound = targetIds.length > 0 && idResolvesInDocument(items, targetIds, rules.markerMaxX);

  const pages = Array.from(new Set(items.map((item) => item.page))).sort((left, right) => left - right);
  const rows: EmployeeRow[] = [];
  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
    const row = locateRowOnPage(pageItems, page, idFound, targetIds, nameTokens, rules);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

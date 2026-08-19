/**
 * Format-profile assistant — LOGIC only (Phase 1A, wave 2), no UI.
 *
 * When analyzeShiftsFromItems cannot import confidently, this module turns
 * the ItemAnalysis into concrete questions (which row is you, what does
 * token X mean), and the answers back into a persisted UserFormatProfile
 * plus a one-shot re-parse for the selected row.
 *
 * PII boundary (hard rule):
 * - EmployeeRowCandidate.label is the row label AS PRINTED — display-only,
 *   it must NEVER be persisted. buildProfileFromAnswers stores only the
 *   manual-row strategy + rowIndex; selectorFromAnswers' label-keyed
 *   selector is session-scoped and never written to storage.
 * - tokenAliases/offTokens contain document TOKENS the user classified,
 *   never person names or employee ids.
 */
import { FORMAT_PROFILE_VERSION, UserFormatProfile } from '../lib/format-profiles';
import { CalendarImportContext, ParsedCalendarShift, PdfDocumentType } from '../lib/import-types';
import { mergeShiftTypeOverrides, ShiftTypeOverrides } from '../lib/shift-types';
import { getDaysInMonth } from '../lib/week';
import { mapColumnGroupsToDays } from './core/clustering';
import { EmployeeRow, EmployeeSelector } from './core/row-detection';
import { normalizeEmployeeId, normalizeText } from './core/normalize';
import { buildCodeProfile, codeOverridesFromLearning, ShiftCodeMapping } from './core/shift-code-profile';
import { isEmployeeIdToken, isEmployeeNameLabel, looksLikeEmployeeLabel } from './core/tokens';
import { PdfTextItem, sortPdfItemsForReading } from './core/text-items';
import { getIngestionProfile } from './profiles';
import { IngestionProfile } from './profiles/types';
import {
  buildShiftsFromEmployeeRow,
  buildShiftsFromMappedColumns,
  mergeCodeOverrides,
  resolveColumnDayMapping,
} from './parsers/parse-items';
import { DayMappingDiagnostic, ItemAnalysis } from './analysis';

export type AssistantQuestion =
  | { kind: 'row-selection'; candidates: EmployeeRowCandidate[] }
  | { kind: 'day-mapping'; columnIndex: number; sampleTokens: string[]; proposedDay: number }
  | { kind: 'token-meaning'; token: string }
  | { kind: 'shift-code'; code: string };

export interface EmployeeRowCandidate {
  /** row label text as printed — UI display only, NEVER persisted */
  label: string;
  page: number;
  y: number;
  rowIndex: number;
}

export interface AssistantAnswers {
  selectedRow?: EmployeeRowCandidate;
  /**
   * Day-mapping answer: confirmed accepts the proposed day; on rejection
   * correctedDay carries the user-entered day of month for that column.
   */
  dayMapping?: { confirmed: boolean; correctedDay?: number };
  tokenMeanings: Record<string, {
    kind: 'work' | 'rest';
    shiftTypeId?: string;
    startTime?: string;
    endTime?: string;
  }>;
}

const DEFAULT_MAX_ROWS = 8;
const MAX_TOKEN_QUESTIONS = 6;

/**
 * A row band whose line-mates are mostly day numbers/dates is a structural
 * column header (e.g. the "Nómina"/"Empleado" title row above the grid),
 * never an employee. Structural test only — no per-company vocabulary.
 */
const DAY_HEADER_LIKE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]?\d{1,2}([/-]\d{1,2}([/-]\d{2,4})?)?$/;
const MIN_DAY_HEADER_SIBLINGS = 3;

/** Bare numeric employee ids (nómina-style, 4–6 digits) — day numbers are 1–2. */
const BARE_ID_LIKE = /^\d{4,6}$/;

const isStructuralHeaderBand = (band: PdfTextItem[], pageItems: PdfTextItem[], markerMaxX: number): boolean => {
  const siblings = pageItems.filter(
    (item) => item.x >= markerMaxX && Math.abs(item.y - band[0].y) <= 1 && !band.includes(item),
  );
  return siblings.filter((item) => DAY_HEADER_LIKE.test(item.text.trim())).length >= MIN_DAY_HEADER_SIBLINGS;
};

/** User-facing profile label per document type — never a person name. */
export const DOCUMENT_TYPE_LABELS: Record<PdfDocumentType, string> = {
  TYPE_A: 'Cuadrante mensual',
  TYPE_B: 'Cuadrante semanal',
  TYPE_TAB: 'Cuadrante tabular',
  TYPE_LEGEND: 'Cuadrante con leyenda de códigos',
  TYPE_MULTI: 'Cuadrante multi-mes',
  UNKNOWN: 'Formato personalizado',
};

const generateProfileId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Lists the document's employee rows: marker-label items left of the
 * profile's markerMaxX, clustered per page into visual y-bands (tolerance 1,
 * same as the reading-order sort). A band is only selectable when it
 * contains an actual name label — a bare id without a name gives the user
 * nothing to recognize. rowIndex is the reading-order index across pages;
 * it is the ONLY identity the persisted profile may keep.
 */
export function findEmployeeRowCandidates(
  items: PdfTextItem[],
  profile: IngestionProfile,
  opts?: { maxRows?: number },
): EmployeeRowCandidate[] {
  const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;
  const candidates: EmployeeRowCandidate[] = [];
  const pages = Array.from(new Set(items.map((item) => item.page))).sort((a, b) => a - b);

  for (const page of pages) {
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
    // Anchor rows: a name label sitting just outside the marker column still
    // belongs to the marker row when it shares the line with an id marker
    // (dense real layouts nudge the name a few points right of markerMaxX).
    const anchorIdYs = pageItems
      .filter(
        (item) =>
          item.x < profile.rowWindow.markerMaxX
          && (isEmployeeIdToken(item.text.trim()) || BARE_ID_LIKE.test(item.text.trim())),
      )
      .map((item) => item.y);
    const labelItems = pageItems.filter(
      (item) =>
        (item.x < profile.rowWindow.markerMaxX && looksLikeEmployeeLabel(item.text))
        || (item.x >= profile.rowWindow.markerMaxX
          && item.x < profile.rowWindow.dataMinX
          && isEmployeeNameLabel(item.text)
          && anchorIdYs.some((anchorY) => Math.abs(anchorY - item.y) <= 1)),
    );

    const bands: PdfTextItem[][] = [];
    for (const item of labelItems) {
      const last = bands[bands.length - 1];
      if (last && Math.abs(last[0].y - item.y) <= 1) {
        last.push(item);
      } else {
        bands.push([item]);
      }
    }

    for (const band of bands) {
      if (!band.some((item) => isEmployeeNameLabel(item.text))) {
        continue;
      }
      if (isStructuralHeaderBand(band, pageItems, profile.rowWindow.markerMaxX)) {
        continue;
      }
      const label = [...band]
        .sort((left, right) => left.x - right.x)
        .map((item) => item.text.trim())
        .filter(Boolean)
        .join(' ');
      candidates.push({ label, page, y: band[0].y, rowIndex: candidates.length });
      if (candidates.length >= maxRows) {
        return candidates;
      }
    }
  }

  return candidates;
}

/**
 * Builds the single day-mapping question for a diagnostic: targets the first
 * unmatched column group and proposes the nearest unmapped day header (by x
 * distance), falling back to day 1 when no unmapped header exists. Returns
 * null when every column group was aligned — a fully resolved mapping never
 * produces a question.
 */
export function dayMappingQuestionFromDiagnostic(
  dayMapping: DayMappingDiagnostic,
): Extract<AssistantQuestion, { kind: 'day-mapping' }> | null {
  const target = dayMapping.unmatchedGroups[0];
  if (!target) {
    return null;
  }

  let proposedDay = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const header of dayMapping.unmappedHeaders) {
    const distance = Math.abs(header.x - target.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      proposedDay = header.day;
    }
  }

  return {
    kind: 'day-mapping',
    columnIndex: target.columnIndex,
    sampleTokens: target.sampleTokens,
    proposedDay,
  };
}

/**
 * Turns an ItemAnalysis into the questions the UI should ask.
 *
 * - row-selection: only when the employee match is 'none' or 'multiple' and
 *   the document has selectable rows (capped at opts.maxRows, default 8).
 * - day-mapping: at most one, only when the employee row was found AND the
 *   column→day alignment left a column group unmatched (the minimum useful
 *   question; see dayMappingQuestionFromDiagnostic).
 * - token-meaning / shift-code: one per unknown row token (cap 6). Short
 *   code-like tokens (1–5 letters/digits, e.g. N, TN, G12, X, M1) are asked
 *   as shift-code ("¿Qué turno representa M?") so the answer can carry a
 *   type + times and re-parse the cell; longer phrases are asked as
 *   token-meaning ("¿Qué significa X?").
 */
export function generateAssistantQuestions(
  items: PdfTextItem[],
  context: CalendarImportContext,
  analysis: ItemAnalysis,
  opts?: { maxRows?: number },
): AssistantQuestion[] {
  void context; // day-mapping detection runs off analysis.dayMapping
  const questions: AssistantQuestion[] = [];
  const profile = getIngestionProfile(analysis.structure.documentType);

  if ((analysis.employeeMatch === 'none' || analysis.employeeMatch === 'multiple') && profile) {
    const candidates = findEmployeeRowCandidates(items, profile, { maxRows: opts?.maxRows });
    if (candidates.length > 0) {
      questions.push({ kind: 'row-selection', candidates });
    }
  }

  // Emission predicate: the row was located (analysis.dayMapping exists) and
  // the alignment could not pair every column group. Unmapped headers alone
  // (empty day cells) are NOT actionable — there is no column to ask about.
  if (analysis.dayMapping) {
    const dayMappingQuestion = dayMappingQuestionFromDiagnostic(analysis.dayMapping);
    if (dayMappingQuestion) {
      questions.push(dayMappingQuestion);
    }
  }

  const codeLike = /^[A-Za-zÁÉÍÓÚÑñáéíóú0-9]{1,5}$/;
  for (const token of analysis.unknownTokens.slice(0, MAX_TOKEN_QUESTIONS)) {
    // Any short code-like unknown token is asked as a shift-code question
    // (type + optional times) so the answer can actually re-parse the cell;
    // longer phrases stay token-meaning (work/rest classification only).
    if (codeLike.test(token)) {
      questions.push({ kind: 'shift-code', code: token });
    } else {
      questions.push({ kind: 'token-meaning', token });
    }
  }

  return questions;
}

/**
 * Builds the persisted format profile from the assistant answers.
 *
 * - employeeRow: 'manual-row' + rowIndex when the user picked a row (never
 *   the label); 'name' otherwise (the strategy that worked, no name stored).
 * - tokenAliases: only for tokens the user answered — explicit shiftTypeId,
 *   else 'Regular' for work / 'Libre' for rest classifications.
 * - offTokens: every token classified as 'rest'.
 * - label/signature/parserParams come from the detected document type and
 *   its IngestionProfile — no document content.
 */
export function buildProfileFromAnswers(
  items: PdfTextItem[],
  context: CalendarImportContext,
  analysis: ItemAnalysis,
  answers: AssistantAnswers,
): UserFormatProfile {
  void items; // answers + analysis carry everything the profile needs
  void context;
  const detected = getIngestionProfile(analysis.structure.documentType);
  const now = new Date().toISOString();

  const tokenAliases: Record<string, string> = {};
  const codeTimes: Record<string, { startTime: string; endTime: string }> = {};
  const offTokens: string[] = [];
  for (const [token, meaning] of Object.entries(answers.tokenMeanings)) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }
    tokenAliases[trimmed] = meaning.shiftTypeId ?? (meaning.kind === 'work' ? 'Regular' : 'Libre');
    if (meaning.kind === 'rest') {
      offTokens.push(trimmed);
    }
    // Work codes need their times persisted — without them a later re-parse
    // of a bare code cell (e.g. "N") could not rebuild the shift.
    if (meaning.kind === 'work' && meaning.startTime && meaning.endTime) {
      codeTimes[trimmed] = { startTime: meaning.startTime, endTime: meaning.endTime };
    }
  }

  // Learned column→day correction, stored as { columnIndex: day } so a later
  // re-parse (parseWithDayMapping) can force the same assignment. Confirmed
  // answers store the proposed day; rejections only store an explicit
  // correctedDay — a bare "no" teaches nothing.
  let dayColumnMap: Record<number, number> | undefined;
  const dayMappingQuestion = analysis.dayMapping
    ? dayMappingQuestionFromDiagnostic(analysis.dayMapping)
    : null;
  if (answers.dayMapping && dayMappingQuestion) {
    const day = answers.dayMapping.confirmed
      ? dayMappingQuestion.proposedDay
      : answers.dayMapping.correctedDay;
    if (typeof day === 'number' && Number.isInteger(day) && day >= 1) {
      dayColumnMap = { [dayMappingQuestion.columnIndex]: day };
    }
  }

  return {
    profileVersion: FORMAT_PROFILE_VERSION,
    id: generateProfileId(),
    label: DOCUMENT_TYPE_LABELS[analysis.structure.documentType],
    signature: analysis.structure.signature,
    tokenAliases,
    offTokens,
    ...(Object.keys(codeTimes).length > 0 ? { codeTimes } : {}),
    employeeRow: answers.selectedRow
      ? { strategy: 'manual-row', rowIndex: answers.selectedRow.rowIndex }
      : { strategy: 'name' },
    parserParams: {
      clusterTolerance: detected?.clusterTolerance ?? 0,
      columnMatchMaxDistance: detected?.columnMatchMaxDistance ?? 0,
    },
    ...(dayColumnMap ? { dayColumnMap } : {}),
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  };
}

/**
 * Session-scoped selector keyed by the selected row's label AS PRINTED in
 * this document. NEVER persist it: the durable profile stores the rowIndex
 * strategy only (see buildProfileFromAnswers). Returns null when no manual
 * row was selected.
 */
export function selectorFromAnswers(answers: AssistantAnswers): EmployeeSelector | null {
  if (!answers.selectedRow) {
    return null;
  }
  return { employeeName: answers.selectedRow.label, employeeIdentifiers: [] };
}

/**
 * Session-scoped selector for a manually picked candidate: the printed label
 * plus the id-like marker printed in the candidate's own block, if any.
 * Two-line layouts (e.g. TYPE_LEGEND) put the id on a separate line below
 * the name, and their row window anchors on that id marker — a name-only
 * selector can never match them. Session use only; NEVER persisted (the
 * durable profile stores the manual-row strategy + rowIndex only).
 */
export function selectorForCandidate(
  items: PdfTextItem[],
  candidate: EmployeeRowCandidate,
  profile: IngestionProfile,
): EmployeeSelector {
  const markerMaxX = profile.rowWindow.markerMaxX;
  const isIdLike = (item: PdfTextItem): boolean =>
    !isEmployeeNameLabel(item.text) && item.text.replace(/\D/g, '').length >= 2;
  // Ids printed on the candidate's own line (e.g. TYPE_B: nómina id and name
  // share the marker line).
  const sameLine = items
    .filter(
      (item) =>
        item.page === candidate.page
        && item.x < markerMaxX
        && Math.abs(item.y - candidate.y) <= 1
        && item.text.trim() !== candidate.label
        && isIdLike(item),
    )
    .sort((a, b) => a.x - b.x);
  // Ids printed on a separate line inside the candidate's block (e.g.
  // TYPE_LEGEND: id line between the name and the next employee's name).
  // Only scanned when the candidate's own line carries no id — otherwise the
  // first id below already belongs to the NEXT employee.
  const belowIds: PdfTextItem[] = [];
  if (sameLine.length === 0) {
    const below = items
      .filter((item) => item.page === candidate.page && item.x < markerMaxX && item.y < candidate.y - 1)
      .sort((a, b) => b.y - a.y);
    const nextNameY = below.find((item) => isEmployeeNameLabel(item.text))?.y ?? Number.NEGATIVE_INFINITY;
    for (const item of below) {
      if (item.y <= nextNameY) {
        break;
      }
      if (isIdLike(item)) {
        belowIds.push(item);
      }
    }
  }
  const employeeIdentifiers = [...sameLine, ...belowIds].map((item) => item.text.trim());
  return { employeeName: candidate.label, employeeIdentifiers };
}

/**
 * Resolves the EmployeeRow for a manually picked candidate: rebuilds the row
 * band around the candidate's marker y with the profile's window rules.
 * Ceiling falls back to a small offset for non-'offset' modes (manual
 * selection has no "previous label" ceiling); the floor honors
 * 'next-row-boundary' by scanning for the next row marker below the
 * candidate — layouts that split a cell across several physical lines
 * (start times above the name, end times below it, e.g. real TYPE_B
 * fortnight rosters) silently lost the trailing line with the old flat
 * fallback. Returns null when the band holds no data cells.
 */
export function resolveRowForCandidate(
  items: PdfTextItem[],
  candidate: EmployeeRowCandidate,
  profile: IngestionProfile,
): EmployeeRow | null {
  const ceilingOffset = profile.rowWindow.ceiling.mode === 'offset' ? profile.rowWindow.ceiling.offset : 15;
  const inclusive = profile.rowWindow.ceiling.mode === 'offset' ? profile.rowWindow.ceiling.inclusive : false;
  const ceilingY = candidate.y + ceilingOffset;

  let floorY: number;
  const floor = profile.rowWindow.floor;
  if (floor.mode === 'offset') {
    floorY = candidate.y + floor.offset;
  } else {
    const { scan } = floor;
    const boundary = items
      .filter(
        (item) =>
          item.page === candidate.page
          && item.x < profile.rowWindow.markerMaxX
          && item.y < candidate.y - 0.5,
      )
      .sort((a, b) => b.y - a.y)
      .find((item) =>
        (scan.idPattern && scan.idPattern.test(normalizeEmployeeId(item.text)))
        || scan.tokens.some((token) => normalizeText(item.text).includes(token)));
    floorY = boundary ? boundary.y + scan.padY : scan.fallback;
  }

  const rowItems = items.filter(
    (item) =>
      item.page === candidate.page
      && item.x > profile.rowWindow.dataMinX
      && (inclusive ? item.y <= ceilingY : item.y < ceilingY)
      && item.y >= floorY,
  );
  if (rowItems.length === 0) {
    return null;
  }

  return { rowItems, page: candidate.page, category: profile.rowWindow.defaultCategory };
}

/**
 * Re-parses ONLY the manually selected row (see resolveRowForCandidate) and
 * runs the shared row→shifts pipeline (buildShiftsFromEmployeeRow, the exact
 * steps 5–10 of parseShiftsFromItems). Returns [] when the band holds no
 * data cells. Multi-section (TYPE_MULTI) documents are out of scope for this
 * helper in wave 2.
 */
export function parseWithSelectedRow(
  items: PdfTextItem[],
  context: CalendarImportContext,
  candidate: EmployeeRowCandidate,
  profile: IngestionProfile,
  codeOverrides?: Map<string, ShiftCodeMapping>,
): ParsedCalendarShift[] {
  const row = resolveRowForCandidate(items, candidate, profile);
  if (!row) {
    return [];
  }

  return buildShiftsFromEmployeeRow(items, row, context, profile, codeOverrides);
}

/**
 * Code mappings directly from the current assistant answers — used by the
 * one-shot re-parse so the just-classified codes resolve immediately, before
 * any profile round-trip through storage.
 */
export function buildCodeOverridesFromAnswers(
  answers: AssistantAnswers,
): Map<string, ShiftCodeMapping> {
  const tokenAliases: Record<string, string> = {};
  const codeTimes: Record<string, { startTime: string; endTime: string }> = {};
  const offTokens: string[] = [];
  for (const [token, meaning] of Object.entries(answers.tokenMeanings)) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }
    tokenAliases[trimmed] = meaning.shiftTypeId ?? (meaning.kind === 'work' ? 'Regular' : 'Libre');
    if (meaning.kind === 'rest') {
      offTokens.push(trimmed);
    } else if (meaning.startTime && meaning.endTime) {
      codeTimes[trimmed] = { startTime: meaning.startTime, endTime: meaning.endTime };
    }
  }
  return codeOverridesFromLearning({ tokenAliases, offTokens, codeTimes });
}

/**
 * One-shot re-parse with a corrected column→day assignment (the day-mapping
 * answer). The corrected group is excluded from the standard alignment and
 * forced onto the corrected day — clamped to the context month length — and
 * the corrected day is removed from the pool available to the remaining
 * groups, so on collision the correction wins and the displaced group is
 * re-aligned against the other headers or left unmapped (never re-dated to
 * an invented day). Dates are built exclusively from the context month by
 * buildShiftsFromMappedColumns, so nothing outside it can be fabricated.
 * Falls back to the standard alignment when the columnIndex is stale.
 */
export function parseWithDayMapping(
  items: PdfTextItem[],
  context: CalendarImportContext,
  row: EmployeeRow,
  profile: IngestionProfile,
  correction: { columnIndex: number; day: number },
  codeOverrides?: Map<string, ShiftCodeMapping>,
): ParsedCalendarShift[] {
  const codeProfile = mergeCodeOverrides(
    profile.useShiftCodeProfile ? buildCodeProfile(items) : undefined,
    codeOverrides,
  );
  const { columnGroups, dayColumns, mappedColumns } = resolveColumnDayMapping(items, row, context, profile);

  const target = columnGroups[correction.columnIndex];
  if (!target || !Number.isInteger(correction.day)) {
    return buildShiftsFromMappedColumns(mappedColumns, context, profile, codeProfile);
  }

  const correctedDay = Math.min(
    Math.max(1, correction.day),
    getDaysInMonth(context.year, context.month),
  );
  const remainingGroups = columnGroups.filter((_, index) => index !== correction.columnIndex);
  const remainingDayColumns = dayColumns.filter((column) => column.day !== correctedDay);
  const realigned = mapColumnGroupsToDays(remainingGroups, remainingDayColumns, profile.columnMatchMaxDistance);
  const mapped = [...realigned, { day: correctedDay, items: target }]
    .sort((left, right) => left.day - right.day);

  return buildShiftsFromMappedColumns(mapped, context, profile, codeProfile);
}

/**
 * Mirrors the profile's learned tokenAliases into the shift-type registry
 * (localStorage overrides via mergeShiftTypeOverrides) so the parser
 * resolves them on subsequent imports. offTokens not already aliased are
 * mapped to 'Libre'. Only tokens the user classified are present in the
 * profile by construction, so this never registers unasked tokens.
 */
export function applyTokenAliasesToShiftTypes(profile: UserFormatProfile): ShiftTypeOverrides {
  const aliases: Record<string, string> = { ...profile.tokenAliases };
  for (const token of profile.offTokens) {
    if (!aliases[token]) {
      aliases[token] = 'Libre';
    }
  }
  return mergeShiftTypeOverrides({ types: [], aliases });
}

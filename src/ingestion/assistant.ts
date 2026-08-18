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
import { buildCodeProfile } from './core/shift-code-profile';
import { isEmployeeNameLabel, looksLikeEmployeeLabel } from './core/tokens';
import { PdfTextItem, sortPdfItemsForReading } from './core/text-items';
import { getIngestionProfile } from './profiles';
import { IngestionProfile } from './profiles/types';
import {
  buildShiftsFromEmployeeRow,
  buildShiftsFromMappedColumns,
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
    const labelItems = pageItems.filter(
      (item) => item.x < profile.rowWindow.markerMaxX && looksLikeEmployeeLabel(item.text),
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
 * - token-meaning / shift-code: one per unknown row token (cap 6). Tokens of
 *   a code-based profile (useShiftCodeProfile) that look like codes
 *   (1–4 letters) are asked as shift-code ("¿Qué turno representa M?");
 *   everything else as token-meaning ("¿Qué significa X?").
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

  const codeLike = /^[A-Za-zÁÉÍÓÚÑñáéíóú]{1,4}$/;
  for (const token of analysis.unknownTokens.slice(0, MAX_TOKEN_QUESTIONS)) {
    if (profile?.useShiftCodeProfile && codeLike.test(token)) {
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
 * Resolves the EmployeeRow for a manually picked candidate: rebuilds the row
 * band around the candidate's marker y with the profile's window offsets
 * (manual selection has no "previous label" ceiling / boundary floor, so
 * those modes fall back to a small default band). Returns null when the band
 * holds no data cells.
 */
export function resolveRowForCandidate(
  items: PdfTextItem[],
  candidate: EmployeeRowCandidate,
  profile: IngestionProfile,
): EmployeeRow | null {
  const ceilingOffset = profile.rowWindow.ceiling.mode === 'offset' ? profile.rowWindow.ceiling.offset : 15;
  const inclusive = profile.rowWindow.ceiling.mode === 'offset' ? profile.rowWindow.ceiling.inclusive : false;
  const floorOffset = profile.rowWindow.floor.mode === 'offset' ? profile.rowWindow.floor.offset : -0.5;

  const ceilingY = candidate.y + ceilingOffset;
  const floorY = candidate.y + floorOffset;
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
): ParsedCalendarShift[] {
  const row = resolveRowForCandidate(items, candidate, profile);
  if (!row) {
    return [];
  }

  return buildShiftsFromEmployeeRow(items, row, context, profile);
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
): ParsedCalendarShift[] {
  const codeProfile = profile.useShiftCodeProfile ? buildCodeProfile(items) : undefined;
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

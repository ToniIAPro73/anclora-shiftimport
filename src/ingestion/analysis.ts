/**
 * Document analysis and import quality (Phase 1A, wave 2).
 *
 * Pure, item-based layer on top of the parsing pipeline: it inspects the
 * extracted text items, classifies the employee-row tokens and composes the
 * QualitySignals that computeImportResult (src/lib/import-quality.ts) turns
 * into an ImportResult. It never writes to storage and never auto-imports
 * when the employee row is not unambiguously identified.
 *
 * PII boundary: the layout signature only contains day-header tokens and
 * legend codes (hashed one-way into structureHash) — never person names or
 * employee ids.
 */
import {
  computeLayoutSignature,
  detectProfileDrift,
  LayoutSignature,
  matchFormatProfile,
  ProfileDriftReport,
  UserFormatProfile,
} from '../lib/format-profiles';
import {
  computeImportResult,
  ImportResult,
  ImportWarning,
  QualitySignals,
} from '../lib/import-quality';
import { CalendarImportContext, ParsedCalendarShift, PdfDocumentType } from '../lib/import-types';
import { IngestionError } from '../lib/ingestion-errors';
import { getDaysInMonth } from '../lib/week';
import { getDayColumnsForPage } from './core/day-columns';
import { normalizeText } from './core/normalize';
import {
  countEmployeeNameCandidates,
  EmployeeRow,
  EmployeeSelector,
  findEmployeeRowItems,
  matchesNameTokens,
} from './core/row-detection';
import { buildCodeProfile, parseLegendCodes } from './core/shift-code-profile';
import { isEmployeeIdToken, isEmployeeNameLabel, expandShiftTokens } from './core/tokens';
import { PdfTextItem, sortPdfItemsForReading } from './core/text-items';
import { getIngestionProfile } from './profiles';
import { IngestionProfile } from './profiles/types';
import { detectPdfDocumentTypeFromItems } from './parsers/detect';
import { parseShiftsFromItems, resolveColumnDayMapping } from './parsers/parse-items';

export interface DocumentStructureAnalysis {
  documentType: PdfDocumentType;
  signature: LayoutSignature;
  dayHeaderCount: number;
  matchedProfile: { profile: UserFormatProfile; score: number } | null;
  drift: ProfileDriftReport | null;
  periodDetected: boolean;
}

export type EmployeeMatchStrength = 'strong' | 'weak' | 'multiple' | 'none';

/**
 * Column→day alignment diagnostic for the located employee row. Captured by
 * re-running the pipeline's shared alignment step (resolveColumnDayMapping)
 * so the format assistant can ask a day-mapping question only when the grid
 * could not be fully paired — never recomputed blindly in the UI layer.
 */
export interface DayMappingDiagnostic {
  dayHeaderCount: number;
  /** distinct day headers paired with a column group */
  mappedDayCount: number;
  /** day headers no column group aligned to (empty days included) */
  unmappedHeaders: Array<{ day: number; x: number; page: number }>;
  /** column groups that fell outside columnMatchMaxDistance of any header */
  unmatchedGroups: Array<{ columnIndex: number; sampleTokens: string[]; x: number }>;
}

export interface ItemAnalysis {
  structure: DocumentStructureAnalysis;
  employeeMatch: EmployeeMatchStrength;
  /** employee row when found */
  rowItems: PdfTextItem[] | null;
  /** distinct unknown tokens from rowItems */
  unknownTokens: string[];
  totalTokens: number;
  recognizedTokens: number;
  invalidTimes: number;
  /** present only when the employee row was located (never for TYPE_MULTI) */
  dayMapping?: DayMappingDiagnostic;
}

/**
 * Same scoring as matchFormatProfile (src/lib/format-profiles.ts) but over a
 * caller-provided profile list — a performance hint for callers that already
 * loaded the profiles (matchFormatProfile itself reads storage).
 */
const matchProfileIn = (
  signature: LayoutSignature,
  profiles: UserFormatProfile[],
): { profile: UserFormatProfile; score: number } | null => {
  let best: { profile: UserFormatProfile; score: number } | null = null;
  for (const profile of profiles) {
    let score: number | null = null;
    if (profile.signature.structureHash === signature.structureHash) {
      score = 1;
    } else if (
      profile.signature.documentType === signature.documentType
      && profile.signature.dayHeaderCount === signature.dayHeaderCount
    ) {
      score = 0.6;
    }
    if (score !== null && (best === null || score > best.score)) {
      best = { profile, score };
    }
  }
  return best;
};

const matchProfile = (
  signature: LayoutSignature,
  profilesHint?: UserFormatProfile[],
): { profile: UserFormatProfile; score: number } | null =>
  profilesHint ? matchProfileIn(signature, profilesHint) : matchFormatProfile(signature);

/**
 * Whether the profile's calendar-context rule actually found a period in
 * these items (detectCalendarContext falls back to the current month/year
 * silently, so a fallback must not count as detected).
 */
const contextDetectionSucceeded = (items: PdfTextItem[], profile: IngestionProfile): boolean => {
  const rule = profile.calendarContext;
  switch (rule.mode) {
    case 'day-header-month-vote':
      return profile.dayHeader.monthGroup !== undefined
        && items.some((item) => profile.dayHeader.pattern.test(item.text));
    case 'month-name-scan':
      return items.some((item) => {
        const normalized = normalizeText(item.text);
        return rule.monthNames.some((name) => normalized.includes(name));
      });
  }
};

/**
 * Inspects the document layout: type detection, day headers, layout
 * signature (day-header tokens + legend codes, NO names/ids) and saved
 * profile matching/drift. UNKNOWN documents get an empty signature and
 * dayHeaderCount 0.
 */
export function analyzeDocumentStructure(
  items: PdfTextItem[],
  context: CalendarImportContext,
  profilesHint?: UserFormatProfile[],
): DocumentStructureAnalysis {
  const documentType = detectPdfDocumentTypeFromItems(items);
  const profile = getIngestionProfile(documentType);

  if (!profile) {
    const signature = computeLayoutSignature({
      documentType,
      dayHeaderCount: 0,
      columnCount: 0,
      hasLegend: false,
      structureTokens: [],
    });
    const matchedProfile = matchProfile(signature, profilesHint);
    return {
      documentType,
      signature,
      dayHeaderCount: 0,
      matchedProfile,
      drift: matchedProfile ? detectProfileDrift(matchedProfile.profile, signature) : null,
      periodDetected: false,
    };
  }

  const pages = Array.from(new Set(items.map((item) => item.page)));
  const dayColumns = pages.flatMap((page) => getDayColumnsForPage(items, page, context, profile.dayHeader));

  // Structure tokens: the raw day-header texts matched by the profile's
  // dayHeader rule plus legend codes when the profile uses a code profile.
  // computeLayoutSignature normalizes (trim/lowercase, dedupe, sort) and
  // hashes them one-way into structureHash.
  const structureTokens = items
    .filter((item) => profile.dayHeader.pattern.test(item.text))
    .map((item) => item.text);

  let hasLegend = false;
  if (profile.useShiftCodeProfile) {
    const legendCodes = new Set<string>();
    for (const item of items) {
      for (const entry of parseLegendCodes(item.text)) {
        legendCodes.add(entry.code);
      }
    }
    hasLegend = legendCodes.size > 0;
    structureTokens.push(...legendCodes);
  }

  const signature = computeLayoutSignature({
    documentType,
    dayHeaderCount: dayColumns.length,
    columnCount: new Set(dayColumns.map((column) => column.x)).size,
    hasLegend,
    structureTokens,
  });
  const matchedProfile = matchProfile(signature, profilesHint);

  return {
    documentType,
    signature,
    dayHeaderCount: dayColumns.length,
    matchedProfile,
    drift: matchedProfile ? detectProfileDrift(matchedProfile.profile, signature) : null,
    periodDetected: contextDetectionSucceeded(items, profile),
  };
}

/**
 * Name-only match strength: 'strong' when every name token (length ≥ 3)
 * prefix-matches a word of the located marker label, 'weak' when the match
 * is partial (matchesNameTokens accepts ≥ min(2, n) tokens).
 */
const nameMatchStrength = (
  items: PdfTextItem[],
  page: number,
  employeeName: string,
  markerMaxX: number,
): 'strong' | 'weak' => {
  const nameTokens = normalizeText(employeeName).split(' ').filter((token) => token.length >= 3);
  if (nameTokens.length === 0) {
    return 'weak';
  }
  const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page));
  const marker = pageItems.find(
    (item) => item.x < markerMaxX && isEmployeeNameLabel(item.text) && matchesNameTokens(item.text, nameTokens),
  );
  if (!marker) {
    return 'weak';
  }
  const words = normalizeText(marker.text).split(' ');
  const matched = nameTokens.filter((token) =>
    words.some((word) => word.startsWith(token) || token.startsWith(word)),
  );
  return matched.length === nameTokens.length ? 'strong' : 'weak';
};

/**
 * Captures the column→day alignment for the located row via the pipeline's
 * own alignment step: day headers left unpaired and column groups that fell
 * outside columnMatchMaxDistance (with their first cell tokens as samples
 * for the assistant's day-mapping question).
 */
const computeDayMappingDiagnostic = (
  items: PdfTextItem[],
  row: EmployeeRow,
  context: CalendarImportContext,
  profile: IngestionProfile,
): DayMappingDiagnostic => {
  const { columnGroups, dayColumns, mappedColumns, unmatchedGroupIndices } =
    resolveColumnDayMapping(items, row, context, profile);
  const mappedDays = new Set(mappedColumns.map((column) => column.day));
  return {
    dayHeaderCount: dayColumns.length,
    mappedDayCount: mappedDays.size,
    unmappedHeaders: dayColumns
      .filter((column) => !mappedDays.has(column.day))
      .map((column) => ({ day: column.day, x: column.x, page: row.page })),
    unmatchedGroups: unmatchedGroupIndices.map((columnIndex) => {
      const group = columnGroups[columnIndex];
      return {
        columnIndex,
        sampleTokens: group.slice(0, 3).map((item) => item.text.trim()).filter(Boolean),
        x: group.reduce((sum, item) => sum + item.x, 0) / group.length,
      };
    }),
  };
};

/**
 * Full item-level analysis for one import attempt.
 *
 * Employee match strength rules:
 * - 'multiple': more than one name candidate and no disambiguating digit id
 *   (we must not auto-pick a row).
 * - 'none': zero candidates, or the row band could not be located.
 * - 'strong': matched via a digit identifier, or a unique full-name match
 *   (every name token matches the row label).
 * - 'weak': unique but partial-token name match (fuzzy — wrong-row
 *   extraction is the worst silent failure, hence the distinction).
 *
 * Token classification runs over the located row's data cells, excluding the
 * name/id marker items (marker column and parenthesized ids). A cell counts
 * as recognized when expandShiftTokens extracts any time/separator/off/code
 * token from it (codes via buildCodeProfile only when the detected profile
 * opts in). Cells that look time-ish (contain ':') but yield nothing count
 * as invalidTimes; anything else is an unknown token.
 */
export function analyzeItemsForImport(
  items: PdfTextItem[],
  context: CalendarImportContext,
  selector: EmployeeSelector,
  profilesHint?: UserFormatProfile[],
): ItemAnalysis {
  const structure = analyzeDocumentStructure(items, context, profilesHint);
  const base: ItemAnalysis = {
    structure,
    employeeMatch: 'none',
    rowItems: null,
    unknownTokens: [],
    totalTokens: 0,
    recognizedTokens: 0,
    invalidTimes: 0,
  };

  const profile = getIngestionProfile(structure.documentType);
  if (!profile || items.length === 0) {
    return base;
  }

  const targetIds = selector.employeeIdentifiers
    .map((value) => value.replace(/\D/g, ''))
    .filter((value) => value.length > 0);

  if (targetIds.length === 0) {
    const candidates = countEmployeeNameCandidates(items, selector.employeeName, profile.rowWindow.markerMaxX);
    if (candidates > 1) {
      return { ...base, employeeMatch: 'multiple' };
    }
    if (candidates === 0) {
      return base;
    }
  }

  const row: EmployeeRow | null = findEmployeeRowItems(items, selector, profile.rowWindow);
  if (!row) {
    return base;
  }

  // With digit ids, findEmployeeRowItems only matches a page where the id
  // marker is present — an id-backed row is always a strong match.
  const employeeMatch: EmployeeMatchStrength = targetIds.length > 0
    ? 'strong'
    : nameMatchStrength(items, row.page, selector.employeeName, profile.rowWindow.markerMaxX);

  const codeProfile = profile.useShiftCodeProfile ? buildCodeProfile(items) : undefined;
  const cellItems = row.rowItems.filter(
    (item) => item.x > profile.rowWindow.markerMaxX && !isEmployeeIdToken(item.text),
  );

  let totalTokens = 0;
  let recognizedTokens = 0;
  let invalidTimes = 0;
  const unknownTokens = new Set<string>();
  for (const item of cellItems) {
    const text = item.text.trim();
    if (!text) {
      continue;
    }
    totalTokens += 1;
    if (expandShiftTokens(text, codeProfile).length > 0) {
      recognizedTokens += 1;
      continue;
    }
    if (text.includes(':')) {
      invalidTimes += 1;
      continue;
    }
    unknownTokens.add(text);
  }

  return {
    structure,
    employeeMatch,
    rowItems: row.rowItems,
    unknownTokens: [...unknownTokens],
    totalTokens,
    recognizedTokens,
    invalidTimes,
    // TYPE_MULTI has no single day-column grid per page; the day-mapping
    // assistant question does not apply to it.
    ...(profile.id !== 'TYPE_MULTI'
      ? { dayMapping: computeDayMappingDiagnostic(items, row, context, profile) }
      : {}),
  };
}

/**
 * Analysis-driven import: parses the employee's shifts and composes the
 * ImportResult from concrete quality signals.
 *
 * Error policy (IngestionError from parseShiftsFromItems):
 * - UNKNOWN_EMPLOYEE → employeeMatch 'none', empty shifts, no throw.
 * - AMBIGUOUS_EMPLOYEE → employeeMatch 'multiple', empty shifts, no throw.
 *   ('none'/'multiple' therefore never produce shifts — the UI must ask.)
 * - UNSUPPORTED_LAYOUT / EMPTY_DOCUMENT → state forced to UNRECOGNIZED with
 *   an UNSUPPORTED_SECTION warning, empty shifts.
 * - NO_SHIFTS_FOUND → empty shifts + PARTIAL_EXTRACTION; the UI decides.
 * - Anything else (MALFORMED_INPUT, UNSUPPORTED_FORMAT) rethrows.
 */
export function analyzeShiftsFromItems(
  items: PdfTextItem[],
  context: CalendarImportContext,
  selector: EmployeeSelector,
  profilesHint?: UserFormatProfile[],
): { shifts: ParsedCalendarShift[]; quality: ImportResult; analysis: ItemAnalysis } {
  let analysis = analyzeItemsForImport(items, context, selector, profilesHint);

  let shifts: ParsedCalendarShift[] = [];
  let employeeMatch = analysis.employeeMatch;
  let forceUnrecognized = false;
  const extraWarnings: ImportWarning[] = [];

  try {
    shifts = parseShiftsFromItems(items, context, selector);
  } catch (error) {
    if (!(error instanceof IngestionError)) {
      throw error;
    }
    switch (error.code) {
      case 'UNKNOWN_EMPLOYEE':
        employeeMatch = 'none';
        break;
      case 'AMBIGUOUS_EMPLOYEE':
        employeeMatch = 'multiple';
        break;
      case 'UNSUPPORTED_LAYOUT':
      case 'EMPTY_DOCUMENT':
        forceUnrecognized = true;
        extraWarnings.push({ code: 'UNSUPPORTED_SECTION' });
        break;
      case 'NO_SHIFTS_FOUND':
        extraWarnings.push({ code: 'PARTIAL_EXTRACTION' });
        break;
      default:
        throw error;
    }
  }

  if (employeeMatch !== analysis.employeeMatch) {
    analysis = { ...analysis, employeeMatch };
  }

  // The layout's day headers are the best promise of how many days the
  // document covers; without headers we fall back to the context month.
  const expectedDays = analysis.structure.dayHeaderCount > 0
    ? analysis.structure.dayHeaderCount
    : getDaysInMonth(context.year, context.month);
  const mappedDays = new Set(shifts.map((shift) => shift.date)).size;
  const incompleteAssignments = shifts.filter(
    (shift) => !shift.isValid || shift.startTime === '??:??' || shift.endTime === '??:??',
  ).length;

  const signals: QualitySignals = {
    knownProfileMatched: analysis.structure.matchedProfile !== null,
    profileDrift: analysis.structure.drift?.drifted ?? false,
    periodDetected: analysis.structure.periodDetected,
    employeeMatch,
    expectedDays,
    mappedDays,
    totalTokens: analysis.totalTokens,
    recognizedTokens: analysis.recognizedTokens,
    unknownTokens: analysis.unknownTokens,
    invalidTimes: analysis.invalidTimes,
    incompleteAssignments,
  };

  let quality = computeImportResult(shifts, signals, analysis.structure.matchedProfile?.profile.id);
  if (extraWarnings.length > 0 || forceUnrecognized) {
    const warnings = [...quality.warnings];
    for (const warning of extraWarnings) {
      if (!warnings.some((existing) => existing.code === warning.code)) {
        warnings.push(warning);
      }
    }
    quality = {
      ...quality,
      warnings,
      ...(forceUnrecognized
        ? { state: 'UNRECOGNIZED' as const, confidence: Math.min(quality.confidence, 0.2) }
        : {}),
    };
  }

  return { shifts, quality, analysis };
}

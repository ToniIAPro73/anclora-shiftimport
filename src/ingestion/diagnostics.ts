/**
 * Structured import diagnosis + guided recovery (Phase 1B).
 *
 * Pure derivation layer on top of DocumentAnalysisResult: it normalizes the
 * parser's quality state, warnings and assistant questions into a small
 * canonical state model (ImportState) plus structured ImportDiagnostic
 * entries the UI renders directly. The UI must consume this model instead of
 * hardcoding behavior from raw parser exceptions or the numeric confidence.
 *
 * Guarantees this layer exists to enforce:
 * - 0 importable shifts is never presented as READY/CORRECT.
 * - An unknown shift code is never silently dropped: it becomes a blocking
 *   UNKNOWN_SHIFT_CODES diagnostic with a recovery question.
 * - A document period conflicting with the user's explicit month/year
 *   selection becomes a blocking MONTH_MISMATCH diagnostic; nothing is
 *   re-dated until the user decides.
 *
 * PII boundary: diagnostics carry document TOKENS, day numbers and ISO
 * dates — never person names, employee ids or file contents.
 */
import { IngestionError, IngestionErrorCode } from '../lib/ingestion-errors';
import { CalendarImportContext } from '../lib/import-types';
import { ImportResult } from '../lib/import-quality';
import { ItemAnalysis } from './analysis';
import { DocumentAnalysisResult } from './parsers/file';

export type ImportState =
  | 'READY'
  | 'NEEDS_USER_INPUT'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'UNSUPPORTED'
  | 'FAILED';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

/** The one action the user can take to resolve a diagnostic. */
export type RecoveryAction =
  /** answer the assistant question attached to the diagnostic */
  | 'answer-question'
  /** explicitly choose between the selected and the detected period */
  | 'choose-period'
  /** provide a different file (format/layout not importable) */
  | 'reupload'
  | 'none';

/** Pipeline stage that produced the diagnostic (never rendered as-is). */
export type DiagnosticStage =
  | 'extraction'
  | 'analysis'
  | 'mapping'
  | 'classification';

export interface ImportDiagnostic {
  code: IngestionErrorCode;
  severity: DiagnosticSeverity;
  /** while true, confirmation stays disabled and nothing is imported */
  blocking: boolean;
  /** true when a user action (recovery) can unblock the import */
  recoverable: boolean;
  /** i18n key under diagnosis.* (never a hardcoded string) */
  messageKey: string;
  /** interpolation vars for messageKey (tokens, counts, days, periods) */
  details?: Record<string, string | number>;
  /** ISO dates or day numbers excluded/unresolved, when known */
  affectedDays?: Array<string | number>;
  /** raw document tokens involved (shift codes), when relevant */
  tokens?: string[];
  recovery: RecoveryAction;
  /** true when importing only the resolved part is acceptable */
  safeToImportPartial: boolean;
  stage: DiagnosticStage;
}

export interface ImportDiagnosis {
  state: ImportState;
  diagnostics: ImportDiagnostic[];
  /**
   * Extraction accounting: how many cell tokens were understood and how
   * many days/tokens remain unresolved. Drives the "26 de 31 días" copy.
   */
  summary: {
    recognizedTokens: number;
    totalTokens: number;
    expectedDays: number;
    mappedDays: number;
    unresolvedDays: Array<string | number>;
    unresolvedTokens: string[];
  };
}

export interface DiagnosisOptions {
  /**
   * Item-level analysis (already computed by the caller for the assistant
   * session). Supplies per-day resolution detail; optional so the diagnosis
   * also works without it.
   */
  itemAnalysis?: ItemAnalysis | null;
  /**
   * The user's explicit month/year selection. When it conflicts with the
   * document-detected period (result.detectedContext, real evidence only),
   * a blocking MONTH_MISMATCH diagnostic is emitted.
   */
  selectedContext?: CalendarImportContext;
  /** true once the user explicitly resolved the month conflict */
  periodConflictResolved?: boolean;
  /**
   * true when the user dismissed the recovery assistant: unknown-code
   * diagnostics downgrade from blocking to an explicit exclusion warning —
   * the drop is surfaced, never silent.
   */
  recoveryDismissed?: boolean;
}

const UNKNOWN_TOKEN_PENALTY_MAX_TOKENS = 6;

/** Distinct unknown shift codes from the quality warnings (authoritative). */
const unknownTokensFromQuality = (quality: ImportResult): string[] =>
  quality.warnings
    .filter((warning) => warning.code === 'UNKNOWN_SHIFT_TOKEN')
    .map((warning) => String(warning.context?.token ?? ''))
    .filter(Boolean);

const partialWarningContext = (quality: ImportResult): { expected: number; mapped: number } | null => {
  const warning = quality.warnings.find(
    (entry) => entry.code === 'PARTIAL_EXTRACTION'
      && typeof entry.context?.expected === 'number'
      && typeof entry.context?.mapped === 'number',
  );
  if (!warning) {
    return null;
  }
  return { expected: Number(warning.context?.expected), mapped: Number(warning.context?.mapped) };
};

/**
 * Best available explanation when zero shifts were extracted, derived from
 * concrete signals — never a bare "Correcto". Falls back to an honest
 * "cause could not be determined" key when no signal explains it.
 */
function noShiftsReasonKey(result: DocumentAnalysisResult, itemAnalysis: ItemAnalysis | null | undefined): string {
  const employeeMissing = result.quality.state === 'UNRECOGNIZED'
    && result.questions.some((question) => question.kind === 'row-selection');
  if (result.quality.warnings.some((warning) => warning.code === 'UNSUPPORTED_SECTION')) {
    return 'diagnosis.noShifts.reasonUnsupportedLayout';
  }
  if (employeeMissing) {
    return 'diagnosis.noShifts.reasonEmployeeMissing';
  }
  const unknownTokens = unknownTokensFromQuality(result.quality);
  const totalTokens = itemAnalysis?.totalTokens ?? 0;
  if (unknownTokens.length > 0 && totalTokens > 0 && (itemAnalysis?.recognizedTokens ?? 0) === 0) {
    return 'diagnosis.noShifts.reasonAllCodesUnknown';
  }
  if (totalTokens === 0 && !itemAnalysis) {
    return 'diagnosis.noShifts.reasonNoValues';
  }
  if (itemAnalysis && itemAnalysis.totalTokens > 0 && itemAnalysis.dayMapping?.unmappedHeaders.length) {
    return 'diagnosis.noShifts.reasonNoDateAlignment';
  }
  if (itemAnalysis && itemAnalysis.totalTokens === 0) {
    return 'diagnosis.noShifts.reasonNoValues';
  }
  return 'diagnosis.noShifts.reasonUnknown';
}

const samePeriod = (left: CalendarImportContext, right: CalendarImportContext): boolean =>
  left.month === right.month && left.year === right.year;

/**
 * Builds the canonical diagnosis for one import attempt.
 *
 * State resolution order (first match wins for the blocking decisions):
 * 1. MONTH_MISMATCH pending user decision → NEEDS_USER_INPUT (blocking).
 * 2. UNSUPPORTED layout/format evidence with no actionable questions →
 *    UNSUPPORTED (blocking, not recoverable in place).
 * 3. Zero shifts → BLOCKED with NO_SHIFTS_FOUND + best reason, unless
 *    assistant questions exist (employee/token recovery) → NEEDS_USER_INPUT.
 * 4. Open assistant questions (employee row, unknown codes, day mapping) →
 *    NEEDS_USER_INPUT; unknown codes stay blocking until answered or
 *    explicitly dismissed.
 * 5. Partial extraction (mapped < expected) → PARTIAL; import of the
 *    resolved part stays allowed with the unresolved days listed.
 * 6. Otherwise READY (non-blocking warnings may still be listed).
 */
export function buildImportDiagnosis(
  result: DocumentAnalysisResult,
  opts: DiagnosisOptions = {},
): ImportDiagnosis {
  const diagnostics: ImportDiagnostic[] = [];
  const { quality, questions, shifts } = result;
  const itemAnalysis = opts.itemAnalysis ?? null;

  const unknownTokens = unknownTokensFromQuality(quality);
  const partial = partialWarningContext(quality);
  const expectedDays = partial?.expected ?? itemAnalysis?.structure.dayHeaderCount ?? 0;
  const mappedDays = partial?.mapped ?? new Set(shifts.map((shift) => shift.date)).size;

  // Day numbers the layout promised but no column aligned to, plus the days
  // whose cells hold unknown codes (both are "understood structure, unresolved
  // content" and must be named, not just counted).
  const unmappedDays = itemAnalysis?.dayMapping
    ? itemAnalysis.dayMapping.unmappedHeaders.map((header) => header.day)
    : [];
  const unknownTokenDays = itemAnalysis?.unknownTokenDays ?? {};
  const unknownDays = [...new Set(Object.values(unknownTokenDays).flat())]
    .sort((left, right) => left - right);
  const unresolvedDays: Array<string | number> = [...new Set([...unmappedDays, ...unknownDays])]
    .sort((left, right) => Number(left) - Number(right));

  // --- 1. Period conflict (explicit selection vs document evidence) -------
  // TYPE_MULTI documents legitimately contain several months: a selection
  // matching ANY covered section is fine; a selection outside the covered
  // periods is the conflict. Single-period documents conflict when the
  // detected period (real evidence only) differs from the selection.
  const coveredPeriods = result.coveredPeriods ?? [];
  const detectedForAction = result.detectedContext ?? coveredPeriods[0];
  let periodConflict = false;
  if (opts.selectedContext && detectedForAction) {
    if (coveredPeriods.length > 0) {
      periodConflict = !coveredPeriods.some((period) => samePeriod(period, opts.selectedContext!));
    } else {
      const periodEvidence = result.kind === 'csv'
        ? result.shifts.some((shift) => Boolean(shift.date))
        : (result.structure?.periodDetected ?? false);
      periodConflict = periodEvidence && !samePeriod(opts.selectedContext, detectedForAction);
    }
  }
  if (periodConflict && opts.selectedContext && detectedForAction) {
    const pending = opts.periodConflictResolved !== true;
    diagnostics.push({
      code: 'MONTH_MISMATCH',
      severity: 'error',
      blocking: pending,
      recoverable: true,
      messageKey: 'diagnosis.monthMismatch.message',
      details: {
        selectedMonth: opts.selectedContext.month,
        selectedYear: opts.selectedContext.year,
        detectedMonth: detectedForAction.month,
        detectedYear: detectedForAction.year,
      },
      recovery: 'choose-period',
      safeToImportPartial: false,
      stage: 'mapping',
    });
    if (pending) {
      return finishDiagnosis('NEEDS_USER_INPUT', diagnostics, {
        recognizedTokens: itemAnalysis?.recognizedTokens ?? 0,
        totalTokens: itemAnalysis?.totalTokens ?? 0,
        expectedDays,
        mappedDays,
        unresolvedDays,
        unresolvedTokens: unknownTokens,
      });
    }
  }

  // --- 2. Unsupported layout/format ---------------------------------------
  const unsupportedEvidence = quality.warnings.some((warning) => warning.code === 'UNSUPPORTED_SECTION')
    || result.structure?.documentType === 'UNKNOWN';
  if (unsupportedEvidence && questions.length === 0 && shifts.length === 0) {
    diagnostics.push({
      code: 'UNSUPPORTED_LAYOUT',
      severity: 'error',
      blocking: true,
      recoverable: false,
      messageKey: 'diagnosis.unsupportedLayout.message',
      recovery: 'reupload',
      safeToImportPartial: false,
      stage: 'extraction',
    });
    return finishDiagnosis('UNSUPPORTED', diagnostics, {
      recognizedTokens: itemAnalysis?.recognizedTokens ?? 0,
      totalTokens: itemAnalysis?.totalTokens ?? 0,
      expectedDays,
      mappedDays: 0,
      unresolvedDays,
      unresolvedTokens: unknownTokens,
    });
  }

  // --- 3/4. Employee recovery (unknown / ambiguous) ------------------------
  const rowQuestion = questions.find((question) => question.kind === 'row-selection');
  if (rowQuestion) {
    const ambiguous = itemAnalysis?.employeeMatch === 'multiple'
      || quality.warnings.some((warning) => warning.code === 'MULTIPLE_EMPLOYEE_MATCHES');
    diagnostics.push({
      code: ambiguous ? 'AMBIGUOUS_EMPLOYEE' : 'UNKNOWN_EMPLOYEE',
      severity: 'error',
      blocking: true,
      recoverable: true,
      messageKey: ambiguous
        ? 'diagnosis.employee.ambiguousMessage'
        : 'diagnosis.employee.unknownMessage',
      recovery: 'answer-question',
      safeToImportPartial: false,
      stage: 'analysis',
    });
  }

  // --- 4. Unknown shift codes ----------------------------------------------
  const hasCodeQuestions = questions.some(
    (question) => question.kind === 'shift-code' || question.kind === 'token-meaning',
  );
  if (unknownTokens.length > 0) {
    const blocking = hasCodeQuestions && opts.recoveryDismissed !== true;
    diagnostics.push({
      code: 'UNKNOWN_SHIFT_CODES',
      severity: blocking ? 'error' : 'warning',
      blocking,
      recoverable: hasCodeQuestions,
      messageKey: blocking
        ? 'diagnosis.unknownCodes.message'
        : 'diagnosis.unknownCodes.excludedMessage',
      details: { count: unknownTokens.length, tokens: unknownTokens.slice(0, UNKNOWN_TOKEN_PENALTY_MAX_TOKENS).join(', ') },
      tokens: unknownTokens,
      ...(unknownDays.length > 0 ? { affectedDays: unknownDays } : {}),
      recovery: hasCodeQuestions ? 'answer-question' : 'none',
      safeToImportPartial: !blocking,
      stage: 'classification',
    });
  }

  // --- 3. Zero shifts -------------------------------------------------------
  if (shifts.length === 0) {
    const blocking = true;
    diagnostics.push({
      code: 'NO_SHIFTS_FOUND',
      severity: 'error',
      blocking,
      recoverable: questions.length > 0,
      messageKey: noShiftsReasonKey(result, itemAnalysis),
      recovery: questions.length > 0 ? 'answer-question' : 'none',
      safeToImportPartial: false,
      stage: 'analysis',
    });
    return finishDiagnosis(
      questions.length > 0 ? 'NEEDS_USER_INPUT' : 'BLOCKED',
      diagnostics,
      {
        recognizedTokens: itemAnalysis?.recognizedTokens ?? 0,
        totalTokens: itemAnalysis?.totalTokens ?? 0,
        expectedDays,
        mappedDays: 0,
        unresolvedDays,
        unresolvedTokens: unknownTokens,
      },
    );
  }

  if (diagnostics.some((diagnostic) => diagnostic.blocking)) {
    return finishDiagnosis('NEEDS_USER_INPUT', diagnostics, {
      recognizedTokens: itemAnalysis?.recognizedTokens ?? 0,
      totalTokens: itemAnalysis?.totalTokens ?? 0,
      expectedDays,
      mappedDays,
      unresolvedDays,
      unresolvedTokens: unknownTokens,
    });
  }

  // --- 5. Partial extraction -------------------------------------------------
  if (partial && partial.mapped < partial.expected) {
    diagnostics.push({
      code: 'PARTIAL_EXTRACTION',
      severity: 'warning',
      blocking: false,
      recoverable: questions.length > 0,
      messageKey: 'diagnosis.partial.message',
      details: { recognized: partial.mapped, expected: partial.expected },
      recovery: questions.length > 0 ? 'answer-question' : 'none',
      // Current product contract: the preview is editable and partial import
      // of the resolved days is allowed — with the gap made explicit.
      safeToImportPartial: true,
      stage: 'mapping',
    });
    return finishDiagnosis('PARTIAL', diagnostics, {
      recognizedTokens: itemAnalysis?.recognizedTokens ?? 0,
      totalTokens: itemAnalysis?.totalTokens ?? 0,
      expectedDays,
      mappedDays,
      unresolvedDays,
      unresolvedTokens: unknownTokens,
    });
  }

  // --- 6. Ready ----------------------------------------------------------------
  return finishDiagnosis('READY', diagnostics, {
    recognizedTokens: itemAnalysis?.recognizedTokens ?? 0,
    totalTokens: itemAnalysis?.totalTokens ?? 0,
    expectedDays,
    mappedDays,
    unresolvedDays,
    unresolvedTokens: unknownTokens,
  });
}

function finishDiagnosis(
  state: ImportState,
  diagnostics: ImportDiagnostic[],
  summary: ImportDiagnosis['summary'],
): ImportDiagnosis {
  return { state, diagnostics, summary };
}

/**
 * Diagnosis for a thrown import failure (UNSUPPORTED_FORMAT, MALFORMED_INPUT,
 * parser crashes like the known XLSX defect, OCR failures). The UI renders
 * this instead of a raw exception — no parser names, no stack traces.
 */
export function diagnosisFromError(error: unknown): ImportDiagnosis {
  const code: IngestionErrorCode = error instanceof IngestionError ? error.code : 'PARSER_FAILURE';
  const unsupported = code === 'UNSUPPORTED_FORMAT' || code === 'UNSUPPORTED_LAYOUT';
  const diagnostic: ImportDiagnostic = {
    code: unsupported ? code : code === 'PARSER_FAILURE' ? 'PARSER_FAILURE' : code,
    severity: 'error',
    blocking: true,
    recoverable: false,
    messageKey: `diagnosis.error.${code}`,
    recovery: unsupported || code === 'MALFORMED_INPUT' ? 'reupload' : 'none',
    safeToImportPartial: false,
    stage: 'extraction',
  };
  return {
    state: unsupported ? 'UNSUPPORTED' : 'FAILED',
    diagnostics: [diagnostic],
    summary: {
      recognizedTokens: 0,
      totalTokens: 0,
      expectedDays: 0,
      mappedDays: 0,
      unresolvedDays: [],
      unresolvedTokens: [],
    },
  };
}

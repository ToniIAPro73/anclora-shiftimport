/**
 * Structured import diagnosis + guided recovery (Phase 1B) — acceptance
 * coverage for the GN-06 / GS-10 / month-mismatch / partial-extraction
 * product rules. Fixtures are synthetic (see fixtures/type-a.fixture.ts).
 */
import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { loadFormatProfiles, saveFormatProfile } from '../lib/format-profiles';
import { resolveShiftTypeId } from '../lib/shift-types';
import { ImportResult } from '../lib/import-quality';
import { ParsedCalendarShift } from '../lib/import-types';
import {
  buildCodeOverridesFromAnswers,
  buildProfileFromAnswers,
  generateAssistantQuestions,
} from './assistant';
import { analyzeItemsForImport, analyzeShiftsFromItems } from './analysis';
import { buildImportDiagnosis, diagnosisFromError } from './diagnostics';
import { IngestionError } from '../lib/ingestion-errors';
import { parseShiftsFromItems, detectCalendarContextFromItems } from './parsers/parse-items';
import { DocumentAnalysisResult } from './parsers/file';
import {
  TYPE_A_FIXTURE_ITEMS,
  TYPE_A_SELECTOR,
} from './fixtures/type-a.fixture';

setupLocalStorageMock();

const CONTEXT = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS); // agosto 2026

function makeQuality(shifts: ParsedCalendarShift[], overrides: Partial<ImportResult> = {}): ImportResult {
  return { shifts, confidence: 1, warnings: [], state: 'CORRECT', ...overrides };
}

function makeResult(overrides: Partial<DocumentAnalysisResult> = {}): DocumentAnalysisResult {
  const shifts = overrides.shifts ?? [];
  return {
    kind: 'pdf',
    context: CONTEXT,
    shifts,
    quality: makeQuality(shifts),
    structure: null,
    questions: [],
    ...overrides,
  };
}

describe('buildImportDiagnosis — canonical states', () => {
  it('READY: clean result with shifts and no warnings', () => {
    const shifts = [
      { date: '2026-08-01', startTime: '17:00', endTime: '01:00', isValid: true, confidence: 1, rawText: 'x' },
    ];
    const diagnosis = buildImportDiagnosis(makeResult({ shifts, quality: makeQuality(shifts) }));
    expect(diagnosis.state).toBe('READY');
    expect(diagnosis.diagnostics.every((diagnostic) => !diagnostic.blocking)).toBe(true);
  });

  it('A2. incomplete work times (??:??): PARTIAL + INCOMPLETE_TIMES, never READY', () => {
    const shifts = [
      { date: '2026-08-01', startTime: '10:00', endTime: '??:??', shiftType: 'Regular', isValid: false, confidence: 0.9, rawText: '10:00' },
      { date: '2026-08-02', startTime: '10:00', endTime: '12:00', shiftType: 'Regular', isValid: true, confidence: 0.9, rawText: 'x' },
      { date: '2026-08-03', startTime: '', endTime: '', shiftType: 'Libre', isValid: true, confidence: 1, rawText: 'OFF' },
    ];
    const diagnosis = buildImportDiagnosis(makeResult({ shifts, quality: makeQuality(shifts) }));

    expect(diagnosis.state).toBe('PARTIAL');
    const diagnostic = diagnosis.diagnostics.find((entry) => entry.code === 'INCOMPLETE_TIMES');
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.blocking).toBe(false);
    expect(diagnostic?.recoverable).toBe(true);
    expect(diagnostic?.safeToImportPartial).toBe(true);
    // Only the work row with the missing end time is named — the complete
    // row and the absence row (typed, no times) are not.
    expect(diagnostic?.affectedDays).toEqual([1]);
  });

  it('A. GN-06: zero shifts is BLOCKED with NO_SHIFTS_FOUND — never READY', () => {
    const diagnosis = buildImportDiagnosis(makeResult({
      shifts: [],
      quality: makeQuality([], { state: 'CORRECT', warnings: [{ code: 'PARTIAL_EXTRACTION' }] }),
    }));
    expect(diagnosis.state).toBe('BLOCKED');
    const diagnostic = diagnosis.diagnostics.find((entry) => entry.code === 'NO_SHIFTS_FOUND');
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.blocking).toBe(true);
    expect(diagnostic?.messageKey).toMatch(/^diagnosis\.noShifts\./);
  });

  it('B/C. unknown codes: blocking UNKNOWN_SHIFT_CODES, questions, affected days', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const { shifts, quality } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
    const result = makeResult({ shifts, quality, questions, structure: analysis.structure });

    const diagnosis = buildImportDiagnosis(result, { itemAnalysis: analysis });

    expect(diagnosis.state).toBe('NEEDS_USER_INPUT');
    const diagnostic = diagnosis.diagnostics.find((entry) => entry.code === 'UNKNOWN_SHIFT_CODES');
    expect(diagnostic?.blocking).toBe(true);
    expect(diagnostic?.recoverable).toBe(true);
    // Both codes accounted for — no silent omission.
    expect(diagnostic?.tokens?.sort()).toEqual(['AJ', 'DL']);
    expect(diagnostic?.affectedDays).toEqual([3, 5]);
    // One deterministic question per code.
    expect(questions.filter((question) => question.kind === 'shift-code')).toEqual([
      { kind: 'shift-code', code: 'DL' },
      { kind: 'shift-code', code: 'AJ' },
    ]);
  });

  it('B. guided recovery: defining the codes re-parses the missing days and persists the learning', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    // Real fixture tokens: DL (day 3) as rest, AJ (day 5) as work with times.
    const realAnswers = {
      tokenMeanings: {
        DL: { kind: 'rest' as const, shiftTypeId: 'Libre' },
        AJ: { kind: 'work' as const, startTime: '08:00', endTime: '16:00' },
      },
    };

    const overrides = buildCodeOverridesFromAnswers(realAnswers);
    const reparsed = parseShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR, overrides);
    const dates = reparsed.map((shift) => shift.date);
    expect(dates).toContain('2026-08-03'); // DL → Libre
    expect(dates).toContain('2026-08-05'); // AJ → work 08:00–16:00
    const aj = reparsed.find((shift) => shift.date === '2026-08-05');
    expect(aj?.startTime).toBe('08:00');
    expect(aj?.endTime).toBe('16:00');

    // Learning persisted through the EXISTING override storage (no new mechanism).
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, realAnswers);
    expect(profile.tokenAliases).toEqual({ DL: 'Libre', AJ: 'Regular' });
    expect(profile.codeTimes).toEqual({ AJ: { startTime: '08:00', endTime: '16:00' } });

    saveFormatProfile(profile);
    // Repeat import of the same layout resolves the codes silently.
    const again = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(again.analysis.unknownTokens).toEqual([]);
    expect(again.shifts.map((shift) => shift.date)).toContain('2026-08-05');
    expect(resolveShiftTypeId('DL')).toBeNull(); // aliases applied by the panel, not the profile builder
  });

  it('B. dismissed recovery downgrades to an explicit exclusion — still not silent', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const { shifts, quality } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const result = makeResult({ shifts, quality, questions: [], structure: analysis.structure });

    const diagnosis = buildImportDiagnosis(result, { itemAnalysis: analysis, recoveryDismissed: true });
    const diagnostic = diagnosis.diagnostics.find((entry) => entry.code === 'UNKNOWN_SHIFT_CODES');
    expect(diagnostic?.blocking).toBe(false);
    expect(diagnostic?.messageKey).toBe('diagnosis.unknownCodes.excludedMessage');
    expect(diagnostic?.affectedDays).toEqual([3, 5]);
  });

  it('D. month mismatch: blocking until the user decides; never re-dates silently', () => {
    const shifts = [
      { date: '2026-08-01', startTime: '17:00', endTime: '01:00', isValid: true, confidence: 1, rawText: 'x' },
    ];
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const result = makeResult({
      shifts,
      quality: makeQuality(shifts),
      structure: analysis.structure, // periodDetected: true for the fixture
      detectedContext: { month: 7, year: 2026 }, // document: agosto
    });

    const pending = buildImportDiagnosis(result, {
      itemAnalysis: analysis,
      selectedContext: { month: 9, year: 2026 }, // user: octubre
    });
    expect(pending.state).toBe('NEEDS_USER_INPUT');
    const mismatch = pending.diagnostics.find((entry) => entry.code === 'MONTH_MISMATCH');
    expect(mismatch?.blocking).toBe(true);
    expect(mismatch?.recovery).toBe('choose-period');
    expect(mismatch?.details).toMatchObject({ selectedMonth: 9, detectedMonth: 7 });

    const resolved = buildImportDiagnosis(result, {
      itemAnalysis: analysis,
      selectedContext: { month: 9, year: 2026 },
      periodConflictResolved: true,
    });
    expect(resolved.diagnostics.find((entry) => entry.code === 'MONTH_MISMATCH')?.blocking).toBe(false);
    expect(resolved.state).not.toBe('NEEDS_USER_INPUT');
  });

  it('D. TYPE_MULTI: covered months are fine, an uncovered selection is a blocking conflict', () => {
    const result = makeResult({
      detectedContext: { month: 8, year: 2026 },
      coveredPeriods: [
        { month: 8, year: 2026 },
        { month: 9, year: 2026 },
      ],
    });

    // September IS covered by the document — no conflict.
    const covered = buildImportDiagnosis(result, { selectedContext: { month: 9, year: 2026 } });
    expect(covered.diagnostics.some((entry) => entry.code === 'MONTH_MISMATCH')).toBe(false);

    // August is NOT covered — blocking conflict, nothing parsed cross-month.
    const conflict = buildImportDiagnosis(result, { selectedContext: { month: 7, year: 2026 } });
    expect(conflict.state).toBe('NEEDS_USER_INPUT');
    const mismatch = conflict.diagnostics.find((entry) => entry.code === 'MONTH_MISMATCH');
    expect(mismatch?.blocking).toBe(true);
    expect(mismatch?.details).toMatchObject({ selectedMonth: 7, detectedMonth: 8 });
  });

  it('D. no period evidence, no conflict (structure-less result)', () => {
    const shifts = [
      { date: '2026-10-01', startTime: '08:00', endTime: '16:00', isValid: true, confidence: 1, rawText: 'x' },
    ];
    const result = makeResult({
      shifts,
      quality: makeQuality(shifts),
      detectedContext: { month: 8, year: 2026 },
    });
    const diagnosis = buildImportDiagnosis(result, {
      itemAnalysis: null,
      selectedContext: { month: 9, year: 2026 },
    });
    // structure is null here — without period evidence there is no conflict.
    expect(diagnosis.diagnostics.some((entry) => entry.code === 'MONTH_MISMATCH')).toBe(false);
  });

  it('E. partial extraction: PARTIAL state with counts and unresolved days named', () => {
    const shifts = [
      { date: '2026-08-01', startTime: '17:00', endTime: '01:00', isValid: true, confidence: 1, rawText: 'x' },
    ];
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const result = makeResult({
      shifts,
      quality: makeQuality(shifts, {
        state: 'REVIEW',
        warnings: [{ code: 'PARTIAL_EXTRACTION', context: { expected: 31, mapped: 26 } }],
      }),
    });
    const diagnosis = buildImportDiagnosis(result, { itemAnalysis: analysis });
    expect(diagnosis.state).toBe('PARTIAL');
    const diagnostic = diagnosis.diagnostics.find((entry) => entry.code === 'PARTIAL_EXTRACTION');
    expect(diagnostic?.blocking).toBe(false);
    expect(diagnostic?.safeToImportPartial).toBe(true);
    expect(diagnostic?.details).toEqual({ recognized: 26, expected: 31 });
    expect(diagnosis.summary.unresolvedDays.length).toBeGreaterThan(0);
  });

  it('F. employee recovery: row question maps to UNKNOWN/AMBIGUOUS diagnostics', () => {
    const noneAnalysis = analyzeItemsForImport(
      TYPE_A_FIXTURE_ITEMS,
      CONTEXT,
      { employeeName: 'Nadie', employeeIdentifiers: [] },
    );
    const noneQuestions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, noneAnalysis);
    const noneResult = makeResult({
      questions: noneQuestions,
      quality: makeQuality([], { state: 'UNRECOGNIZED', confidence: 0.2 }),
      structure: noneAnalysis.structure,
    });
    const noneDiagnosis = buildImportDiagnosis(noneResult, { itemAnalysis: noneAnalysis });
    expect(noneDiagnosis.state).toBe('NEEDS_USER_INPUT');
    const employee = noneDiagnosis.diagnostics.find((entry) => entry.code === 'UNKNOWN_EMPLOYEE');
    expect(employee?.blocking).toBe(true);
    expect(employee?.recoverable).toBe(true);
    expect(noneDiagnosis.recovery).toEqual({
      eligible: true,
      strategy: 'answer-question',
      reason: 'UNKNOWN_EMPLOYEE',
    });
  });

  it('diagnosisFromError: parser crashes and unsupported formats never leak raw exceptions', () => {
    const unsupported = diagnosisFromError(new IngestionError('UNSUPPORTED_FORMAT', '...'));
    expect(unsupported.state).toBe('UNSUPPORTED');
    expect(unsupported.diagnostics[0].messageKey).toBe('diagnosis.error.UNSUPPORTED_FORMAT');
    expect(unsupported.diagnostics[0].blocking).toBe(true);
    expect(unsupported.recovery).toEqual({
      eligible: false,
      strategy: 'reupload',
      reason: 'UNSUPPORTED_FORMAT',
    });

    const crash = diagnosisFromError(new TypeError('cell.value is not iterable'));
    expect(crash.state).toBe('FAILED');
    expect(crash.diagnostics[0].code).toBe('PARSER_FAILURE');
    expect(crash.recovery).toEqual({
      eligible: false,
      strategy: 'none',
      reason: 'PARSER_FAILURE',
    });
    expect(JSON.stringify(crash)).not.toContain('cell.value');
  });
});

describe('I. privacy boundary', () => {
  it('learned profiles carry tokens/times only — never names or ids', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, {
      selectedRow: { label: 'Ana Martinez (1001)', page: 1, y: 200, rowIndex: 1 },
      tokenMeanings: {
        DL: { kind: 'rest', shiftTypeId: 'Libre' },
        AJ: { kind: 'work', startTime: '08:00', endTime: '16:00' },
      },
    });
    saveFormatProfile(profile);
    const serialized = JSON.stringify(loadFormatProfiles());
    for (const pii of ['Ana', 'Martinez', 'Carlos', 'Ruiz', '1001', '1002']) {
      expect(serialized.includes(pii)).toBe(false);
    }
  });
});

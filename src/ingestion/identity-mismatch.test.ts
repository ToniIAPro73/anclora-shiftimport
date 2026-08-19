/**
 * Identity cross-check regression tests (M0 data-integrity fix).
 *
 * A typed name and a typed employee id resolving to DIFFERENT employees must
 * never silently prefer the id: the import blocks with an IDENTITY_MISMATCH
 * diagnostic until the user explicitly picks the correct detected row.
 * Id-only and name-only resolutions still auto-match; neither-resolving
 * keeps the existing row-selection assistant flow.
 *
 * All fixtures are synthetic (fixtures/type-a.fixture.ts) — no real PII.
 */
import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { IngestionError } from '../lib/ingestion-errors';
import { analyzeItemsForImport, analyzeShiftsFromItems } from './analysis';
import {
  findEmployeeRowCandidates,
  generateAssistantQuestions,
  selectorForCandidate,
} from './assistant';
import { detectIdentityMismatch } from './core/row-detection';
import { buildImportDiagnosis } from './diagnostics';
import { DocumentAnalysisResult } from './parsers/file';
import { detectCalendarContextFromItems, parseShiftsFromItems } from './parsers/parse-items';
import { TYPE_A_PROFILE } from './profiles/type-a';
import {
  TYPE_A_EXPECTED,
  TYPE_A_FIXTURE_ITEMS,
  TYPE_A_SELECTOR,
} from './fixtures/type-a.fixture';

setupLocalStorageMock();

const CONTEXT = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS); // agosto 2026

const summarize = (shifts: ReturnType<typeof analyzeShiftsFromItems>['shifts']) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

/** 'Carlos Ruiz' (printed row, id 1002) typed with Ana's id (1001). */
const MISMATCH_SELECTOR = { employeeName: 'Carlos Ruiz', employeeIdentifiers: ['1001'] };

describe('identity cross-check — resolution rules', () => {
  it('name + id resolving to the same employee auto-match (strong)', () => {
    expect(detectIdentityMismatch(TYPE_A_FIXTURE_ITEMS, TYPE_A_SELECTOR, TYPE_A_PROFILE.rowWindow)).toBe(false);

    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(analysis.employeeMatch).toBe('strong');

    const { shifts } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED);
  });

  it('valid id / unknown name: the id match is accepted', () => {
    const selector = { employeeName: 'Persona Desconocida', employeeIdentifiers: ['1001'] };
    expect(detectIdentityMismatch(TYPE_A_FIXTURE_ITEMS, selector, TYPE_A_PROFILE.rowWindow)).toBe(false);

    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector);
    expect(analysis.employeeMatch).toBe('strong');

    const { shifts } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector);
    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED);
  });

  it('valid name / unknown id: the name match is accepted (absent id never vetoes)', () => {
    const selector = { employeeName: 'Ana Martinez', employeeIdentifiers: ['9999'] };
    expect(detectIdentityMismatch(TYPE_A_FIXTURE_ITEMS, selector, TYPE_A_PROFILE.rowWindow)).toBe(false);

    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector);
    expect(analysis.employeeMatch).toBe('strong');

    const { shifts } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector);
    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED);
  });

  it('name and id resolving to different employees: mismatch, nothing is parsed', () => {
    expect(detectIdentityMismatch(TYPE_A_FIXTURE_ITEMS, MISMATCH_SELECTOR, TYPE_A_PROFILE.rowWindow)).toBe(true);

    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, MISMATCH_SELECTOR);
    expect(analysis.employeeMatch).toBe('mismatch');
    expect(analysis.rowItems).toBeNull();
    expect(analysis.totalTokens).toBe(0);

    const { shifts, quality, analysis: fullAnalysis } = analyzeShiftsFromItems(
      TYPE_A_FIXTURE_ITEMS,
      CONTEXT,
      MISMATCH_SELECTOR,
    );
    expect(shifts).toEqual([]);
    expect(fullAnalysis.employeeMatch).toBe('mismatch');
    expect(quality.state).toBe('UNRECOGNIZED');
    expect(quality.confidence).toBeLessThanOrEqual(0.2);

    // The parser itself refuses: no silent id precedence at any entry point.
    try {
      parseShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, MISMATCH_SELECTOR);
      expect.unreachable('parseShiftsFromItems must throw on identity mismatch');
    } catch (error) {
      expect(error).toBeInstanceOf(IngestionError);
      expect((error as IngestionError).code).toBe('IDENTITY_MISMATCH');
    }
  });

  it('neither name nor id resolves: none + the existing row-selection assistant', () => {
    const selector = { employeeName: 'Nadie Conocido', employeeIdentifiers: ['9999'] };

    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector);
    expect(analysis.employeeMatch).toBe('none');

    const { shifts } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector);
    expect(shifts).toEqual([]);

    const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
    expect(questions.some((question) => question.kind === 'row-selection')).toBe(true);

    const result: DocumentAnalysisResult = {
      kind: 'pdf',
      context: CONTEXT,
      shifts,
      quality: analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector).quality,
      structure: analysis.structure,
      questions,
    };
    const diagnosis = buildImportDiagnosis(result, { itemAnalysis: analysis });
    expect(diagnosis.state).toBe('NEEDS_USER_INPUT');
    expect(diagnosis.diagnostics.find((entry) => entry.code === 'UNKNOWN_EMPLOYEE')?.blocking).toBe(true);
    expect(diagnosis.diagnostics.some((entry) => entry.code === 'IDENTITY_MISMATCH')).toBe(false);
  });
});

describe('identity mismatch — guided recovery', () => {
  it('emits a blocking IDENTITY_MISMATCH diagnostic; the import can never reach READY on its own', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, MISMATCH_SELECTOR);
    const { shifts, quality } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, MISMATCH_SELECTOR);
    const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);

    // The row-selection question is offered so the user can pick the row.
    expect(questions.some((question) => question.kind === 'row-selection')).toBe(true);

    const result: DocumentAnalysisResult = {
      kind: 'pdf',
      context: CONTEXT,
      shifts,
      quality,
      structure: analysis.structure,
      questions,
    };
    const diagnosis = buildImportDiagnosis(result, { itemAnalysis: analysis });

    expect(diagnosis.state).toBe('NEEDS_USER_INPUT');
    expect(diagnosis.state).not.toBe('READY');
    const diagnostic = diagnosis.diagnostics.find((entry) => entry.code === 'IDENTITY_MISMATCH');
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.blocking).toBe(true);
    expect(diagnostic?.recoverable).toBe(true);
    expect(diagnostic?.messageKey).toBe('diagnosis.employee.mismatchMessage');
    expect(diagnostic?.recovery).toBe('answer-question');
  });

  it('human selection unblocks: picking the correct row parses exactly its shifts', () => {
    const candidates = findEmployeeRowCandidates(TYPE_A_FIXTURE_ITEMS, TYPE_A_PROFILE);
    const picked = candidates.find((candidate) => candidate.label.includes('Ana Martinez'));
    expect(picked).toBeDefined();

    const sessionSelector = selectorForCandidate(TYPE_A_FIXTURE_ITEMS, picked!, TYPE_A_PROFILE);
    // The session selector is internally consistent, so no mismatch fires.
    expect(detectIdentityMismatch(TYPE_A_FIXTURE_ITEMS, sessionSelector, TYPE_A_PROFILE.rowWindow)).toBe(false);

    const shifts = parseShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, sessionSelector);
    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED);
  });
});

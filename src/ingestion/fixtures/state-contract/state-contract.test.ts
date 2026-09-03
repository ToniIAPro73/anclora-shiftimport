/**
 * Automated state-contract test (see ./README.md): one fixture per
 * `ImportState` value, run through the real pipeline
 * (`analyzeDocumentFile`/`diagnosisFromError` + `buildImportDiagnosis`) and
 * asserted against the single source of truth (`ImportDiagnosis.state` /
 * `.recovery`) — never a value the UI recomputes on its own.
 */
import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../../test-utils/local-storage';
import { IngestionError } from '../../../lib/ingestion-errors';
import { analyzeDocumentFile, DocumentAnalysisResult } from '../../parsers/file';
import { detectCalendarContextFromItems } from '../../parsers/parse-items';
import { buildImportDiagnosis, diagnosisFromError, ImportDiagnosis, ImportState } from '../../diagnostics';
import { analyzeItemsForImport } from '../../analysis';
import { generateAssistantQuestions } from '../../assistant';
import { TYPE_A_FIXTURE_ITEMS } from '../type-a.fixture';

setupLocalStorageMock();

const makeFile = (name: string, content: string | BlobPart[], type = '') =>
  new File(typeof content === 'string' ? [content] : content, name, { type });

const ANA_SELECTOR = { employeeName: 'Ana Martinez', employeeIdentifiers: [] };
const CONTEXT = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS); // agosto 2026

describe('state contract — six canonical fixtures', () => {
  it('01_READY: complete roster CSV → READY, no assistant needed, nothing to recover', async () => {
    const csv = [
      'fecha,inicio,fin,tipo',
      '01/08/2026,08:00,16:00,Regular',
      '02/08/2026,,,Libre',
    ].join('\n');
    const file = makeFile('ready.csv', csv, 'text/csv');
    const result = await analyzeDocumentFile(file, ANA_SELECTOR, undefined, { month: 7, year: 2026 });
    const diagnosis = buildImportDiagnosis(result);

    expect(diagnosis.state).toBe<ImportState>('READY');
    expect(result.questions).toEqual([]); // assistant gate: analysis.questions.length > 0
    expect(diagnosis.recovery).toEqual({ eligible: false, strategy: 'none', reason: 'NONE' });
  });

  it('02_NEEDS_USER_INPUT: unrecognized employee on a known PDF layout → assistant, recovery eligible', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, { employeeName: 'Nadie', employeeIdentifiers: [] });
    const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
    const result: DocumentAnalysisResult = {
      kind: 'pdf',
      context: CONTEXT,
      shifts: [],
      quality: { shifts: [], confidence: 0.2, warnings: [], state: 'UNRECOGNIZED' },
      structure: analysis.structure,
      questions,
    };
    const diagnosis = buildImportDiagnosis(result, { itemAnalysis: analysis });

    expect(diagnosis.state).toBe<ImportState>('NEEDS_USER_INPUT');
    expect(questions.length).toBeGreaterThan(0);
    expect(diagnosis.recovery.eligible).toBe(true);
    expect(diagnosis.recovery.strategy).toBe('answer-question');
  });

  it('03_PARTIAL: one incomplete work shift among valid ones → PARTIAL, valid rows stay visible', () => {
    const shifts = [
      { date: '2026-08-01', startTime: '10:00', endTime: '??:??', shiftType: 'Regular', isValid: false, confidence: 0.9, rawText: '10:00' },
      { date: '2026-08-02', startTime: '10:00', endTime: '12:00', shiftType: 'Regular', isValid: true, confidence: 0.9, rawText: 'x' },
      { date: '2026-08-03', startTime: '', endTime: '', shiftType: 'Libre', isValid: true, confidence: 1, rawText: 'OFF' },
    ];
    const result: DocumentAnalysisResult = {
      kind: 'pdf',
      context: CONTEXT,
      shifts,
      quality: { shifts, confidence: 0.9, warnings: [], state: 'CORRECT' },
      structure: null,
      questions: [],
    };
    const diagnosis = buildImportDiagnosis(result);

    expect(diagnosis.state).toBe<ImportState>('PARTIAL');
    // Preview is never emptied to force resolution: the two complete rows
    // (one work, one absence) stay in the working set.
    expect(shifts.filter((shift) => shift.isValid)).toHaveLength(2);
  });

  it('04_BLOCKED: XLSX with zero recognizable employees → BLOCKED, explained, not a terminal exception', { timeout: 20000 }, async () => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Hoja1').addRow(['esto no es un cuadrante reconocible']);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = makeFile('vacio.xlsx', [buffer], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Regression: this used to `throw NO_SHIFTS_FOUND` and land on FAILED
    // (diagnosisFromError) — now it returns a structured result instead.
    const result = await analyzeDocumentFile(file, ANA_SELECTOR, undefined, { month: 7, year: 2026 });
    const diagnosis = buildImportDiagnosis(result);

    expect(diagnosis.state).toBe<ImportState>('BLOCKED');
    expect(diagnosis.diagnostics.some((diagnostic) => diagnostic.code === 'NO_SHIFTS_FOUND')).toBe(true);
    // Excel has no question engine yet: honestly non-recoverable, but this
    // is a structured diagnosis, never a raw/technical exception.
    expect(diagnosis.recovery.eligible).toBe(false);
  });

  it('05_UNSUPPORTED: .txt upload → UNSUPPORTED, no assistant, clear explanation', async () => {
    const file = makeFile('turnos.txt', 'EMP-01 2026-10-01 08:00-16:00', 'text/plain');
    await expect(analyzeDocumentFile(file, ANA_SELECTOR)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });

    const diagnosis = diagnosisFromError(new IngestionError('UNSUPPORTED_FORMAT', '...'));
    expect(diagnosis.state).toBe<ImportState>('UNSUPPORTED');
    expect(diagnosis.recovery.eligible).toBe(false);
    expect(diagnosis.recovery.strategy).toBe('reupload');
  });

  it('06_FAILED_TECHNICAL: malformed CSV quoting → FAILED, technical, no stack trace leaked', async () => {
    const file = makeFile('malformado.csv', 'fecha,inicio,fin,tipo\n"01/08/2026,08:00,16:00,Regular', 'text/csv');
    let caught: unknown;
    try {
      await analyzeDocumentFile(file, ANA_SELECTOR);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(IngestionError);
    expect((caught as IngestionError).code).toBe('MALFORMED_INPUT');
    const diagnosis = diagnosisFromError(caught);
    expect(diagnosis.state).toBe<ImportState>('FAILED');
    expect(diagnosis.recovery.eligible).toBe(false);
    expect(JSON.stringify(diagnosis)).not.toContain('01/08/2026'); // no document content leaked
  });
});

describe('state contract — parameterized matrix', () => {
  interface StateContractCase {
    id: string;
    name: string;
    expectedState: ImportState;
    assistantExpected: boolean;
    previewExpected: boolean;
    recoveryEligible: boolean;
    terminal: boolean;
    run: () => Promise<{
      diagnosis: import('../../diagnostics').ImportDiagnosis;
      hasAssistantQuestions: boolean;
      validShiftsCount: number;
    }>;
  }

  const matrixCases: StateContractCase[] = [
    {
      id: '01_READY',
      name: 'complete roster CSV',
      expectedState: 'READY',
      assistantExpected: false,
      previewExpected: true,
      recoveryEligible: false,
      terminal: false,
      run: async () => {
        const csv = [
          'fecha,inicio,fin,tipo',
          '01/08/2026,08:00,16:00,Regular',
          '02/08/2026,,,Libre',
        ].join('\n');
        const file = makeFile('ready.csv', csv, 'text/csv');
        const result = await analyzeDocumentFile(file, ANA_SELECTOR, undefined, { month: 7, year: 2026 });
        const diagnosis = buildImportDiagnosis(result);
        return {
          diagnosis,
          hasAssistantQuestions: result.questions.length > 0,
          validShiftsCount: result.shifts.filter((shift) => shift.isValid).length,
        };
      },
    },
    {
      id: '02_NEEDS_USER_INPUT',
      name: 'unrecognized employee on known layout',
      expectedState: 'NEEDS_USER_INPUT',
      assistantExpected: true,
      previewExpected: false,
      recoveryEligible: true,
      terminal: false,
      run: async () => {
        const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, { employeeName: 'Nadie', employeeIdentifiers: [] });
        const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
        const result: DocumentAnalysisResult = {
          kind: 'pdf',
          context: CONTEXT,
          shifts: [],
          quality: { shifts: [], confidence: 0.2, warnings: [], state: 'UNRECOGNIZED' },
          structure: analysis.structure,
          questions,
        };
        const diagnosis = buildImportDiagnosis(result, { itemAnalysis: analysis });
        return {
          diagnosis,
          hasAssistantQuestions: questions.length > 0,
          validShiftsCount: 0,
        };
      },
    },
    {
      id: '03_PARTIAL',
      name: 'mixed valid and incomplete shifts (pure time gap)',
      expectedState: 'PARTIAL',
      assistantExpected: false,
      previewExpected: true,
      recoveryEligible: false,
      terminal: false,
      run: async () => {
        const shifts = [
          { date: '2026-08-01', startTime: '10:00', endTime: '??:??', shiftType: 'Regular', isValid: false, confidence: 0.9, rawText: '10:00' },
          { date: '2026-08-02', startTime: '10:00', endTime: '12:00', shiftType: 'Regular', isValid: true, confidence: 0.9, rawText: 'x' },
          { date: '2026-08-03', startTime: '', endTime: '', shiftType: 'Libre', isValid: true, confidence: 1, rawText: 'OFF' },
        ];
        const result: DocumentAnalysisResult = {
          kind: 'pdf',
          context: CONTEXT,
          shifts,
          quality: { shifts, confidence: 0.9, warnings: [], state: 'CORRECT' },
          structure: null,
          questions: [],
        };
        const diagnosis = buildImportDiagnosis(result);
        return {
          diagnosis,
          hasAssistantQuestions: result.questions.length > 0,
          validShiftsCount: shifts.filter((shift) => shift.isValid).length,
        };
      },
    },
    {
      id: '04_BLOCKED',
      name: 'XLSX with zero recognizable employees',
      expectedState: 'BLOCKED',
      assistantExpected: false,
      previewExpected: false,
      recoveryEligible: false,
      terminal: true,
      run: async () => {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet('Hoja1').addRow(['esto no es un cuadrante reconocible']);
        const buffer = await workbook.xlsx.writeBuffer();
        const file = makeFile('vacio.xlsx', [buffer], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const result = await analyzeDocumentFile(file, ANA_SELECTOR, undefined, { month: 7, year: 2026 });
        const diagnosis = buildImportDiagnosis(result);
        return {
          diagnosis,
          hasAssistantQuestions: result.questions.length > 0,
          validShiftsCount: result.shifts.filter((shift) => shift.isValid).length,
        };
      },
    },
    {
      id: '05_UNSUPPORTED',
      name: 'unsupported file extension (.txt)',
      expectedState: 'UNSUPPORTED',
      assistantExpected: false,
      previewExpected: false,
      recoveryEligible: false,
      terminal: true,
      run: async () => {
        const file = makeFile('turnos.txt', 'EMP-01 2026-10-01 08:00-16:00', 'text/plain');
        let diagnosis: ImportDiagnosis;
        try {
          await analyzeDocumentFile(file, ANA_SELECTOR);
          throw new Error('should have failed');
        } catch (error) {
          diagnosis = diagnosisFromError(error);
        }
        return {
          diagnosis,
          hasAssistantQuestions: false,
          validShiftsCount: 0,
        };
      },
    },
    {
      id: '06_FAILED',
      name: 'technical failure (malformed CSV)',
      expectedState: 'FAILED',
      assistantExpected: false,
      previewExpected: false,
      recoveryEligible: false,
      terminal: true,
      run: async () => {
        const file = makeFile('malformado.csv', 'fecha,inicio,fin,tipo\n"01/08/2026,08:00,16:00,Regular', 'text/csv');
        let diagnosis: ImportDiagnosis;
        try {
          await analyzeDocumentFile(file, ANA_SELECTOR);
          throw new Error('should have failed');
        } catch (error) {
          diagnosis = diagnosisFromError(error);
        }
        return {
          diagnosis,
          hasAssistantQuestions: false,
          validShiftsCount: 0,
        };
      },
    },
  ];

  it.each(matrixCases)(
    '$id ($name) asserts expected contract: state=$expectedState, assistant=$assistantExpected, preview=$previewExpected, recovery=$recoveryEligible, terminal=$terminal',
    { timeout: 20000 },
    async ({ run, expectedState, assistantExpected, previewExpected, recoveryEligible, terminal }) => {
      const { diagnosis, hasAssistantQuestions, validShiftsCount } = await run();

      // 1. Exact state contract
      expect(diagnosis.state).toBe(expectedState);

      // 2. Assistant expectation: questions present + recovery strategy answer-question
      const showAssistant = hasAssistantQuestions && diagnosis.recovery.eligible && diagnosis.recovery.strategy === 'answer-question';
      expect(showAssistant).toBe(assistantExpected);

      // 3. Preview expectation: valid extracted rows displayed
      const showPreview = validShiftsCount > 0;
      expect(showPreview).toBe(previewExpected);

      // 4. Recovery eligibility
      expect(diagnosis.recovery.eligible).toBe(recoveryEligible);

      // 5. Terminal contract: BLOCKED, UNSUPPORTED, and FAILED are terminal in this architecture
      const isTerminal = diagnosis.state === 'BLOCKED' || diagnosis.state === 'UNSUPPORTED' || diagnosis.state === 'FAILED';
      expect(isTerminal).toBe(terminal);
    },
  );
});

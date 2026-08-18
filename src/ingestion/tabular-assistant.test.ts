/**
 * Tabular (CSV / non-positional) assistant — Phase 1A remediation.
 *
 * Covers the roster-CSV flows that used to dead-end at UNRECOGNIZED:
 * row disambiguation from the parsed table, token-meaning classification,
 * day-mapping for day-number grids and the safe-failure predicate. All
 * fixtures are synthetic; names are fictional.
 */
import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { loadFormatProfiles, saveFormatProfile } from '../lib/format-profiles';
import { EmployeeSelector } from './core/row-detection';
import { analyzeDocumentFile } from './parsers/file';
import {
  analyzeRosterTable,
  buildTabularImportResult,
  buildTabularProfileFromAnswers,
  dayNumberFromHeader,
  generateTabularQuestions,
  parseRosterTable,
  parseRosterTableWithAnswers,
} from './tabular-assistant';

setupLocalStorageMock();

const NADIE: EmployeeSelector = { employeeName: 'Nadie', employeeIdentifiers: [] };
const ANA: EmployeeSelector = { employeeName: 'Ana Martinez', employeeIdentifiers: [] };
const CONTEXT = { month: 7, year: 2026 }; // August 2026

const summarize = (shifts: ReturnType<typeof parseRosterTableWithAnswers>) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
  }));

// Canonical-style roster with an employee column (unknown to the selector).
const ROSTER_WITH_EMPLOYEE = [
  'fecha,empleado,inicio,fin',
  '01/08/2026,Ana Martinez,08:00,14:00',
  '02/08/2026,Carlos Ruiz,08:00,14:00',
  '03/08/2026,Ana Martinez,17:00,01:00',
].join('\n');

// Grid-style CSV: day-number column headers, one row per employee.
const GRID_CSV = [
  'Empleado,1,2,3',
  'Ana Martinez,08:00-16:00,OFF,ZZ',
  'Carlos Ruiz,OFF,OFF,OFF',
].join('\n');

describe('parseRosterTable', () => {
  it('parses headers and rows; rejects quoted and header-only content', () => {
    expect(parseRosterTable(GRID_CSV)).toEqual({
      headers: ['Empleado', '1', '2', '3'],
      rows: [
        ['Ana Martinez', '08:00-16:00', 'OFF', 'ZZ'],
        ['Carlos Ruiz', 'OFF', 'OFF', 'OFF'],
      ],
    });
    expect(parseRosterTable('a,b\n')).toBeNull();
    expect(parseRosterTable('a,b\n"c",d')).toBeNull();
    expect(parseRosterTable('solo\nlineas\nsueltas')).toBeNull();
  });
});

describe('analyzeRosterTable', () => {
  it('detects date/employee columns and selector matches in a roster', () => {
    const table = parseRosterTable(ROSTER_WITH_EMPLOYEE)!;
    const analysis = analyzeRosterTable(table, ANA);
    expect(analysis.dateColumnIndex).toBe(0);
    expect(analysis.employeeColumnIndex).toBe(1);
    expect(analysis.matchingRowIndices).toEqual([0, 2]);
    expect(analysis.dayHeaderColumns).toEqual([]);
    expect(analysis.valueColumnIndices).toEqual([2, 3]);
    expect(analysis.unknownTokens).toEqual([]);
  });

  it('detects a date column by content when the header has no alias', () => {
    const table = parseRosterTable('when,detail\n2026-08-01,OFF\n2026-08-02,08:00-14:00')!;
    expect(analyzeRosterTable(table, NADIE).dateColumnIndex).toBe(0);
  });

  it('detects day-number grid columns and falls back to the leftmost label column', () => {
    const table = parseRosterTable(GRID_CSV)!;
    const analysis = analyzeRosterTable(table, NADIE);
    expect(analysis.dateColumnIndex).toBeNull();
    expect(analysis.dayHeaderColumns).toEqual([1, 2, 3]);
    expect(analysis.employeeColumnIndex).toBe(0); // alias 'empleado'
    expect(analysis.unknownTokens).toEqual(['ZZ']);

    const noAlias = parseRosterTable('Operario,1,2\nAna Martinez,08:00-16:00,OFF')!;
    expect(analyzeRosterTable(noAlias, NADIE).employeeColumnIndex).toBe(0);
  });

  it('dayNumberFromHeader parses plain, dd/mm and ISO day headers', () => {
    expect(dayNumberFromHeader('1')).toBe(1);
    expect(dayNumberFromHeader('05')).toBe(5);
    expect(dayNumberFromHeader('32')).toBeNull();
    expect(dayNumberFromHeader('07/08')).toBe(7);
    expect(dayNumberFromHeader('2026-08-09')).toBe(9);
    expect(dayNumberFromHeader('LUN')).toBeNull();
  });
});

describe('generateTabularQuestions', () => {
  it('roster with unmatched selector: row-selection with distinct candidates', () => {
    const table = parseRosterTable(ROSTER_WITH_EMPLOYEE)!;
    const questions = generateTabularQuestions(table, analyzeRosterTable(table, NADIE));
    expect(questions).toEqual([
      {
        kind: 'row-selection',
        candidates: [
          { label: 'Ana Martinez', page: 0, y: 0, rowIndex: 0 },
          { label: 'Carlos Ruiz', page: 0, y: 0, rowIndex: 1 },
        ],
      },
    ]);
  });

  it('uniquely matched selector: no row-selection question', () => {
    const table = parseRosterTable(ROSTER_WITH_EMPLOYEE)!;
    const questions = generateTabularQuestions(table, analyzeRosterTable(table, ANA));
    expect(questions.some((q) => q.kind === 'row-selection')).toBe(false);
  });

  it('unknown value tokens produce token-meaning questions', () => {
    const table = parseRosterTable('fecha,detalle\n01/08/2026,XX\n02/08/2026,YY')!;
    const questions = generateTabularQuestions(table, analyzeRosterTable(table, NADIE));
    expect(questions).toEqual([
      { kind: 'token-meaning', token: 'XX' },
      { kind: 'token-meaning', token: 'YY' },
    ]);
  });

  it('grid CSV: day-mapping anchored at the first day column plus token questions', () => {
    const table = parseRosterTable(GRID_CSV)!;
    const questions = generateTabularQuestions(table, analyzeRosterTable(table, NADIE));
    const dayMapping = questions.find((q) => q.kind === 'day-mapping');
    expect(dayMapping).toEqual({
      kind: 'day-mapping',
      columnIndex: 1,
      sampleTokens: ['1', '08:00-16:00', 'OFF'],
      proposedDay: 1,
    });
    expect(questions.some((q) => q.kind === 'row-selection')).toBe(true);
    expect(questions).toContainEqual({ kind: 'token-meaning', token: 'ZZ' });
  });

  it('safe failure: no date column AND no day headers → no questions', () => {
    const table = parseRosterTable('foo,bar\nbaz,qux')!;
    expect(generateTabularQuestions(table, analyzeRosterTable(table, NADIE))).toEqual([]);
  });
});

describe('buildTabularProfileFromAnswers', () => {
  it('stores rowIndex strategy and tabular column memory — never PII', () => {
    const table = parseRosterTable(ROSTER_WITH_EMPLOYEE)!;
    const analysis = analyzeRosterTable(table, NADIE);
    const profile = buildTabularProfileFromAnswers(table, analysis, {
      selectedRow: { label: 'Ana Martinez', page: 0, y: 0, rowIndex: 0 },
      tokenMeanings: {},
    });

    expect(profile.employeeRow).toEqual({ strategy: 'manual-row', rowIndex: 0 });
    expect(profile.tabular).toEqual({
      dateColumnIndex: 0,
      employeeColumnIndex: 1,
      valueColumnIndices: [2, 3],
    });
    expect(profile.signature.documentType).toBe('TYPE_TAB');

    const serialized = JSON.stringify(profile);
    for (const pii of ['Ana', 'Martinez', 'Carlos', 'Ruiz']) {
      expect(serialized.includes(pii)).toBe(false);
    }
  });

  it('round-trips through saveFormatProfile/loadFormatProfiles with tabular + dayColumnMap', () => {
    const table = parseRosterTable(GRID_CSV)!;
    const analysis = analyzeRosterTable(table, NADIE);
    const profile = buildTabularProfileFromAnswers(table, analysis, {
      dayMapping: { confirmed: false, correctedDay: 2 },
      tokenMeanings: { ZZ: { kind: 'rest' } },
    });
    expect(profile.dayColumnMap).toEqual({ 1: 2 });
    expect(profile.tokenAliases).toEqual({ ZZ: 'Libre' });
    expect(profile.offTokens).toEqual(['ZZ']);

    const saved = saveFormatProfile(profile);
    const loaded = loadFormatProfiles().find((candidate) => candidate.id === saved.id);
    expect(loaded?.tabular).toEqual(profile.tabular);
    expect(loaded?.dayColumnMap).toEqual(profile.dayColumnMap);
  });
});

describe('parseRosterTableWithAnswers', () => {
  it('date-column mode: only the selected employee\'s rows, valid ISO dates', () => {
    const table = parseRosterTable(ROSTER_WITH_EMPLOYEE)!;
    const shifts = parseRosterTableWithAnswers(table, {
      selectedRow: { label: 'Ana Martinez', page: 0, y: 0, rowIndex: 0 },
      tokenMeanings: {},
    }, CONTEXT);

    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '08:00', endTime: '14:00', shiftType: 'Regular' },
      { date: '2026-08-03', startTime: '17:00', endTime: '01:00', shiftType: 'Regular' },
    ]);
    for (const shift of shifts) {
      expect(shift.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('answered token meanings classify work/rest cells', () => {
    const table = parseRosterTable('fecha,detalle\n01/08/2026,XX\n02/08/2026,YY')!;
    const shifts = parseRosterTableWithAnswers(table, {
      tokenMeanings: {
        XX: { kind: 'work', startTime: '08:00', endTime: '16:00' },
        YY: { kind: 'rest' },
      },
    }, CONTEXT);
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' },
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre' },
    ]);
  });

  it('grid mode: dates come from day headers + context month, selected row only', () => {
    const table = parseRosterTable(GRID_CSV)!;
    const shifts = parseRosterTableWithAnswers(table, {
      selectedRow: { label: 'Ana Martinez', page: 0, y: 0, rowIndex: 0 },
      dayMapping: { confirmed: true },
      tokenMeanings: {},
    }, CONTEXT);
    // ZZ is unanswered/unknown → no shift for day 3.
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' },
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre' },
    ]);
  });

  it('grid mode: corrected anchor day wins collisions, never leaves the context month', () => {
    const table = parseRosterTable(GRID_CSV)!;
    const shifts = parseRosterTableWithAnswers(table, {
      selectedRow: { label: 'Ana Martinez', page: 0, y: 0, rowIndex: 0 },
      dayMapping: { confirmed: false, correctedDay: 2 },
      tokenMeanings: { ZZ: { kind: 'work', startTime: '20:00', endTime: '23:00' } },
    }, CONTEXT);
    // Anchor column "1" forced to day 2; header "2" collides and stays
    // unassigned; header "3" maps to day 3.
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-02', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' },
      { date: '2026-08-03', startTime: '20:00', endTime: '23:00', shiftType: 'Regular' },
    ]);
    for (const shift of shifts) {
      expect(shift.date.startsWith('2026-08-')).toBe(true);
    }
  });
});

describe('buildTabularImportResult', () => {
  it('recomputes quality: answered tokens stop penalizing the result', () => {
    const table = parseRosterTable('fecha,detalle\n01/08/2026,XX')!;
    const { shifts, quality } = buildTabularImportResult(table, {
      tokenMeanings: { XX: { kind: 'work', startTime: '08:00', endTime: '16:00' } },
    }, CONTEXT);
    expect(shifts).toHaveLength(1);
    expect(quality.shifts).toEqual(shifts);
    expect(quality.warnings).toEqual([]);
    expect(quality.state).toBe('CORRECT');
  });
});

describe('analyzeDocumentFile — tabular assistant wiring', () => {
  const makeCsv = (content: string) => new File([content], 'cuadrante.csv', { type: 'text/csv' });

  it('roster CSV with unmatched employee: row-selection question + table carried', async () => {
    const result = await analyzeDocumentFile(makeCsv(ROSTER_WITH_EMPLOYEE), NADIE);
    expect(result.structure).toBeNull();
    expect(result.quality.state).toBe('UNRECOGNIZED');
    expect(result.table).toBeDefined();
    const rowSelection = result.questions.find((q) => q.kind === 'row-selection');
    expect(rowSelection).toBeDefined();
    expect(rowSelection?.kind === 'row-selection' && rowSelection.candidates.map((c) => c.label))
      .toEqual(['Ana Martinez', 'Carlos Ruiz']);

    // The answers drive the tabular re-parse the panel would run.
    const { shifts } = buildTabularImportResult(result.table!, {
      selectedRow: { label: 'Ana Martinez', page: 0, y: 0, rowIndex: 0 },
      tokenMeanings: {},
    }, result.context);
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '08:00', endTime: '14:00', shiftType: 'Regular' },
      { date: '2026-08-03', startTime: '17:00', endTime: '01:00', shiftType: 'Regular' },
    ]);
  });

  it('grid CSV (UNKNOWN positional layout): tabular questions + table carried', async () => {
    const result = await analyzeDocumentFile(makeCsv(GRID_CSV), NADIE);
    expect(result.structure?.documentType).toBe('UNKNOWN');
    expect(result.quality.state).toBe('UNRECOGNIZED');
    expect(result.table).toBeDefined();
    expect(result.questions.some((q) => q.kind === 'row-selection')).toBe(true);
    expect(result.questions.some((q) => q.kind === 'day-mapping')).toBe(true);
    expect(result.questions).toContainEqual({ kind: 'token-meaning', token: 'ZZ' });
  });

  it('genuinely insufficient CSV: no questions, UNRECOGNIZED stands, no table', async () => {
    const result = await analyzeDocumentFile(makeCsv('foo,bar\nbaz,qux'), NADIE);
    expect(result.quality.state).toBe('UNRECOGNIZED');
    expect(result.questions).toEqual([]);
    expect(result.table).toBeUndefined();
  });

  it('clean roster CSV with matched employee: CORRECT, no questions (bypass preserved)', async () => {
    const result = await analyzeDocumentFile(
      makeCsv('fecha,empleado,inicio,fin\n01/08/2026,Ana Martinez,08:00,14:00'),
      ANA,
    );
    expect(result.quality.state).toBe('CORRECT');
    expect(result.questions).toEqual([]);
  });
});

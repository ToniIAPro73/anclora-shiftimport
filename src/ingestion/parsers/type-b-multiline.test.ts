/**
 * Golden tests for the split-line TYPE_B layout family (real fortnight
 * rosters): one day cell spread over start/marker/end physical lines.
 */
import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { IngestionError } from '../../lib/ingestion-errors';
import { analyzeItemsForImport } from '../analysis';
import {
  findEmployeeRowCandidates,
  parseWithSelectedRow,
  selectorForCandidate,
} from '../assistant';
import { countEmployeeNameCandidates } from '../core/row-detection';
import { PdfTextItem } from '../core/text-items';
import { parseShiftsFromItems } from './parse-items';
import { TYPE_B_PROFILE } from '../profiles/type-b';
import {
  TYPE_B_MULTILINE_CONTEXT,
  TYPE_B_MULTILINE_EXPECTED,
  TYPE_B_MULTILINE_ITEMS,
  TYPE_B_MULTILINE_SELECTOR,
} from '../fixtures/type-b-multiline.fixture';

setupLocalStorageMock();

const summarize = (shifts: ReturnType<typeof parseShiftsFromItems>) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

describe('TYPE_B split-line layout (real fortnight pattern)', () => {
  it('typed path: both cell lines combine into complete shifts (golden)', () => {
    const shifts = parseShiftsFromItems(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, TYPE_B_MULTILINE_SELECTOR);
    expect(summarize(shifts)).toEqual(TYPE_B_MULTILINE_EXPECTED);
  });

  it('candidate list skips the structural header band and keeps all employees', () => {
    const candidates = findEmployeeRowCandidates(TYPE_B_MULTILINE_ITEMS, TYPE_B_PROFILE);
    const labels = candidates.map((candidate) => candidate.label);
    expect(labels.some((label) => /NOMINA|EMPLEADO/i.test(label))).toBe(false);
    expect(labels.some((label) => label.includes('Ficticio Uno'))).toBe(true);
    // Name sits right of the marker column: reachable only via the id anchor.
    expect(labels.some((label) => label.includes('Ficticia Dos'))).toBe(true);
    // Day codes from the marker line never leak into the label.
    expect(labels.every((label) => !/\bOFF\b/.test(label))).toBe(true);
  });

  it('selectorForCandidate harvests the nómina id printed on the candidate line', () => {
    const candidates = findEmployeeRowCandidates(TYPE_B_MULTILINE_ITEMS, TYPE_B_PROFILE);
    const second = candidates.find((candidate) => candidate.label.includes('Ficticia Dos'))!;
    expect(selectorForCandidate(TYPE_B_MULTILINE_ITEMS, second, TYPE_B_PROFILE))
      .toEqual({ employeeName: second.label, employeeIdentifiers: ['90002'] });
  });

  it('manual row pick: band parse keeps both cell lines and excludes the next block', () => {
    const candidates = findEmployeeRowCandidates(TYPE_B_MULTILINE_ITEMS, TYPE_B_PROFILE);
    const first = candidates.find((candidate) => candidate.label.includes('Ficticio Uno'))!;
    const shifts = parseWithSelectedRow(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, first, TYPE_B_PROFILE);
    // No phantom ??:?? segment from the neighbour's start line.
    expect(shifts.every((shift) => shift.endTime !== '??:??')).toBe(true);
    expect(summarize(shifts)).toEqual(TYPE_B_MULTILINE_EXPECTED);
  });
});

/**
 * Direct employee matching (typed name / typed id) must agree with the
 * candidate-row detection the assistant uses — a name the assistant lists
 * must also match when typed verbatim (real FTPS QA regression).
 */
describe('TYPE_B direct employee matching', () => {
  const SECOND_ROW_EXPECTED = [
    { date: '2026-09-01', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', isValid: true },
    { date: '2026-09-02', startTime: '08:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
    { date: '2026-09-03', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
    { date: '2026-09-04', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
    { date: '2026-09-05', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
  ];

  it('direct name match: name inside the marker column', () => {
    const selector = { employeeName: 'Ficticio Uno', employeeIdentifiers: [] };
    const analysis = analyzeItemsForImport(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector);
    expect(analysis.employeeMatch).toBe('strong');
    expect(summarize(parseShiftsFromItems(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector)))
      .toEqual(TYPE_B_MULTILINE_EXPECTED);
  });

  it('direct name match: name right of the marker column (id-anchored line)', () => {
    const selector = { employeeName: 'Ficticia Dos', employeeIdentifiers: [] };
    const analysis = analyzeItemsForImport(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector);
    expect(analysis.employeeMatch).toBe('strong');
    expect(summarize(parseShiftsFromItems(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector)))
      .toEqual(SECOND_ROW_EXPECTED);
  });

  it('direct id match: bare nómina id locates the row', () => {
    const selector = { employeeName: '', employeeIdentifiers: ['90002'] };
    const analysis = analyzeItemsForImport(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector);
    expect(analysis.employeeMatch).toBe('strong');
    expect(summarize(parseShiftsFromItems(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector)))
      .toEqual(SECOND_ROW_EXPECTED);
  });

  it('name + id of the same employee: consistent, no mismatch', () => {
    const selector = { employeeName: 'Ficticia Dos', employeeIdentifiers: ['90002'] };
    expect(summarize(parseShiftsFromItems(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector)))
      .toEqual(SECOND_ROW_EXPECTED);
  });

  it('name + id of different employees: IDENTITY_MISMATCH, nothing parsed', () => {
    const selector = { employeeName: 'Ficticio Uno', employeeIdentifiers: ['90002'] };
    try {
      parseShiftsFromItems(TYPE_B_MULTILINE_ITEMS, TYPE_B_MULTILINE_CONTEXT, selector);
      expect.unreachable('must throw on identity mismatch');
    } catch (error) {
      expect(error).toBeInstanceOf(IngestionError);
      expect((error as IngestionError).code).toBe('IDENTITY_MISMATCH');
    }
  });

  it('name split across several text items still matches as one line', () => {
    const split: PdfTextItem[] = [
      ...TYPE_B_MULTILINE_ITEMS,
      { text: '90003', x: 28, y: 397.8, width: 0, height: 0, page: 1 },
      { text: 'Fictio', x: 88, y: 397.8, width: 0, height: 0, page: 1 },
      { text: 'Tres', x: 120, y: 397.8, width: 0, height: 0, page: 1 },
      { text: 'OFF', x: 263, y: 397.8, width: 0, height: 0, page: 1 },
    ];
    // One row candidate, not two: the split items are one visual line.
    expect(countEmployeeNameCandidates(split, 'Fictio Tres', TYPE_B_PROFILE.rowWindow)).toBe(1);

    const selector = { employeeName: 'Fictio Tres', employeeIdentifiers: [] };
    expect(summarize(parseShiftsFromItems(split, TYPE_B_MULTILINE_CONTEXT, selector))).toEqual([
      { date: '2026-09-01', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
    ]);

    // The split name combined with its own id must not trip the cross-check.
    const withId = { employeeName: 'Fictio Tres', employeeIdentifiers: ['90003'] };
    expect(summarize(parseShiftsFromItems(split, TYPE_B_MULTILINE_CONTEXT, withId))).toEqual([
      { date: '2026-09-01', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
    ]);
  });
});

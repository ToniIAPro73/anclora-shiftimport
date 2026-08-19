/**
 * Golden tests for the split-line TYPE_B layout family (real fortnight
 * rosters): one day cell spread over start/marker/end physical lines.
 */
import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import {
  findEmployeeRowCandidates,
  parseWithSelectedRow,
  selectorForCandidate,
} from '../assistant';
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

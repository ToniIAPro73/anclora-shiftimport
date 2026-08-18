/**
 * Day-mapping assistant (Phase 1A remediation): the day-mapping question is
 * emitted only when the grid's column→day alignment leaves a column group
 * unmatched, the answer is learned into the profile (dayColumnMap) and the
 * corrected re-parse never fabricates dates outside the context month.
 *
 * All fixtures are synthetic; no real rosters.
 */
import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { saveFormatProfile } from '../lib/format-profiles';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from '../lib/shift-types';
import {
  buildProfileFromAnswers,
  dayMappingQuestionFromDiagnostic,
  generateAssistantQuestions,
  parseWithDayMapping,
} from './assistant';
import { analyzeItemsForImport, analyzeShiftsFromItems } from './analysis';
import { findEmployeeRowItems } from './core/row-detection';
import { PdfTextItem } from './core/text-items';
import { detectCalendarContextFromItems } from './parsers/parse-items';
import { TYPE_A_PROFILE } from './profiles/type-a';
import { TYPE_A_FIXTURE_ITEMS, TYPE_A_SELECTOR } from './fixtures/type-a.fixture';

setupLocalStorageMock();

const CONTEXT = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);

/**
 * TYPE_A grid where the last shift cell sits at x=520 — 20px away from the
 * 05/08 header (x=500), beyond columnMatchMaxDistance (12). The group stays
 * unmatched and the day-5 header unmapped.
 */
const SHIFTED_GRID_ITEMS: PdfTextItem[] = [
  { text: 'PERIODO: AGOSTO 2026', x: 400, y: 450, width: 0, height: 0, page: 1 },
  { text: '01/08', x: 100, y: 400, width: 0, height: 0, page: 1 },
  { text: '02/08', x: 200, y: 400, width: 0, height: 0, page: 1 },
  { text: '03/08', x: 300, y: 400, width: 0, height: 0, page: 1 },
  { text: '04/08', x: 400, y: 400, width: 0, height: 0, page: 1 },
  { text: '05/08', x: 500, y: 400, width: 0, height: 0, page: 1 },
  // Previous employee row: acts as the ceiling boundary of Ana's band so the
  // day headers stay out of her row items (same layout as the TYPE_A fixture).
  { text: 'Carlos Ruiz', x: 30, y: 300, width: 0, height: 0, page: 1 },
  { text: '(1002)', x: 55, y: 300, width: 0, height: 0, page: 1 },
  { text: 'Ana Martinez', x: 30, y: 200, width: 0, height: 0, page: 1 },
  { text: '(1001)', x: 55, y: 200, width: 0, height: 0, page: 1 },
  { text: '08:00-16:00', x: 100, y: 200, width: 0, height: 0, page: 1 },
  { text: 'OFF', x: 200, y: 200, width: 0, height: 0, page: 1 },
  { text: '08:00-16:00', x: 300, y: 200, width: 0, height: 0, page: 1 },
  { text: 'OFF', x: 400, y: 200, width: 0, height: 0, page: 1 },
  { text: '17:00-01:00', x: 520, y: 200, width: 0, height: 0, page: 1 },
];

const summarize = (shifts: ReturnType<typeof parseWithDayMapping>) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
  }));

describe('day-mapping detection', () => {
  it('fully-mapped grid: diagnostic present, but NO day-mapping question', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(analysis.dayMapping).toBeDefined();
    expect(analysis.dayMapping?.dayHeaderCount).toBe(5);
    expect(analysis.dayMapping?.mappedDayCount).toBe(5);
    expect(analysis.dayMapping?.unmatchedGroups).toEqual([]);

    const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
    expect(questions.some((q) => q.kind === 'day-mapping')).toBe(false);
  });

  it('unmatched column group: exactly one day-mapping question with proposedDay', () => {
    const analysis = analyzeItemsForImport(SHIFTED_GRID_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(analysis.dayMapping?.unmatchedGroups).toEqual([
      { columnIndex: 4, sampleTokens: ['17:00-01:00'], x: 520 },
    ]);
    expect(analysis.dayMapping?.unmappedHeaders).toEqual([{ day: 5, x: 500, page: 1 }]);

    const questions = generateAssistantQuestions(SHIFTED_GRID_ITEMS, CONTEXT, analysis);
    const dayMappingQuestions = questions.filter((q) => q.kind === 'day-mapping');
    expect(dayMappingQuestions).toEqual([
      { kind: 'day-mapping', columnIndex: 4, sampleTokens: ['17:00-01:00'], proposedDay: 5 },
    ]);
  });

  it('is not emitted when the employee row was not found', () => {
    const analysis = analyzeItemsForImport(
      SHIFTED_GRID_ITEMS,
      CONTEXT,
      { employeeName: 'Nadie', employeeIdentifiers: [] },
    );
    expect(analysis.dayMapping).toBeUndefined();
    const questions = generateAssistantQuestions(SHIFTED_GRID_ITEMS, CONTEXT, analysis);
    expect(questions.some((q) => q.kind === 'day-mapping')).toBe(false);
  });

  it('proposedDay falls back to 1 when no unmapped header exists', () => {
    const question = dayMappingQuestionFromDiagnostic({
      dayHeaderCount: 4,
      mappedDayCount: 4,
      unmappedHeaders: [],
      unmatchedGroups: [{ columnIndex: 4, sampleTokens: ['X'], x: 520 }],
    });
    expect(question?.proposedDay).toBe(1);
  });
});

describe('day-mapping answers → profile', () => {
  it('confirmed answer stores the proposed day in dayColumnMap', () => {
    const analysis = analyzeItemsForImport(SHIFTED_GRID_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(SHIFTED_GRID_ITEMS, CONTEXT, analysis, {
      dayMapping: { confirmed: true },
      tokenMeanings: {},
    });
    expect(profile.dayColumnMap).toEqual({ 4: 5 });
  });

  it('rejected answer stores the correctedDay; bare rejection stores nothing', () => {
    const analysis = analyzeItemsForImport(SHIFTED_GRID_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const corrected = buildProfileFromAnswers(SHIFTED_GRID_ITEMS, CONTEXT, analysis, {
      dayMapping: { confirmed: false, correctedDay: 3 },
      tokenMeanings: {},
    });
    expect(corrected.dayColumnMap).toEqual({ 4: 3 });

    const bareRejection = buildProfileFromAnswers(SHIFTED_GRID_ITEMS, CONTEXT, analysis, {
      dayMapping: { confirmed: false },
      tokenMeanings: {},
    });
    expect(bareRejection.dayColumnMap).toBeUndefined();
  });

  it('no day-mapping answer → no dayColumnMap (profile shape unchanged)', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, {
      tokenMeanings: { DL: { kind: 'rest' } },
    });
    expect(profile.dayColumnMap).toBeUndefined();
  });
});

describe('parseWithDayMapping', () => {
  it('confirmed mapping assigns the shifted group to the corrected ISO date', () => {
    const row = findEmployeeRowItems(SHIFTED_GRID_ITEMS, TYPE_A_SELECTOR, TYPE_A_PROFILE.rowWindow);
    expect(row).not.toBeNull();

    const shifts = parseWithDayMapping(
      SHIFTED_GRID_ITEMS,
      CONTEXT,
      row!,
      TYPE_A_PROFILE,
      { columnIndex: 4, day: 5 },
    );
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' },
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre' },
      { date: '2026-08-03', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' },
      { date: '2026-08-04', startTime: '', endTime: '', shiftType: 'Libre' },
      { date: '2026-08-05', startTime: '17:00', endTime: '01:00', shiftType: 'Regular' },
    ]);
  });

  it('collision: the corrected day wins, the displaced group is left unmapped', () => {
    const row = findEmployeeRowItems(SHIFTED_GRID_ITEMS, TYPE_A_SELECTOR, TYPE_A_PROFILE.rowWindow);
    const shifts = parseWithDayMapping(
      SHIFTED_GRID_ITEMS,
      CONTEXT,
      row!,
      TYPE_A_PROFILE,
      { columnIndex: 4, day: 3 },
    );
    // Day 3 now holds the corrected cell; the old day-3 group cannot steal it
    // back and no other header is close enough, so it drops out.
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' },
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre' },
      { date: '2026-08-03', startTime: '17:00', endTime: '01:00', shiftType: 'Regular' },
      { date: '2026-08-04', startTime: '', endTime: '', shiftType: 'Libre' },
    ]);
  });

  it('clamps out-of-month corrections to the context month, never fabricating dates', () => {
    const row = findEmployeeRowItems(SHIFTED_GRID_ITEMS, TYPE_A_SELECTOR, TYPE_A_PROFILE.rowWindow);
    const shifts = parseWithDayMapping(
      SHIFTED_GRID_ITEMS,
      CONTEXT,
      row!,
      TYPE_A_PROFILE,
      { columnIndex: 4, day: 45 },
    );
    const dates = shifts.map((shift) => shift.date);
    expect(dates).toContain('2026-08-31'); // August has 31 days: 45 clamps to 31
    for (const date of dates) {
      expect(date.startsWith('2026-08-')).toBe(true);
    }
  });
});

describe('known-profile bypass', () => {
  it('matched profile + clean import → no questions at all', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const base = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, base, {
      tokenMeanings: { DL: { kind: 'rest' }, AJ: { kind: 'rest' } },
    });
    saveFormatProfile(profile);

    const { quality, analysis } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(analysis.structure.matchedProfile?.profile.id).toBe(profile.id);
    expect(analysis.structure.drift?.drifted).toBe(false);
    expect(quality.state).toBe('CORRECT');
    // Same bypass rule as analyzeDocumentFile: CORRECT never asks.
    const questions = quality.state === 'CORRECT'
      ? []
      : generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
    expect(questions).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { FORMAT_PROFILE_VERSION, saveFormatProfile, UserFormatProfile } from '../lib/format-profiles';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from '../lib/shift-types';
import {
  analyzeDocumentStructure,
  analyzeItemsForImport,
  analyzeShiftsFromItems,
} from './analysis';
import { detectCalendarContextFromItems } from './parsers/parse-items';
import {
  TYPE_A_EXPECTED,
  TYPE_A_EXPECTED_WITH_PRESET,
  TYPE_A_FIXTURE_ITEMS,
  TYPE_A_SELECTOR,
} from './fixtures/type-a.fixture';
import { PdfTextItem } from './core/text-items';

setupLocalStorageMock();

const summarize = (shifts: ReturnType<typeof analyzeShiftsFromItems>['shifts']) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

const AMBIGUOUS_ITEMS: PdfTextItem[] = [
  ...TYPE_A_FIXTURE_ITEMS,
  // second row with the same name (no id), below Ana's band
  { text: 'Ana Martinez', x: 30, y: 100, width: 0, height: 0, page: 1 },
];

describe('analyzeShiftsFromItems — happy path', () => {
  it('parses the TYPE_A fixture and reports CORRECT with full confidence (preset loaded)', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    const { shifts, quality, analysis } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, context, TYPE_A_SELECTOR);

    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED_WITH_PRESET);
    expect(quality.state).toBe('CORRECT');
    expect(quality.confidence).toBe(1);
    expect(quality.warnings).toEqual([]);
    expect(analysis.employeeMatch).toBe('strong');
    expect(analysis.structure.documentType).toBe('TYPE_A');
    expect(analysis.structure.dayHeaderCount).toBe(5);
    expect(analysis.structure.periodDetected).toBe(true);
    expect(analysis.totalTokens).toBe(5);
    expect(analysis.recognizedTokens).toBe(5);
    expect(analysis.unknownTokens).toEqual([]);
    expect(analysis.invalidTimes).toBe(0);
  });

  it('also yields the golden result without the preset (unknown tokens reduce confidence)', () => {
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    const { shifts, quality, analysis } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, context, TYPE_A_SELECTOR);

    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED);
    expect(analysis.unknownTokens).toEqual(['DL', 'AJ']);
    expect(quality.warnings.filter((w) => w.code === 'UNKNOWN_SHIFT_TOKEN')).toHaveLength(2);
    expect(quality.confidence).toBeLessThan(1);
    expect(quality.state).not.toBe('CORRECT');
  });
});

describe('analyzeShiftsFromItems — employee resolution', () => {
  it('unknown employee: UNRECOGNIZED, no shifts, no throw', () => {
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    const { shifts, quality, analysis } = analyzeShiftsFromItems(
      TYPE_A_FIXTURE_ITEMS,
      context,
      { employeeName: 'Nadie', employeeIdentifiers: ['9999'] },
    );

    expect(shifts).toEqual([]);
    expect(analysis.employeeMatch).toBe('none');
    expect(quality.state).toBe('UNRECOGNIZED');
    expect(quality.confidence).toBeLessThanOrEqual(0.2);
  });

  it('ambiguous name (two rows, no id): MULTIPLE_EMPLOYEE_MATCHES, no shifts, no throw', () => {
    const context = detectCalendarContextFromItems(AMBIGUOUS_ITEMS);
    const { shifts, quality, analysis } = analyzeShiftsFromItems(
      AMBIGUOUS_ITEMS,
      context,
      { employeeName: 'Ana Martinez', employeeIdentifiers: [] },
    );

    expect(shifts).toEqual([]);
    expect(analysis.employeeMatch).toBe('multiple');
    expect(quality.warnings.some((w) => w.code === 'MULTIPLE_EMPLOYEE_MATCHES')).toBe(true);
    expect(quality.state).toBe('REVIEW');
  });

  it('partial name match is weak, full unique name match is strong', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);

    const weak = analyzeItemsForImport(
      TYPE_A_FIXTURE_ITEMS,
      context,
      { employeeName: 'Ana Martinez Lopez', employeeIdentifiers: [] },
    );
    expect(weak.employeeMatch).toBe('weak');

    const strong = analyzeItemsForImport(
      TYPE_A_FIXTURE_ITEMS,
      context,
      { employeeName: 'Ana Martinez', employeeIdentifiers: [] },
    );
    expect(strong.employeeMatch).toBe('strong');
  });
});

describe('analyzeDocumentStructure / profile matching', () => {
  const buildProfileFrom = (items: PdfTextItem[]): UserFormatProfile => {
    const context = detectCalendarContextFromItems(items);
    const structure = analyzeDocumentStructure(items, context);
    const now = new Date().toISOString();
    return {
      profileVersion: FORMAT_PROFILE_VERSION,
      id: 'test-profile-1',
      label: 'Cuadrante mensual',
      signature: structure.signature,
      tokenAliases: {},
      offTokens: [],
      employeeRow: { strategy: 'manual-row' },
      parserParams: { clusterTolerance: 8, columnMatchMaxDistance: 12 },
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    };
  };

  it('matched saved profile: exact signature scores 1 and profileId lands on the result', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    saveFormatProfile(buildProfileFrom(TYPE_A_FIXTURE_ITEMS));

    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    const { quality, analysis } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, context, TYPE_A_SELECTOR);

    expect(analysis.structure.matchedProfile?.profile.id).toBe('test-profile-1');
    expect(analysis.structure.matchedProfile?.score).toBe(1);
    expect(analysis.structure.drift?.drifted).toBe(false);
    expect(quality.profileId).toBe('test-profile-1');
    expect(quality.state).toBe('CORRECT');
  });

  it('drifted day headers: PROFILE_DRIFT warning, never CORRECT', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    saveFormatProfile(buildProfileFrom(TYPE_A_FIXTURE_ITEMS));

    const driftedItems = TYPE_A_FIXTURE_ITEMS.map((item) =>
      item.text === '05/08' ? { ...item, text: '06/08' } : item,
    );
    const context = detectCalendarContextFromItems(driftedItems);
    const { quality, analysis } = analyzeShiftsFromItems(driftedItems, context, TYPE_A_SELECTOR);

    expect(analysis.structure.matchedProfile?.profile.id).toBe('test-profile-1');
    expect(analysis.structure.drift?.drifted).toBe(true);
    expect(analysis.structure.drift?.changedFields).toContain('structureHash');
    expect(quality.warnings.some((w) => w.code === 'PROFILE_DRIFT')).toBe(true);
    expect(quality.state).toBe('REVIEW');
  });

  it('UNKNOWN layout: empty signature, dayHeaderCount 0, UNRECOGNIZED with UNSUPPORTED_SECTION', () => {
    const items: PdfTextItem[] = [{ text: 'hola', x: 10, y: 10, width: 0, height: 0, page: 1 }];
    const context = detectCalendarContextFromItems(items);
    const { shifts, quality, analysis } = analyzeShiftsFromItems(items, context, TYPE_A_SELECTOR);

    expect(analysis.structure.documentType).toBe('UNKNOWN');
    expect(analysis.structure.dayHeaderCount).toBe(0);
    expect(analysis.structure.periodDetected).toBe(false);
    expect(shifts).toEqual([]);
    expect(quality.state).toBe('UNRECOGNIZED');
    expect(quality.warnings.some((w) => w.code === 'UNSUPPORTED_SECTION')).toBe(true);
  });

  it('empty document: UNRECOGNIZED, no throw', () => {
    const context = detectCalendarContextFromItems([]);
    const { shifts, quality } = analyzeShiftsFromItems([], context, TYPE_A_SELECTOR);

    expect(shifts).toEqual([]);
    expect(quality.state).toBe('UNRECOGNIZED');
  });
});

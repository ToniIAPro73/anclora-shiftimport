import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { loadFormatProfiles, saveFormatProfile } from '../lib/format-profiles';
import { mergeShiftTypeOverrides, resolveShiftTypeId, SHIFT_TYPE_PRESET_EXAMPLE } from '../lib/shift-types';
import {
  applyTokenAliasesToShiftTypes,
  AssistantAnswers,
  buildProfileFromAnswers,
  findEmployeeRowCandidates,
  generateAssistantQuestions,
  parseWithSelectedRow,
  selectorFromAnswers,
} from './assistant';
import { analyzeItemsForImport, analyzeShiftsFromItems } from './analysis';
import { detectCalendarContextFromItems } from './parsers/parse-items';
import { TYPE_A_PROFILE } from './profiles/type-a';
import {
  TYPE_A_EXPECTED_WITH_PRESET,
  TYPE_A_FIXTURE_ITEMS,
  TYPE_A_SELECTOR,
} from './fixtures/type-a.fixture';

setupLocalStorageMock();

const CONTEXT = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);

const summarize = (shifts: ReturnType<typeof parseWithSelectedRow>) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

describe('findEmployeeRowCandidates', () => {
  it('returns labeled candidates for the synthetic two-employee grid', () => {
    const candidates = findEmployeeRowCandidates(TYPE_A_FIXTURE_ITEMS, TYPE_A_PROFILE);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ label: 'Carlos Ruiz (1002)', page: 1, y: 300, rowIndex: 0 });
    expect(candidates[1]).toMatchObject({ label: 'Ana Martinez (1001)', page: 1, y: 200, rowIndex: 1 });
  });

  it('caps the number of candidates', () => {
    const candidates = findEmployeeRowCandidates(TYPE_A_FIXTURE_ITEMS, TYPE_A_PROFILE, { maxRows: 1 });
    expect(candidates).toHaveLength(1);
  });
});

describe('generateAssistantQuestions', () => {
  it('emits row-selection only when the employee match is none/multiple', () => {
    // Strong match: no row-selection question.
    const strong = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const strongQuestions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, strong);
    expect(strongQuestions.some((q) => q.kind === 'row-selection')).toBe(false);

    // Unknown employee: row-selection with the labeled candidates.
    const none = analyzeItemsForImport(
      TYPE_A_FIXTURE_ITEMS,
      CONTEXT,
      { employeeName: 'Nadie', employeeIdentifiers: [] },
    );
    expect(none.employeeMatch).toBe('none');
    const noneQuestions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, none);
    const rowSelection = noneQuestions.find((q) => q.kind === 'row-selection');
    expect(rowSelection).toBeDefined();
    expect(rowSelection?.kind === 'row-selection' && rowSelection.candidates).toHaveLength(2);
  });

  it('emits token-meaning questions for unknown row tokens', () => {
    // Without the company preset, DL/AJ are unknown tokens in Ana's row.
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(analysis.unknownTokens).toEqual(['DL', 'AJ']);

    const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
    const tokenQuestions = questions.filter((q) => q.kind === 'token-meaning');
    expect(tokenQuestions).toEqual([
      { kind: 'token-meaning', token: 'DL' },
      { kind: 'token-meaning', token: 'AJ' },
    ]);
  });

  it('emits nothing when the import is already clean', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const { quality, analysis } = analyzeShiftsFromItems(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    expect(quality.state).toBe('CORRECT');
    expect(generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis)).toEqual([]);
  });
});

describe('buildProfileFromAnswers', () => {
  const answers: AssistantAnswers = {
    selectedRow: { label: 'Ana Martinez (1001)', page: 1, y: 200, rowIndex: 1 },
    tokenMeanings: {
      DL: { kind: 'rest' },
      AJ: { kind: 'rest' },
      XY: { kind: 'work', startTime: '08:00', endTime: '16:00' },
    },
  };

  it('produces a valid UserFormatProfile from the answers', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, answers);

    expect(profile.profileVersion).toBe(1);
    expect(profile.id).toBeTruthy();
    expect(profile.label).toBe('Cuadrante mensual');
    expect(profile.signature).toEqual(analysis.structure.signature);
    expect(profile.tokenAliases).toEqual({ DL: 'Libre', AJ: 'Libre', XY: 'Regular' });
    expect(profile.offTokens).toEqual(['DL', 'AJ']);
    expect(profile.employeeRow).toEqual({ strategy: 'manual-row', rowIndex: 1 });
    expect(profile.parserParams).toEqual({ clusterTolerance: 8, columnMatchMaxDistance: 12 });
  });

  it('never persists PII: no candidate labels, names or ids in the serialized profile', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, answers);
    const serialized = JSON.stringify(profile);

    for (const pii of ['Ana', 'Martinez', 'Carlos', 'Ruiz', '1001', '1002', 'Ana Martinez (1001)']) {
      expect(serialized.includes(pii)).toBe(false);
    }
  });

  it('round-trips through saveFormatProfile/loadFormatProfiles', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, answers);

    const saved = saveFormatProfile(profile);
    const loaded = loadFormatProfiles().find((candidate) => candidate.id === saved.id);

    expect(loaded).toBeDefined();
    expect(loaded?.tokenAliases).toEqual(profile.tokenAliases);
    expect(loaded?.offTokens).toEqual(profile.offTokens);
    expect(loaded?.employeeRow).toEqual(profile.employeeRow);
    expect(loaded?.signature).toEqual(profile.signature);
  });
});

describe('selectorFromAnswers', () => {
  it('is null without a manual row, label-keyed (session-only) otherwise', () => {
    expect(selectorFromAnswers({ tokenMeanings: {} })).toBeNull();
    expect(selectorFromAnswers({
      selectedRow: { label: 'Ana Martinez (1001)', page: 1, y: 200, rowIndex: 1 },
      tokenMeanings: {},
    })).toEqual({ employeeName: 'Ana Martinez (1001)', employeeIdentifiers: [] });
  });
});

describe('parseWithSelectedRow', () => {
  it('extracts the selected person\'s shifts from the synthetic two-employee grid', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const candidates = findEmployeeRowCandidates(TYPE_A_FIXTURE_ITEMS, TYPE_A_PROFILE);
    const ana = candidates[1];

    const shifts = parseWithSelectedRow(TYPE_A_FIXTURE_ITEMS, CONTEXT, ana, TYPE_A_PROFILE);
    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED_WITH_PRESET);
  });

  it('returns [] for a row without data cells', () => {
    const candidates = findEmployeeRowCandidates(TYPE_A_FIXTURE_ITEMS, TYPE_A_PROFILE);
    const carlos = candidates[0];
    expect(parseWithSelectedRow(TYPE_A_FIXTURE_ITEMS, CONTEXT, carlos, TYPE_A_PROFILE)).toEqual([]);
  });
});

describe('applyTokenAliasesToShiftTypes', () => {
  it('registers aliases resolvable via resolveShiftTypeId', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, {
      selectedRow: { label: 'Ana Martinez (1001)', page: 1, y: 200, rowIndex: 1 },
      tokenMeanings: {
        DL: { kind: 'rest' },
        AJ: { kind: 'rest' },
        XY: { kind: 'work', startTime: '08:00', endTime: '16:00' },
      },
    });

    applyTokenAliasesToShiftTypes(profile);

    expect(resolveShiftTypeId('DL')).toBe('Libre');
    expect(resolveShiftTypeId('aj')).toBe('Libre');
    expect(resolveShiftTypeId('xy')).toBe('Regular');
  });

  it('maps offTokens without an explicit alias to Libre', () => {
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, TYPE_A_SELECTOR);
    const profile = buildProfileFromAnswers(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis, {
      tokenMeanings: { BR: { kind: 'rest' } },
    });

    applyTokenAliasesToShiftTypes(profile);
    expect(resolveShiftTypeId('BR')).toBe('Libre');
  });
});

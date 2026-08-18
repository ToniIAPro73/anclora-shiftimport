import { describe, expect, it } from 'vitest';
import { computeImportResult, qualityStateFor } from './import-quality';
import type { QualitySignals } from './import-quality';

const cleanSignals = (overrides: Partial<QualitySignals> = {}): QualitySignals => ({
  knownProfileMatched: true,
  profileDrift: false,
  periodDetected: true,
  employeeMatch: 'strong',
  expectedDays: 20,
  mappedDays: 20,
  totalTokens: 20,
  recognizedTokens: 20,
  unknownTokens: [],
  invalidTimes: 0,
  incompleteAssignments: 0,
  ...overrides,
});

describe('import-quality', () => {
  it('scores a known-profile match with zero issues as CORRECT with high confidence', () => {
    const result = computeImportResult([], cleanSignals(), 'profile-1');
    expect(result.state).toBe('CORRECT');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.warnings).toEqual([]);
    expect(result.profileId).toBe('profile-1');
  });

  it('does not penalize an unknown profile by itself', () => {
    const result = computeImportResult([], cleanSignals({ knownProfileMatched: false }));
    expect(result.state).toBe('CORRECT');
    expect(result.confidence).toBe(1);
  });

  it('drops to REVIEW when a few unknown tokens lower the confidence', () => {
    const result = computeImportResult(
      [],
      cleanSignals({ unknownTokens: ['DL', 'AJ', 'TD', 'X9'], recognizedTokens: 16 }),
    );
    expect(result.confidence).toBe(0.8); // 1 − 4·0.05
    expect(result.state).toBe('REVIEW');
    expect(result.warnings.map((w) => w.code)).toEqual([
      'UNKNOWN_SHIFT_TOKEN',
      'UNKNOWN_SHIFT_TOKEN',
      'UNKNOWN_SHIFT_TOKEN',
      'UNKNOWN_SHIFT_TOKEN',
    ]);
    expect(result.warnings[0].context).toEqual({ token: 'DL' });
  });

  it('marks as UNRECOGNIZED when confidence falls below the review threshold', () => {
    const result = computeImportResult(
      [],
      cleanSignals({
        profileDrift: true,
        periodDetected: false,
        employeeMatch: 'weak',
        unknownTokens: ['X1', 'X2'],
      }),
    );
    // 1 − 0.25 (drift) − 0.15 (period) − 0.25 (weak) − 0.10 (tokens) = 0.25
    expect(result.confidence).toBe(0.25);
    expect(result.state).toBe('UNRECOGNIZED');
  });

  it('lowers confidence deterministically per distinct unknown token, capped at −0.3', () => {
    const many = computeImportResult(
      [],
      cleanSignals({ unknownTokens: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] }),
    );
    expect(many.confidence).toBe(0.7);
    expect(many.warnings).toHaveLength(8);
  });

  it('dedupes repeated unknown tokens before penalizing', () => {
    const result = computeImportResult([], cleanSignals({ unknownTokens: ['DL', 'DL', 'DL'] }));
    expect(result.confidence).toBe(0.95);
    expect(result.warnings).toHaveLength(1);
  });

  it('warns PARTIAL_EXTRACTION proportionally to the missing days', () => {
    const result = computeImportResult([], cleanSignals({ expectedDays: 20, mappedDays: 8 }));
    expect(result.confidence).toBe(0.91); // 1 − 0.15·(12/20)
    const warning = result.warnings.find((w) => w.code === 'PARTIAL_EXTRACTION');
    expect(warning?.context).toEqual({ expected: 20, mapped: 8 });
  });

  it('emits a single UNKNOWN_CELL warning for invalid times with a capped penalty', () => {
    const result = computeImportResult([], cleanSignals({ invalidTimes: 6 }));
    expect(result.confidence).toBe(0.8);
    expect(result.warnings).toEqual([{ code: 'UNKNOWN_CELL', context: { count: 6 } }]);
  });

  it('emits PARTIAL_EXTRACTION once for incomplete assignments', () => {
    const result = computeImportResult(
      [],
      cleanSignals({ incompleteAssignments: 2, expectedDays: 20, mappedDays: 16 }),
    );
    const partials = result.warnings.filter((w) => w.code === 'PARTIAL_EXTRACTION');
    expect(partials).toHaveLength(1);
    expect(result.confidence).toBe(0.87); // 1 − 0.15·(4/20) − 2·0.05
  });

  it('warns on profile drift and never allows CORRECT with drift', () => {
    const result = computeImportResult([], cleanSignals({ profileDrift: true }));
    expect(result.warnings.map((w) => w.code)).toContain('PROFILE_DRIFT');
    expect(result.state).toBe('REVIEW'); // 0.75 confidence, drift caps at REVIEW
  });

  it('warns DATE_MAPPING_UNCERTAIN when the period is not detected', () => {
    const result = computeImportResult([], cleanSignals({ periodDetected: false }));
    expect(result.warnings.map((w) => w.code)).toContain('DATE_MAPPING_UNCERTAIN');
    expect(result.confidence).toBe(0.85);
    expect(result.state).toBe('CORRECT');
  });

  it('warns EMPLOYEE_MATCH_WEAK on a weak employee match', () => {
    const result = computeImportResult([], cleanSignals({ employeeMatch: 'weak' }));
    expect(result.warnings.map((w) => w.code)).toContain('EMPLOYEE_MATCH_WEAK');
    expect(result.state).toBe('REVIEW');
  });

  it('caps multiple employee matches at REVIEW even with perfect confidence', () => {
    const signals = cleanSignals({ employeeMatch: 'multiple' });
    expect(qualityStateFor(1, signals)).toBe('REVIEW');
    const result = computeImportResult([], signals);
    expect(result.confidence).toBe(1);
    expect(result.state).toBe('REVIEW');
    expect(result.warnings.map((w) => w.code)).toContain('MULTIPLE_EMPLOYEE_MATCHES');
  });

  it('forces UNRECOGNIZED and confidence ≤ 0.2 when no employee row matches', () => {
    const signals = cleanSignals({ employeeMatch: 'none' });
    expect(qualityStateFor(1, signals)).toBe('UNRECOGNIZED');
    const result = computeImportResult([], signals);
    expect(result.state).toBe('UNRECOGNIZED');
    expect(result.confidence).toBeLessThanOrEqual(0.2);
  });

  it('keeps the parsed shifts untouched in the result', () => {
    const shifts = [{ date: '2026-03-04' }];
    const result = computeImportResult(shifts, cleanSignals());
    expect(result.shifts).toBe(shifts);
  });
});

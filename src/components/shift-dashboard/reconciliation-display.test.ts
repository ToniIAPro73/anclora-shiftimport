import { describe, expect, it } from 'vitest';
import { cleanReason, summarizeReason } from './reconciliation-display';

describe('reconciliation reason display', () => {
  it('strips run tags and UUIDs', () => {
    expect(cleanReason('[run 1acfbb93-09f0-40c3-9860-8de50a26b3d8] Reconciled (HIGH): ok')).toBe('Reconciled (HIGH): ok');
    expect(cleanReason('Ref 1acfbb93-09f0-40c3-9860-8de50a26b3d8 aprobado')).toBe('Ref aprobado');
    expect(cleanReason(null)).toBe('');
  });

  it('classifies and shortens', () => {
    expect(summarizeReason('[run abc] consistent with company calendar').kind).toBe('matchesPlan');
    expect(summarizeReason('').kind).toBe('reconciled');
    const long = summarizeReason('x'.repeat(200));
    expect(long.text.length).toBeLessThanOrEqual(48);
    expect(long.full.length).toBe(200);
  });
});

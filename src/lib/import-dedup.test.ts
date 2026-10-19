import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  classifyImportChanges,
  fingerprintShift,
  mergeImportedShifts,
  semanticShiftFingerprint,
} from './import-dedup';
import { Shift } from './types';

setupLocalStorageMock();

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'id-1',
  date: '2026-08-01',
  startTime: '08:00',
  endTime: '14:00',
  location: '',
  origin: 'IMP',
  ...overrides,
});

describe('fingerprintShift', () => {
  it('is deterministic and independent of the random id', () => {
    const a = fingerprintShift(shift({ id: 'x' }));
    const b = fingerprintShift(shift({ id: 'y' }));
    expect(a.full).toBe(b.full);
    expect(a.full).not.toContain('id-');
  });

  it('differs when the semantic content differs', () => {
    expect(fingerprintShift(shift({ startTime: '16:00', endTime: '22:00' })).full)
      .not.toBe(fingerprintShift(shift({ startTime: '08:00', endTime: '14:00' })).full);
  });

  it('normalizes loose input before fingerprinting', () => {
    expect(fingerprintShift(shift({ date: '2026-8-1' })).full)
      .toBe(fingerprintShift(shift({ date: '2026-08-01' })).full);
  });

  it('preserves provenance in the technical fingerprint while semantic identity ignores it', () => {
    const existing = shift({ origin: 'schedule' as Shift['origin'] });
    const incoming = shift({ origin: 'IMP' });
    expect(fingerprintShift(existing).full).not.toBe(fingerprintShift(incoming).full);
    expect(semanticShiftFingerprint(existing)).toBe(semanticShiftFingerprint(incoming));
  });
});

describe('mergeImportedShifts — idempotent re-import', () => {
  it('importing the same document twice yields the same set', () => {
    const first = mergeImportedShifts([], [shift(), shift({ id: 'i2', startTime: '16:00', endTime: '22:00' })]);
    const second = mergeImportedShifts(first, [shift({ id: 'new-uuid' }), shift({ id: 'another-uuid', startTime: '16:00', endTime: '22:00' })]);
    expect(second.length).toBe(first.length);
    expect(second.map((s) => s.id).sort()).toEqual(first.map((s) => s.id).sort());
  });

  it('preserves the existing id when the fingerprint matches', () => {
    const first = mergeImportedShifts([], [shift({ id: 'stable-id' })]);
    const second = mergeImportedShifts(first, [shift({ id: 'random-uuid' })]);
    expect(second[0].id).toBe('stable-id');
  });

  it('preserves one existing row when only technical origin differs', () => {
    const existing = shift({ id: 'scheduled', origin: 'schedule' as Shift['origin'] });
    const merged = mergeImportedShifts([existing], [shift({ id: 'incoming', origin: 'IMP' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('scheduled');
  });

  it('does not delete shifts outside the incoming date range', () => {
    const existing = [shift({ id: 'july', date: '2026-07-15' })];
    const incoming = [shift({ id: 'aug', date: '2026-08-01' })];
    const merged = mergeImportedShifts(existing, incoming);
    expect(merged.map((s) => s.id)).toEqual(['july', 'aug']);
  });

  it('appends genuinely new shifts and keeps unmatched existing ones (no silent delete)', () => {
    const existing = [shift({ id: 'old', startTime: '08:00', endTime: '12:00' })];
    const incoming = [shift({ id: 'new', startTime: '20:00', endTime: '00:00' })];
    const merged = mergeImportedShifts(existing, incoming);
    expect(merged.length).toBe(2);
  });
});

describe('classifyImportChanges', () => {
  it('classifies a repeated import as all UNCHANGED', () => {
    const existing = [shift({ id: 'a' })];
    const report = classifyImportChanges(existing, [shift({ id: 'b' })]);
    expect(report.unchanged.length).toBe(1);
    expect(report.new.length).toBe(0);
    expect(report.changed.length).toBe(0);
    expect(report.removed.length).toBe(0);
  });

  it('classifies a brand-new shift as NEW', () => {
    const report = classifyImportChanges([], [shift({ id: 'a' })]);
    expect(report.new.length).toBe(1);
    expect(report.additions.length).toBe(1);
  });

  it('classifies a shift whose type changed at the same slot as CHANGED', () => {
    const existing = [shift({ id: 'a', location: 'Libre', startTime: '08:00', endTime: '14:00', origin: 'IMP' })];
    const incoming = [shift({ id: 'b', startTime: '08:00', endTime: '14:00', origin: 'IMP' })];
    const report = classifyImportChanges(existing, incoming);
    expect(report.changed.length).toBe(1);
    expect(report.new.length).toBe(0);
    expect(report.removed.length).toBe(0);
  });

  it('classifies a missing in-range shift as REMOVED', () => {
    const existing = [shift({ id: 'a', startTime: '08:00', endTime: '12:00' }), shift({ id: 'b', startTime: '16:00', endTime: '22:00' })];
    const incoming = [shift({ id: 'c', startTime: '08:00', endTime: '12:00' })];
    const report = classifyImportChanges(existing, incoming);
    expect(report.unchanged.length).toBe(1);
    expect(report.removed.length).toBe(1);
    expect(report.removed[0].shift.id).toBe('b');
  });

  it('treats schedule vs IMP as unchanged business state, including day off', () => {
    for (const existing of [
      shift({ date: '2026-10-14', startTime: '13:00', endTime: '21:00', origin: 'schedule' as Shift['origin'] }),
      shift({ date: '2026-10-14', startTime: '', endTime: '', shiftType: 'Libre', origin: 'schedule' as Shift['origin'] }),
      shift({ date: '2026-10-14', startTime: '', endTime: '', shiftType: 'Vacaciones', origin: 'schedule' as Shift['origin'] }),
    ]) {
      const report = classifyImportChanges([existing], [{ ...existing, id: 'incoming', origin: 'IMP' }]);
      expect(report.unchanged).toHaveLength(1);
      expect(report.changed).toHaveLength(0);
      expect(report.new).toHaveLength(0);
      expect(report.removed).toHaveLength(0);
    }
  });

  it('classifies a unique same-day time change as CHANGED, not an independent NEW + REMOVED pair', () => {
    const report = classifyImportChanges(
      [shift({ date: '2026-10-15', startTime: '11:00', endTime: '19:00' })],
      [shift({ id: 'incoming', date: '2026-10-15', startTime: '10:00', endTime: '18:00' })],
    );
    expect(report.changed).toHaveLength(1);
    expect(report.new).toHaveLength(0);
    expect(report.removed).toHaveLength(0);
  });

  it('pairs a changed main shift while preserving an exact extra on the same day', () => {
    const report = classifyImportChanges(
      [
        shift({ id: 'main', date: '2026-10-15', startTime: '11:00', endTime: '19:00' }),
        shift({ id: 'extra', date: '2026-10-15', startTime: '19:00', endTime: '20:00', shiftType: 'Extras' }),
      ],
      [
        shift({ id: 'incoming-main', date: '2026-10-15', startTime: '10:00', endTime: '18:00' }),
        shift({ id: 'incoming-extra', date: '2026-10-15', startTime: '19:00', endTime: '20:00', shiftType: 'Extras' }),
      ],
    );
    expect(report.unchanged.map(({ shift: row }) => row.id)).toEqual(['extra']);
    expect(report.changed.map(({ shift: row }) => row.id)).toEqual(['incoming-main']);
    expect(report.new).toHaveLength(0);
    expect(report.removed).toHaveLength(0);
  });

  it('keeps ambiguous multiple same-day rows explicit instead of pairing arbitrarily', () => {
    const report = classifyImportChanges(
      [
        shift({ id: 'first', date: '2026-10-15', startTime: '09:00', endTime: '17:00' }),
        shift({ id: 'second', date: '2026-10-15', startTime: '11:00', endTime: '19:00' }),
      ],
      [shift({ id: 'incoming', date: '2026-10-15', startTime: '10:00', endTime: '18:00' })],
    );
    expect(report.changed).toHaveLength(0);
    expect(report.new).toHaveLength(1);
    expect(report.removed).toHaveLength(2);
  });

  it('classifies a unique same-day type change as CHANGED', () => {
    const report = classifyImportChanges(
      [shift({ date: '2026-10-15', startTime: '', endTime: '', shiftType: 'Vacaciones' })],
      [shift({ id: 'incoming', date: '2026-10-15', startTime: '', endTime: '', shiftType: 'Libre' })],
    );
    expect(report.changed).toHaveLength(1);
    expect(report.new).toHaveLength(0);
    expect(report.removed).toHaveLength(0);
  });

  it('does not flag out-of-range shifts as REMOVED', () => {
    const existing = [shift({ id: 'july', date: '2026-07-15' })];
    const report = classifyImportChanges(existing, [shift({ id: 'aug', date: '2026-08-01' })]);
    expect(report.removed.length).toBe(0);
  });
});

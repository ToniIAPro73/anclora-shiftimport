import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  FORMAT_PROFILE_VERSION,
  computeLayoutSignature,
  deleteFormatProfile,
  detectProfileDrift,
  loadFormatProfiles,
  matchFormatProfile,
  saveFormatProfile,
  touchFormatProfile,
} from './format-profiles';
import type { UserFormatProfile } from './format-profiles';

setupLocalStorageMock();

const baseSignatureInput = {
  documentType: 'TYPE_A' as const,
  dayHeaderCount: 31,
  columnCount: 33,
  hasLegend: true,
  structureTokens: ['LUNES', 'MARTES', 'Nombre', 'Turno'],
};

const buildProfile = (overrides: Partial<UserFormatProfile> = {}): UserFormatProfile => ({
  profileVersion: FORMAT_PROFILE_VERSION,
  id: '',
  label: 'Cuadrante mensual',
  signature: computeLayoutSignature(baseSignatureInput),
  tokenAliases: { DL: 'Libre', M: 'Regular' },
  offTokens: ['DL'],
  employeeRow: { strategy: 'manual-row', rowIndex: 3 },
  parserParams: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
  createdAt: '',
  updatedAt: '',
  useCount: 0,
  ...overrides,
});

describe('format-profiles', () => {
  it('computes a deterministic signature regardless of token order and case', () => {
    const a = computeLayoutSignature(baseSignatureInput);
    const b = computeLayoutSignature({
      ...baseSignatureInput,
      structureTokens: ['turno', 'NOMBRE', 'martes', 'lunes', 'LUNES'],
    });
    expect(a.structureHash).toBe(b.structureHash);
    expect(a.structureHash).toMatch(/^[0-9a-f]{8}$/);
    expect(a.dayHeaderCount).toBe(31);
    expect(a.hasLegend).toBe(true);
  });

  it('round-trips a profile through persistence, filling id and timestamps', () => {
    const saved = saveFormatProfile(buildProfile());
    expect(saved.id).not.toBe('');
    expect(saved.createdAt).not.toBe('');
    expect(saved.updatedAt).not.toBe('');

    const loaded = loadFormatProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(saved);
  });

  it('upserts by id and deletes by id', () => {
    const saved = saveFormatProfile(buildProfile());
    const updated = saveFormatProfile({ ...saved, useCount: 5, label: 'Cuadrante semanal' });
    expect(loadFormatProfiles()).toHaveLength(1);
    expect(loadFormatProfiles()[0].label).toBe('Cuadrante semanal');
    expect(updated.id).toBe(saved.id);

    deleteFormatProfile(saved.id);
    expect(loadFormatProfiles()).toEqual([]);
  });

  it('matches an identical layout with score 1.0', () => {
    const saved = saveFormatProfile(buildProfile());
    const match = matchFormatProfile(computeLayoutSignature(baseSignatureInput));
    expect(match).not.toBeNull();
    expect(match?.score).toBe(1);
    expect(match?.profile.id).toBe(saved.id);
  });

  it('matches same documentType + dayHeaderCount with score 0.6 when the structure changed', () => {
    saveFormatProfile(buildProfile());
    const changed = computeLayoutSignature({
      ...baseSignatureInput,
      columnCount: 40,
      structureTokens: ['LUNES', 'MARTES', 'Empleado', 'Horario'],
    });
    const match = matchFormatProfile(changed);
    expect(match?.score).toBe(0.6);
  });

  it('returns null when nothing resembles the observed layout', () => {
    saveFormatProfile(buildProfile());
    const unrelated = computeLayoutSignature({
      ...baseSignatureInput,
      documentType: 'TYPE_B',
      dayHeaderCount: 7,
      structureTokens: ['otra', 'cosa'],
    });
    expect(matchFormatProfile(unrelated)).toBeNull();
  });

  it('detects drift when the column count changes', () => {
    const profile = saveFormatProfile(buildProfile());
    const observed = computeLayoutSignature({
      ...baseSignatureInput,
      columnCount: 40,
      structureTokens: ['LUNES', 'MARTES', 'Empleado', 'Horario'],
    });
    const report = detectProfileDrift(profile, observed);
    expect(report.drifted).toBe(true);
    expect(report.changedFields).toEqual(['structureHash', 'columnCount']);
  });

  it('reports no drift for an identical layout', () => {
    const profile = saveFormatProfile(buildProfile());
    const report = detectProfileDrift(profile, computeLayoutSignature(baseSignatureInput));
    expect(report).toEqual({ drifted: false, changedFields: [] });
  });

  it('touchFormatProfile bumps useCount and updatedAt only', () => {
    const saved = saveFormatProfile(buildProfile());
    const touched = touchFormatProfile(saved.id);
    expect(touched?.useCount).toBe(1);
    expect(touched).not.toBeNull();
    expect(touched!.updatedAt >= saved.updatedAt).toBe(true);
    expect(touchFormatProfile('missing-id')).toBeNull();
  });

  it('never persists third-party PII: names/ids in the source document are hashed away', () => {
    const coworkerName = 'María García López';
    const coworkerId = 'EMP-778899';
    const signature = computeLayoutSignature({
      ...baseSignatureInput,
      structureTokens: [coworkerName, coworkerId, 'Turno', 'Lunes'],
    });
    const profile = saveFormatProfile(buildProfile({
      label: 'Cuadrante mensual',
      signature,
      // identity-free row rule: the strategy, never the identifier value
      employeeRow: { strategy: 'identifier' },
    }));

    const serialized = JSON.stringify(loadFormatProfiles()) + JSON.stringify(profile);
    expect(serialized).not.toContain(coworkerName.toLowerCase());
    expect(serialized).not.toContain(coworkerId.toLowerCase());
    // The signature still matches structurally despite holding no clear text.
    expect(matchFormatProfile(signature)?.score).toBe(1);
  });
});

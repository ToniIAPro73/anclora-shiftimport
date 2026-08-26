import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  FORMAT_PROFILE_VERSION,
  computeLayoutSignature,
  deleteFormatProfile,
  detectProfileDrift,
  detectServerProfileDrift,
  loadFormatProfiles,
  matchFormatProfile,
  matchFormatProfileList,
  sanitizeFormatProfileForPersistence,
  saveFormatProfile,
  touchFormatProfile,
} from './format-profiles';
import type { FormatProfile, UserFormatProfile } from './format-profiles';

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

const validCandidatePayload = () => ({
  displayName: 'Cuadrante mensual',
  sourceType: 'pdf' as const,
  signature: computeLayoutSignature(baseSignatureInput),
  tokenAliases: { DL: 'libre', M: 'regular' },
  codeTimes: { M: { startTime: '08:00', endTime: '16:00' } },
  offTokens: ['DL'],
  employeeRowStrategy: 'manual-row' as const,
  employeeRowIndex: 3,
  dayColumnMap: { 0: 1, 1: 2 },
  tabularMemory: null,
  parserConfig: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
});

describe('sanitizeFormatProfileForPersistence', () => {
  it('accepts a well-formed candidate payload', () => {
    const result = sanitizeFormatProfileForPersistence(validCandidatePayload());
    expect(result.ok).toBe(true);
    expect(result.rejections).toEqual([]);
    expect(result.value?.displayName).toBe('Cuadrante mensual');
  });

  it('rejects a non-object payload', () => {
    expect(sanitizeFormatProfileForPersistence(null).ok).toBe(false);
    expect(sanitizeFormatProfileForPersistence('nope').ok).toBe(false);
    expect(sanitizeFormatProfileForPersistence([1, 2]).ok).toBe(false);
  });

  it('rejects any field outside the allowlist', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      employeeName: 'María García',
    });
    expect(result.ok).toBe(false);
    expect(result.rejections.some((r) => r.field === 'employeeName')).toBe(true);
  });

  it('rejects an email-shaped displayName', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      displayName: 'someone@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.rejections.some((r) => r.field === 'displayName')).toBe(true);
  });

  it('rejects a person-name-shaped displayName', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      displayName: 'María García López',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a payroll-id-shaped displayName (long digit run)', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      displayName: 'Formato EMP778899',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a tokenAlias value that looks like a name', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      tokenAliases: { DL: 'Juan Pérez Ruiz' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an oversize displayName', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      displayName: 'x'.repeat(81),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects too many tokenAliases entries', () => {
    const tokenAliases = Object.fromEntries(
      Array.from({ length: 61 }, (_, i) => [`T${i}`, 'regular']),
    );
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      tokenAliases,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid employeeRowStrategy', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      employeeRowStrategy: 'raw-text',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed codeTimes entry', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      codeTimes: { M: { startTime: 'not-a-time', endTime: '16:00' } },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing signature', () => {
    const { signature, ...rest } = validCandidatePayload();
    const result = sanitizeFormatProfileForPersistence(rest);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-uuid supersedesLogicalProfileId', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      supersedesLogicalProfileId: 'not-a-uuid',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a valid supersedesLogicalProfileId', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      supersedesLogicalProfileId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.ok).toBe(true);
    expect(result.value?.supersedesLogicalProfileId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects raw document text disguised as offTokens (name-shaped)', () => {
    const result = sanitizeFormatProfileForPersistence({
      ...validCandidatePayload(),
      offTokens: ['Ana Torres'],
    });
    expect(result.ok).toBe(false);
  });
});

const buildServerProfile = (overrides: Partial<FormatProfile> = {}): FormatProfile => ({
  id: 'p1',
  organizationId: 'org1',
  logicalProfileId: 'lp1',
  version: 1,
  status: 'validated',
  signature: computeLayoutSignature(baseSignatureInput),
  sourceType: 'pdf',
  displayName: 'Cuadrante mensual',
  parserConfig: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
  tokenAliases: {},
  codeTimes: {},
  offTokens: [],
  employeeRowStrategy: 'manual-row',
  employeeRowIndex: 3,
  dayColumnMap: null,
  tabularMemory: null,
  useCount: 0,
  successfulUseCount: 0,
  lastUsedAt: null,
  createdByUserId: null,
  supersedesProfileId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('matchFormatProfileList / detectServerProfileDrift', () => {
  it('matches exact structure at score 1.0 and skips deprecated rows', () => {
    const good = buildServerProfile({ id: 'good' });
    const deprecated = buildServerProfile({ id: 'dep', status: 'deprecated' });
    const match = matchFormatProfileList([deprecated, good], computeLayoutSignature(baseSignatureInput));
    expect(match?.profile.id).toBe('good');
    expect(match?.score).toBe(1);
  });

  it('detects drift on a server profile the same way as the local variant', () => {
    const profile = buildServerProfile();
    const observed = computeLayoutSignature({
      ...baseSignatureInput,
      columnCount: 99,
      structureTokens: ['algo', 'distinto'],
    });
    expect(detectServerProfileDrift(profile, observed).drifted).toBe(true);
  });
});

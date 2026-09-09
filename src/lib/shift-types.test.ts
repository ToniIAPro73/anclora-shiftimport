import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  DEFAULT_SHIFT_TYPES,
  FALLBACK_SHIFT_TYPE_COLOR,
  getShiftTypeColor,
  getShiftTypeDefinition,
  getShiftTypes,
  mergeShiftTypeOverrides,
  resolveShiftTypeId,
  setShiftTypeAlias,
  SHIFT_TYPE_PRESET_EXAMPLE,
  upsertShiftType,
} from './shift-types';

setupLocalStorageMock();

describe('configurable shift type registry', () => {
  it('defaults are neutral and company-agnostic', () => {
    const ids = getShiftTypes().map((type) => type.id);
    expect(ids).toEqual(['Regular', 'Libre', 'Vacaciones', 'Extras']);
    expect(ids).not.toContain('JT');
  });

  it('JT and company tokens are NOT universal semantics', () => {
    expect(resolveShiftTypeId('JT')).toBeNull();
    expect(resolveShiftTypeId('DL')).toBeNull();
    expect(resolveShiftTypeId('AJ')).toBeNull();
    expect(resolveShiftTypeId('OFF')).toBe('Libre');
    expect(resolveShiftTypeId('Regular')).toBe('Regular');
  });

  it('loads the legacy company preset on demand', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    expect(resolveShiftTypeId('JT')).toBe('JT');
    expect(resolveShiftTypeId('DL')).toBe('Libre');
    expect(resolveShiftTypeId('AJ')).toBeNull();
    expect(resolveShiftTypeId('TD')).toBe('Regular');
    expect(getShiftTypes().map((type) => type.id)).toContain('JT');
  });

  it('user can upsert a custom type', () => {
    upsertShiftType({
      id: 'Guardia',
      label: 'Guardia',
      shortLabel: 'GDA',
      color: '#123456',
      countsAsWork: true,
    });
    expect(getShiftTypes().map((type) => type.id)).toContain('Guardia');
    expect(resolveShiftTypeId('Guardia')).toBe('Guardia');
  });

  it('user can add a custom alias without touching code', () => {
    setShiftTypeAlias('libre-e', 'Libre');
    expect(resolveShiftTypeId('libre-e')).toBe('Libre');
  });

  it('custom aliases win over default aliases', () => {
    setShiftTypeAlias('off', 'Vacaciones');
    expect(resolveShiftTypeId('off')).toBe('Vacaciones');
  });

  it('defaults remain available after user overrides', () => {
    expect(DEFAULT_SHIFT_TYPES.some((type) => type.id === 'Libre')).toBe(true);
  });

  describe('getShiftTypeColor canonical color resolution and fallbacks', () => {
    it('resolves REGULAR_COLOR, LIBRE_COLOR, VACACIONES_COLOR from default registry', () => {
      expect(getShiftTypeColor('Regular')).toBe('#3b82f6');
      expect(getShiftTypeColor('Libre')).toBe('#ef4444');
      expect(getShiftTypeColor('Vacaciones')).toBe('#16a34a');
      expect(getShiftTypeColor('Extras')).toBe('#D4AF37');
    });

    it('resolves BAJA_COLOR when configured as non-working (countsAsWork: false)', () => {
      upsertShiftType({
        id: 'Baja',
        label: 'Baja médica',
        shortLabel: 'Baja',
        color: '#8b5cf6',
        countsAsWork: false,
      });
      expect(getShiftTypeColor('Baja')).toBe('#8b5cf6');
      // countsAsWork=false does NOT affect color resolution
      expect(getShiftTypeDefinition('Baja')?.countsAsWork).toBe(false);
      expect(getShiftTypeColor('Baja')).toBe('#8b5cf6');
    });

    it('resolves CUSTOM_SHIFT_TYPE_COLOR', () => {
      upsertShiftType({
        id: 'TurnoNoche',
        label: 'Turno de Noche',
        shortLabel: 'NOC',
        color: '#6366f1',
        countsAsWork: true,
      });
      expect(getShiftTypeColor('TurnoNoche')).toBe('#6366f1');
    });

    it('falls back to FALLBACK_SHIFT_TYPE_COLOR for unknown or invalid colors', () => {
      expect(getShiftTypeColor('NonExistentType')).toBe(FALLBACK_SHIFT_TYPE_COLOR);
      expect(getShiftTypeColor('')).toBe(FALLBACK_SHIFT_TYPE_COLOR);

      // Type with invalid hex/CSS color
      upsertShiftType({
        id: 'BrokenColorType',
        label: 'Broken',
        shortLabel: 'BRK',
        color: 'not-a-valid-hex',
        countsAsWork: true,
      });
      expect(getShiftTypeColor('BrokenColorType')).toBe(FALLBACK_SHIFT_TYPE_COLOR);
    });

    it('resolves color through aliases and case normalization', () => {
      expect(getShiftTypeColor('libre')).toBe('#ef4444');
      expect(getShiftTypeColor('regular')).toBe('#3b82f6');
    });
  });
});

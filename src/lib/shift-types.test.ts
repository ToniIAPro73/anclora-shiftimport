import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  DEFAULT_SHIFT_TYPES,
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
    expect(resolveShiftTypeId('AJ')).toBe('Libre');
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
});

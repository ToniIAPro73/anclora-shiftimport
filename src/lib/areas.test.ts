import { describe, expect, it } from 'vitest';
import { findActiveArea, findAreaMismatch, normalizeAreaKey } from './areas';
import { RemoteArea } from './remote';

const area = (over: Partial<RemoteArea> = {}): RemoteArea => ({
  id: 'area-1',
  name: 'Norte',
  code: 'N',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('normalizeAreaKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeAreaKey('  Norte ')).toBe('norte');
  });
});

describe('findActiveArea', () => {
  const areas = [area(), area({ id: 'area-2', name: 'Sur', code: null }), area({ id: 'area-3', name: 'Este', code: 'E', active: false })];

  it('matches by name, case- and whitespace-insensitive', () => {
    expect(findActiveArea(areas, ' norte ')?.id).toBe('area-1');
    expect(findActiveArea(areas, 'SUR')?.id).toBe('area-2');
  });

  it('matches by code', () => {
    expect(findActiveArea(areas, 'n')?.id).toBe('area-1');
  });

  it('never matches inactive areas', () => {
    expect(findActiveArea(areas, 'Este')).toBeNull();
    expect(findActiveArea(areas, 'e')).toBeNull();
  });

  it('returns null for unknown or empty references', () => {
    expect(findActiveArea(areas, 'Oeste')).toBeNull();
    expect(findActiveArea(areas, '')).toBeNull();
  });
});

describe('findAreaMismatch', () => {
  const areas = [area(), area({ id: 'area-2', name: 'Sur', code: null })];
  const employee = { name: 'Ana', areaId: 'area-2' };

  it('org-scoped imports (no target area) never mismatch', () => {
    expect(findAreaMismatch(employee, null, areas)).toBeNull();
    expect(findAreaMismatch(employee, undefined, areas)).toBeNull();
  });

  it('same area → no mismatch', () => {
    expect(findAreaMismatch(employee, 'area-2', areas)).toBeNull();
  });

  it('different area → mismatch with both area names resolved', () => {
    expect(findAreaMismatch(employee, 'area-1', areas)).toEqual({
      employeeName: 'Ana',
      employeeAreaName: 'Sur',
      targetAreaName: 'Norte',
    });
  });

  it('employee without an area never mismatches', () => {
    expect(findAreaMismatch({ name: 'Bea', areaId: null }, 'area-1', areas)).toBeNull();
  });

  it('falls back to the raw id when an area is no longer listed (deactivated)', () => {
    expect(findAreaMismatch({ name: 'Ana', areaId: 'area-gone' }, 'area-1', areas)?.employeeAreaName).toBe('area-gone');
  });
});

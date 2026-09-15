import { describe, expect, it } from 'vitest';
import { contrastRatio, getShiftVisualTokenKey, SHIFT_VISUAL_PALETTE } from './shift-visuals';

describe('semantic shift visual tokens', () => {
  it.each([
    ['Regular', 'regular'],
    ['JT', 'leadership'],
    ['Jefe de turno', 'leadership'],
    ['Ausencia', 'absence'],
    ['Libre', 'day-off'],
    ['Vacaciones', 'vacation'],
    ['Extras', 'overtime'],
    ['Baja', 'leave'],
    ['custom-company-type', 'custom'],
  ])('maps %s to the %s token group', (typeId, expected) => {
    expect(getShiftVisualTokenKey(typeId)).toBe(expected);
  });

  it.each(['light', 'dark'] as const)('keeps every %s text/background pair at AA', (theme) => {
    for (const palette of Object.values(SHIFT_VISUAL_PALETTE[theme])) {
      expect(contrastRatio(palette.foreground, palette.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'] as const)('keeps every %s border distinguishable from the calendar cell', (theme) => {
    const cell = theme === 'dark' ? '#192350' : '#ffffff';
    for (const palette of Object.values(SHIFT_VISUAL_PALETTE[theme])) {
      expect(contrastRatio(palette.border, cell)).toBeGreaterThanOrEqual(3);
    }
  });

  it('has complete non-empty tokens for Ausencia in both themes', () => {
    expect(SHIFT_VISUAL_PALETTE.light.absence).toEqual({
      background: '#f2e5fb', foreground: '#54216f', border: '#7a32aa',
    });
    expect(SHIFT_VISUAL_PALETTE.dark.absence).toEqual({
      background: '#3c2455', foreground: '#f0d6ff', border: '#d49aff',
    });
  });
});

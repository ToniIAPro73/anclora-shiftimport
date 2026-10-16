import type { CSSProperties } from 'react';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';

/** Accent for a shift type, resolved through the same theme tokens the calendar badges use. */
export function shiftAccentStyle(shiftTypeId: string): CSSProperties {
  const key = getShiftVisualTokenKey(shiftTypeId);
  return {
    ['--metric-accent' as string]: `var(--shift-${key}-border)`,
    ['--metric-tint' as string]: `var(--shift-${key}-background)`,
    ['--metric-ink' as string]: `var(--shift-${key}-foreground)`,
  };
}

/** Neutral/informative accent for metrics that are not a shift type (worked days, totals). */
export const NEUTRAL_ACCENT: CSSProperties = {
  ['--metric-accent' as string]: 'var(--color-accent)',
  ['--metric-tint' as string]: 'var(--panel-muted-bg)',
  ['--metric-ink' as string]: 'var(--text-primary)',
};

export type ShiftVisualTokenKey =
  | 'regular'
  | 'leadership'
  | 'absence'
  | 'day-off'
  | 'vacation'
  | 'overtime'
  | 'leave'
  | 'custom';

export interface ShiftVisualPalette {
  background: string;
  foreground: string;
  border: string;
}

/** The values mirror the CSS semantic tokens and make contrast regressions
 * testable without relying on a browser's rendering implementation. */
export const SHIFT_VISUAL_PALETTE: Record<'light' | 'dark', Record<ShiftVisualTokenKey, ShiftVisualPalette>> = {
  dark: {
    regular: { background: '#16345a', foreground: '#b9ddff', border: '#66b8ff' },
    leadership: { background: '#3b2b64', foreground: '#eadcff', border: '#c6a8ff' },
    absence: { background: '#3c2455', foreground: '#f0d6ff', border: '#d49aff' },
    'day-off': { background: '#4c232b', foreground: '#ffd0d5', border: '#ff8b98' },
    vacation: { background: '#184c3b', foreground: '#c8f6d9', border: '#60d69c' },
    overtime: { background: '#4d3b12', foreground: '#ffe8a3', border: '#f3c95c' },
    leave: { background: '#4a2e48', foreground: '#f8d0f1', border: '#ed9cdc' },
    custom: { background: '#26344a', foreground: '#d7e7fa', border: '#83a9d2' },
  },
  light: {
    regular: { background: '#e3f1ff', foreground: '#0e3d6e', border: '#2374b8' },
    leadership: { background: '#eee7ff', foreground: '#4b2b86', border: '#7045b7' },
    absence: { background: '#f2e5fb', foreground: '#54216f', border: '#7a32aa' },
    'day-off': { background: '#ffe7ea', foreground: '#8f1f2c', border: '#cf2436' },
    vacation: { background: '#e2f6e9', foreground: '#145a37', border: '#188a50' },
    overtime: { background: '#fff4cc', foreground: '#6b4c00', border: '#a47a00' },
    leave: { background: '#fbe7f5', foreground: '#76235f', border: '#ad4a95' },
    custom: { background: '#eef2f7', foreground: '#24344d', border: '#526a8b' },
  },
};

function channel(value: string): number {
  const normalized = value.replace('#', '');
  const raw = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const srgb = Number.parseInt(raw, 16) / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(first: string, second: string): number {
  const luminance = (color: string) => 0.2126 * channel(color.slice(0, 2)) + 0.7152 * channel(color.slice(2, 4)) + 0.0722 * channel(color.slice(4, 6));
  const firstLuminance = luminance(first.replace('#', ''));
  const secondLuminance = luminance(second.replace('#', ''));
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

/** Maps domain ids to semantic CSS token groups; labels never drive this. */
export function getShiftVisualTokenKey(typeId: string): ShiftVisualTokenKey {
  const normalized = typeId.trim().toLowerCase();
  if (normalized === 'regular') return 'regular';
  if (normalized === 'jt' || normalized === 'jefe de turno') return 'leadership';
  if (normalized === 'ausencia' || normalized === 'ausencias' || normalized === 'absence' || normalized === 'absences') return 'absence';
  if (normalized === 'libre' || normalized === 'día libre' || normalized === 'dia libre' || normalized === 'day off') return 'day-off';
  if (normalized === 'vacaciones' || normalized === 'vacation') return 'vacation';
  if (normalized === 'extras' || normalized === 'overtime') return 'overtime';
  if (normalized === 'baja' || normalized === 'leave' || normalized === 'sick leave') return 'leave';
  return 'custom';
}

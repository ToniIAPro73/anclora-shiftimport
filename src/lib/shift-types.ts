/**
 * Configurable shift type registry.
 *
 * Domain concept: ShiftTypeDefinition describes a kind of shift
 * (label, color, whether it counts as worked time).
 * Import aliases (PDF parser tokens like DL/AJ/OFF) are kept separate
 * and resolved onto type ids via resolveShiftTypeId.
 */
export interface ShiftTypeDefinition {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  countsAsWork: boolean;
  category?: string;
}

export const DEFAULT_SHIFT_TYPES: ShiftTypeDefinition[] = [
  { id: 'Regular', label: 'Regular', shortLabel: 'Regular', color: '#3b82f6', countsAsWork: true, category: 'work' },
  { id: 'JT', label: 'JT', shortLabel: 'JT', color: '#a78bfa', countsAsWork: true, category: 'work' },
  { id: 'Libre', label: 'Libre', shortLabel: 'Libres', color: '#ef4444', countsAsWork: false, category: 'absence' },
  { id: 'Extras', label: 'Extras', shortLabel: 'Extras', color: '#D4AF37', countsAsWork: true, category: 'work' },
  { id: 'Vacaciones', label: 'Vacaciones', shortLabel: 'VAC.', color: '#16a34a', countsAsWork: false, category: 'absence' },
];

export const FALLBACK_SHIFT_TYPE_COLOR = '#3b82f6';

const SHIFT_TYPE_ALIASES: Record<string, string> = {
  regular: 'Regular',
  td: 'Regular',
  jt: 'JT',
  extras: 'Extras',
  libre: 'Libre',
  dl: 'Libre',
  aj: 'Libre',
  off: 'Libre',
  vacaciones: 'Vacaciones',
  'vac.': 'Vacaciones',
  vac: 'Vacaciones',
};

/**
 * Resolves a raw token or alias (parser tokens, user input, stored labels)
 * to a registry type id. Returns null when the token is unknown.
 */
export const resolveShiftTypeId = (token: string): string | null => {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return SHIFT_TYPE_ALIASES[normalized] ?? null;
};

export const getShiftTypeDefinition = (typeId: string): ShiftTypeDefinition | undefined =>
  DEFAULT_SHIFT_TYPES.find((type) => type.id === typeId);

export const getShiftTypeColor = (typeId: string): string =>
  getShiftTypeDefinition(typeId)?.color ?? FALLBACK_SHIFT_TYPE_COLOR;

export const shiftTypeCountsAsWork = (typeId: string): boolean =>
  getShiftTypeDefinition(typeId)?.countsAsWork ?? true;

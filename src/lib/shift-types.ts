/**
 * Configurable shift type registry.
 *
 * Domain concept: ShiftTypeDefinition describes a kind of shift
 * (label, color, whether it counts as worked time).
 * Import aliases (PDF parser tokens like OFF) are kept separate
 * and resolved onto type ids via resolveShiftTypeId.
 *
 * The effective registry is DEFAULT_SHIFT_TYPES (neutral, generic for any
 * shift worker) merged with per-user overrides persisted in localStorage.
 * Company-specific types (e.g. JT) and aliases (dl/aj/td) are NOT product
 * defaults; they live in SHIFT_TYPE_PRESET_EXAMPLE as documentation and can
 * be loaded via mergeShiftTypeOverrides.
 */
export interface ShiftTypeDefinition {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  countsAsWork: boolean;
  category?: string;
}

export interface ShiftTypeOverrides {
  types: ShiftTypeDefinition[];
  aliases: Record<string, string>;
}

const SHIFT_TYPES_STORAGE_KEY = 'anclora_shiftimport_shift_types_v1';

export const DEFAULT_SHIFT_TYPES: ShiftTypeDefinition[] = [
  { id: 'Regular', label: 'Regular', shortLabel: 'Regular', color: '#3b82f6', countsAsWork: true, category: 'work' },
  { id: 'Libre', label: 'Libre', shortLabel: 'Libres', color: '#ef4444', countsAsWork: false, category: 'absence' },
  { id: 'Vacaciones', label: 'Vacaciones', shortLabel: 'VAC.', color: '#16a34a', countsAsWork: false, category: 'absence' },
  { id: 'Extras', label: 'Extras', shortLabel: 'Extras', color: '#D4AF37', countsAsWork: true, category: 'work' },
];

export const FALLBACK_SHIFT_TYPE_COLOR = '#3b82f6';

const DEFAULT_SHIFT_TYPE_ALIASES: Record<string, string> = {
  regular: 'Regular',
  trabajo: 'Regular',
  libre: 'Libre',
  off: 'Libre',
  vacaciones: 'Vacaciones',
  'vac.': 'Vacaciones',
  vac: 'Vacaciones',
  extras: 'Extras',
};

/**
 * Example preset for the legacy GroundSync-derived company calendar.
 * Loading it (mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE)) restores
 * the inherited behavior: JT as a work type and the company PDF tokens.
 */
export const SHIFT_TYPE_PRESET_EXAMPLE: ShiftTypeOverrides = {
  types: [
    { id: 'JT', label: 'JT', shortLabel: 'JT', color: '#a78bfa', countsAsWork: true, category: 'work' },
  ],
  aliases: {
    jt: 'JT',
    dl: 'Libre',
    aj: 'Libre',
    td: 'Regular',
  },
};

const EMPTY_OVERRIDES: ShiftTypeOverrides = { types: [], aliases: {} };

const normalizeTypeDefinition = (raw: Partial<ShiftTypeDefinition> | null | undefined): ShiftTypeDefinition | null => {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (!id) {
    return null;
  }

  return {
    id,
    label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : id,
    shortLabel: typeof raw?.shortLabel === 'string' && raw.shortLabel.trim() ? raw.shortLabel.trim() : id,
    color: typeof raw?.color === 'string' && raw.color.trim() ? raw.color.trim() : FALLBACK_SHIFT_TYPE_COLOR,
    countsAsWork: typeof raw?.countsAsWork === 'boolean' ? raw.countsAsWork : true,
    category: typeof raw?.category === 'string' && raw.category.trim() ? raw.category.trim() : undefined,
  };
};

const normalizeOverrides = (raw: Partial<ShiftTypeOverrides> | null | undefined): ShiftTypeOverrides => ({
  types: Array.isArray(raw?.types)
    ? raw.types.map(normalizeTypeDefinition).filter((type): type is ShiftTypeDefinition => type !== null)
    : [],
  aliases: raw?.aliases && typeof raw.aliases === 'object'
    ? Object.fromEntries(
      Object.entries(raw.aliases)
        .map(([token, typeId]) => [token.trim().toLowerCase(), String(typeId).trim()])
        .filter(([token, typeId]) => Boolean(token) && Boolean(typeId)),
    )
    : {},
});

export const loadShiftTypeOverrides = (): ShiftTypeOverrides => {
  const data = localStorage.getItem(SHIFT_TYPES_STORAGE_KEY);
  if (!data) {
    return { ...EMPTY_OVERRIDES, types: [], aliases: {} };
  }

  try {
    return normalizeOverrides(JSON.parse(data) as Partial<ShiftTypeOverrides>);
  } catch (e) {
    console.error('Failed to parse shift type overrides from storage', e);
    return { ...EMPTY_OVERRIDES, types: [], aliases: {} };
  }
};

export const saveShiftTypeOverrides = (overrides: ShiftTypeOverrides): void => {
  localStorage.setItem(SHIFT_TYPES_STORAGE_KEY, JSON.stringify(normalizeOverrides(overrides)));
};

/**
 * Merges additional types/aliases into the stored overrides and persists them.
 * Types replace by id; aliases replace by token.
 */
export const mergeShiftTypeOverrides = (addition: ShiftTypeOverrides): ShiftTypeOverrides => {
  const current = loadShiftTypeOverrides();
  const typesById = new Map(current.types.map((type) => [type.id, type]));
  for (const type of addition.types) {
    const normalized = normalizeTypeDefinition(type);
    if (normalized) {
      typesById.set(normalized.id, normalized);
    }
  }

  const next = normalizeOverrides({
    types: [...typesById.values()],
    aliases: { ...current.aliases, ...addition.aliases },
  });
  saveShiftTypeOverrides(next);
  return next;
};

export const upsertShiftType = (definition: ShiftTypeDefinition): ShiftTypeOverrides =>
  mergeShiftTypeOverrides({ types: [definition], aliases: {} });

export const setShiftTypeAlias = (token: string, typeId: string): ShiftTypeOverrides =>
  mergeShiftTypeOverrides({ types: [], aliases: { [token]: typeId } });

/**
 * Effective registry: neutral defaults merged with user overrides
 * (overrides replace defaults by id, and can add new types).
 */
export const getShiftTypes = (): ShiftTypeDefinition[] => {
  const overrides = loadShiftTypeOverrides();
  const typesById = new Map(DEFAULT_SHIFT_TYPES.map((type) => [type.id, type]));
  for (const type of overrides.types) {
    typesById.set(type.id, type);
  }
  return [...typesById.values()];
};

/**
 * Resolves a raw token or alias (parser tokens, user input, stored labels)
 * to a type id: custom aliases first, then default aliases, then an
 * id/label match against the effective registry. Null when unknown.
 */
export const resolveShiftTypeId = (token: string): string | null => {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const types = getShiftTypes();
  const isKnownTypeId = (typeId: string): boolean => types.some((type) => type.id === typeId);

  const customTarget = loadShiftTypeOverrides().aliases[normalized];
  if (customTarget && isKnownTypeId(customTarget)) {
    return customTarget;
  }

  const defaultTarget = DEFAULT_SHIFT_TYPE_ALIASES[normalized];
  if (defaultTarget && isKnownTypeId(defaultTarget)) {
    return defaultTarget;
  }

  return types.find(
    (type) => type.id.toLowerCase() === normalized || type.label.toLowerCase() === normalized,
  )?.id ?? null;
};

export const getShiftTypeDefinition = (typeId: string): ShiftTypeDefinition | undefined =>
  getShiftTypes().find((type) => type.id === typeId);

export const getShiftTypeColor = (typeId: string): string =>
  getShiftTypeDefinition(typeId)?.color ?? FALLBACK_SHIFT_TYPE_COLOR;

export const shiftTypeCountsAsWork = (typeId: string): boolean =>
  getShiftTypeDefinition(typeId)?.countsAsWork ?? true;

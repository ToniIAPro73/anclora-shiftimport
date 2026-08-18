import type { PdfDocumentType } from './import-types';

export const FORMAT_PROFILE_VERSION = 1;

export interface LayoutSignature {
  documentType: PdfDocumentType;
  /** structural fingerprint: sorted unique normalized header-ish tokens of the grid (day headers, legend labels) — NO person names */
  structureHash: string;
  dayHeaderCount: number;
  columnCount: number;
  hasLegend: boolean;
}

export interface UserFormatProfile {
  profileVersion: typeof FORMAT_PROFILE_VERSION;
  id: string; // uuid
  label: string; // user-facing, derived from doc type, e.g. "Cuadrante mensual" — never a person name
  signature: LayoutSignature;
  /** token → shiftTypeId learned from assistant answers (e.g. { DL: 'libre', M: 'regular' }) */
  tokenAliases: Record<string, string>;
  offTokens: string[];
  /** employee row rule WITHOUT identity: which row selection strategy worked */
  employeeRow: { strategy: 'identifier' | 'name' | 'manual-row'; rowIndex?: number };
  parserParams: { clusterTolerance: number; columnMatchMaxDistance: number };
  /**
   * Learned column→day correction from a day-mapping answer:
   * { columnClusterIndex: dayOfMonth }. Consumed only by the assistant
   * re-parse (parseWithDayMapping); the generic pipeline never auto-applies
   * it, so repeat documents still surface drift instead of silently
   * re-dating cells.
   */
  dayColumnMap?: Record<number, number>;
  /**
   * Tabular (CSV) layout memory: positional column indices of the parsed
   * table, so a repeat document can reuse the answered mapping without
   * re-asking. Indices only — never header text or cell content.
   */
  tabular?: {
    dateColumnIndex: number | null;
    employeeColumnIndex: number | null;
    valueColumnIndices: number[];
  };
  createdAt: string; // ISO
  updatedAt: string;
  useCount: number;
}

export interface ProfileDriftReport {
  drifted: boolean;
  changedFields: string[]; // e.g. ['dayHeaderCount','structureHash']
}

/**
 * Persisted user format profiles: the format assistant (Phase 1A) learns how
 * a document layout maps to shifts once, saves a profile here, and repeat
 * documents of the same layout are matched silently via matchFormatProfile.
 *
 * PII boundary: profiles describe the document FORMAT, never its contents.
 * Person names, employee ids and roster cell values are hashed into
 * structureHash (one-way) or kept only as strategy metadata (employeeRow)
 * — no third-party PII is stored.
 */

const FORMAT_PROFILES_STORAGE_KEY = 'anclora_shiftimport_format_profiles_v1';

const hasLocalStorage = (): boolean => typeof localStorage !== 'undefined';

/**
 * FNV-1a 32-bit hash as hex — small, deterministic, dependency-free.
 * One-way by design: layout tokens (which may contain a header cell with a
 * name on) never persist in clear text.
 */
const fnv1aHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const computeLayoutSignature = (input: {
  documentType: PdfDocumentType;
  dayHeaderCount: number;
  columnCount: number;
  hasLegend: boolean;
  structureTokens: string[];
}): LayoutSignature => {
  const normalizedTokens = [
    ...new Set(
      input.structureTokens.map((token) => token.trim().toLowerCase()).filter(Boolean),
    ),
  ].sort();
  return {
    documentType: input.documentType,
    structureHash: fnv1aHash(normalizedTokens.join('|')),
    dayHeaderCount: input.dayHeaderCount,
    columnCount: input.columnCount,
    hasLegend: input.hasLegend,
  };
};

const generateProfileId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeSignature = (raw: Partial<LayoutSignature> | null | undefined): LayoutSignature => ({
  documentType: typeof raw?.documentType === 'string' ? raw.documentType : 'UNKNOWN',
  structureHash: typeof raw?.structureHash === 'string' ? raw.structureHash : '',
  dayHeaderCount: typeof raw?.dayHeaderCount === 'number' ? raw.dayHeaderCount : 0,
  columnCount: typeof raw?.columnCount === 'number' ? raw.columnCount : 0,
  hasLegend: raw?.hasLegend === true,
});

const normalizeDayColumnMap = (
  raw: unknown,
): Record<number, number> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([columnIndex, day]) => [Number(columnIndex), Number(day)] as const)
    .filter(([columnIndex, day]) =>
      Number.isInteger(columnIndex) && columnIndex >= 0 && Number.isInteger(day) && day >= 1);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeTabularMemory = (
  raw: unknown,
): UserFormatProfile['tabular'] | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const candidate = raw as Partial<NonNullable<UserFormatProfile['tabular']>>;
  const dateColumnIndex = typeof candidate.dateColumnIndex === 'number' ? candidate.dateColumnIndex : null;
  const employeeColumnIndex = typeof candidate.employeeColumnIndex === 'number' ? candidate.employeeColumnIndex : null;
  const valueColumnIndices = Array.isArray(candidate.valueColumnIndices)
    ? candidate.valueColumnIndices.filter((index): index is number => Number.isInteger(index) && index >= 0)
    : [];
  return { dateColumnIndex, employeeColumnIndex, valueColumnIndices };
};

const normalizeProfile = (
  raw: Partial<UserFormatProfile> | null | undefined,
  now: string,
): UserFormatProfile | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!label) {
    return null;
  }
  return {
    profileVersion: FORMAT_PROFILE_VERSION,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateProfileId(),
    label,
    signature: normalizeSignature(raw.signature),
    tokenAliases: raw.tokenAliases && typeof raw.tokenAliases === 'object'
      ? Object.fromEntries(
        Object.entries(raw.tokenAliases)
          .map(([token, typeId]) => [token.trim(), String(typeId).trim()])
          .filter(([token, typeId]) => Boolean(token) && Boolean(typeId)),
      )
      : {},
    offTokens: Array.isArray(raw.offTokens)
      ? raw.offTokens.map((token) => String(token).trim()).filter(Boolean)
      : [],
    employeeRow: {
      strategy: raw.employeeRow?.strategy === 'identifier' || raw.employeeRow?.strategy === 'name'
        ? raw.employeeRow.strategy
        : 'manual-row',
      rowIndex: typeof raw.employeeRow?.rowIndex === 'number' ? raw.employeeRow.rowIndex : undefined,
    },
    parserParams: {
      clusterTolerance: typeof raw.parserParams?.clusterTolerance === 'number' ? raw.parserParams.clusterTolerance : 0,
      columnMatchMaxDistance: typeof raw.parserParams?.columnMatchMaxDistance === 'number' ? raw.parserParams.columnMatchMaxDistance : 0,
    },
    ...(normalizeDayColumnMap(raw.dayColumnMap) ? { dayColumnMap: normalizeDayColumnMap(raw.dayColumnMap) } : {}),
    ...(normalizeTabularMemory(raw.tabular) ? { tabular: normalizeTabularMemory(raw.tabular) } : {}),
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now,
    useCount: typeof raw.useCount === 'number' && raw.useCount >= 0 ? raw.useCount : 0,
  };
};

export const loadFormatProfiles = (): UserFormatProfile[] => {
  if (!hasLocalStorage()) {
    return [];
  }
  const data = localStorage.getItem(FORMAT_PROFILES_STORAGE_KEY);
  if (!data) {
    return [];
  }

  try {
    const parsed = JSON.parse(data) as Array<Partial<UserFormatProfile>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const now = new Date().toISOString();
    return parsed
      .map((raw) => normalizeProfile(raw, now))
      .filter((profile): profile is UserFormatProfile => profile !== null);
  } catch (e) {
    console.error('Failed to parse format profiles from storage', e);
    return [];
  }
};

const persistProfiles = (profiles: UserFormatProfile[]): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(FORMAT_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
};

/** Upserts a profile by id; missing id/timestamps are filled in. */
export const saveFormatProfile = (profile: UserFormatProfile): UserFormatProfile => {
  const normalized = normalizeProfile(profile, new Date().toISOString());
  if (!normalized) {
    throw new Error('Cannot save a format profile without a label');
  }
  const profiles = loadFormatProfiles();
  const index = profiles.findIndex((existing) => existing.id === normalized.id);
  if (index >= 0) {
    profiles[index] = normalized;
  } else {
    profiles.push(normalized);
  }
  persistProfiles(profiles);
  return normalized;
};

export const deleteFormatProfile = (id: string): void => {
  const profiles = loadFormatProfiles().filter((profile) => profile.id !== id);
  persistProfiles(profiles);
};

/**
 * Silent matching for repeat documents: an exact structural fingerprint
 * scores 1.0; the same document type with the same day-header layout scores
 * 0.6 (a candidate for drift inspection); anything else does not match.
 */
export const matchFormatProfile = (
  signature: LayoutSignature,
): { profile: UserFormatProfile; score: number } | null => {
  let best: { profile: UserFormatProfile; score: number } | null = null;
  for (const profile of loadFormatProfiles()) {
    let score: number | null = null;
    if (profile.signature.structureHash === signature.structureHash) {
      score = 1;
    } else if (
      profile.signature.documentType === signature.documentType
      && profile.signature.dayHeaderCount === signature.dayHeaderCount
    ) {
      score = 0.6;
    }
    if (score !== null && (best === null || score > best.score)) {
      best = { profile, score };
    }
  }
  return best;
};

/** Compares a stored profile's signature against a freshly observed layout. */
export const detectProfileDrift = (
  profile: UserFormatProfile,
  observed: LayoutSignature,
): ProfileDriftReport => {
  const fields: Array<keyof LayoutSignature> = [
    'documentType',
    'structureHash',
    'dayHeaderCount',
    'columnCount',
    'hasLegend',
  ];
  const changedFields = fields.filter(
    (field) => profile.signature[field] !== observed[field],
  );
  return { drifted: changedFields.length > 0, changedFields };
};

/**
 * Cheap history: bumps useCount/updatedAt on a successful match. No version
 * archive — the previous signature is intentionally not kept.
 */
export const touchFormatProfile = (id: string): UserFormatProfile | null => {
  const profiles = loadFormatProfiles();
  const index = profiles.findIndex((profile) => profile.id === id);
  if (index < 0) {
    return null;
  }
  const updated: UserFormatProfile = {
    ...profiles[index],
    useCount: profiles[index].useCount + 1,
    updatedAt: new Date().toISOString(),
  };
  profiles[index] = updated;
  persistProfiles(profiles);
  return updated;
};

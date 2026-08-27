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
  /**
   * Learned work-code times: token → { startTime, endTime } for codes the
   * user classified as work with explicit times (guided recovery). Rest
   * codes need no entry — their tokenAlias suffices. Document tokens only,
   * never person data.
   */
  codeTimes?: Record<string, { startTime: string; endTime: string }>;
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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizeCodeTimes = (
  raw: unknown,
): Record<string, { startTime: string; endTime: string }> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([token, value]) => {
      const times = value as Partial<{ startTime: unknown; endTime: unknown }> | null;
      const startTime = typeof times?.startTime === 'string' ? times.startTime : '';
      const endTime = typeof times?.endTime === 'string' ? times.endTime : '';
      return [token.trim(), { startTime, endTime }] as const;
    })
    .filter(([token, times]) =>
      Boolean(token) && TIME_PATTERN.test(times.startTime) && TIME_PATTERN.test(times.endTime));
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
    ...(normalizeCodeTimes(raw.codeTimes) ? { codeTimes: normalizeCodeTimes(raw.codeTimes) } : {}),
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

// ---------------------------------------------------------------------------
// Server-canonical model (Format Memory v1, organization-scoped persistence).
// Additive to the client-only UserFormatProfile above; see
// sdd/features/format-memory-v1/01_TECHNICAL_DESIGN.md.
// ---------------------------------------------------------------------------

export type FormatProfileStatus = 'candidate' | 'validated' | 'verified' | 'legacy' | 'deprecated';

export type FormatProfileSourceType = 'pdf' | 'tabular';

export type UseOutcome = 'success' | 'failure';

/** Server-persisted, organization-scoped format profile (one version). */
export interface FormatProfile {
  id: string;
  organizationId: string;
  logicalProfileId: string;
  version: number;
  status: FormatProfileStatus;
  signature: LayoutSignature;
  sourceType: FormatProfileSourceType;
  displayName: string;
  parserConfig: { clusterTolerance: number; columnMatchMaxDistance: number };
  tokenAliases: Record<string, string>;
  codeTimes: Record<string, { startTime: string; endTime: string }>;
  offTokens: string[];
  employeeRowStrategy: 'identifier' | 'name' | 'manual-row';
  employeeRowIndex: number | null;
  dayColumnMap: Record<number, number> | null;
  tabularMemory: UserFormatProfile['tabular'] | null;
  useCount: number;
  successfulUseCount: number;
  lastUsedAt: string | null;
  createdByUserId: string | null;
  supersedesProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input accepted from a client wanting to persist a new candidate version. */
export interface CandidateProfileInput {
  displayName: string;
  sourceType: FormatProfileSourceType;
  signature: LayoutSignature;
  tokenAliases: Record<string, string>;
  codeTimes: Record<string, { startTime: string; endTime: string }>;
  offTokens: string[];
  employeeRowStrategy: 'identifier' | 'name' | 'manual-row';
  employeeRowIndex: number | null;
  dayColumnMap: Record<number, number> | null;
  tabularMemory: UserFormatProfile['tabular'] | null;
  parserConfig: { clusterTolerance: number; columnMatchMaxDistance: number };
  /** Set when this candidate is a drift re-teach of an existing logical family. */
  supersedesLogicalProfileId?: string;
}

export interface ProfileMatch {
  profile: FormatProfile;
  score: number;
}

const MAX_DISPLAY_NAME = 80;
const MAX_ALIAS_ENTRIES = 60;
const MAX_ALIAS_LEN = 40;
const MAX_OFF_TOKENS = 60;
const MAX_OFF_TOKEN_LEN = 20;
const MAX_DAY_COLUMN_ENTRIES = 31;
const MAX_EMPLOYEE_ROW_INDEX = 9999;

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Long digit runs read as payroll/external ids, never a legitimate alias/label. */
const LONG_DIGIT_RUN = /\d{5,}/;
/** "Firstname Lastname"-shaped text: two+ capitalized words, no digits/symbols. */
const NAME_SHAPED = /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+)(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+)+$/;

export interface SanitizationRejection {
  field: string;
  reason: string;
}

export interface SanitizationResult {
  ok: boolean;
  value?: CandidateProfileInput;
  rejections: SanitizationRejection[];
}

const looksLikePii = (text: string): string | null => {
  if (EMAIL_PATTERN.test(text)) return 'looks like an email address';
  if (LONG_DIGIT_RUN.test(text)) return 'looks like an external/payroll id';
  if (NAME_SHAPED.test(text.trim())) return 'looks like a person name';
  return null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Central, authoritative re-validation of any payload that wants to become a
 * persisted FormatProfile. Called both by the API (authoritative) and,
 * optionally, by the client for early UX feedback — the API must NEVER trust
 * a client-side pass of this function and must always re-run it itself.
 *
 * Allowlist-only: any key outside the known shape causes the whole payload to
 * be rejected (fail closed), never silently dropped-and-accepted.
 */
export const sanitizeFormatProfileForPersistence = (
  input: unknown,
): SanitizationResult => {
  const rejections: SanitizationRejection[] = [];
  const reject = (field: string, reason: string) => rejections.push({ field, reason });

  if (!isPlainObject(input)) {
    return { ok: false, rejections: [{ field: '$', reason: 'payload must be an object' }] };
  }

  const allowedKeys = new Set([
    'displayName', 'sourceType', 'signature', 'tokenAliases', 'codeTimes',
    'offTokens', 'employeeRowStrategy', 'employeeRowIndex', 'dayColumnMap',
    'tabularMemory', 'parserConfig', 'supersedesLogicalProfileId',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      reject(key, 'unknown field not on the allowlist');
    }
  }

  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (!displayName) {
    reject('displayName', 'required');
  } else if (displayName.length > MAX_DISPLAY_NAME) {
    reject('displayName', `exceeds ${MAX_DISPLAY_NAME} characters`);
  } else {
    const piiReason = looksLikePii(displayName);
    if (piiReason) reject('displayName', piiReason);
  }

  const sourceType = input.sourceType === 'pdf' || input.sourceType === 'tabular' ? input.sourceType : null;
  if (!sourceType) reject('sourceType', 'must be "pdf" or "tabular"');

  const signature = isPlainObject(input.signature) ? normalizeSignature(input.signature as Partial<LayoutSignature>) : null;
  if (!signature || !signature.structureHash) {
    reject('signature', 'missing or invalid structural signature');
  } else if (signature.structureHash.length > 64) {
    reject('signature.structureHash', 'exceeds 64 characters');
  }

  let tokenAliases: Record<string, string> = {};
  if (input.tokenAliases !== undefined) {
    if (!isPlainObject(input.tokenAliases)) {
      reject('tokenAliases', 'must be an object');
    } else {
      const entries = Object.entries(input.tokenAliases);
      if (entries.length > MAX_ALIAS_ENTRIES) {
        reject('tokenAliases', `exceeds ${MAX_ALIAS_ENTRIES} entries`);
      }
      for (const [token, typeId] of entries) {
        if (token.length > MAX_ALIAS_LEN || String(typeId).length > MAX_ALIAS_LEN) {
          reject('tokenAliases', `entry "${token}" exceeds ${MAX_ALIAS_LEN} characters`);
          continue;
        }
        if (typeof typeId !== 'string') {
          reject('tokenAliases', `entry "${token}" value must be a string`);
          continue;
        }
        const piiReason = looksLikePii(token) || looksLikePii(typeId);
        if (piiReason) {
          reject('tokenAliases', `entry "${token}" ${piiReason}`);
          continue;
        }
        tokenAliases[token] = typeId;
      }
    }
  }

  let codeTimes: Record<string, { startTime: string; endTime: string }> = {};
  if (input.codeTimes !== undefined) {
    if (!isPlainObject(input.codeTimes)) {
      reject('codeTimes', 'must be an object');
    } else {
      const entries = Object.entries(input.codeTimes);
      if (entries.length > MAX_ALIAS_ENTRIES) {
        reject('codeTimes', `exceeds ${MAX_ALIAS_ENTRIES} entries`);
      }
      for (const [token, value] of entries) {
        const times = value as Partial<{ startTime: unknown; endTime: unknown }> | null;
        const startTime = typeof times?.startTime === 'string' ? times.startTime : '';
        const endTime = typeof times?.endTime === 'string' ? times.endTime : '';
        if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
          reject('codeTimes', `entry "${token}" has an invalid time`);
          continue;
        }
        const piiReason = looksLikePii(token);
        if (piiReason) {
          reject('codeTimes', `entry "${token}" ${piiReason}`);
          continue;
        }
        codeTimes[token] = { startTime, endTime };
      }
    }
  }

  let offTokens: string[] = [];
  if (input.offTokens !== undefined) {
    if (!Array.isArray(input.offTokens)) {
      reject('offTokens', 'must be an array');
    } else {
      if (input.offTokens.length > MAX_OFF_TOKENS) {
        reject('offTokens', `exceeds ${MAX_OFF_TOKENS} entries`);
      }
      for (const raw of input.offTokens) {
        const token = String(raw).trim();
        if (token.length > MAX_OFF_TOKEN_LEN) {
          reject('offTokens', `entry "${token}" exceeds ${MAX_OFF_TOKEN_LEN} characters`);
          continue;
        }
        const piiReason = looksLikePii(token);
        if (piiReason) {
          reject('offTokens', `entry "${token}" ${piiReason}`);
          continue;
        }
        offTokens.push(token);
      }
    }
  }

  const employeeRowStrategy = input.employeeRowStrategy === 'identifier'
    || input.employeeRowStrategy === 'name'
    || input.employeeRowStrategy === 'manual-row'
    ? input.employeeRowStrategy
    : null;
  if (!employeeRowStrategy) reject('employeeRowStrategy', 'must be "identifier", "name" or "manual-row"');

  let employeeRowIndex: number | null = null;
  if (input.employeeRowIndex !== undefined && input.employeeRowIndex !== null) {
    if (typeof input.employeeRowIndex !== 'number' || !Number.isInteger(input.employeeRowIndex)
      || input.employeeRowIndex < 0 || input.employeeRowIndex > MAX_EMPLOYEE_ROW_INDEX) {
      reject('employeeRowIndex', `must be an integer 0-${MAX_EMPLOYEE_ROW_INDEX}`);
    } else {
      employeeRowIndex = input.employeeRowIndex;
    }
  }

  let dayColumnMap: Record<number, number> | null = null;
  if (input.dayColumnMap !== undefined && input.dayColumnMap !== null) {
    if (!isPlainObject(input.dayColumnMap)) {
      reject('dayColumnMap', 'must be an object');
    } else {
      const entries = Object.entries(input.dayColumnMap);
      if (entries.length > MAX_DAY_COLUMN_ENTRIES) {
        reject('dayColumnMap', `exceeds ${MAX_DAY_COLUMN_ENTRIES} entries`);
      }
      const normalized = normalizeDayColumnMap(input.dayColumnMap);
      dayColumnMap = normalized ?? null;
    }
  }

  let tabularMemory: UserFormatProfile['tabular'] | null = null;
  if (input.tabularMemory !== undefined && input.tabularMemory !== null) {
    if (!isPlainObject(input.tabularMemory)) {
      reject('tabularMemory', 'must be an object');
    } else {
      tabularMemory = normalizeTabularMemory(input.tabularMemory) ?? null;
    }
  }

  let parserConfig = { clusterTolerance: 0, columnMatchMaxDistance: 0 };
  if (input.parserConfig !== undefined) {
    if (!isPlainObject(input.parserConfig)
      || typeof input.parserConfig.clusterTolerance !== 'number'
      || typeof input.parserConfig.columnMatchMaxDistance !== 'number') {
      reject('parserConfig', 'must be { clusterTolerance: number, columnMatchMaxDistance: number }');
    } else {
      parserConfig = {
        clusterTolerance: input.parserConfig.clusterTolerance,
        columnMatchMaxDistance: input.parserConfig.columnMatchMaxDistance,
      };
    }
  }

  let supersedesLogicalProfileId: string | undefined;
  if (input.supersedesLogicalProfileId !== undefined) {
    if (typeof input.supersedesLogicalProfileId !== 'string' || !UUID_PATTERN.test(input.supersedesLogicalProfileId)) {
      reject('supersedesLogicalProfileId', 'must be a UUID');
    } else {
      supersedesLogicalProfileId = input.supersedesLogicalProfileId;
    }
  }

  if (rejections.length > 0) {
    return { ok: false, rejections };
  }

  return {
    ok: true,
    rejections: [],
    value: {
      displayName,
      sourceType: sourceType as FormatProfileSourceType,
      signature: signature as LayoutSignature,
      tokenAliases,
      codeTimes,
      offTokens,
      employeeRowStrategy: employeeRowStrategy as CandidateProfileInput['employeeRowStrategy'],
      employeeRowIndex,
      dayColumnMap,
      tabularMemory,
      parserConfig,
      ...(supersedesLogicalProfileId ? { supersedesLogicalProfileId } : {}),
    },
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Two-tier scoring shared by the local and remote match paths: exact
 * structural hash scores 1.0; same document type + day-header count scores
 * 0.6 (drift-candidate territory); anything else does not match. Mirrors
 * matchFormatProfile above but operates over server FormatProfile rows.
 */
export const matchFormatProfileList = (
  profiles: FormatProfile[],
  signature: LayoutSignature,
): ProfileMatch | null => {
  let best: ProfileMatch | null = null;
  for (const profile of profiles) {
    if (profile.status === 'deprecated') continue;
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

/** Compares a stored server profile's signature against a freshly observed layout. */
export const detectServerProfileDrift = (
  profile: FormatProfile,
  observed: LayoutSignature,
): ProfileDriftReport => {
  const fields: Array<keyof LayoutSignature> = [
    'documentType', 'structureHash', 'dayHeaderCount', 'columnCount', 'hasLegend',
  ];
  const changedFields = fields.filter((field) => profile.signature[field] !== observed[field]);
  return { drifted: changedFields.length > 0, changedFields };
};

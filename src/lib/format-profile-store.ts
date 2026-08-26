import { apiFetch } from './session';
import {
  CandidateProfileInput,
  FormatProfile,
  FormatProfileStatus,
  LayoutSignature,
  ProfileMatch,
  UseOutcome,
  UserFormatProfile,
  deleteFormatProfile,
  detectServerProfileDrift,
  loadFormatProfiles,
  matchFormatProfileList,
  saveFormatProfile,
  touchFormatProfile,
} from './format-profiles';

/**
 * Persistence abstraction for learned format profiles (Format Memory v1).
 * Ingestion (`src/ingestion/analysis.ts`) and UI (`ImportModal.tsx`,
 * `ProfileAssistantPanel.tsx`) call this interface only — never
 * `localStorage` or `fetch` directly — so the same code path works for both
 * guest (local) and authenticated (organization) sessions. See
 * sdd/features/format-memory-v1/01_TECHNICAL_DESIGN.md.
 */
export interface FormatProfileStore {
  list(): Promise<FormatProfile[]>;
  findMatch(signature: LayoutSignature): Promise<ProfileMatch | null>;
  saveCandidate(input: CandidateProfileInput): Promise<FormatProfile>;
  recordUse(profileId: string, outcome: UseOutcome): Promise<void>;
  confirm(profileId: string): Promise<FormatProfile>;
  deprecate(profileId: string): Promise<FormatProfile>;
  reactivate(profileId: string): Promise<FormatProfile>;
  rename(profileId: string, displayName: string): Promise<FormatProfile>;
}

const localSourceType = (profile: UserFormatProfile): 'pdf' | 'tabular' =>
  (profile.tabular ? 'tabular' : 'pdf');

/** Local (guest) profiles have no server lifecycle: they behave as if
 * always `validated` (auto-selectable) until deleted. */
const localToFormatProfile = (profile: UserFormatProfile): FormatProfile => ({
  id: profile.id,
  organizationId: 'local',
  logicalProfileId: profile.id,
  version: 1,
  status: 'validated',
  signature: profile.signature,
  sourceType: localSourceType(profile),
  displayName: profile.label,
  parserConfig: profile.parserParams,
  tokenAliases: profile.tokenAliases,
  codeTimes: profile.codeTimes ?? {},
  offTokens: profile.offTokens,
  employeeRowStrategy: profile.employeeRow.strategy,
  employeeRowIndex: profile.employeeRow.rowIndex ?? null,
  dayColumnMap: profile.dayColumnMap ?? null,
  tabularMemory: profile.tabular ?? null,
  useCount: profile.useCount,
  successfulUseCount: profile.useCount,
  lastUsedAt: profile.updatedAt,
  createdByUserId: null,
  supersedesProfileId: null,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

/**
 * Adapts a just-learned local profile (assistant output) into the
 * candidate-input shape the store interface accepts. Shared by the assistant
 * panel (teach flow) and the local→organization migration modal so the
 * allowlist field set is defined in exactly one place.
 */
export const candidateInputFromLocalProfile = (profile: UserFormatProfile): CandidateProfileInput => ({
  displayName: profile.label,
  sourceType: localSourceType(profile),
  signature: profile.signature,
  tokenAliases: profile.tokenAliases,
  codeTimes: profile.codeTimes ?? {},
  offTokens: profile.offTokens,
  employeeRowStrategy: profile.employeeRow.strategy,
  employeeRowIndex: profile.employeeRow.rowIndex ?? null,
  dayColumnMap: profile.dayColumnMap ?? null,
  tabularMemory: profile.tabular ?? null,
  parserConfig: profile.parserParams,
});

/**
 * Adapts server FormatProfile rows into the local UserFormatProfile shape
 * consumed by the (unchanged) matching/drift/code-override functions in
 * `src/ingestion/analysis.ts` — the ingestion pipeline's `profilesHint`
 * parameter already exists precisely to accept a pre-loaded list instead of
 * reading localStorage itself, so this is the only integration point
 * FM-06 needs (see 01_TECHNICAL_DESIGN.md).
 */
export const toProfileHintList = (profiles: FormatProfile[]): UserFormatProfile[] =>
  profiles
    .filter((p) => p.status !== 'deprecated')
    .map((p) => ({
      profileVersion: 1,
      id: p.id,
      label: p.displayName,
      signature: p.signature,
      tokenAliases: p.tokenAliases,
      ...(Object.keys(p.codeTimes).length > 0 ? { codeTimes: p.codeTimes } : {}),
      offTokens: p.offTokens,
      employeeRow: {
        strategy: p.employeeRowStrategy,
        ...(p.employeeRowIndex !== null ? { rowIndex: p.employeeRowIndex } : {}),
      },
      parserParams: p.parserConfig,
      ...(p.dayColumnMap ? { dayColumnMap: p.dayColumnMap } : {}),
      ...(p.tabularMemory ? { tabular: p.tabularMemory } : {}),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      useCount: p.useCount,
    }));

const candidateInputToLocalProfile = (input: CandidateProfileInput): UserFormatProfile => ({
  profileVersion: 1,
  id: '',
  label: input.displayName,
  signature: input.signature,
  tokenAliases: input.tokenAliases,
  ...(Object.keys(input.codeTimes).length > 0 ? { codeTimes: input.codeTimes } : {}),
  offTokens: input.offTokens,
  employeeRow: {
    strategy: input.employeeRowStrategy,
    ...(input.employeeRowIndex !== null ? { rowIndex: input.employeeRowIndex } : {}),
  },
  parserParams: input.parserConfig,
  ...(input.dayColumnMap ? { dayColumnMap: input.dayColumnMap } : {}),
  ...(input.tabularMemory ? { tabular: input.tabularMemory } : {}),
  createdAt: '',
  updatedAt: '',
  useCount: 0,
});

/**
 * Guest-mode store: unchanged localStorage-backed behavior. Byte-for-byte
 * compatible with the pre-Format-Memory-v1 flow.
 */
export class LocalFormatProfileStore implements FormatProfileStore {
  async list(): Promise<FormatProfile[]> {
    return loadFormatProfiles().map(localToFormatProfile);
  }

  async findMatch(signature: LayoutSignature): Promise<ProfileMatch | null> {
    return matchFormatProfileList(await this.list(), signature);
  }

  async saveCandidate(input: CandidateProfileInput): Promise<FormatProfile> {
    const saved = saveFormatProfile(candidateInputToLocalProfile(input));
    return localToFormatProfile(saved);
  }

  async recordUse(profileId: string, outcome: UseOutcome): Promise<void> {
    // Local profiles have no success/failure distinction (legacy touchFormatProfile behavior).
    void outcome;
    touchFormatProfile(profileId);
  }

  async confirm(profileId: string): Promise<FormatProfile> {
    const profile = loadFormatProfiles().find((p) => p.id === profileId);
    if (!profile) throw new Error('Format profile not found');
    return localToFormatProfile(profile);
  }

  async deprecate(profileId: string): Promise<FormatProfile> {
    const profile = loadFormatProfiles().find((p) => p.id === profileId);
    if (!profile) throw new Error('Format profile not found');
    deleteFormatProfile(profileId);
    return { ...localToFormatProfile(profile), status: 'deprecated' };
  }

  async reactivate(profileId: string): Promise<FormatProfile> {
    return this.confirm(profileId);
  }

  async rename(profileId: string, displayName: string): Promise<FormatProfile> {
    const profile = loadFormatProfiles().find((p) => p.id === profileId);
    if (!profile) throw new Error('Format profile not found');
    const saved = saveFormatProfile({ ...profile, label: displayName });
    return localToFormatProfile(saved);
  }
}

interface RemoteProfileResponse {
  id: string;
  organizationId: string;
  logicalProfileId: string;
  version: number;
  status: FormatProfileStatus;
  signature: LayoutSignature;
  sourceType: 'pdf' | 'tabular';
  displayName: string;
  parserConfig: FormatProfile['parserConfig'];
  tokenAliases: Record<string, string>;
  codeTimes: FormatProfile['codeTimes'];
  offTokens: string[];
  employeeRowStrategy: FormatProfile['employeeRowStrategy'];
  employeeRowIndex: number | null;
  dayColumnMap: Record<number, number> | null;
  tabularMemory: FormatProfile['tabularMemory'];
  useCount: number;
  successfulUseCount: number;
  lastUsedAt: string | null;
  createdByUserId: string | null;
  supersedesProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Organization store (authenticated sessions). In-memory cache per
 * instance only — a new instance is created on login, logout, or
 * organization switch (see `getFormatProfileStore`), so stale cross-org
 * data is never served: the cache dies with the instance, never merges.
 * A remote failure never touches local data — this store never reads or
 * writes `localStorage`.
 */
export class RemoteOrganizationFormatProfileStore implements FormatProfileStore {
  private cache: FormatProfile[] | null = null;

  async list(): Promise<FormatProfile[]> {
    if (this.cache) return this.cache;
    const payload = await apiFetch<{ profiles: RemoteProfileResponse[] }>('/api/format-profiles');
    this.cache = payload.profiles;
    return this.cache;
  }

  async findMatch(signature: LayoutSignature): Promise<ProfileMatch | null> {
    return matchFormatProfileList(await this.list(), signature);
  }

  async saveCandidate(input: CandidateProfileInput): Promise<FormatProfile> {
    const payload = await apiFetch<{ profile: RemoteProfileResponse }>('/api/format-profiles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    this.cache = null;
    return payload.profile;
  }

  async recordUse(profileId: string, outcome: UseOutcome): Promise<void> {
    await apiFetch<{ profile: RemoteProfileResponse }>('/api/format-profiles', {
      method: 'PATCH',
      body: JSON.stringify({ id: profileId, action: 'use', outcome }),
    });
    this.cache = null;
  }

  async confirm(profileId: string): Promise<FormatProfile> {
    return this.mutate(profileId, 'confirm');
  }

  async deprecate(profileId: string): Promise<FormatProfile> {
    return this.mutate(profileId, 'deprecate');
  }

  async reactivate(profileId: string): Promise<FormatProfile> {
    return this.mutate(profileId, 'reactivate');
  }

  async rename(profileId: string, displayName: string): Promise<FormatProfile> {
    return this.mutate(profileId, 'rename', { displayName });
  }

  private async mutate(
    profileId: string,
    action: 'confirm' | 'deprecate' | 'reactivate' | 'rename',
    extra: Record<string, unknown> = {},
  ): Promise<FormatProfile> {
    const current = (await this.list()).find((p) => p.id === profileId);
    const payload = await apiFetch<{ profile: RemoteProfileResponse }>('/api/format-profiles', {
      method: 'PATCH',
      body: JSON.stringify({ id: profileId, action, updatedAt: current?.updatedAt, ...extra }),
    });
    this.cache = null;
    return payload.profile;
  }
}

export { detectServerProfileDrift };

let activeStore: FormatProfileStore | null = null;
let activeStoreKey: string | null = null;

/**
 * Selects the store for the current session: `local` for guests, one
 * `RemoteOrganizationFormatProfileStore` instance per organization for
 * authenticated sessions. Called at the point session state is known
 * (mirrors how the rest of the app derives `identityLocked`/`areas` from
 * session) — never sprinkled as ad-hoc `if (authenticated)` checks through
 * ingestion/UI code.
 *
 * A new instance is created whenever the key (auth state + organization
 * id) changes, discarding any in-memory cache — this is the cache
 * invalidation point for logout / organization switch.
 */
export function getFormatProfileStore(organizationId: string | null): FormatProfileStore {
  const key = organizationId ?? 'guest';
  if (activeStore && activeStoreKey === key) {
    return activeStore;
  }
  activeStore = organizationId ? new RemoteOrganizationFormatProfileStore() : new LocalFormatProfileStore();
  activeStoreKey = key;
  return activeStore;
}

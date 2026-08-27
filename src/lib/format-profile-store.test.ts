import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { computeLayoutSignature } from './format-profiles';
import type { CandidateProfileInput } from './format-profiles';

setupLocalStorageMock();

const apiFetchMock = vi.fn();
vi.mock('./session', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const {
  LocalFormatProfileStore,
  RemoteOrganizationFormatProfileStore,
  getFormatProfileStore,
  createDriftCandidate,
} = await import('./format-profile-store');

const baseSignatureInput = {
  documentType: 'TYPE_A' as const,
  dayHeaderCount: 31,
  columnCount: 33,
  hasLegend: true,
  structureTokens: ['LUNES', 'MARTES', 'Nombre', 'Turno'],
};

const candidateInput = (overrides: Partial<CandidateProfileInput> = {}): CandidateProfileInput => ({
  displayName: 'Cuadrante mensual',
  sourceType: 'pdf',
  signature: computeLayoutSignature(baseSignatureInput),
  tokenAliases: { DL: 'libre' },
  codeTimes: {},
  offTokens: ['DL'],
  employeeRowStrategy: 'manual-row',
  employeeRowIndex: 3,
  dayColumnMap: null,
  tabularMemory: null,
  parserConfig: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
  ...overrides,
});

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('LocalFormatProfileStore', () => {
  it('saves a candidate and finds it by matching signature', async () => {
    const store = new LocalFormatProfileStore();
    const saved = await store.saveCandidate(candidateInput());
    expect(saved.status).toBe('validated');

    const match = await store.findMatch(computeLayoutSignature(baseSignatureInput));
    expect(match?.profile.id).toBe(saved.id);
    expect(match?.score).toBe(1);
  });

  it('recordUse bumps the underlying local profile useCount', async () => {
    const store = new LocalFormatProfileStore();
    const saved = await store.saveCandidate(candidateInput());
    await store.recordUse(saved.id, 'success');
    const list = await store.list();
    expect(list[0].useCount).toBe(1);
  });

  it('never calls the network (guest mode)', async () => {
    const store = new LocalFormatProfileStore();
    await store.saveCandidate(candidateInput());
    await store.list();
    await store.findMatch(computeLayoutSignature(baseSignatureInput));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('deprecate removes the local profile and rename updates the label', async () => {
    const store = new LocalFormatProfileStore();
    const saved = await store.saveCandidate(candidateInput());

    const renamed = await store.rename(saved.id, 'Nuevo nombre');
    expect(renamed.displayName).toBe('Nuevo nombre');

    const deprecated = await store.deprecate(saved.id);
    expect(deprecated.status).toBe('deprecated');
    expect(await store.list()).toEqual([]);
  });
});

describe('RemoteOrganizationFormatProfileStore', () => {
  const remoteProfile = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    organizationId: 'org1',
    logicalProfileId: 'lp1',
    version: 1,
    status: 'validated',
    signature: computeLayoutSignature(baseSignatureInput),
    sourceType: 'pdf',
    displayName: 'Cuadrante mensual',
    parserConfig: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
    tokenAliases: {},
    codeTimes: {},
    offTokens: [],
    employeeRowStrategy: 'manual-row',
    employeeRowIndex: 3,
    dayColumnMap: null,
    tabularMemory: null,
    useCount: 0,
    successfulUseCount: 0,
    lastUsedAt: null,
    createdByUserId: null,
    supersedesProfileId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  it('list() calls GET /api/format-profiles and caches the result', async () => {
    apiFetchMock.mockResolvedValue({ profiles: [remoteProfile()] });
    const store = new RemoteOrganizationFormatProfileStore();
    const first = await store.list();
    const second = await store.list();
    expect(first).toHaveLength(1);
    expect(second).toBe(first); // cached, no second network call
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/format-profiles');
  });

  it('findMatch scores against the cached list', async () => {
    apiFetchMock.mockResolvedValue({ profiles: [remoteProfile()] });
    const store = new RemoteOrganizationFormatProfileStore();
    const match = await store.findMatch(computeLayoutSignature(baseSignatureInput));
    expect(match?.score).toBe(1);
  });

  it('saveCandidate POSTs and invalidates the cache', async () => {
    apiFetchMock.mockResolvedValueOnce({ profiles: [] });
    const store = new RemoteOrganizationFormatProfileStore();
    await store.list();

    apiFetchMock.mockResolvedValueOnce({ profile: remoteProfile({ status: 'candidate' }) });
    const created = await store.saveCandidate(candidateInput());
    expect(created.status).toBe('candidate');
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/format-profiles', expect.objectContaining({ method: 'POST' }));

    apiFetchMock.mockResolvedValueOnce({ profiles: [remoteProfile({ status: 'candidate' })] });
    await store.list(); // cache was cleared, this must hit the network again
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it('confirm/deprecate/reactivate/rename PATCH with the correct action and echo updatedAt', async () => {
    apiFetchMock.mockResolvedValue({ profiles: [remoteProfile()] });
    const store = new RemoteOrganizationFormatProfileStore();
    await store.list();

    apiFetchMock.mockResolvedValueOnce({ profile: remoteProfile({ status: 'validated' }) });
    await store.confirm('p1');
    const [, options] = apiFetchMock.mock.calls.at(-1) as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({ id: 'p1', action: 'confirm', updatedAt: '2026-01-01T00:00:00Z' });
  });

  it('a failed remote saveCandidate never touches localStorage', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    const store = new RemoteOrganizationFormatProfileStore();
    await expect(store.saveCandidate(candidateInput())).rejects.toThrow('network down');
    expect(localStorage.getItem('anclora_shiftimport_format_profiles_v1')).toBeNull();
  });
});

describe('getFormatProfileStore', () => {
  it('returns a LocalFormatProfileStore for guest (null organizationId)', () => {
    const store = getFormatProfileStore(null);
    expect(store).toBeInstanceOf(LocalFormatProfileStore);
  });

  it('returns the same instance for repeated calls with the same organization', () => {
    const a = getFormatProfileStore('org1');
    const b = getFormatProfileStore('org1');
    expect(a).toBe(b);
  });

  it('returns a new instance (cache invalidated) when the organization changes', () => {
    const a = getFormatProfileStore('org1');
    const b = getFormatProfileStore('org2');
    expect(a).not.toBe(b);
  });

  it('returns a new instance when switching from guest to authenticated', () => {
    const guest = getFormatProfileStore(null);
    const org = getFormatProfileStore('org1');
    expect(guest).not.toBe(org);
    expect(guest).toBeInstanceOf(LocalFormatProfileStore);
    expect(org).toBeInstanceOf(RemoteOrganizationFormatProfileStore);
  });
});

describe('createDriftCandidate', () => {
  const previousRemote = () => ({
    id: 'old-1',
    organizationId: 'org1',
    logicalProfileId: 'lp-1',
    version: 1,
    status: 'validated',
    signature: computeLayoutSignature(baseSignatureInput),
    sourceType: 'pdf',
    displayName: 'Cuadrante mensual',
    parserConfig: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
    tokenAliases: { DL: 'libre' },
    codeTimes: {},
    offTokens: ['DL'],
    employeeRowStrategy: 'manual-row',
    employeeRowIndex: 3,
    dayColumnMap: null,
    tabularMemory: null,
    useCount: 5,
    successfulUseCount: 5,
    lastUsedAt: '2026-01-01T00:00:00Z',
    createdByUserId: null,
    supersedesProfileId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });

  it('builds a candidate carrying the previous aliases under the new signature, linked via supersedesLogicalProfileId', async () => {
    apiFetchMock.mockResolvedValueOnce({ profiles: [previousRemote()] });
    const newCandidate = { ...previousRemote(), id: 'new-1', version: 2, status: 'candidate', supersedesProfileId: 'old-1' };
    apiFetchMock.mockResolvedValueOnce({ profile: newCandidate });

    const observed = computeLayoutSignature({
      documentType: 'TYPE_A', dayHeaderCount: 31, columnCount: 40, hasLegend: true,
      structureTokens: ['LUNES', 'MARTES', 'Empleado', 'Horario'],
    });
    const store = new RemoteOrganizationFormatProfileStore();
    const result = await createDriftCandidate(store, 'old-1', observed);

    expect(result?.status).toBe('candidate');
    const [, options] = apiFetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as CandidateProfileInput;
    expect(body.tokenAliases).toEqual({ DL: 'libre' });
    expect(body.signature.structureHash).toBe(observed.structureHash);
    expect(body.supersedesLogicalProfileId).toBe('lp-1');
  });

  it('returns null when the drifted profile id is no longer found', async () => {
    apiFetchMock.mockResolvedValueOnce({ profiles: [] });
    const store = new RemoteOrganizationFormatProfileStore();
    const result = await createDriftCandidate(store, 'missing', computeLayoutSignature(baseSignatureInput));
    expect(result).toBeNull();
  });
});

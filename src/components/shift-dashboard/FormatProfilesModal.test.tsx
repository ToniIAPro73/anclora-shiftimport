// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { computeLayoutSignature } from '../../lib/format-profiles';
import type { FormatProfile } from '../../lib/format-profiles';
import type { FormatProfileStore } from '../../lib/format-profile-store';
import { FormatProfilesModal } from './FormatProfilesModal';

afterEach(cleanup);

const buildProfile = (overrides: Partial<FormatProfile> = {}): FormatProfile => ({
  id: 'p1',
  organizationId: 'org1',
  logicalProfileId: 'lp1',
  version: 1,
  status: 'validated',
  signature: computeLayoutSignature({
    documentType: 'TYPE_A', dayHeaderCount: 31, columnCount: 33, hasLegend: true,
    structureTokens: ['LUNES', 'MARTES'],
  }),
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
  useCount: 5,
  successfulUseCount: 4,
  lastUsedAt: '2026-08-20T10:00:00Z',
  createdByUserId: 'user-1',
  supersedesProfileId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function fakeStore(profiles: FormatProfile[]): FormatProfileStore {
  return {
    list: vi.fn().mockResolvedValue(profiles),
    findMatch: vi.fn().mockResolvedValue(null),
    saveCandidate: vi.fn(),
    recordUse: vi.fn(),
    confirm: vi.fn().mockResolvedValue({ ...profiles[0], status: 'validated' }),
    deprecate: vi.fn().mockResolvedValue({ ...profiles[0], status: 'deprecated' }),
    reactivate: vi.fn().mockResolvedValue({ ...profiles[0], status: 'validated' }),
    rename: vi.fn().mockResolvedValue({ ...profiles[0], displayName: 'Renamed' }),
  };
}

function renderModal(props: Partial<Parameters<typeof FormatProfilesModal>[0]> = {}) {
  const defaults = {
    isOpen: true,
    onClose: vi.fn(),
    store: fakeStore([buildProfile()]),
    canManage: false,
  };
  const merged = { ...defaults, ...props };
  return render(
    <I18nProvider>
      <FormatProfilesModal {...merged} />
    </I18nProvider>,
  );
}

describe('FormatProfilesModal', () => {
  it('shows the empty state when there are no profiles', async () => {
    renderModal({ store: fakeStore([]) });
    await waitFor(() => expect(screen.getByText('Todavía no se ha aprendido ningún formato en esta organización.')).toBeTruthy());
  });

  it('lists a profile with display name, version, status and scope — never internals', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Cuadrante mensual')).toBeTruthy());
    expect(screen.getByText(/Versión 1/)).toBeTruthy();
    expect(screen.getByText('Validado')).toBeTruthy();
    expect(screen.getByText(/Toda la organización/)).toBeTruthy();

    const dom = document.body.innerHTML;
    expect(dom).not.toContain('lp1'); // logicalProfileId
    expect(dom).not.toContain(buildProfile().signature.structureHash); // fingerprint hash
    expect(dom).not.toContain('clusterTolerance'); // parser config internals
  });

  it('EMPLOYEE (canManage=false) sees no management actions', async () => {
    renderModal({ canManage: false });
    await waitFor(() => expect(screen.getByText('Cuadrante mensual')).toBeTruthy());
    expect(screen.queryByText('Renombrar')).toBeNull();
    expect(screen.queryByText('Desactivar')).toBeNull();
  });

  it('ADMIN (canManage=true) can rename, and confirm only shows for candidate status', async () => {
    const store = fakeStore([buildProfile({ status: 'candidate' })]);
    renderModal({ canManage: true, store });
    await waitFor(() => expect(screen.getByText('Cuadrante mensual')).toBeTruthy());
    expect(screen.getByText('Renombrar')).toBeTruthy();
    expect(screen.getByText('Confirmar')).toBeTruthy();
    expect(screen.getByText('Desactivar')).toBeTruthy();
    expect(screen.queryByText('Reactivar')).toBeNull();

    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => expect(store.confirm).toHaveBeenCalledWith('p1'));
  });

  it('reactivate shows only for legacy/deprecated status', async () => {
    const store = fakeStore([buildProfile({ status: 'legacy' })]);
    renderModal({ canManage: true, store });
    await waitFor(() => expect(screen.getByText('Reactivar')).toBeTruthy());
    fireEvent.click(screen.getByText('Reactivar'));
    await waitFor(() => expect(store.reactivate).toHaveBeenCalledWith('p1'));
  });

  it('groups versions by logical family: latest shown, older versions behind a toggle', async () => {
    const store = fakeStore([
      buildProfile({ id: 'p2', version: 2, status: 'validated', supersedesProfileId: 'p1' }),
      buildProfile({ id: 'p1', version: 1, status: 'legacy' }),
    ]);
    renderModal({ store });

    await waitFor(() => expect(screen.getByText(/Versión 2/)).toBeTruthy());
    expect(screen.queryByText(/Versión 1/)).toBeNull();
    expect(screen.getByText('Ver versiones anteriores (1)')).toBeTruthy();

    fireEvent.click(screen.getByText('Ver versiones anteriores (1)'));
    await waitFor(() => expect(screen.getByText(/Versión 1/)).toBeTruthy());
  });

  it('rename submits the new name via the store', async () => {
    const store = fakeStore([buildProfile()]);
    renderModal({ canManage: true, store });
    await waitFor(() => expect(screen.getByText('Renombrar')).toBeTruthy());
    fireEvent.click(screen.getByText('Renombrar'));
    const input = screen.getByLabelText('Nuevo nombre') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nuevo nombre' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(store.rename).toHaveBeenCalledWith('p1', 'Nuevo nombre'));
  });

  it('surfaces a load error', async () => {
    const store: FormatProfileStore = {
      list: vi.fn().mockRejectedValue(new Error('network down')),
      findMatch: vi.fn(),
      saveCandidate: vi.fn(),
      recordUse: vi.fn(),
      confirm: vi.fn(),
      deprecate: vi.fn(),
      reactivate: vi.fn(),
      rename: vi.fn(),
    };
    renderModal({ store });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('No se pudieron cargar los formatos aprendidos.'));
  });
});

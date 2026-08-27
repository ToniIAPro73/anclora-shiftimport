// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { FORMAT_PROFILE_VERSION, computeLayoutSignature } from '../../lib/format-profiles';
import type { UserFormatProfile } from '../../lib/format-profiles';
import type { FormatProfileStore } from '../../lib/format-profile-store';
import { FormatProfileMigrationModal } from './FormatProfileMigrationModal';

afterEach(cleanup);

const buildLocalProfile = (id: string, overrides: Partial<UserFormatProfile> = {}): UserFormatProfile => ({
  profileVersion: FORMAT_PROFILE_VERSION,
  id,
  label: `Cuadrante ${id}`,
  signature: computeLayoutSignature({
    documentType: 'TYPE_A', dayHeaderCount: 31, columnCount: 33, hasLegend: true,
    structureTokens: ['LUNES', 'MARTES'],
  }),
  tokenAliases: { DL: 'libre' },
  offTokens: ['DL'],
  employeeRow: { strategy: 'manual-row', rowIndex: 3 },
  parserParams: { clusterTolerance: 4, columnMatchMaxDistance: 12 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  useCount: 2,
  ...overrides,
});

function fakeStore(overrides: Partial<FormatProfileStore> = {}): FormatProfileStore {
  return {
    list: vi.fn().mockResolvedValue([]),
    findMatch: vi.fn().mockResolvedValue(null),
    saveCandidate: vi.fn().mockResolvedValue({}),
    recordUse: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue({}),
    deprecate: vi.fn().mockResolvedValue({}),
    reactivate: vi.fn().mockResolvedValue({}),
    rename: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function renderModal(props: Partial<Parameters<typeof FormatProfileMigrationModal>[0]> = {}) {
  const defaultProps = {
    isOpen: true,
    localProfiles: [buildLocalProfile('a'), buildLocalProfile('b')],
    remoteStore: fakeStore(),
    onDone: vi.fn(),
    onKeepLocal: vi.fn(),
    onCancel: vi.fn(),
  };
  const merged = { ...defaultProps, ...props };
  return {
    ...render(
      <I18nProvider>
        <FormatProfileMigrationModal {...merged} />
      </I18nProvider>,
    ),
    props: merged,
  };
}

describe('FormatProfileMigrationModal', () => {
  it('shows the found-local count and explanation, both ES/EN present as distinct strings', () => {
    renderModal();
    expect(screen.getByText(/Se han encontrado 2 formatos/)).toBeTruthy();
    expect(screen.getByText(/No se sube ningún documento original\./)).toBeTruthy();
    expect(screen.getByText(/No se sube ningún dato personal\./)).toBeTruthy();
    expect(screen.getByText(/La copia local no se elimina automáticamente\./)).toBeTruthy();
  });

  it('migrating calls saveCandidate once per local profile with no PII fields and calls onDone on full success', async () => {
    const saveCandidate = vi.fn().mockResolvedValue({ id: 'remote-1' });
    const onDone = vi.fn();
    renderModal({ remoteStore: fakeStore({ saveCandidate }), onDone });

    fireEvent.click(screen.getByText('Migrar a mi organización'));

    await waitFor(() => expect(saveCandidate).toHaveBeenCalledTimes(2));
    const firstCallArg = saveCandidate.mock.calls[0][0];
    expect(Object.keys(firstCallArg).sort()).toEqual([
      'codeTimes', 'dayColumnMap', 'displayName', 'employeeRowIndex', 'employeeRowStrategy',
      'offTokens', 'parserConfig', 'signature', 'sourceType', 'tabularMemory', 'tokenAliases',
    ].sort());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('is idempotent: repeating migration does not error and calls saveCandidate again (server dedupes)', async () => {
    const saveCandidate = vi.fn().mockResolvedValue({ id: 'remote-1' });
    renderModal({ remoteStore: fakeStore({ saveCandidate }), localProfiles: [buildLocalProfile('a')] });

    fireEvent.click(screen.getByText('Migrar a mi organización'));
    await waitFor(() => expect(saveCandidate).toHaveBeenCalledTimes(1));
  });

  it('surfaces a partial failure and offers retry without losing the local copy', async () => {
    const saveCandidate = vi.fn()
      .mockResolvedValueOnce({ id: 'remote-1' })
      .mockRejectedValueOnce(new Error('network down'));
    renderModal({ remoteStore: fakeStore({ saveCandidate }) });

    fireEvent.click(screen.getByText('Migrar a mi organización'));

    await waitFor(() => expect(screen.getByText(/1 de 2 formatos migrados\./)).toBeTruthy());
    expect(screen.getByText(/Algunos formatos no se pudieron migrar/)).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  it('keep-local and postpone never call saveCandidate', () => {
    const saveCandidate = vi.fn();
    const onKeepLocal = vi.fn();
    const onCancel = vi.fn();
    renderModal({ remoteStore: fakeStore({ saveCandidate }), onKeepLocal, onCancel });

    fireEvent.click(screen.getByText('Mantener solo en este dispositivo'));
    expect(onKeepLocal).toHaveBeenCalled();
    expect(saveCandidate).not.toHaveBeenCalled();
  });
});

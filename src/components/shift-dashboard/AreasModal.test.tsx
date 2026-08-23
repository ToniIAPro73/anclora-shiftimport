// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import * as remote from '../../lib/remote';
import { RemoteArea } from '../../lib/remote';
import { AreasModal } from './AreasModal';

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteAreas: vi.fn(),
    createRemoteArea: vi.fn(),
    updateRemoteArea: vi.fn(),
  };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedListRemoteAreas = vi.mocked(remote.listRemoteAreas);
const mockedCreateRemoteArea = vi.mocked(remote.createRemoteArea);
const mockedUpdateRemoteArea = vi.mocked(remote.updateRemoteArea);

const area = (over: Partial<RemoteArea> = {}): RemoteArea => ({
  id: 'area-1',
  name: 'Norte',
  code: 'N',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

function renderAreasModal(onChanged: () => void = () => {}) {
  return render(
    <I18nProvider>
      <AreasModal isOpen onClose={() => {}} onChanged={onChanged} />
    </I18nProvider>,
  );
}

describe('AreasModal', () => {
  it('lists the org areas with name and code', async () => {
    mockedListRemoteAreas.mockResolvedValue([area(), area({ id: 'area-2', name: 'Sur', code: null })]);
    renderAreasModal();

    await waitFor(() => expect(screen.getByText('Norte')).toBeTruthy());
    expect(screen.getByText('Sur')).toBeTruthy();
    expect(screen.getByText('· N')).toBeTruthy();
  });

  it('creates an area via createRemoteArea and notifies onChanged', async () => {
    const onChanged = vi.fn();
    mockedListRemoteAreas.mockResolvedValue([]);
    mockedCreateRemoteArea.mockResolvedValue(area({ id: 'area-new', name: 'Planta Norte', code: 'PN' }));
    renderAreasModal(onChanged);

    await waitFor(() => expect(mockedListRemoteAreas).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('Nombre del área'), { target: { value: 'Planta Norte' } });
    fireEvent.change(screen.getByPlaceholderText('Código (opcional)'), { target: { value: 'PN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));

    await waitFor(() => expect(mockedCreateRemoteArea).toHaveBeenCalledWith({ name: 'Planta Norte', code: 'PN' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('edits name/code inline via updateRemoteArea', async () => {
    mockedListRemoteAreas.mockResolvedValue([area()]);
    mockedUpdateRemoteArea.mockResolvedValue(area({ name: 'Norte 2' }));
    renderAreasModal();

    await waitFor(() => expect(screen.getByText('Norte')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByDisplayValue('Norte'), { target: { value: 'Norte 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mockedUpdateRemoteArea).toHaveBeenCalledWith({ id: 'area-1', name: 'Norte 2', code: 'N' }));
  });

  it('deactivates after explicit confirmation (never a hard delete)', async () => {
    const onChanged = vi.fn();
    mockedListRemoteAreas.mockResolvedValue([area()]);
    mockedUpdateRemoteArea.mockResolvedValue(area({ active: false }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAreasModal(onChanged);

    await waitFor(() => expect(screen.getByText('Norte')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(mockedUpdateRemoteArea).toHaveBeenCalledWith({ id: 'area-1', deactivate: true }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('cancelling the confirmation deactivates nothing', async () => {
    mockedListRemoteAreas.mockResolvedValue([area()]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAreasModal();

    await waitFor(() => expect(screen.getByText('Norte')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(mockedUpdateRemoteArea).not.toHaveBeenCalled();
  });

  it('surfaces the server error message on failure', async () => {
    mockedListRemoteAreas.mockResolvedValue([]);
    mockedCreateRemoteArea.mockRejectedValue(new Error('An area with this name or code already exists'));
    renderAreasModal();

    await waitFor(() => expect(mockedListRemoteAreas).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('Nombre del área'), { target: { value: 'Norte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('already exists'));
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { AnnualTargetModal } from './AnnualTargetModal';
import type { RemoteAnnualTarget } from '../../lib/remote';

const { createWorktimeTargetVersion, loadWorktimeTargets } = vi.hoisted(() => ({
  createWorktimeTargetVersion: vi.fn(),
  loadWorktimeTargets: vi.fn(),
}));

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return { ...actual, createWorktimeTargetVersion, loadWorktimeTargets };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const savedTarget: RemoteAnnualTarget = {
  id: 'target-1', employeeId: 'employee-1', year: 2026, targetKind: 'CONTRACTUAL',
  periodType: 'ANNUAL', periodStart: '2026-01-01', periodEnd: '2026-12-31',
  effectiveFrom: '2026-10-30', revision: 1, minimumMinutes: 600, targetMinutes: null,
  maximumMinutes: 2400, includedWorkBuckets: ['Regular'], minimumAnnualMinutes: 600,
  maximumAnnualMinutes: 2400, includedShiftTypes: ['Regular'], marginMinutes: 1800,
  notes: '', source: 'ADMIN', updatedAt: '2026-10-30T10:00:00.000Z',
};

function renderModal(onClose = vi.fn(), history: RemoteAnnualTarget[] = []) {
  loadWorktimeTargets.mockResolvedValue(history);
  return {
    onClose,
    ...render(
      <I18nProvider>
        <AnnualTargetModal
          isOpen
          onClose={onClose}
          employeeId="employee-1"
          employeeName="QA Employee"
          year={2026}
          current={null}
          canEdit
          onSaved={vi.fn()}
        />
      </I18nProvider>,
    ),
  };
}

describe('AnnualTargetModal layout and actions', () => {
  it('uses a wide workspace grid, keeps actions in the shell footer, and contains history', async () => {
    renderModal(vi.fn(), [savedTarget]);
    const dialog = screen.getByRole('dialog');
    const form = screen.getByTestId('annual-target-form');
    const save = screen.getByTestId('annual-target-save');

    expect(dialog.className).toContain('annual-target-modal');
    expect(dialog.className).toContain('modal-content--workspace');
    expect(dialog.style.maxWidth).toBe('1000px');
    expect(form.querySelector('.annual-target__grid')).toBeTruthy();
    expect(form.querySelector('.annual-target__range')).toBeTruthy();
    expect(form.contains(save)).toBe(false);
    expect(save.getAttribute('form')).toBe('annual-target-form');
    expect(screen.getByTestId('annual-target-type-Regular').getAttribute('type')).toBe('checkbox');
    expect((screen.getByTestId('annual-target-type-Regular') as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(loadWorktimeTargets).toHaveBeenCalledWith('employee-1', { history: true }));
    const historyDetails = screen.getByText('Historial de objetivos').closest('details');
    expect(historyDetails?.open).toBe(false);
    fireEvent.click(screen.getByText('Historial de objetivos'));
    expect(historyDetails?.open).toBe(true);
    expect(historyDetails?.querySelector('ul')).toBeTruthy();
  });

  it('enforces counting policy, saves through the shell footer, and keeps cancel available', async () => {
    const onClose = vi.fn();
    createWorktimeTargetVersion.mockResolvedValue(savedTarget);
    renderModal(onClose);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();

    const regular = screen.getByTestId('annual-target-type-Regular');
    fireEvent.change(screen.getByTestId('annual-target-minimum'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Máximo (horas)'), { target: { value: '40' } });
    fireEvent.click(regular);
    fireEvent.click(screen.getByTestId('annual-target-save'));
    expect((await screen.findByRole('alert')).textContent).toContain('Selecciona al menos un tipo de turno.');
    expect(createWorktimeTargetVersion).not.toHaveBeenCalled();

    fireEvent.click(regular);
    fireEvent.click(screen.getByTestId('annual-target-save'));

    await waitFor(() => expect(createWorktimeTargetVersion).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'employee-1', minimumMinutes: 600, maximumMinutes: 2400,
      includedWorkBuckets: ['Regular'],
    })));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes from the persistent footer without submitting', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(createWorktimeTargetVersion).not.toHaveBeenCalled();
  });
});

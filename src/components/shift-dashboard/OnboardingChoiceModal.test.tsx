// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import { OnboardingChoiceModal } from './OnboardingChoiceModal';

afterEach(cleanup);

function renderModal(onConfirm: (organizationName: string, ownerIsEmployee: boolean, employeeName?: string) => Promise<void>) {
  return render(
    <I18nProvider>
      <OnboardingChoiceModal isOpen onConfirm={onConfirm} onLogout={() => {}} />
    </I18nProvider>,
  );
}

describe('OnboardingChoiceModal — owner/employee separation', () => {
  it('defaults to owner-only and does not submit an Employee name', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal(onConfirm);

    fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Acme', false, undefined));
    expect(screen.queryByLabelText('Nombre del empleado')).toBeNull();
  });

  it('requires explicit opt-in and submits the Employee name only when selected', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal(onConfirm);

    fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Personal' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /También trabajaré como empleado/ }));
    fireEvent.change(screen.getByLabelText('Nombre del empleado'), { target: { value: 'Sebastián' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Personal', true, 'Sebastián'));
  });

  it('shows inline validation and focuses the employee field when opt-in has no name', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal(onConfirm);

    fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Personal' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /También trabajaré como empleado/ }));
    const employeeName = screen.getByLabelText('Nombre del empleado');
    fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Indica el nombre del empleado');
    expect(employeeName).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

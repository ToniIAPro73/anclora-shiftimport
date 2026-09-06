// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import { OnboardingChoiceModal } from './OnboardingChoiceModal';

afterEach(cleanup);

function renderModal(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  render(<I18nProvider><OnboardingChoiceModal isOpen onConfirm={onConfirm} onLogout={() => {}} ownerEmail="toni@example.com" /></I18nProvider>);
  return onConfirm;
}

async function completeTeamMinimal() {
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Acme' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));
}

describe('OnboardingChoiceModal — plan-aware governance', () => {
  it('creates a valid owner-only Team organization without an Employee, Admin or Areas', async () => {
    const onConfirm = renderModal();
    await completeTeamMinimal();
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      plan: 'team',
      organization: { name: 'Acme' },
      areas: [],
      owner: { isEmployee: false, employeeName: undefined, areaRef: null },
    })));
    expect(screen.queryByText('Configuración incompleta')).toBeNull();
  });

  it('keeps the explicit owner-to-Employee opt-in and validates its name', async () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Personal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Personal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /También trabajaré como empleado/ }));
    fireEvent.change(screen.getByLabelText('Nombre del empleado'), { target: { value: 'Sebastián' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ owner: expect.objectContaining({ isEmployee: true, employeeName: 'Sebastián' }) })));
  });

  it('shows inline validation and focuses the employee field', () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Personal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Personal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /También trabajaré como empleado/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Indica el nombre del empleado');
    expect(screen.getByLabelText('Nombre del empleado')).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('hides Team-only steps when Personal is selected', () => {
    renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Personal/ }));
    expect(screen.getByText(/Organización/, { selector: 'li' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByText('Áreas')).toBeNull();
  });
});

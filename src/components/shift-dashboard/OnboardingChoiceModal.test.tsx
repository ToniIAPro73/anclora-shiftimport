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

  describe('P5.7 Canonical Scenarios A-F (UI)', () => {
    it('Scenario B: Small org with Admin (Admin is NOT employee)', async () => {
      const onConfirm = renderModal();
      // Step: Plan
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Organization
      fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Small Corp' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Owner
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Admin
      fireEvent.click(screen.getByRole('radio', { name: 'Sí' }));
      fireEvent.change(screen.getByLabelText('Nombre del administrador'), { target: { value: 'Admin Carlos' } });
      fireEvent.change(screen.getByLabelText('Email del administrador'), { target: { value: 'carlos@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Structure (default 'none')
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Summary
      await waitFor(() => expect(screen.getByText('Small Corp')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));

      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        plan: 'team',
        organization: { name: 'Small Corp' },
        owner: expect.objectContaining({ isEmployee: false }),
        admin: expect.objectContaining({
          name: 'Admin Carlos',
          email: 'carlos@example.com',
          isEmployee: false,
        }),
      })));
    });

    it('Scenario D: Structured org with Areas (adds quick suggested area)', async () => {
      const onConfirm = renderModal();
      // Step: Plan
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Organization
      fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Aero Corp' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Owner
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Admin
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Structure -> choose "Quiero crear áreas"
      fireEvent.click(screen.getByRole('radio', { name: /Quiero crear áreas/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Areas -> click quick chip "+ Operaciones"
      fireEvent.click(screen.getByRole('button', { name: '+ Operaciones' }));
      expect(screen.getByDisplayValue('Operaciones')).toBeInTheDocument();
      // Skip remaining optional steps directly to summary
      fireEvent.click(screen.getByRole('button', { name: 'Saltar este paso' }));
      // Step: Summary
      await waitFor(() => expect(screen.getByText('Operaciones')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));

      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        organization: { name: 'Aero Corp' },
        areas: expect.arrayContaining([expect.objectContaining({ name: 'Operaciones' })]),
      })));
    });

    it('Scenario F: Admin IS an employee (explicitly marked)', async () => {
      const onConfirm = renderModal();
      // Step: Plan
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Organization
      fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Dual Admin Org' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Owner
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Admin
      fireEvent.click(screen.getByRole('radio', { name: 'Sí' }));
      fireEvent.change(screen.getByLabelText('Nombre del administrador'), { target: { value: 'Elena Admin' } });
      fireEvent.change(screen.getByLabelText('Email del administrador'), { target: { value: 'elena@example.com' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /Este administrador también trabaja como empleado/ }));
      fireEvent.change(screen.getByLabelText('Nombre del empleado'), { target: { value: 'Elena Operational' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Structure
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      // Step: Summary
      fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));

      await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        admin: expect.objectContaining({
          name: 'Elena Admin',
          email: 'elena@example.com',
          isEmployee: true,
          employeeName: 'Elena Operational',
        }),
      })));
    });
  });
});

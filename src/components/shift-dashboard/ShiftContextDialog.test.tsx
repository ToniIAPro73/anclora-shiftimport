// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { planShiftContext, type ContextRowInput, type IncomingShiftInput } from '../../lib/shift-context';
import { ShiftContextDialog } from './ShiftContextDialog';

setupLocalStorageMock();
afterEach(cleanup);

const DATE = '2026-11-10';
const dayOff: ContextRowInput = { id: 'off', shiftType: 'Libre', effectiveState: 'EFFECTIVE' };
const regular = (id: string, startTime = '08:00', endTime = '16:00'): ContextRowInput => ({ id, shiftType: 'Regular', startTime, endTime, effectiveState: 'EFFECTIVE' });
const extras: IncomingShiftInput = { shiftType: 'Extras', startTime: '16:00', endTime: '19:00' };

function open(existing: ContextRowInput[], incoming: IncomingShiftInput, role = 'ADMIN', onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const plan = planShiftContext({ date: DATE, existing, incoming, role })!;
  render(
    <ThemeProvider>
      <I18nProvider>
        <ShiftContextDialog isOpen date="martes, 10 de noviembre de 2026" employeeName="E2E Empleado" incoming={incoming} plan={plan} onCancel={vi.fn()} onConfirm={onConfirm} />
      </I18nProvider>
    </ThemeProvider>,
  );
  return { onConfirm, plan };
}

describe('ShiftContextDialog', () => {
  it('day off + Extras: REPLACE preselected and recommended, ADD disabled with the reason, explicit confirmation required', async () => {
    const { onConfirm } = open([dayOff], extras);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Ya existen asignaciones para este día');
    expect((screen.getByTestId('shift-context-op-REPLACE') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('shift-context-op-ADD') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('shift-context-recommended').textContent).toContain('Recomendado');
    expect(screen.getByText(/día completo/)).toBeTruthy();
    // preview: day off replaced, extras new — as text, not colour alone
    const rows = within(screen.getByTestId('shift-context-preview')).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['REPLACED', 'NEW']);
    expect(rows[0].textContent).toContain('Se sustituye');
    // never writes without a reason and a click
    const confirm = screen.getByTestId('shift-context-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('shift-context-reason'), { target: { value: 'Trabajo extraordinario' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ operation: 'REPLACE', targetId: 'off', reason: 'Trabajo extraordinario' }));
  });

  it('Regular + Extras: ADD recommended; switching to REPLACE updates the preview', () => {
    const { plan } = open([regular('reg')], { shiftType: 'Extras', startTime: '18:00', endTime: '21:00' });
    expect(plan.recommended).toBe('ADD');
    expect((screen.getByTestId('shift-context-op-ADD') as HTMLInputElement).checked).toBe(true);
    const status = () => within(screen.getByTestId('shift-context-preview')).getAllByRole('listitem').map((row) => row.getAttribute('data-status'));
    expect(status()).toEqual(['KEPT', 'NEW']);
    fireEvent.click(screen.getByTestId('shift-context-op-REPLACE'));
    expect(status()).toEqual(['REPLACED', 'NEW']);
  });

  it('several shifts: the exact target must be chosen before confirming a replacement', async () => {
    const { onConfirm } = open([regular('morning', '08:00', '12:00'), regular('afternoon', '14:00', '18:00')], { shiftType: 'Extras', startTime: '12:00', endTime: '14:00' });
    fireEvent.click(screen.getByTestId('shift-context-op-REPLACE'));
    fireEvent.change(screen.getByTestId('shift-context-reason'), { target: { value: 'Corrección' } });
    expect((screen.getByTestId('shift-context-confirm') as HTMLButtonElement).disabled).toBe(true); // no target chosen yet
    const targets = screen.getAllByTestId('shift-context-target') as HTMLInputElement[];
    fireEvent.click(targets[1]);
    fireEvent.click(screen.getByTestId('shift-context-confirm'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ operation: 'REPLACE', targetId: 'afternoon', reason: 'Corrección' }));
  });

  it('a protected vacation for a PLANNER: nothing can be confirmed and the reason is explained', () => {
    const vacation: ContextRowInput = { id: 'vac', shiftType: 'Vacaciones', effectiveState: 'EFFECTIVE', timeOffRequestId: 'tor-1' };
    open([vacation], extras, 'PLANNER');
    expect(screen.getByTestId('shift-context-blocked').textContent).toContain('propietario o administrador');
    expect((screen.getByTestId('shift-context-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Vacaciones aprobadas \(protegidas\)/)).toBeTruthy();
  });
});

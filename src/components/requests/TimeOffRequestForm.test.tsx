// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { ApiError } from '../../lib/session';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { createRemoteTimeOffRequest, loadRemoteTimeOffImpact } from '../../lib/remote';
import { TimeOffRequestForm } from './TimeOffRequestForm';

vi.mock('../../lib/remote', () => ({
  createRemoteTimeOffRequest: vi.fn(),
  loadRemoteTimeOffImpact: vi.fn(),
}));

setupLocalStorageMock();
afterEach(cleanup);

const create = vi.mocked(createRemoteTimeOffRequest);
const impact = vi.mocked(loadRemoteTimeOffImpact);
const TODAY = '2026-11-02';

function renderForm(props: Partial<React.ComponentProps<typeof TimeOffRequestForm>> = {}) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <TimeOffRequestForm today={TODAY} {...props} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

const fill = (start: string, end: string) => {
  fireEvent.change(screen.getByTestId('time-off-start'), { target: { value: start } });
  fireEvent.change(screen.getByTestId('time-off-end'), { target: { value: end } });
};

const created = {
  id: 'r1', requestType: 'VACATION' as const, startDate: '2026-11-10', endDate: '2026-11-14', requestedDays: 5, comment: '',
  status: 'PENDING' as const, createdAt: '2026-11-02T10:00:00.000Z', resolvedAt: null, resolvedByName: null, rejectionReason: null,
  history: [{ type: 'CREATED' as const, at: '2026-11-02T10:00:00.000Z' }],
};

describe('TimeOffRequestForm', () => {
  beforeEach(() => {
    create.mockReset();
    impact.mockReset();
    impact.mockResolvedValue({ publishedShifts: 0, draftAssignments: 0, overlapsOwn: [] });
  });

  it('has no type select (fixed to Vacaciones) and disables submit until the range is valid', () => {
    renderForm();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect((screen.getByTestId('time-off-submit') as HTMLButtonElement).disabled).toBe(true);
    fill('2026-11-10', '2026-11-14');
    expect((screen.getByTestId('time-off-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('time-off-days').textContent).toBe('Días solicitados: 5');
  });

  it('shows inline errors with aria-invalid / aria-describedby once a field is touched', () => {
    renderForm();
    fill('2026-11-14', '2026-11-10');
    const end = screen.getByTestId('time-off-end') as HTMLInputElement;
    fireEvent.blur(end);
    expect(end.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(end.getAttribute('aria-describedby') ?? '');
    expect(message?.textContent).toBe('La fecha de fin no puede ser anterior a la de inicio.');
    expect((screen.getByTestId('time-off-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks a past start date', () => {
    renderForm();
    fill('2026-11-01', '2026-11-03');
    fireEvent.blur(screen.getByTestId('time-off-start'));
    expect(screen.getByText('Las vacaciones no pueden empezar en el pasado.')).toBeTruthy();
  });

  it('shows the calendar impact before sending', async () => {
    impact.mockResolvedValue({ publishedShifts: 3, draftAssignments: 1, overlapsOwn: [] });
    renderForm();
    fill('2026-11-10', '2026-11-14');
    await waitFor(() => expect(screen.getByText('Turnos publicados en esas fechas: 3')).toBeTruthy());
    expect(screen.getByText('Turnos en borradores de planificación: 1')).toBeTruthy();
    expect(impact).toHaveBeenCalledWith('2026-11-10', '2026-11-14');
  });

  it('blocks the submit with a role=alert when /impact reports an own overlap', async () => {
    impact.mockResolvedValue({ publishedShifts: 0, draftAssignments: 0, overlapsOwn: [{ id: 'o1', startDate: '2026-11-12', endDate: '2026-11-13', status: 'PENDING' }] });
    renderForm();
    fill('2026-11-10', '2026-11-14');
    const overlap = await screen.findByTestId('time-off-overlap');
    expect(overlap.getAttribute('role')).toBe('alert');
    expect((screen.getByTestId('time-off-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('still allows sending when the impact check is unavailable (the server stays authoritative)', async () => {
    impact.mockRejectedValue(new ApiError(500, 'boom'));
    renderForm();
    fill('2026-11-10', '2026-11-14');
    await waitFor(() => expect(screen.getByText('No se pudo comprobar el impacto. Puedes enviar la solicitud igualmente.')).toBeTruthy());
    expect((screen.getByTestId('time-off-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends a VACATION request with the typed data, never an employee id, and reports success', async () => {
    create.mockResolvedValue(created);
    const onCreated = vi.fn();
    renderForm({ onCreated });
    fill('2026-11-10', '2026-11-14');
    fireEvent.change(screen.getByTestId('time-off-comment'), { target: { value: '  Verano  ' } });
    fireEvent.click(screen.getByTestId('time-off-submit'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(create).toHaveBeenCalledWith({ requestType: 'VACATION', startDate: '2026-11-10', endDate: '2026-11-14', comment: 'Verano' });
    expect(screen.getByTestId('time-off-success').getAttribute('role')).toBe('status');
  });

  it.each([
    ['TIME_OFF_OVERLAP', 'Ya tienes una solicitud pendiente o aprobada'],
    ['TIME_OFF_TYPE_NOT_ENABLED', 'Este tipo de ausencia no está disponible.'],
    ['EMPLOYEE_LINK_REQUIRED', 'Tu usuario no está vinculado a un empleado activo.'],
  ])('a %s failure is a persistent role=alert with the five answers and keeps the typed data', async (code, why) => {
    create.mockRejectedValue(new ApiError(409, 'x', code));
    renderForm();
    fill('2026-11-10', '2026-11-14');
    fireEvent.change(screen.getByTestId('time-off-comment'), { target: { value: 'Verano' } });
    fireEvent.click(screen.getByTestId('time-off-submit'));
    const alert = await screen.findByTestId('time-off-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('No se pudo enviar tu solicitud de vacaciones.');   // what
    expect(alert.textContent).toContain('nada se ha guardado en el servidor');                // what was written
    expect(alert.textContent).toContain('no se ha creado la solicitud');                      // what was not written
    expect(alert.textContent).toContain(why);                                                 // why
    expect(alert.textContent).toContain('Qué puedes hacer');                                  // what to do
    expect((screen.getByTestId('time-off-start') as HTMLInputElement).value).toBe('2026-11-10');
    expect((screen.getByTestId('time-off-comment') as HTMLTextAreaElement).value).toBe('Verano');
    fireEvent.click(screen.getByText('Cerrar aviso'));
    expect(screen.queryByTestId('time-off-error')).toBeNull();
  });

  it('an unknown failure falls back to the generic reason', async () => {
    create.mockRejectedValue(new Error('network'));
    renderForm();
    fill('2026-11-10', '2026-11-14');
    fireEvent.click(screen.getByTestId('time-off-submit'));
    expect((await screen.findByTestId('time-off-error')).textContent).toContain('Ha habido un problema de conexión o del servidor.');
  });
});

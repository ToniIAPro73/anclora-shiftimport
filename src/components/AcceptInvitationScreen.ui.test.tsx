// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../lib/i18n-react';
import { ThemeProvider } from '../lib/theme-react';
import { AcceptInvitationScreen } from './AcceptInvitationScreen';
import { acceptRemoteAccessInvitation, validateRemoteAccessInvitation } from '../lib/remote';
import { ApiError } from '../lib/session';

vi.mock('../lib/remote', async () => {
  const actual = await vi.importActual<typeof import('../lib/remote')>('../lib/remote');
  return {
    ...actual,
    acceptRemoteAccessInvitation: vi.fn(),
    validateRemoteAccessInvitation: vi.fn(),
  };
});

const validInvitation = (acceptanceMode: 'CREATE_ACCOUNT' | 'LINK_EXISTING', employeeName: string | null = null) => ({
  status: 'VALID' as const,
  invitationId: 'invitation-id',
  organizationName: 'Estudio Horizonte',
  role: 'EMPLOYEE' as const,
  employeeName,
  email: 'toni.garcia@e2e.test',
  expiresAt: '2026-09-19T00:00:00.000Z',
  acceptanceMode,
});

function renderScreen(mode: 'CREATE_ACCOUNT' | 'LINK_EXISTING', employeeName: string | null = null) {
  window.history.replaceState({}, '', '/accept-invitation#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
  vi.mocked(validateRemoteAccessInvitation).mockResolvedValue(validInvitation(mode, employeeName));
  return render(<ThemeProvider><I18nProvider><AcceptInvitationScreen /></I18nProvider></ThemeProvider>);
}

describe('AcceptInvitationScreen account modes', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/accept-invitation');
  });

  it('shows account creation fields only for CREATE_ACCOUNT, with no display name, locale or theme field anywhere', async () => {
    renderScreen('CREATE_ACCOUNT');
    expect(await screen.findByLabelText('Crea tu contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirma tu contraseña')).toBeInTheDocument();

    // The three removed fields must not exist in any form — not hidden by
    // CSS, actually absent from the DOM.
    expect(screen.queryByLabelText('Nombre visible')).not.toBeInTheDocument();
    expect(document.getElementById('invitation-displayName')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Idioma')).not.toBeInTheDocument();
    expect(document.getElementById('invitation-locale')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tema')).not.toBeInTheDocument();
    expect(document.getElementById('invitation-theme')).not.toBeInTheDocument();
  });

  it('shows a human invitation summary without internal access or profile terminology', async () => {
    renderScreen('CREATE_ACCOUNT', 'Marta Ruiz');
    expect(await screen.findByText('Estudio Horizonte')).toBeInTheDocument();
    expect(screen.getByText('Activa tu acceso para continuar.')).toBeInTheDocument();
    expect(screen.queryByText(/Tipo de acceso|Perfil asociado|Empleado|EMPLOYEE/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Marta Ruiz')).not.toBeInTheDocument();
  });

  it('presents the email as read-only information, never as an editable input', async () => {
    renderScreen('CREATE_ACCOUNT');
    const emailDisplay = await screen.findByTestId('invitation-email-display');
    expect(emailDisplay.tagName).not.toBe('INPUT');
    expect(emailDisplay).toHaveTextContent('toni.garcia@e2e.test');
    expect(document.getElementById('invitation-email')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /correo/i })).not.toBeInTheDocument();
  });

  it('does not show password fields for LINK_EXISTING', async () => {
    renderScreen('LINK_EXISTING');
    expect(await screen.findByText(/Tu cuenta ya existe/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Crea tu contraseña')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirma tu contraseña')).not.toBeInTheDocument();
    expect(document.getElementById('invitation-password')).not.toBeInTheDocument();
  });

  it('sends only {token, password} for a new account — no email, displayName, locale, theme or confirmation', async () => {
    renderScreen('CREATE_ACCOUNT');
    vi.mocked(acceptRemoteAccessInvitation).mockResolvedValue({ status: 'ACCEPTED', organizationId: 'org-id', userId: 'user-id' });
    await screen.findByLabelText('Crea tu contraseña');
    fireEvent.change(screen.getByLabelText('Crea tu contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.change(screen.getByLabelText('Confirma tu contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta y aceptar/i }));
    await waitFor(() => expect(acceptRemoteAccessInvitation).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(acceptRemoteAccessInvitation).mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['password', 'token']);
    expect(payload).toMatchObject({ password: 'correct-horse-battery' });
  });

  it('sends only {token} for an existing account — no password either', async () => {
    renderScreen('LINK_EXISTING');
    vi.mocked(acceptRemoteAccessInvitation).mockResolvedValue({ status: 'ACCEPTED', organizationId: 'org-id', userId: 'user-id' });
    await screen.findByText(/Tu cuenta ya existe/i);
    fireEvent.click(screen.getByRole('button', { name: /añadir acceso y aceptar/i }));
    await waitFor(() => expect(acceptRemoteAccessInvitation).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(acceptRemoteAccessInvitation).mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(['token']);
  });

  it('validates the password confirmation client-side and never calls the server on mismatch', async () => {
    renderScreen('CREATE_ACCOUNT');
    await screen.findByLabelText('Crea tu contraseña');
    fireEvent.change(screen.getByLabelText('Crea tu contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.change(screen.getByLabelText('Confirma tu contraseña'), { target: { value: 'different-value' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta y aceptar/i }));
    await waitFor(() => expect(document.activeElement?.id).toBe('invitation-passwordConfirmation'));
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(acceptRemoteAccessInvitation).not.toHaveBeenCalled();
  });

  it('keeps the form open and focuses the password field when no password is entered', async () => {
    renderScreen('CREATE_ACCOUNT');
    await screen.findByLabelText('Crea tu contraseña');
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta y aceptar/i }));
    await waitFor(() => expect(document.activeElement?.id).toBe('invitation-password'));
    expect(screen.getByText('Indica una contraseña.')).toBeInTheDocument();
    expect(acceptRemoteAccessInvitation).not.toHaveBeenCalled();
  });

  it('sizes the new-account and existing-account surfaces differently (no one-size-fits-all card)', async () => {
    const { unmount } = renderScreen('CREATE_ACCOUNT');
    await screen.findByLabelText('Crea tu contraseña');
    expect(document.querySelector('.invite-card--new')).toBeInTheDocument();
    expect(document.querySelector('.invite-card--existing')).not.toBeInTheDocument();
    unmount();

    renderScreen('LINK_EXISTING');
    await screen.findByText(/Tu cuenta ya existe/i);
    expect(document.querySelector('.invite-card--existing')).toBeInTheDocument();
    expect(document.querySelector('.invite-card--new')).not.toBeInTheDocument();
  });

  it('uses the real landing-page brand button (.btn-gold) for every primary CTA, never the green .auth-submit', async () => {
    renderScreen('CREATE_ACCOUNT');
    const cta = await screen.findByRole('button', { name: /crear cuenta y aceptar/i });
    expect(cta.className).toContain('btn-gold');
    expect(cta.className).not.toContain('auth-submit');
  });
});

describe('AcceptInvitationScreen terminal states', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/accept-invitation');
  });

  it('success: shows the specified title, body and CTA, in the brand button, with no generic "Aceptar invitación" title', async () => {
    window.history.replaceState({}, '', '/accept-invitation#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    vi.mocked(validateRemoteAccessInvitation).mockResolvedValue(validInvitation('LINK_EXISTING'));
    vi.mocked(acceptRemoteAccessInvitation).mockResolvedValue({ status: 'ACCEPTED', organizationId: 'org-id', userId: 'user-id' });
    render(<ThemeProvider><I18nProvider><AcceptInvitationScreen /></I18nProvider></ThemeProvider>);
    await screen.findByText(/Tu cuenta ya existe/i);
    fireEvent.click(screen.getByRole('button', { name: /añadir acceso y aceptar/i }));

    expect(await screen.findByText('Acceso activado')).toBeInTheDocument();
    expect(screen.getByText('Ya puedes entrar en Anclora ShiftImport y empezar a trabajar con Estudio Horizonte.')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: 'Ir a la aplicación' });
    expect(cta.className).toContain('btn-gold');
    expect(screen.queryByText('Aceptar invitación')).not.toBeInTheDocument();
    expect(document.querySelector('.invite-card--terminal')).toBeInTheDocument();
  });

  it('unavailable invitation: shows the non-alarmist title/text and a "Volver a ShiftImport" CTA, no generic title', async () => {
    window.history.replaceState({}, '', '/accept-invitation#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    vi.mocked(validateRemoteAccessInvitation).mockRejectedValue(
      new ApiError(409, 'gone', 'INVITATION_EXPIRED'),
    );
    render(<ThemeProvider><I18nProvider><AcceptInvitationScreen /></I18nProvider></ThemeProvider>);

    expect(await screen.findByText('Esta invitación ya no está disponible')).toBeInTheDocument();
    expect(screen.getByText('Puede que ya la hayas aceptado o que el enlace haya caducado. Si necesitas acceso, solicita una nueva invitación a la persona que te invitó.')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: 'Volver a ShiftImport' });
    expect(cta.className).toContain('btn-gold');
    expect(screen.queryByText('Aceptar invitación')).not.toBeInTheDocument();
    expect(document.querySelector('.invite-card--terminal')).toBeInTheDocument();
  });

  it('session conflict: activates the invited account without switching the current session, and offers an explicit switch', async () => {
    window.history.replaceState({}, '', '/accept-invitation#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    vi.mocked(validateRemoteAccessInvitation).mockResolvedValue(validInvitation('CREATE_ACCOUNT'));
    vi.mocked(acceptRemoteAccessInvitation).mockResolvedValue({
      status: 'ACCEPTED',
      organizationId: 'org-id',
      userId: 'user-id',
      requiresAccountSwitch: true,
      currentEmail: 'laura.martin@e2e.test',
    });
    const onSwitchAccount = vi.fn();
    render(<ThemeProvider><I18nProvider><AcceptInvitationScreen onSwitchAccount={onSwitchAccount} /></I18nProvider></ThemeProvider>);
    await screen.findByLabelText('Crea tu contraseña');
    fireEvent.change(screen.getByLabelText('Crea tu contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.change(screen.getByLabelText('Confirma tu contraseña'), { target: { value: 'correct-horse-battery' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta y aceptar/i }));

    expect(await screen.findByText('Cuenta activada')).toBeInTheDocument();
    expect(screen.getByText('La cuenta toni.garcia@e2e.test ya está preparada.')).toBeInTheDocument();
    expect(screen.getByText('Actualmente tienes una sesión iniciada como laura.martin@e2e.test.')).toBeInTheDocument();

    const primary = screen.getByRole('button', { name: 'Cerrar sesión e iniciar con la nueva cuenta' });
    expect(primary.className).toContain('btn-gold');
    const secondary = screen.getByRole('button', { name: 'Mantener la sesión actual' });
    expect(secondary.className).not.toContain('btn-gold');

    fireEvent.click(primary);
    expect(onSwitchAccount).toHaveBeenCalledWith('toni.garcia@e2e.test');

    fireEvent.click(secondary);
    expect(window.location.pathname).toBe('/app');
  });

  it('recoverable validation error stays compact and offers a retry', async () => {
    window.history.replaceState({}, '', '/accept-invitation#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
    vi.mocked(validateRemoteAccessInvitation)
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(validInvitation('LINK_EXISTING'));
    render(<ThemeProvider><I18nProvider><AcceptInvitationScreen /></I18nProvider></ThemeProvider>);

    expect(await screen.findByText('No se pudo validar la invitación')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Volver a validar' });
    expect(retry).toHaveClass('btn-gold', 'invite-cta');
    fireEvent.click(retry);
    expect(await screen.findByText('Tu cuenta ya existe. Añade este acceso para continuar. Tu contraseña y tus preferencias no cambiarán.')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../lib/i18n-react';
import { ThemeProvider } from '../lib/theme-react';
import { AcceptInvitationScreen } from './AcceptInvitationScreen';
import { acceptRemoteAccessInvitation, validateRemoteAccessInvitation } from '../lib/remote';

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
  organizationName: 'Synthetic Org',
  role: 'EMPLOYEE' as const,
  employeeName,
  email: 'person@example.test',
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

  it('shows the organization, translated access type and, when present, the associated employee profile', async () => {
    renderScreen('CREATE_ACCOUNT', 'Marta Ruiz');
    expect(await screen.findByText('Synthetic Org')).toBeInTheDocument();
    expect(screen.getByText('Tipo de acceso: Empleado')).toBeInTheDocument();
    expect(screen.getByText('Perfil asociado: Marta Ruiz')).toBeInTheDocument();
  });

  it('hides the associated employee line when there is no employee profile', async () => {
    renderScreen('CREATE_ACCOUNT', null);
    await screen.findByText('Synthetic Org');
    expect(screen.queryByText(/Perfil asociado/)).not.toBeInTheDocument();
  });

  it('presents the email as read-only information, never as an editable input', async () => {
    renderScreen('CREATE_ACCOUNT');
    const emailDisplay = await screen.findByTestId('invitation-email-display');
    expect(emailDisplay.tagName).not.toBe('INPUT');
    expect(emailDisplay).toHaveTextContent('person@example.test');
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
});

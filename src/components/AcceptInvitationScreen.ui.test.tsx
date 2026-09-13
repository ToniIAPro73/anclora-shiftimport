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

const validInvitation = (acceptanceMode: 'CREATE_ACCOUNT' | 'LINK_EXISTING') => ({
  status: 'VALID' as const,
  invitationId: 'invitation-id',
  organizationName: 'Synthetic Org',
  role: 'EMPLOYEE' as const,
  employeeName: null,
  email: 'person@example.test',
  expiresAt: '2026-09-19T00:00:00.000Z',
  acceptanceMode,
});

function renderScreen(mode: 'CREATE_ACCOUNT' | 'LINK_EXISTING') {
  window.history.replaceState({}, '', '/accept-invitation#token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO');
  vi.mocked(validateRemoteAccessInvitation).mockResolvedValue(validInvitation(mode));
  return render(<ThemeProvider><I18nProvider><AcceptInvitationScreen /></I18nProvider></ThemeProvider>);
}

describe('AcceptInvitationScreen account modes', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/accept-invitation');
  });

  it('shows account creation fields only for CREATE_ACCOUNT', async () => {
    renderScreen('CREATE_ACCOUNT');
    expect(await screen.findByLabelText('Nombre visible')).toBeInTheDocument();
    expect(document.getElementById('invitation-password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirma tu contraseña')).toBeInTheDocument();
  });

  it('does not show password fields for LINK_EXISTING', async () => {
    renderScreen('LINK_EXISTING');
    expect(await screen.findByText(/Tu cuenta ya existe/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Crea tu contraseña')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirma tu contraseña')).not.toBeInTheDocument();
  });

  it('keeps the form open and focuses the first invalid field', async () => {
    renderScreen('CREATE_ACCOUNT');
    await screen.findByLabelText('Nombre visible');
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta y aceptar/i }));
    await waitFor(() => expect(document.activeElement?.id).toBe('invitation-displayName'));
    expect(screen.getByText('Indica un nombre visible.')).toBeInTheDocument();
    expect(document.getElementById('invitation-password')).toBeInTheDocument();
    expect(acceptRemoteAccessInvitation).not.toHaveBeenCalled();
  });
});

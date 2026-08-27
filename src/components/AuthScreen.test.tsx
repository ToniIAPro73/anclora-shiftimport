// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../lib/i18n-react';
import * as session from '../lib/session';
import { AuthScreen } from './AuthScreen';

vi.mock('../lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/session')>();
  return { ...actual, login: vi.fn(), register: vi.fn() };
});

afterEach(cleanup);

const mockedLogin = vi.mocked(session.login);

function renderAuthScreen() {
  return render(
    <I18nProvider>
      <AuthScreen onAuthenticated={() => {}} onContinueAsGuest={() => {}} />
    </I18nProvider>,
  );
}

describe('AuthScreen — login password visibility toggle', () => {
  it('hides the password by default, shows it on toggle and hides again on a second toggle', () => {
    renderAuthScreen();

    const passwordInput = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(passwordInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(passwordInput.type).toBe('password');
  });

  it('login still submits the typed credentials unaffected by the toggle', async () => {
    mockedLogin.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com', displayName: '' }, organizationId: null, role: null, employeeId: null, memberships: [] });
    renderAuthScreen();

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'a@b.com' } });
    const passwordInput = screen.getByLabelText('Contraseña') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'p4ssword!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(passwordInput.value).toBe('p4ssword!');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(mockedLogin).toHaveBeenCalledWith('a@b.com', 'p4ssword!');
  });
});

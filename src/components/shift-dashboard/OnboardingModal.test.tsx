// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { saveUserProfile, DEFAULT_USER_PROFILE } from '../../lib/profile';
import { loadOnboarding } from '../../lib/onboarding';
import { getTtfvEvents } from '../../lib/ttfv';
import { OnboardingModal } from './OnboardingModal';

setupLocalStorageMock();
afterEach(cleanup);

function renderOnboarding(userId: string | null = null, onFileChosen: (file: File) => void = () => {}, onClose: () => void = () => {}) {
  return render(
    <I18nProvider>
      <OnboardingModal isOpen onClose={onClose} onFileChosen={onFileChosen} userId={userId} />
    </I18nProvider>,
  );
}

function chooseFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['fecha,tipo\n2026-03-04,Regular'], 'cuadrante.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('OnboardingModal', () => {
  it('renders the source step first and records the funnel start', () => {
    renderOnboarding('user-1');
    expect(screen.getByText('Bienvenido a Anclora ShiftImport')).toBeTruthy();
    expect(screen.getByText('¿Cómo recibes tu cuadrante?')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
    expect(loadOnboarding().step).toBe('NEW_USER');
    expect(getTtfvEvents().some((event) => event.name === 'onboarding_started')).toBe(true);
  });

  it('advances to the upload step when a source option is chosen, and back', () => {
    renderOnboarding('user-1');
    fireEvent.click(screen.getByText('Excel'));
    expect(screen.getByText('Selecciona tu cuadrante')).toBeTruthy();

    fireEvent.click(screen.getByText('Atrás'));
    expect(screen.getByText('¿Cómo recibes tu cuadrante?')).toBeTruthy();
  });

  it('hands the chosen file to the caller and records document_selected', () => {
    const onFileChosen = vi.fn();
    renderOnboarding('user-1', onFileChosen);
    fireEvent.click(screen.getByText('PDF'));

    const file = chooseFile();
    expect(onFileChosen).toHaveBeenCalledTimes(1);
    expect(onFileChosen.mock.calls[0][0]).toBe(file);
    expect(loadOnboarding().step).toBe('DOCUMENT_SELECTED');
    expect(getTtfvEvents().some((event) => event.name === 'document_selected')).toBe(true);
  });

  it('lets a first user reach the import without any account or profile fields', () => {
    // No profile saved: no identity line, no name/id inputs anywhere.
    const onFileChosen = vi.fn();
    renderOnboarding('user-1', onFileChosen);
    expect(screen.queryByText(/Usaremos tu perfil guardado/)).toBeNull();

    fireEvent.click(screen.getByText('Imagen'));
    expect(screen.queryByLabelText(/nombre/i)).toBeNull();
    chooseFile();
    expect(onFileChosen).toHaveBeenCalledTimes(1);
  });

  it('shows the useExisting line when the profile already has an identity', () => {
    saveUserProfile('user-1', { ...DEFAULT_USER_PROFILE, displayName: 'Ana' });
    renderOnboarding('user-1');
    fireEvent.click(screen.getByText('CSV'));
    expect(screen.getByText('Usaremos tu perfil guardado (Ana)')).toBeTruthy();
  });

  it('closes via the top-right button inside the card', () => {
    const onClose = vi.fn();
    renderOnboarding('user-1', () => {}, onClose);
    fireEvent.click(screen.getByLabelText('Cerrar la guía de inicio'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
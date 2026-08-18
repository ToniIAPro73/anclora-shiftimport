// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { I18nProvider } from '../lib/i18n-react';
import { LegalPage } from './LegalPage';

setupLocalStorageMock();
afterEach(cleanup);

function renderLegal(kind: 'privacy' | 'terms' | 'legal', locale: 'es' | 'en') {
  if (locale === 'en') {
    localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
  } else {
    localStorage.removeItem('anclora_shiftimport_locale_v1');
  }
  return render(
    <I18nProvider>
      <LegalPage kind={kind} />
    </I18nProvider>,
  );
}

// Words that only ever appear in the Spanish body — if any shows up while
// locale=en, chrome/body have gone mixed-language.
const SPANISH_TELLS = ['Responsable del tratamiento', 'Política de privacidad', 'Aviso legal', 'Términos', 'turnos de trabajo del usuario', 'Volver al inicio'];
// English-only tells that must never appear while locale=es.
const ENGLISH_TELLS = ['Data controller', 'Privacy policy', 'Legal notice', 'Terms of service', 'Back to home'];

describe('LegalPage bilingual content', () => {
  it.each(['privacy', 'terms', 'legal'] as const)('%s: locale=es renders a fully Spanish page (chrome + body)', (kind) => {
    renderLegal(kind, 'es');
    const text = document.body.textContent ?? '';
    for (const tell of ENGLISH_TELLS) {
      expect(text, `unexpected English tell "${tell}" while locale=es`).not.toContain(tell);
    }
  });

  it.each(['privacy', 'terms', 'legal'] as const)('%s: locale=en renders a fully English page (chrome + body)', (kind) => {
    renderLegal(kind, 'en');
    const text = document.body.textContent ?? '';
    for (const tell of SPANISH_TELLS) {
      expect(text, `unexpected Spanish tell "${tell}" while locale=en`).not.toContain(tell);
    }
  });

  it('privacy page title and body agree on locale (no english title + spanish body or vice versa)', () => {
    renderLegal('privacy', 'en');
    expect(screen.getByText('Privacy policy')).toBeTruthy();
    expect(screen.getByText(/Data controller/)).toBeTruthy();
    expect(screen.queryByText(/Responsable del tratamiento/)).toBeNull();

    cleanup();
    renderLegal('privacy', 'es');
    expect(screen.getByText('Política de privacidad')).toBeTruthy();
    expect(screen.getByText(/Responsable del tratamiento/)).toBeTruthy();
    expect(screen.queryByText(/Data controller/)).toBeNull();
  });
});

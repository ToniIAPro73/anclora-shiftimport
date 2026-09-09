// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { I18nProvider } from './i18n-react';
import { useI18n } from './use-i18n';

setupLocalStorageMock();

afterEach(() => {
  cleanup();
});

function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}>
      {locale}
    </button>
  );
}

describe('UXR-F1-M02 (CX-F08): document.documentElement.lang stays in sync with the effective locale', () => {
  it('AC-1: EN interface sets document.documentElement.lang to "en"', () => {
    const { getByRole } = render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    );

    act(() => {
      getByRole('button').click();
    });

    expect(document.documentElement.lang).toBe('en');
  });

  it('AC-2: ES -> EN -> ES cycle, and a fresh mount simulating reload with EN persisted, keep lang coherent', () => {
    const { getByRole, unmount } = render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    );
    const button = getByRole('button');

    act(() => { button.click(); }); // es -> en
    expect(document.documentElement.lang).toBe('en');

    act(() => { button.click(); }); // en -> es
    expect(document.documentElement.lang).toBe('es');

    act(() => { button.click(); }); // es -> en, persisted to localStorage
    expect(document.documentElement.lang).toBe('en');

    unmount();
    // index.html ships a static `lang="es"` before hydration; a cold load
    // with EN already persisted must still converge to "en" once the
    // provider mounts, not stay stuck on the static default.
    document.documentElement.lang = 'es';

    render(
      <I18nProvider>
        <LocaleSwitcher />
      </I18nProvider>,
    );

    expect(document.documentElement.lang).toBe('en');
  });
});

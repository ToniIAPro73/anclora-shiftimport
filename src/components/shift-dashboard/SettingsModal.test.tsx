// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { SettingsModal } from './SettingsModal';

setupLocalStorageMock();
afterEach(cleanup);

describe('SettingsModal', () => {
  it('does not show a duplicate ES/EN language selector (locale changes only via the global toggle)', () => {
    render(
      <I18nProvider>
        <SettingsModal isOpen onClose={() => {}} />
      </I18nProvider>,
    );
    // The old duplicate control was a <select> with 'Español'/'English' options.
    expect(screen.queryByText('Español')).toBeNull();
    expect(screen.queryByRole('option', { name: 'English' })).toBeNull();
    // The current locale is still shown, read-only, alongside a hint.
    expect(screen.getByText('ES')).toBeTruthy();
  });

  it('offers a curated IANA timezone dropdown with localized labels', () => {
    render(
      <I18nProvider>
        <SettingsModal isOpen onClose={() => {}} />
      </I18nProvider>,
    );
    const madrid = screen.getByRole('option', { name: 'Madrid' }) as HTMLOptionElement;
    expect(madrid.value).toBe('Europe/Madrid');
    const tokyo = screen.getByRole('option', { name: 'Tokio' }) as HTMLOptionElement;
    expect(tokyo.value).toBe('Asia/Tokyo');
    const utc = screen.getByRole('option', { name: 'UTC' }) as HTMLOptionElement;
    expect(utc.value).toBe('UTC');
  });

  it('closes via the external close button and on Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <SettingsModal isOpen onClose={onClose} />
      </I18nProvider>,
    );
    const closeButton = screen.getByLabelText('Cerrar ajustes');
    expect(closeButton.style.position).toBe('absolute');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { SettingsModal } from './SettingsModal';

setupLocalStorageMock();
afterEach(cleanup);

describe('SettingsModal', () => {
  it('has no language control at all — locale is only ever changed via the global header toggle', () => {
    render(
      <I18nProvider>
        <SettingsModal isOpen onClose={() => {}} session={null} />
      </I18nProvider>,
    );
    // The old duplicate controls: a <select> with 'Español'/'English' options,
    // and later a read-only "current locale" row. Neither should exist.
    expect(screen.queryByText('Español')).toBeNull();
    expect(screen.queryByRole('option', { name: 'English' })).toBeNull();
    expect(screen.queryByText('Idioma')).toBeNull();
    expect(screen.queryByText('Language')).toBeNull();
  });

  it('offers a curated IANA timezone dropdown with localized labels', () => {
    render(
      <I18nProvider>
        <SettingsModal isOpen onClose={() => {}} session={null} />
      </I18nProvider>,
    );
    // Click the timezone selector to open the dropdown
    const timezoneTrigger = screen.getByLabelText('Zona horaria');
    fireEvent.click(timezoneTrigger);
    // Options are buttons with role="option" in SearchableSelect
    const madrid = screen.getByRole('option', { name: 'Madrid' });
    expect(madrid).toBeTruthy();
    const tokyo = screen.getByRole('option', { name: 'Tokio' });
    expect(tokyo).toBeTruthy();
    const utc = screen.getByRole('option', { name: 'UTC' });
    expect(utc).toBeTruthy();
  });

  it('closes via the external close button and on Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <SettingsModal isOpen onClose={onClose} session={null} />
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
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { ShiftModal } from './ShiftModal';

setupLocalStorageMock();
afterEach(cleanup);

describe('ShiftModal close consistency', () => {
  it('renders the close button in the shared dialog shell', () => {
    render(
      <I18nProvider>
        <ShiftModal isOpen editingShift={null} onClose={() => {}} onSave={() => {}} />
      </I18nProvider>,
    );
    const closeButton = screen.getByLabelText('Cerrar');
    expect(closeButton.closest('[role="dialog"]')).toBeTruthy();
    expect(closeButton.closest('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <ShiftModal isOpen editingShift={null} onClose={onClose} onSave={() => {}} />
      </I18nProvider>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

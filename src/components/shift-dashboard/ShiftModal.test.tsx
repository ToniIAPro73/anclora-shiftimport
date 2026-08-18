// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { ShiftModal } from './ShiftModal';

setupLocalStorageMock();
afterEach(cleanup);

describe('ShiftModal close consistency', () => {
  it('renders the close button outside the form (absolute, top-right of the card)', () => {
    render(
      <I18nProvider>
        <ShiftModal isOpen editingShift={null} onClose={() => {}} onSave={() => {}} />
      </I18nProvider>,
    );
    const closeButton = screen.getByLabelText('Cerrar');
    expect(closeButton.style.position).toBe('absolute');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <ShiftModal isOpen editingShift={null} onClose={onClose} onSave={() => {}} />
      </I18nProvider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

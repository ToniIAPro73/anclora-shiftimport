// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { ImportModal } from './ImportModal';

setupLocalStorageMock();
afterEach(cleanup);

function renderImportModal(locale: 'es' | 'en', onClose: () => void) {
  if (locale === 'en') {
    localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
  }
  return render(
    <I18nProvider>
      <ImportModal
        isOpen
        onClose={onClose}
        onConfirmImport={async () => true}
        initialContext={{ month: 0, year: 2026 }}
      />
    </I18nProvider>,
  );
}

describe('ImportModal', () => {
  it('shows the Spanish, format-neutral empty-state copy ("Procesar archivo", not "Procesar PDF")', () => {
    renderImportModal('es', () => {});
    expect(screen.getByText('Pulsa "Procesar archivo" para detectar turnos')).toBeTruthy();
    expect(screen.getByText('Procesar archivo')).toBeTruthy();
    expect(screen.queryByText(/Procesar PDF/)).toBeNull();
  });

  it('shows the English empty-state copy when locale is en', () => {
    renderImportModal('en', () => {});
    expect(screen.getByText('Click "Process file" to detect shifts')).toBeTruthy();
    expect(screen.getByText('Process file')).toBeTruthy();
  });

  it('closes via the external close button (positioned outside the header row, absolute in the card)', () => {
    const onClose = vi.fn();
    renderImportModal('es', onClose);
    const closeButton = screen.getByLabelText('Cerrar importación');
    expect(closeButton.style.position).toBe('absolute');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderImportModal('es', onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import { loadRemoteChangeRequests, loadRemoteShifts } from '../../lib/remote';
import { NewChangeRequestModal } from './NewChangeRequestModal';

vi.mock('../../lib/remote', async () => {
  const actual = await vi.importActual<typeof import('../../lib/remote')>('../../lib/remote');
  return { ...actual, loadRemoteShifts: vi.fn(), loadRemoteChangeRequests: vi.fn() };
});

afterEach(cleanup);
const mockedLoadShifts = vi.mocked(loadRemoteShifts);
const mockedLoadRequests = vi.mocked(loadRemoteChangeRequests);

describe('NewChangeRequestModal', () => {
  beforeEach(() => {
    mockedLoadShifts.mockReset();
    mockedLoadRequests.mockReset();
    mockedLoadShifts.mockResolvedValue([{ id: 'shift-1', date: '2026-09-05', startTime: '09:00', endTime: '17:00', location: 'Office', origin: 'IMP' }]);
    mockedLoadRequests.mockResolvedValue([]);
  });

  it('loads only the authenticated employee shift source and exposes the request form in a dialog', async () => {
    render(
      <ThemeProvider>
        <I18nProvider>
          <NewChangeRequestModal isOpen employeeId="employee-1" onClose={vi.fn()} />
        </I18nProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Nueva solicitud' })).toBeTruthy());
    expect(mockedLoadShifts).toHaveBeenCalledWith('employee-1');
    expect(screen.getByLabelText('Turno afectado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeTruthy();
  });
});

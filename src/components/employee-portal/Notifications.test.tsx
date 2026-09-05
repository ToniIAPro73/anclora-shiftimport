// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n-react';
import { EmployeeNotification, loadRemoteNotifications, markRemoteNotificationRead } from '../../lib/remote';
import { ThemeProvider } from '../../lib/theme-react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { Notifications } from './Notifications';

vi.mock('../../lib/remote', () => ({
  loadRemoteNotifications: vi.fn(),
  markRemoteNotificationRead: vi.fn(),
}));

setupLocalStorageMock();
afterEach(cleanup);

const mockedLoad = vi.mocked(loadRemoteNotifications);
const mockedMarkRead = vi.mocked(markRemoteNotificationRead);
const shiftId = '22222222-2222-4222-8222-222222222222';

function notification(readAt: string | null = null): EmployeeNotification {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    organizationId: 'org-1',
    type: 'SHIFT_PUBLISHED',
    resourceType: 'SHIFT',
    resourceId: shiftId,
    readAt,
    createdAt: '2026-09-05T10:00:00.000Z',
  };
}

function renderNotifications(onOpenShift = vi.fn()) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <Notifications onOpenShift={onOpenShift} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('Notifications', () => {
  beforeEach(() => {
    mockedLoad.mockReset();
    mockedMarkRead.mockReset();
  });

  it('renders an accessible unread count and marks an opened notification read', async () => {
    const onOpenShift = vi.fn();
    mockedLoad.mockResolvedValue({ notifications: [notification()], unreadCount: 1 });
    mockedMarkRead.mockResolvedValue(notification('2026-09-05T10:05:00.000Z'));
    renderNotifications(onOpenShift);

    await waitFor(() => expect(screen.getByLabelText('1 notificación sin leer')).toBeTruthy());
    const item = screen.getByRole('button', { name: 'Tienes un nuevo turno publicado' });
    fireEvent.click(item);
    await waitFor(() => expect(mockedMarkRead).toHaveBeenCalledWith(notification().id));
    expect(onOpenShift).toHaveBeenCalledWith(shiftId);
    await waitFor(() => expect(screen.getByLabelText('0 notificaciones sin leer')).toBeTruthy());
  });

  it('renders empty and error states without introducing delivery channels', async () => {
    mockedLoad.mockResolvedValue({ notifications: [], unreadCount: 0 });
    renderNotifications();
    await waitFor(() => expect(screen.getByTestId('notifications-empty')).toBeTruthy());

    cleanup();
    mockedLoad.mockRejectedValue(new Error('offline'));
    renderNotifications();
    await waitFor(() => expect(screen.getByTestId('notifications-error')).toBeTruthy());
    expect(screen.queryByText(/email|SMS|push/i)).toBeNull();
  });
});

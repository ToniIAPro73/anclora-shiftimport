import { useCallback, useEffect, useState } from 'react';
import { EmployeeNotification, loadRemoteNotifications, markRemoteNotificationRead } from '../../lib/remote';

type NotificationsState =
  | { status: 'loading'; notifications: EmployeeNotification[] }
  | { status: 'ready'; notifications: EmployeeNotification[] }
  | { status: 'error'; notifications: EmployeeNotification[] };

export interface NotificationsController {
  notifications: EmployeeNotification[];
  unreadCount: number;
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
  markRead: (notificationId: string) => Promise<boolean>;
}

export function useNotifications(): NotificationsController {
  const [state, setState] = useState<NotificationsState>({ status: 'loading', notifications: [] });
  const [markingId, setMarkingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState((current) => ({ status: 'loading', notifications: current.notifications }));
    try {
      const result = await loadRemoteNotifications();
      setState({ status: 'ready', notifications: result.notifications });
    } catch {
      setState((current) => ({ status: 'error', notifications: current.notifications }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const markRead = useCallback(async (notificationId: string): Promise<boolean> => {
    if (markingId) return false;
    setMarkingId(notificationId);
    try {
      const updated = await markRemoteNotificationRead(notificationId);
      setState((current) => ({
        status: current.status === 'error' ? 'ready' : current.status,
        notifications: current.notifications.map((notification) => notification.id === updated.id ? updated : notification),
      }));
      setMarkingId(null);
      return true;
    } catch {
      setMarkingId(null);
      return false;
    }
  }, [markingId]);

  const unreadCount = state.notifications.reduce((count, notification) => count + (notification.readAt ? 0 : 1), 0);
  return {
    notifications: state.notifications,
    unreadCount,
    loading: state.status === 'loading',
    error: state.status === 'error',
    reload,
    markRead,
  };
}

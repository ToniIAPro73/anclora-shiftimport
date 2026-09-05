import { Bell, Check, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmployeeNotification } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { useNotifications } from './use-notifications';
import { NotificationsController } from './use-notifications';

interface NotificationsProps {
  onOpenShift?: (shiftId: string) => void;
}

interface NotificationsPanelProps extends NotificationsProps {
  controller: NotificationsController;
}

function relativeTimestamp(iso: string, locale: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return iso;
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const [value, unit] = absoluteSeconds < 60
    ? [seconds, 'second']
    : absoluteSeconds < 3600
      ? [Math.round(seconds / 60), 'minute']
      : absoluteSeconds < 86400
        ? [Math.round(seconds / 3600), 'hour']
        : [Math.round(seconds / 86400), 'day'];
  return new Intl.RelativeTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', { numeric: 'auto' })
    .format(value, unit as Intl.RelativeTimeFormatUnit);
}

export function Notifications({ onOpenShift }: NotificationsProps) {
  return <NotificationsPanel controller={useNotifications()} onOpenShift={onOpenShift} />;
}

export function NotificationsPanel({ controller, onOpenShift }: NotificationsPanelProps) {
  const { locale, t } = useI18n();
  const [feedback, setFeedback] = useState('');

  const notificationText = useMemo(() => ({
    SHIFT_PUBLISHED: t('employeeNotifications.shiftPublished'),
    CHANGE_REQUEST_RESOLVED: t('employeeNotifications.changeRequestResolved'),
    APPROVAL_REQUEST_CREATED: t('employeeNotifications.approvalRequestCreated'),
  }), [t]);

  const handleOpen = async (notification: EmployeeNotification) => {
    setFeedback('');
    const marked = await controller.markRead(notification.id);
    if (!marked) {
      setFeedback(t('employeeNotifications.markReadError'));
      return;
    }
    setFeedback(t('employeeNotifications.markedRead'));
    if (notification.type === 'SHIFT_PUBLISHED') {
      onOpenShift?.(notification.resourceId);
    }
  };

  return (
    <section className="employee-notifications" aria-labelledby="employee-notifications-title" data-testid="notifications">
      <div className="employee-notifications__heading">
        <div>
          <p className="employee-notifications__eyebrow">{t('employeeNotifications.eyebrow')}</p>
          <h2 id="employee-notifications-title">
            <Bell size={20} aria-hidden="true" />
            {t('employeeNotifications.title')}
          </h2>
        </div>
        <span
          className="employee-notifications__count"
          aria-label={controller.unreadCount === 1
            ? t('employeeNotifications.unreadCountOne')
            : t('employeeNotifications.unreadCount', { count: controller.unreadCount })}
        >
          {controller.unreadCount}
        </span>
      </div>

      {controller.loading && (
        <p className="employee-notifications__state" role="status" aria-busy="true" data-testid="notifications-loading">
          {t('employeeNotifications.loading')}
        </p>
      )}

      {controller.error && (
        <div className="employee-notifications__state employee-notifications__state--error" role="alert" data-testid="notifications-error">
          <h3>{t('employeeNotifications.errorTitle')}</h3>
          <p>{t('employeeNotifications.errorDescription')}</p>
          <button type="button" onClick={() => void controller.reload()}>
            <RotateCcw size={15} aria-hidden="true" />
            {t('employeeNotifications.retry')}
          </button>
        </div>
      )}

      {!controller.loading && !controller.error && controller.notifications.length === 0 && (
        <div className="employee-notifications__state" data-testid="notifications-empty">
          <h3>{t('employeeNotifications.emptyTitle')}</h3>
          <p>{t('employeeNotifications.emptyDescription')}</p>
        </div>
      )}

      {!controller.loading && !controller.error && controller.notifications.length > 0 && (
        <ol className="employee-notifications__list" aria-label={t('employeeNotifications.title')}>
          {controller.notifications.map((notification) => {
            const text = notificationText[notification.type] ?? t('employeeNotifications.unknown');
            const isUnread = !notification.readAt;
            return (
              <li key={notification.id} className={`employee-notifications__item${isUnread ? ' is-unread' : ''}`}>
                <button
                  type="button"
                  className="employee-notifications__item-button"
                  aria-label={text}
                  aria-describedby={`notification-time-${notification.id}`}
                  disabled={controller.loading}
                  onClick={() => void handleOpen(notification)}
                >
                  <span className="employee-notifications__item-icon" aria-hidden="true">
                    {isUnread ? <Bell size={16} /> : <Check size={16} />}
                  </span>
                  <span className="employee-notifications__item-copy">
                    <strong>{text}</strong>
                    <time id={`notification-time-${notification.id}`} dateTime={notification.createdAt}>
                      {relativeTimestamp(notification.createdAt, locale)}
                    </time>
                  </span>
                  {isUnread && <span className="employee-notifications__unread-dot" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <p className="employee-notifications__feedback" role={feedback ? 'alert' : undefined} aria-live="polite">
        {feedback}
      </p>
    </section>
  );
}

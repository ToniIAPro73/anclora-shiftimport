import { CalendarDays, CalendarRange, ClipboardList, MoreHorizontal } from 'lucide-react';
import { useI18n } from '../../lib/use-i18n';

export type PortalView = 'today' | 'week' | 'requests' | 'more' | 'detail';
export type PortalSection = Exclude<PortalView, 'detail'>;

interface BottomNavProps {
  activeView: PortalView;
  detailReturnView: PortalSection;
  unreadCount: number;
  onNavigate: (view: PortalSection) => void;
}

const ITEMS = [
  { key: 'today', icon: CalendarDays, labelKey: 'employeePortal.today' },
  { key: 'week', icon: CalendarRange, labelKey: 'employeePortal.week' },
  { key: 'requests', icon: ClipboardList, labelKey: 'employeePortal.requests' },
  { key: 'more', icon: MoreHorizontal, labelKey: 'employeePortal.more' },
] as const;

export function BottomNav({ activeView, detailReturnView, unreadCount, onNavigate }: BottomNavProps) {
  const { t } = useI18n();

  return (
    <nav className="employee-portal__navigation" aria-label={t('employeePortal.navigationLabel')} data-testid="employee-portal-nav">
      {ITEMS.map(({ key, icon: Icon, labelKey }) => {
        const isActive = activeView === key || (activeView === 'detail' && detailReturnView === key);
        const label = t(labelKey);
        return (
          <button
            type="button"
            key={key}
            className={`employee-portal__nav-button${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(key)}
          >
            <span className="employee-portal__nav-icon" aria-hidden="true"><Icon size={19} strokeWidth={isActive ? 2.4 : 2} /></span>
            <span>{label}</span>
            {key === 'more' && unreadCount > 0 && (
              <span
                className="employee-portal__nav-badge"
                aria-label={unreadCount === 1
                  ? t('employeePortal.unreadNotificationsOne')
                  : t('employeePortal.unreadNotifications', { count: unreadCount })}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

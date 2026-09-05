import { SessionInfo } from '../../lib/session';
import { useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { TurnosLogo } from '../branding/TurnosLogo';
import { MyWeek } from './MyWeek';
import { ShiftDetail } from './ShiftDetail';
import { Today } from './Today';
import { RequestStatus } from './RequestStatus';
import { BottomNav, PortalSection, PortalView } from './BottomNav';
import { More } from './More';
import { useNotifications } from './use-notifications';
import { getWeekStartMonday, toISODate } from '../../lib/week';

interface PortalShellProps {
  session: SessionInfo;
  employeeName?: string;
  onLogout: () => void;
}

function resolveOrganizationName(session: SessionInfo): string {
  if (!session.organizationId) {
    return '';
  }
  return session.memberships.find((membership) => membership.organizationId === session.organizationId)?.organizationName ?? '';
}

function resolveIdentity(session: SessionInfo, employeeName?: string): string {
  return employeeName?.trim() || session.user.displayName.trim() || session.user.email;
}

export const PortalShell = ({ session, employeeName, onLogout }: PortalShellProps) => {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<PortalView>('today');
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [detailReturnView, setDetailReturnView] = useState<PortalSection>('today');
  const [weekStart, setWeekStart] = useState(() => toISODate(getWeekStartMonday(new Date())));
  const notificationsController = useNotifications();
  const organizationName = resolveOrganizationName(session);
  const identity = resolveIdentity(session, employeeName);
  const openDetail = (shiftId: string, returnView: PortalSection) => {
    setSelectedShiftId(shiftId);
    setDetailReturnView(returnView);
    setActiveView('detail');
  };
  const closeDetail = () => {
    setActiveView(detailReturnView);
    const shiftId = selectedShiftId;
    window.setTimeout(() => {
      if (!shiftId) return;
      document.querySelector<HTMLElement>(`[data-shift-id="${shiftId}"]`)?.focus();
    }, 0);
  };
  const mainHeadingId = activeView === 'today'
    ? 'employee-today-title'
    : activeView === 'week'
      ? 'employee-week-title'
      : activeView === 'requests'
        ? 'employee-request-status-title'
        : activeView === 'more'
          ? 'employee-more-title'
          : 'employee-shift-detail-title';

  return (
    <div className="employee-portal" data-testid="employee-portal">
      <header className="employee-portal__header">
        <div className="employee-portal__identity">
          <TurnosLogo />
          <div className="employee-portal__identity-copy">
            <p className="employee-portal__eyebrow">{t('employeePortal.eyebrow')}</p>
            <h1 className="employee-portal__organization">{organizationName || 'Anclora ShiftImport'}</h1>
            <p className="employee-portal__person">{identity}</p>
          </div>
        </div>

      </header>

      <main className="employee-portal__main" aria-labelledby={mainHeadingId}>
        {activeView === 'today' && <Today onSelectShift={(shiftId) => openDetail(shiftId, 'today')} />}
        {activeView === 'week' && <MyWeek weekStart={weekStart} onWeekStartChange={setWeekStart} onSelectShift={(shiftId) => openDetail(shiftId, 'week')} />}
        {activeView === 'requests' && <RequestStatus onSelectShift={(shiftId) => openDetail(shiftId, 'requests')} />}
        {activeView === 'more' && (
          <More
            session={session}
            identity={identity}
            organizationName={organizationName}
            notificationsController={notificationsController}
            onOpenShift={(shiftId) => openDetail(shiftId, 'more')}
            onLogout={onLogout}
          />
        )}
        {activeView === 'detail' && selectedShiftId && <ShiftDetail shiftId={selectedShiftId} onBack={closeDetail} />}
      </main>

      <BottomNav
        activeView={activeView}
        detailReturnView={detailReturnView}
        unreadCount={notificationsController.unreadCount}
        onNavigate={setActiveView}
      />
    </div>
  );
};

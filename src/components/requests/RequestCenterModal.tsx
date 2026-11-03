import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ModalShell } from '../ui/ModalShell';
import { SegmentedTabs, type SegmentedTab } from '../ui/SegmentedTabs';
import { ApprovalInbox } from '../shift-dashboard/ApprovalInbox';
import { useI18n } from '../../lib/use-i18n';
import './RequestCenterModal.css';

export type RequestCenterTab = 'pending' | 'history' | 'mine';

interface RequestCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tab to show when it opens (the sidebar's "Mis solicitudes" opens it on `mine`). */
  initialTab?: RequestCenterTab;
  /** The role can decide requests (OWNER, ADMIN, PLANNER). Without it only "Mis solicitudes" exists. */
  canManage: boolean;
  /** The user has a linked employee: "Mis solicitudes" is meaningful. */
  hasEmployee: boolean;
  currentEmployeeId?: string | null;
  currentUserId?: string | null;
  areas?: Array<{ id: string; name: string }>;
  pendingCount?: number;
  onPendingCountChange?: (count: number) => void;
  /** The existing own-requests surface (RequestStatus), reused as is so the EMPLOYEE portal and this tab never diverge. */
  mine?: ReactNode;
}

/**
 * Request Center (spec §5.4): ONE modal for everything a person does with requests. Managers get "Pendientes del equipo",
 * "Historial del equipo" and, when they are also employees, "Mis solicitudes"; roles without management only get the last one.
 * It extends the existing Solicitudes modal (same ModalShell workspace, same viewport rules): there is no second centre.
 * Hiding tabs is presentation only — every list and decision is authorised again by the server.
 */
export function RequestCenterModal({
  isOpen, onClose, initialTab, canManage, hasEmployee, currentEmployeeId, currentUserId, areas, pendingCount = 0, onPendingCountChange, mine,
}: RequestCenterModalProps) {
  const { t } = useI18n();
  const tabs = useMemo<Array<SegmentedTab<RequestCenterTab>>>(() => {
    const list: Array<SegmentedTab<RequestCenterTab>> = [];
    if (canManage) {
      list.push({ id: 'pending', label: pendingCount > 0 ? `${t('requestCenter.pending')} (${pendingCount})` : t('requestCenter.pending'), shortLabel: pendingCount > 0 ? `${t('requestCenter.pendingShort')} (${pendingCount})` : t('requestCenter.pendingShort') });
      list.push({ id: 'history', label: t('requestCenter.history'), shortLabel: t('requestCenter.historyShort') });
    }
    if (hasEmployee) list.push({ id: 'mine', label: t('requestCenter.mine'), shortLabel: t('requestCenter.mineShort') });
    return list;
  }, [canManage, hasEmployee, pendingCount, t]);

  const fallback = tabs[0]?.id ?? 'mine';
  const [tab, setTab] = useState<RequestCenterTab>(initialTab && tabs.some((item) => item.id === initialTab) ? initialTab : fallback);
  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab && tabs.some((item) => item.id === initialTab) ? initialTab : (tabs[0]?.id ?? 'mine'));
    // The tab only resets when the modal (re)opens or is asked for another entry point, never while the user navigates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab]);

  if (tabs.length === 0) return null;
  const active = tabs.some((item) => item.id === tab) ? tab : fallback;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('requestCenter.title')}
      closeAriaLabel={t('common.close')}
      workspace
      maxWidth="1040px"
      height="min(calc(100dvh - 32px), 960px)"
    >
      <div className="request-center" data-testid="request-center">
        {tabs.length > 1 && (
          <SegmentedTabs
            tabs={tabs}
            value={active}
            onChange={setTab}
            ariaLabel={t('requestCenter.tabsLabel')}
            idPrefix="request-center-tab"
            panelId="request-center-panel"
            testIdPrefix="request-center-tab"
          />
        )}
        <div
          className="request-center__panel"
          id="request-center-panel"
          role="tabpanel"
          aria-labelledby={tabs.length > 1 ? `request-center-tab-${active}` : undefined}
          data-tab={active}
        >
          {active === 'pending' && (
            <ApprovalInbox mode="PENDING" currentEmployeeId={currentEmployeeId} currentUserId={currentUserId} areas={areas} onPendingCountChange={onPendingCountChange} />
          )}
          {active === 'history' && (
            <ApprovalInbox mode="HISTORY" currentEmployeeId={currentEmployeeId} currentUserId={currentUserId} areas={areas} />
          )}
          {active === 'mine' && mine}
        </div>
      </div>
    </ModalShell>
  );
}

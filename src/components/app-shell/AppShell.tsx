import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AreaChart,
  CalendarDays,
  ChevronDown,
  FileCog,
  History,
  LogOut,
  Map,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCw,
  Settings2,
  Upload,
  UsersRound,
  X,
} from 'lucide-react';
import type { Role } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { TurnosLogo } from '../branding/TurnosLogo';

import './AppShell.css';

const SIDEBAR_STATE_KEY = 'anclora_shiftimport_sidebar_v1';

export type ShellSection = 'calendar' | 'planner';

export function CalendarToolbar({
  year,
  month,
  shiftCount,
  areaControl,
  employeeControl,
  onNavigate,
  onRefresh,
  isRefreshing = false,
}: {
  year: number;
  month: number;
  shiftCount?: number;
  areaControl?: ReactNode;
  employeeControl?: ReactNode;
  onNavigate: (delta: number) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const { t, tl } = useI18n();
  const monthNames = tl('calendar.months');
  return (
    <div className="calendar-toolbar" data-testid="calendar-toolbar">
      <div className="calendar-toolbar__heading">
        <p className="calendar-toolbar__eyebrow">{t('shell.calendar')}</p>
        <h1 className="calendar-toolbar__title">{monthNames[month]} {year}</h1>
      </div>
      <div className="calendar-toolbar__controls">
        {areaControl}
        {employeeControl}
        {typeof shiftCount === 'number' && (
          <span className="calendar-toolbar__count" role="status" aria-live="polite">
            {t('calendar.shiftCount', { count: shiftCount })}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            className="calendar-toolbar__refresh-button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={t('calendar.refreshCalendar')}
            title={t('calendar.refreshCalendar')}
            data-testid="calendar-refresh-button"
          >
            <RotateCw size={16} className={isRefreshing ? 'icon-spin' : undefined} aria-hidden="true" />
          </button>
        )}
        <div className="month-navigator" aria-label={t('calendar.monthNavigation')}>
          <button type="button" className="month-nav-button" onClick={() => onNavigate(-1)} aria-label={t('header.previousMonth')}>
            <ChevronDown size={18} aria-hidden="true" style={{ transform: 'rotate(90deg)' }} />
          </button>
          <span className="month-nav-label">{monthNames[month]} {year}</span>
          <button type="button" className="month-nav-button" onClick={() => onNavigate(1)} aria-label={t('header.nextMonth')}>
            <ChevronDown size={18} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

export interface AppShellProps {
  children: ReactNode;
  role: Role | null;
  userName: string;
  userRole?: string;
  activeSection: ShellSection;
  themeControl: ReactNode;
  languageControl: ReactNode;
  contextContent?: ReactNode;
  contextSummary?: ReactNode;
  hasContext?: boolean;
  onSignIn?: () => void;
  onImport?: () => void;
  onAddShift?: () => void;
  onSelfImport?: () => void;
  onHistoricalAdd?: () => void;
  onRequests?: () => void;
  onHistory?: () => void;
  onPlanner?: () => void;
  onApprovals?: () => void;
  onTeam?: () => void;
  onMembers?: () => void;
  onAreas?: () => void;
  onFormatProfiles?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
  pendingRequestsCount?: number;
}

interface SidebarItemProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  badge?: number;
  collapsed: boolean;
  onClick?: () => void;
  testId?: string;
}

function SidebarItem({ label, icon, active = false, badge, collapsed, onClick, testId }: SidebarItemProps) {
  return (
    <button
      type="button"
      className={`app-shell__nav-item${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={collapsed ? label : undefined}
      onClick={onClick}
      data-testid={testId}
    >
      <span className="app-shell__nav-icon" aria-hidden="true">{icon}</span>
      <span className="app-shell__nav-label">{label}</span>
      {typeof badge === 'number' && <span className="app-shell__nav-badge" aria-label={`${badge}`}>{badge}</span>}
    </button>
  );
}

function SidebarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="app-shell__nav-group">
      <p className="app-shell__nav-group-label">{label}</p>
      <div className="app-shell__nav-group-items">{children}</div>
    </div>
  );
}

function UserMenu({
  userName,
  userRole,
  onSignIn,
  onLogout,
}: Pick<AppShellProps, 'userName' | 'userRole' | 'onSignIn' | 'onLogout'>) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const displayName = userName.trim() || t('shell.account');
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="app-shell__user" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className="app-shell__user-trigger"
        aria-label={t('shell.userMenu')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        data-testid="app-shell-user-menu"
      >
        <span className="app-shell__avatar" aria-hidden="true">{initials}</span>
        <span className="app-shell__user-copy">
          <strong>{displayName}</strong>
          {userRole && <small>{userRole}</small>}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="app-shell__user-menu" role="menu" aria-label={t('shell.userMenu')}>
          {onLogout && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>
              <LogOut size={16} aria-hidden="true" />
              {t('auth.logoutAction')}
            </button>
          )}
          {onSignIn && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignIn(); }}>
              {t('auth.signIn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({
  children,
  role,
  userName,
  userRole,
  activeSection,
  themeControl,
  languageControl,
  contextContent,
  contextSummary,
  hasContext = Boolean(contextContent || contextSummary),
  onSignIn,
  onImport,
  onAddShift,
  onSelfImport,
  onHistoricalAdd,
  onRequests,
  onHistory,
  onPlanner,
  onApprovals,
  onTeam,
  onMembers,
  onAreas,
  onFormatProfiles,
  onSettings,
  onLogout,
  pendingRequestsCount,
}: AppShellProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(SIDEBAR_STATE_KEY) !== 'collapsed';
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STATE_KEY, expanded ? 'expanded' : 'collapsed');
  }, [expanded]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => drawerRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]');
    focusable()?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        menuTriggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const items = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);
  const runAction = (action?: () => void) => {
    closeDrawer();
    action?.();
  };
  const isEmployee = role === 'EMPLOYEE';
  const canManage = role === 'OWNER' || role === 'ADMIN';

  return (
    <div className={`app-shell${expanded ? ' is-expanded' : ' is-collapsed'}${drawerOpen ? ' is-drawer-open' : ''}`} data-testid="app-shell">
      <a className="app-shell__skip-link" href="#main-content">{t('shell.skipToMain')}</a>
      <div className="app-shell__mobile-backdrop" aria-hidden="true" onClick={closeDrawer} />
      <aside
          ref={drawerRef}
          className="app-shell__sidebar"
          aria-label={t('shell.sidebarLabel')}
          data-testid="app-shell-sidebar"
        >
          <div className="app-shell__brand">
            <TurnosLogo />
            <div className="app-shell__brand-copy">
              <strong>Anclora ShiftImport</strong>
              <span>{t('header.subtitle')}</span>
            </div>
          </div>

          <nav className="app-shell__nav" aria-label={t('shell.navigationLabel')}>
            {/* OPERACIÓN: Calendario, Planificar, Importar, Añadir turno, Solicitudes */}
            <SidebarGroup label={t('shell.operation')}>
              <SidebarItem label={t('shell.calendar')} icon={<CalendarDays size={18} />} active={activeSection === 'calendar'} collapsed={!expanded} onClick={() => runAction()} testId="sidebar-calendar" />
              {isEmployee ? (
                <>
                  {onSelfImport && <SidebarItem label={t('employeePortal.importSelf')} icon={<Upload size={18} />} collapsed={!expanded} onClick={() => runAction(onSelfImport)} testId="sidebar-self-import" />}
                  {onHistoricalAdd && <SidebarItem label={t('employeePortal.addHistorical')} icon={<Plus size={18} />} collapsed={!expanded} onClick={() => runAction(onHistoricalAdd)} testId="sidebar-historical-add" />}
                  {onRequests && <SidebarItem label={t('employeePortal.requests')} icon={<FileCog size={18} />} collapsed={!expanded} onClick={() => runAction(onRequests)} testId="sidebar-requests" />}
                </>
              ) : (
                <>
                  {onPlanner && <SidebarItem label={t('planner.navLabel')} icon={<AreaChart size={18} />} active={activeSection === 'planner'} collapsed={!expanded} onClick={() => runAction(onPlanner)} testId="sidebar-planner" />}
                  {onImport && <SidebarItem label={t('shell.import')} icon={<Upload size={18} />} collapsed={!expanded} onClick={() => runAction(onImport)} testId="sidebar-import" />}
                  {onAddShift && <SidebarItem label={t('shell.addShift')} icon={<Plus size={18} />} collapsed={!expanded} onClick={() => runAction(onAddShift)} testId="sidebar-add-shift" />}
                  {(onApprovals || onRequests) && (
                    <SidebarItem
                      label={t('approvalInbox.navLabel')}
                      icon={<FileCog size={18} />}
                      badge={typeof pendingRequestsCount === 'number' && pendingRequestsCount > 0 ? pendingRequestsCount : undefined}
                      collapsed={!expanded}
                      onClick={() => runAction(onApprovals || onRequests)}
                      testId="sidebar-approvals"
                    />
                  )}
                </>
              )}
            </SidebarGroup>

            {/* GESTIÓN: Equipo, Historial de importaciones, Formatos aprendidos (hidden from EMPLOYEE) */}
            {!isEmployee && (canManage || onHistory) && (
              <SidebarGroup label={t('shell.management')}>
                {canManage && onTeam && (
                  <SidebarItem
                    label={t('shell.team')}
                    icon={<UsersRound size={18} />}
                    collapsed={!expanded}
                    onClick={() => runAction(onTeam)}
                    testId="sidebar-team"
                  />
                )}
                {canManage && !onTeam && onMembers && (
                  <SidebarItem
                    label={t('members.title')}
                    icon={<UsersRound size={18} />}
                    collapsed={!expanded}
                    onClick={() => runAction(onMembers)}
                    testId="sidebar-members"
                  />
                )}
                {canManage && !onTeam && onAreas && (
                  <SidebarItem
                    label={t('areas.manage')}
                    icon={<Map size={18} />}
                    collapsed={!expanded}
                    onClick={() => runAction(onAreas)}
                    testId="sidebar-areas"
                  />
                )}
                {onHistory && (
                  <SidebarItem
                    label={t('shell.history')}
                    icon={<History size={18} />}
                    collapsed={!expanded}
                    onClick={() => runAction(onHistory)}
                    testId="sidebar-history"
                  />
                )}
                {canManage && onFormatProfiles && (
                  <SidebarItem
                    label={t('formatProfiles.manage')}
                    icon={<FileCog size={18} />}
                    collapsed={!expanded}
                    onClick={() => runAction(onFormatProfiles)}
                    testId="sidebar-formats"
                  />
                )}
              </SidebarGroup>
            )}

            {/* CONFIGURACIÓN: Ajustes (hidden from EMPLOYEE) */}
            {!isEmployee && canManage && onSettings && (
              <SidebarGroup label={t('shell.configuration')}>
                <SidebarItem
                  label={t('settings.title')}
                  icon={<Settings2 size={18} />}
                  collapsed={!expanded}
                  onClick={() => runAction(onSettings)}
                  testId="sidebar-settings"
                />
              </SidebarGroup>
            )}
          </nav>

          <button
            type="button"
            className="app-shell__collapse"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={expanded ? t('shell.collapseSidebar') : t('shell.expandSidebar')}
            title={expanded ? t('shell.collapseSidebar') : t('shell.expandSidebar')}
            data-testid="sidebar-collapse"
          >
            {expanded ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
          </button>
      </aside>

      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <button
            ref={menuTriggerRef}
            type="button"
            className="app-shell__mobile-menu"
            aria-label={t('shell.openNavigation')}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            data-testid="app-shell-mobile-menu"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          {hasContext && contextSummary && <div className="app-shell__context-topbar"><div className="app-shell__context-summary">{contextSummary}</div></div>}
          <div className="app-shell__topbar-spacer" />
          <div className="app-shell__topbar-controls">
            {!isEmployee && typeof pendingRequestsCount === 'number' && pendingRequestsCount > 0 && (onApprovals || onRequests) && (
              <button
                type="button"
                className="app-shell__topbar-requests"
                onClick={() => runAction(onApprovals || onRequests)}
                title={t('approvalInbox.count', { count: pendingRequestsCount })}
                aria-label={t('approvalInbox.count', { count: pendingRequestsCount })}
                data-testid="topbar-pending-requests"
              >
                <FileCog size={16} aria-hidden="true" />
                <span className="app-shell__topbar-requests-badge">{pendingRequestsCount}</span>
              </button>
            )}
            {themeControl}
            {languageControl}
            <UserMenu userName={userName} userRole={userRole} onSignIn={onSignIn} onLogout={onLogout} />
          </div>
          {drawerOpen && <button type="button" className="app-shell__mobile-close" aria-label={t('shell.closeNavigation')} onClick={closeDrawer}><X size={20} aria-hidden="true" /></button>}
        </header>

        <main id="main-content" className="app-shell__main" aria-label={t('shell.mainWorkspace')}>
          {hasContext && contextContent && (
            <section className="app-shell__main-context" aria-label={t('shell.context')} data-testid="app-shell-main-context">
              {contextContent}
            </section>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

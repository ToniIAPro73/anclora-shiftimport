import { ChevronLeft, ChevronRight, History, PlusCircle, Settings } from 'lucide-react';
import { SessionInfo } from '../../lib/session';
import { RemoteEmployee } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { TurnosLogo } from '../branding/TurnosLogo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LanguageToggle } from '../ui/LanguageToggle';

interface MonthHeaderProps {
  year: number;
  month: number;
  onNavigate: (delta: number) => void;
  onAddShift: () => void;
  onImport: () => void;
  onOpenImportHistory?: () => void;
  onOpenSettings: (role: SessionInfo['role']) => void;
  session: SessionInfo | null;
  employees: RemoteEmployee[];
}

function resolveIdentity(session: SessionInfo | null, employees: RemoteEmployee[]): string {
  if (!session) {
    return '';
  }

  // 1. Prefer the linked employee's name (from backend, org-scoped)
  if (session.employeeId) {
    const employee = employees.find((e) => e.id === session.employeeId);
    if (employee?.name) {
      return employee.name;
    }
  }

  // 2. Fallback to the authenticated user's display name (from backend)
  if (session.user.displayName) {
    return session.user.displayName;
  }

  // 3. Final fallback to email
  return session.user.email;
}

function resolveOrganizationName(session: SessionInfo | null): string {
  if (!session?.organizationId) {
    return '';
  }
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  return membership?.organizationName ?? '';
}

export const MonthHeader = ({
  year,
  month,
  onNavigate,
  onAddShift,
  onImport,
  onOpenImportHistory,
  onOpenSettings,
  session,
  employees,
}: MonthHeaderProps) => {
  const { t, tl } = useI18n();
  const identity = resolveIdentity(session, employees);
  const organizationName = resolveOrganizationName(session);
  const monthNames = tl('calendar.months');

  return (
    <div className="dashboard-header">
      <div className="dashboard-brand">
        <TurnosLogo />
        <div className="dashboard-brand-copy">
          <h1
            className="dashboard-title"
            style={{ background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            Anclora ShiftImport
          </h1>
          <p className="dashboard-subtitle">{t('header.subtitle')}</p>
          {identity && (
            <p className="dashboard-identity">
              {identity}
              {organizationName && <span style={{ marginLeft: '8px', opacity: 0.7 }}> · {organizationName}</span>}
            </p>
          )}
        </div>
      </div>

      <div className="month-toolbar">
        <div className="month-navigator">
          <button className="month-nav-button" onClick={() => onNavigate(-1)}>
            <ChevronLeft size={20} />
          </button>
          <div className="month-nav-label">
            {monthNames[month]} {year}
          </div>
          <button className="month-nav-button" onClick={() => onNavigate(1)}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="dashboard-actions">
        <ThemeToggle />
        <LanguageToggle />
        <button onClick={() => onOpenSettings(session?.role ?? null)} className="theme-toggle" title={t('settings.title')} aria-label={t('header.settingsAria')}>
          <Settings size={18} />
        </button>
        <button onClick={onImport} className="btn-outline dashboard-action-button">
                  {t('header.import')}
                </button>
                {onOpenImportHistory && (
                  <button
                    onClick={onOpenImportHistory}
                    className="theme-toggle"
                    title={t('header.importHistory')}
                    aria-label={t('header.importHistory')}
                  >
                    <History size={18} />
                  </button>
                )}
                <button className="btn-gold dashboard-action-button dashboard-add-button" onClick={onAddShift}>
          <PlusCircle size={18} /> <span>{t('header.add')}</span>
        </button>
      </div>
    </div>
  );
};
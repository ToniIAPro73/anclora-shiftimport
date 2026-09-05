import { LogOut } from 'lucide-react';
import { SessionInfo } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { TurnosLogo } from '../branding/TurnosLogo';
import { LanguageToggle } from '../ui/LanguageToggle';
import { ThemeToggle } from '../ui/ThemeToggle';

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
  const organizationName = resolveOrganizationName(session);
  const identity = resolveIdentity(session, employeeName);

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

        <div className="employee-portal__actions">
          <ThemeToggle />
          <LanguageToggle />
          <button
            type="button"
            className="employee-portal__logout"
            onClick={onLogout}
            aria-label={t('employeePortal.logout')}
          >
            <LogOut size={17} aria-hidden="true" />
            <span>{t('employeePortal.logout')}</span>
          </button>
        </div>
      </header>

      <main className="employee-portal__main" aria-labelledby="employee-portal-title">
        <section className="employee-portal__empty-state">
          <p className="employee-portal__empty-label">{t('employeePortal.emptyLabel')}</p>
          <h2 id="employee-portal-title">{t('employeePortal.emptyTitle')}</h2>
          <p>{t('employeePortal.emptyDescription')}</p>
        </section>
      </main>

      <nav className="employee-portal__navigation" aria-label={t('employeePortal.navigationLabel')} data-testid="employee-portal-nav">
        <span className="sr-only">{t('employeePortal.navigationPlaceholder')}</span>
      </nav>
    </div>
  );
};

import { LogOut, UserRound } from 'lucide-react';
import { SessionInfo } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { LanguageToggle } from '../ui/LanguageToggle';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationsPanel } from './Notifications';
import { NotificationsController } from './use-notifications';

interface MoreProps {
  session: SessionInfo;
  identity: string;
  organizationName: string;
  notificationsController: NotificationsController;
  onOpenShift: (shiftId: string) => void;
  onLogout: () => void;
}

export function More({ session, identity, organizationName, notificationsController, onOpenShift, onLogout }: MoreProps) {
  const { t } = useI18n();

  return (
    <section className="employee-more" aria-labelledby="employee-more-title" data-testid="employee-more">
      <div className="employee-more__heading">
        <p className="employee-more__eyebrow">{t('employeePortal.more')}</p>
        <h2 id="employee-more-title">{t('employeePortal.moreTitle')}</h2>
      </div>

      <div className="employee-more__profile">
        <span className="employee-more__profile-icon" aria-hidden="true"><UserRound size={20} /></span>
        <div>
          <p>{t('employeePortal.profile')}</p>
          <strong>{identity}</strong>
          <span>{organizationName || session.user.email}</span>
        </div>
      </div>

      <div className="employee-more__preferences" aria-label={t('employeePortal.preferences')}>
        <span>{t('employeePortal.preferences')}</span>
        <div className="employee-more__preference-controls">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>

      <NotificationsPanel controller={notificationsController} onOpenShift={onOpenShift} />

      <button type="button" className="employee-more__logout" onClick={onLogout}>
        <LogOut size={17} aria-hidden="true" />
        {t('employeePortal.logout')}
      </button>
    </section>
  );
}

import { ChevronLeft, ChevronRight, PlusCircle, Settings } from 'lucide-react';
import { formatProfileIdentity, loadUserProfile } from '../../lib/profile';
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
  onOpenSettings: () => void;
}

export const MonthHeader = ({ year, month, onNavigate, onAddShift, onImport, onOpenSettings }: MonthHeaderProps) => {
  const { t, tl } = useI18n();
  const identity = formatProfileIdentity(loadUserProfile());
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
          {identity && <p className="dashboard-identity">{identity}</p>}
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
        <button onClick={onOpenSettings} className="theme-toggle" title={t('settings.title')} aria-label={t('header.settingsAria')}>
          <Settings size={18} />
        </button>
        <button onClick={onImport} className="btn-outline dashboard-action-button">
                  {t('header.import')}
                </button>
                <button className="btn-gold dashboard-action-button dashboard-add-button" onClick={onAddShift}>
          <PlusCircle size={18} /> <span>{t('header.add')}</span>
        </button>
      </div>
    </div>
  );
};

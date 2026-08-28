import { navigate, useRoute } from '../lib/route';
import { useI18n } from '../lib/use-i18n';
import { TurnosLogo } from './branding/TurnosLogo';
import { ThemeToggle } from './ui/ThemeToggle';
import { LanguageToggle } from './ui/LanguageToggle';

interface PublicHeaderProps {
  /** null = session resolution still in flight (unknown); never conflate with guest. */
  isAuthenticated: boolean | null;
}

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * Shared by LandingPage and PricingPage (§4/§6 of the Stitch handoff): same
 * theme/language toggle components as the authenticated shell, single
 * dominant CTA, no second lookalike header.
 */
export const PublicHeader = ({ isAuthenticated }: PublicHeaderProps) => {
  const { t } = useI18n();
  const route = useRoute();

  const goToSection = (id: string) => {
    if (route === '/') {
      scrollToId(id);
      return;
    }
    navigate('/');
  };

  return (
    <header className="public-header">
      <button type="button" className="public-header-brand" onClick={() => navigate('/')} aria-label="Anclora ShiftImport">
        <TurnosLogo />
        <span>Anclora ShiftImport</span>
      </button>
      <nav className="public-nav" aria-label={t('landing.nav.howItWorks')}>
        <button type="button" className="public-nav-link" onClick={() => goToSection('how-it-works')}>
          {t('landing.nav.howItWorks')}
        </button>
        <button type="button" className="public-nav-link" onClick={() => goToSection('segments')}>
          {t('landing.nav.forCompanies')}
        </button>
        <button type="button" className="public-nav-link" onClick={() => navigate('/pricing')}>
          {t('landing.nav.pricing')}
        </button>
        <div className="public-header-toggles">
          <ThemeToggle />
          <LanguageToggle />
        </div>
        {/*
          Secondary action in a fixed-geometry slot: while auth is unknown
          nothing is shown, but the sizer reserves the max width of either
          label (login / goToApp) so the nav never shifts on resolution. The
          primary CTA is always the public one (/signup redirects signed-in
          users to /app in App), keeping text and width stable.
        */}
        <span className="public-header-secondary-slot">
          <span className="public-header-secondary-sizer" aria-hidden="true">
            <span className="public-nav-link public-header-secondary-sizer-item">{t('landing.nav.login')}</span>
            <span className="public-nav-link public-header-secondary-sizer-item">{t('landing.goToApp')}</span>
          </span>
          {isAuthenticated !== null && (
            <button
              type="button"
              className="public-nav-link public-header-secondary-action"
              onClick={() => navigate(isAuthenticated ? '/app' : '/login')}
            >
              {isAuthenticated ? t('landing.goToApp') : t('landing.nav.login')}
            </button>
          )}
        </span>
        <button
          type="button"
          className="btn-gold public-header-cta"
          onClick={() => navigate('/signup')}
        >
          {t('landing.nav.ctaPrimary')}
        </button>
      </nav>
    </header>
  );
};

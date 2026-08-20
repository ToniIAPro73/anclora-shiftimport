import { navigate } from '../lib/route';
import { useI18n } from '../lib/use-i18n';

interface LandingPageProps {
  isAuthenticated: boolean;
}

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * Fase 1.2B landing MVP: header, hero (problem → result), 3-step how-it-works,
 * Personal vs Team segments, final CTA. Conversion-focused, not a full
 * corporate site (per spec: "no construir todavía una web corporativa grande").
 */
export const LandingPage = ({ isAuthenticated }: LandingPageProps) => {
  const { t } = useI18n();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <button type="button" className="landing-header-brand" onClick={() => navigate('/')} aria-label="Anclora ShiftImport">
          <img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" />
          <span>Anclora ShiftImport</span>
        </button>
        <nav className="landing-nav" aria-label={t('landing.nav.howItWorks')}>
          <button type="button" className="landing-nav-link" onClick={() => scrollToId('how-it-works')}>
            {t('landing.nav.howItWorks')}
          </button>
          <button type="button" className="landing-nav-link" onClick={() => scrollToId('segments')}>
            {t('landing.nav.forCompanies')}
          </button>
          <button type="button" className="landing-nav-link" onClick={() => navigate('/pricing')}>
            {t('landing.nav.pricing')}
          </button>
          {!isAuthenticated && (
            <button type="button" className="landing-nav-link" onClick={() => navigate('/login')}>
              {t('landing.nav.login')}
            </button>
          )}
          <button
            type="button"
            className="btn-gold"
            onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
          >
            {isAuthenticated ? t('landing.goToApp') : t('landing.nav.ctaPrimary')}
          </button>
        </nav>
      </header>

      <section className="landing-hero">
        <h1>{t('landing.hero.problemTitle')}</h1>
        <p className="landing-hero-problem">{t('landing.hero.problemBody')}</p>
        <h2 style={{ fontSize: 'clamp(1.2rem, 2.4vw, 1.6rem)', marginBottom: 'var(--space-sm)' }}>
          {t('landing.hero.resultTitle')}
        </h2>
        <p className="landing-hero-result">{t('landing.hero.resultBody')}</p>
        <div className="landing-cta-row">
          <button
            type="button"
            className="btn-gold"
            style={{ padding: '12px 22px', fontWeight: 800 }}
            onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
          >
            {isAuthenticated ? t('landing.goToApp') : t('landing.hero.ctaPrimary')}
          </button>
          <button
            type="button"
            className="btn-outline"
            style={{ padding: '12px 22px', fontWeight: 700 }}
            onClick={() => scrollToId('how-it-works')}
          >
            {t('landing.hero.ctaSecondary')}
          </button>
        </div>
      </section>

      <section id="how-it-works" className="landing-section">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>{t('landing.howItWorks.title')}</h2>
        <div className="landing-steps">
          <article className="landing-step-card">
            <span className="landing-step-number">1</span>
            <h3>{t('landing.howItWorks.step1Title')}</h3>
            <p>{t('landing.howItWorks.step1Body')}</p>
          </article>
          <article className="landing-step-card">
            <span className="landing-step-number">2</span>
            <h3>{t('landing.howItWorks.step2Title')}</h3>
            <p>{t('landing.howItWorks.step2Body')}</p>
          </article>
          <article className="landing-step-card">
            <span className="landing-step-number">3</span>
            <h3>{t('landing.howItWorks.step3Title')}</h3>
            <p>{t('landing.howItWorks.step3Body')}</p>
          </article>
        </div>
      </section>

      <section id="segments" className="landing-section">
        <div className="landing-segments">
          <article className="landing-segment-card">
            <h3>{t('landing.segments.personalTitle')}</h3>
            <p>{t('landing.segments.personalBody')}</p>
          </article>
          <article className="landing-segment-card">
            <h3>{t('landing.segments.teamTitle')}</h3>
            <p>{t('landing.segments.teamBody')}</p>
          </article>
        </div>
      </section>

      <section className="landing-final-cta">
        <h2>{t('landing.finalCta.title')}</h2>
        <button
          type="button"
          className="btn-gold"
          style={{ padding: '14px 26px', fontWeight: 800 }}
          onClick={() => navigate(isAuthenticated ? '/app' : '/signup')}
        >
          {isAuthenticated ? t('landing.goToApp') : t('landing.finalCta.cta')}
        </button>
      </section>
    </div>
  );
};

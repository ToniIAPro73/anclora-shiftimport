import { navigate } from '../lib/route';
import { useI18n } from '../lib/use-i18n';
import { PublicHeader } from '../components/PublicHeader';
import { LegalFooter } from '../components/LegalFooter';

interface LandingPageProps {
  isAuthenticated: boolean;
}

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const TEAM_DEMO = [
  { initials: 'AM', recognized: true },
  { initials: 'AC', recognized: true },
  { initials: 'LR', recognized: true },
  { initials: 'MP', recognized: true },
  { initials: 'JS', recognized: false },
  { initials: 'DV', recognized: false },
];

/**
 * Fase 1.2B-VISUAL landing: "Schedule Intelligence × Editorial SaaS" — real
 * capabilities only (PDF/CSV → employee detection → structured shifts →
 * calendar), Anclora tokens throughout, PublicHeader shared with /pricing
 * and the authenticated shell's toggle behavior.
 */
export const LandingPage = ({ isAuthenticated }: LandingPageProps) => {
  const { t } = useI18n();
  const howItWorksSteps = [
    { title: t('landing.howItWorks.step1Title'), body: t('landing.howItWorks.step1Body') },
    { title: t('landing.howItWorks.step2Title'), body: t('landing.howItWorks.step2Body') },
    { title: t('landing.howItWorks.step3Title'), body: t('landing.howItWorks.step3Body') },
  ];

  return (
    <div className="landing-page">
      <PublicHeader isAuthenticated={isAuthenticated} />

      <section className="landing-hero landing-hero--asymmetric">
        <div className="landing-hero-bg" aria-hidden="true" />
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-hero-eyebrow">{t('landing.hero.eyebrow')}</span>
            <h1>{t('landing.hero.headline')}</h1>
            <p className="landing-hero-subhead">{t('landing.hero.subhead')}</p>
            <div className="landing-cta-row landing-cta-row--start">
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
          </div>

          <div className="hero-stack" aria-hidden="true">
            <div className="hero-stack-card hero-stack-card--raw">
              <span className="hero-stack-card-label">{t('landing.hero.stackRawLabel')}</span>
              <span className="hero-stack-card-line">{t('landing.hero.stackRawLine')}</span>
              <div className="hero-stack-card-rows">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="hero-stack-card hero-stack-card--parsing">
              <span className="hero-stack-card-label">{t('landing.hero.stackParsingLabel')}</span>
              <span className="hero-stack-card-line">{t('landing.hero.stackParsingLine')}</span>
            </div>
            <div className="hero-stack-card hero-stack-card--calendar">
              <span className="hero-stack-card-label">{t('landing.hero.stackCalendarLabel')}</span>
              <span className="hero-stack-card-line">{t('landing.hero.stackCalendarLine')}</span>
              <div className="hero-stack-card-rows hero-stack-card-rows--calendar">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section before-after">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>{t('beforeAfter.title')}</h2>
        <div className="before-after-grid">
          <article className="before-after-card before-after-card--before">
            <span className="before-after-card-label">{t('beforeAfter.beforeLabel')}</span>
            <p>{t('beforeAfter.beforeBody')}</p>
          </article>
          <article className="before-after-card before-after-card--after">
            <span className="before-after-card-label">{t('beforeAfter.afterLabel')}</span>
            <p>{t('beforeAfter.afterBody')}</p>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="landing-section">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>{t('landing.howItWorks.title')}</h2>
        <div className="landing-steps">
          {howItWorksSteps.map((step, index) => (
            <article key={step.title} className="landing-step-card">
              <span className="landing-step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>{t('landing.bento.title')}</h2>
        <div className="bento-grid">
          <article className="bento-card bento-card--large">
            <h3>{t('landing.bento.pdfTitle')}</h3>
            <p>{t('landing.bento.pdfBody')}</p>
          </article>
          <article className="bento-card">
            <h3>{t('landing.bento.csvTitle')}</h3>
            <p>{t('landing.bento.csvBody')}</p>
          </article>
          <article className="bento-card">
            <h3>{t('landing.bento.detectionTitle')}</h3>
            <p>{t('landing.bento.detectionBody')}</p>
          </article>
          <article className="bento-card">
            <h3>{t('landing.bento.reviewTitle')}</h3>
            <p>{t('landing.bento.reviewBody')}</p>
          </article>
          <article className="bento-card bento-card--wide">
            <h3>{t('landing.bento.calendarTitle')}</h3>
            <p>{t('landing.bento.calendarBody')}</p>
          </article>
          <article className="bento-card">
            <h3>{t('landing.bento.teamTitle')}</h3>
            <p>{t('landing.bento.teamBody')}</p>
          </article>
        </div>
      </section>

      <section id="segments" className="landing-section">
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-md)' }}>{t('landing.team.title')}</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', maxWidth: '640px', margin: '0 auto var(--space-xl)' }}>
          {t('landing.team.body')}
        </p>
        <div className="team-grid">
          {TEAM_DEMO.map((member) => (
            <div key={member.initials} className="team-pill">
              <span className="team-pill-avatar">{member.initials}</span>
              <span className="team-pill-status">
                {member.recognized ? t('landing.team.recognizedLabel') : t('landing.team.newLabel')}
              </span>
            </div>
          ))}
        </div>

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

      <section className="landing-section pricing-teaser">
        <h2>{t('landing.pricingTeaser.title')}</h2>
        <p>{t('landing.pricingTeaser.body')}</p>
        <button type="button" className="btn-outline" onClick={() => navigate('/pricing')}>
          {t('landing.pricingTeaser.cta')}
        </button>
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

      <LegalFooter />
    </div>
  );
};

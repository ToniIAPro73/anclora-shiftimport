import { navigate } from '../lib/route';
import { useI18n } from '../lib/use-i18n';
import { PLAN_IDS, PLANS } from '../lib/plans';
import { PublicHeader } from '../components/PublicHeader';
import { LegalFooter } from '../components/LegalFooter';

interface PricingPageProps {
  isAuthenticated: boolean;
}

/**
 * Fase 1.2G.4: public pricing page. Three plans (Free/Personal/Team, Team
 * visually recommended per PLANS.team.recommended), a short capability
 * comparison, and CTAs that carry the chosen plan as intent to signup
 * (§1.2G.5 — /signup?plan=team). An authenticated visitor never gets routed
 * into a second signup: every CTA resolves to their existing session/app
 * instead, same pattern as the landing page.
 */
export const PricingPage = ({ isAuthenticated }: PricingPageProps) => {
  const { t } = useI18n();

  const handleCta = (planId: (typeof PLAN_IDS)[number]) => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    navigate('/signup', planId === 'free' ? undefined : `plan=${planId}`);
  };

  return (
    <div className="pricing-page">
      <PublicHeader isAuthenticated={isAuthenticated} />
      <div className="pricing-page--full">
      <h1>{t('pricing.title')}</h1>
      <p className="pricing-subtitle">{t('pricing.subtitle')}</p>
      <p className="pricing-hypothesis-notice">{t('pricing.hypothesisNotice')}</p>

      <div className="pricing-cards">
        {PLAN_IDS.map((planId) => {
          const plan = PLANS[planId];
          return (
            <article key={planId} className={`pricing-card${plan.recommended ? ' pricing-card--recommended' : ''}`}>
              {plan.recommended && <span className="pricing-card-badge">{t('pricing.recommended')}</span>}
              <h2>{t(`pricing.plans.${planId}.label`)}</h2>
              <p className="pricing-card-price">
                {plan.priceHypothesis}
                {planId !== 'free' && <span className="pricing-card-period">{t('pricing.perMonth')}</span>}
              </p>
              <p className="pricing-card-tagline">{t(`pricing.plans.${planId}.tagline`)}</p>
              <button
                type="button"
                className={plan.recommended ? 'btn-gold' : 'btn-outline'}
                style={{ padding: '12px 20px', fontWeight: 800, width: '100%' }}
                onClick={() => handleCta(planId)}
              >
                {isAuthenticated ? t('landing.goToApp') : t(`pricing.plans.${planId}.cta`)}
              </button>
            </article>
          );
        })}
      </div>

      <section className="pricing-comparison">
        <h3>{t('pricing.comparison.title')}</h3>
        <div className="pricing-comparison-table">
          <table>
            <thead>
              <tr>
                <th>{t('pricing.comparison.capability')}</th>
                <th>{t('pricing.plans.free.label')}</th>
                <th>{t('pricing.plans.personal.label')}</th>
                <th>{t('pricing.plans.team.label')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('pricing.comparison.ownShifts')}</td>
                <td>{t('pricing.comparison.yes')}</td>
                <td>{t('pricing.comparison.yes')}</td>
                <td>{t('pricing.comparison.yes')}</td>
              </tr>
              <tr>
                <td>{t('pricing.comparison.fullHistory')}</td>
                <td>{t('pricing.comparison.limited')}</td>
                <td>{t('pricing.comparison.yes')}</td>
                <td>{t('pricing.comparison.yes')}</td>
              </tr>
              <tr>
                <td>{t('pricing.comparison.singleImport')}</td>
                <td>{t('pricing.comparison.yes')}</td>
                <td>{t('pricing.comparison.yes')}</td>
                <td>{t('pricing.comparison.yes')}</td>
              </tr>
              <tr>
                <td>{t('pricing.comparison.multiImport')}</td>
                <td>{t('pricing.comparison.no')}</td>
                <td>{t('pricing.comparison.no')}</td>
                <td>{t('pricing.comparison.yes')}</td>
              </tr>
              <tr>
                <td>{t('pricing.comparison.teamManagement')}</td>
                <td>{t('pricing.comparison.no')}</td>
                <td>{t('pricing.comparison.no')}</td>
                <td>{t('pricing.comparison.yes')}</td>
              </tr>
              <tr>
                <td>{t('pricing.comparison.roles')}</td>
                <td>{t('pricing.comparison.no')}</td>
                <td>{t('pricing.comparison.no')}</td>
                <td>{t('pricing.comparison.yes')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <button type="button" className="btn-outline" onClick={() => navigate('/')}>
        {t('pricing.back')}
      </button>
      </div>
      <LegalFooter />
    </div>
  );
};

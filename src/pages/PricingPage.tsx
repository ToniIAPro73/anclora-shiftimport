import { navigate } from '../lib/route';
import { useI18n } from '../lib/use-i18n';

/**
 * Fase 1.2B placeholder: routing + contract-compliant shell only.
 * Real plan comparison and pricing hypothesis land in Fase 1.2G.
 */
export const PricingPage = () => {
  const { t } = useI18n();

  return (
    <div className="pricing-page">
      <h1>{t('pricing.title')}</h1>
      <p>{t('pricing.comingSoon')}</p>
      <button type="button" className="btn-outline" onClick={() => navigate('/')}>
        {t('pricing.back')}
      </button>
    </div>
  );
};

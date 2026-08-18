import { useI18n } from '../lib/use-i18n';

export function LegalFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="legal-footer">
      <span className="legal-footer__copy">{t('legalFooter.copy', { year })}</span>
      <span className="legal-footer__brand">{t('legalFooter.brand')}</span>
      <nav className="legal-footer__nav">
        <a href="/terms" className="legal-footer__link">{t('legalFooter.terms')}</a>
        <a href="/privacy" className="legal-footer__link">{t('legalFooter.privacy')}</a>
        <a href="/legal" className="legal-footer__link">{t('legalFooter.legal')}</a>
        <a href="mailto:hola@anclora.com" className="legal-footer__link">hola@anclora.com</a>
        <button
          type="button"
          className="legal-footer__link legal-footer__cookie-btn"
          onClick={() => window.dispatchEvent(new Event('anclora:open-cookie-preferences'))}
        >
          {t('legalFooter.cookies')}
        </button>
      </nav>
    </footer>
  );
}

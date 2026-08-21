import { useI18n } from '../../lib/use-i18n';
import { SpainFlagIcon, UkFlagIcon } from '../branding/FlagIcon';

export const LanguageToggle = () => {
  const { locale, toggleLocale, t } = useI18n();

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className="theme-toggle lang-toggle"
      title={locale.toUpperCase()}
      aria-label={t('header.languageToggleAria', { locale: locale.toUpperCase() })}
    >
      {locale === 'es' ? <SpainFlagIcon className="lang-toggle-flag" /> : <UkFlagIcon className="lang-toggle-flag" />}
      <span>{locale.toUpperCase()}</span>
    </button>
  );
};

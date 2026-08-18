import { useContext } from 'react';
import { I18nContext, I18nContextValue } from './i18n-context';

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

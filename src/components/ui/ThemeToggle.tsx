import { useI18n } from '../../lib/use-i18n';
import { useTheme } from '../../lib/use-theme';

export const ThemeToggle = () => {
  const { t } = useI18n();
  const { themeMode, toggleThemeMode } = useTheme();
  const themeEmoji = themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '🖥️';
  const themeLabel = themeMode === 'light' ? t('header.themeLight') : themeMode === 'dark' ? t('header.themeDark') : t('header.themeSystem');

  return (
    <button
      type="button"
      onClick={toggleThemeMode}
      className="theme-toggle"
      title={t('header.themeLabel', { mode: themeLabel })}
      aria-label={t('header.themeToggleAria', { mode: themeLabel })}
    >
      <span>{themeEmoji}</span>
    </button>
  );
};

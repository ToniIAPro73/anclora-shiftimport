import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { resetPassword } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { navigate } from '../lib/route';

const getTokenFromUrl = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  return new URLSearchParams(window.location.search).get('token') ?? '';
};

/**
 * Fase 1.2D.3 frontend: redeems the token from the reset-link query string.
 * No token in the URL is a distinct, non-ambiguous state — never a form
 * that silently fails.
 */
export const ResetPasswordScreen = () => {
  const { t } = useI18n();
  const [token] = useState(getTokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch {
      setError(t('resetPassword.invalidToken'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-blob auth-blob-a" aria-hidden="true" />
      <div className="auth-blob auth-blob-b" aria-hidden="true" />

      <div className="auth-card">
        <div className="auth-logo">
          <img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" />
        </div>
        <div className="auth-divider" aria-hidden="true" />
        <p className="auth-app-name">{t('resetPassword.title')}</p>

        {!token ? (
          <>
            <p className="auth-error" role="alert">{t('resetPassword.missingToken')}</p>
            <button type="button" className="auth-link auth-guest" onClick={() => navigate('/forgot-password')}>
              {t('resetPassword.requestNew')}
            </button>
          </>
        ) : done ? (
          <>
            <p className="auth-notice" role="status">{t('resetPassword.success')}</p>
            <button type="button" className="auth-link auth-guest" onClick={() => navigate('/login')}>
              {t('resetPassword.goToLogin')}
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="auth-form">
            <label className="auth-field" htmlFor="reset-password">
              <span>{t('resetPassword.newPasswordLabel')}</span>
              <span className="auth-password-wrap">
                <input
                  id="reset-password"
                  className="modal-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  aria-required="true"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            <label className="auth-field" htmlFor="reset-password-confirm">
              <span>{t('auth.confirmPassword')}</span>
              <input
                id="reset-password-confirm"
                className="modal-input"
                type="password"
                required
                minLength={8}
                aria-required="true"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>

            {error && (
              <p role="alert" aria-live="polite" aria-atomic="true" className="auth-error">{error}</p>
            )}

            <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
              {t('resetPassword.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

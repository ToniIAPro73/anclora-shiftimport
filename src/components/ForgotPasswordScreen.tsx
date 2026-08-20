import { FormEvent, useState } from 'react';
import { requestPasswordReset } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { navigate } from '../lib/route';

/**
 * Fase 1.2D.2 frontend: request-reset form. Always shows the same generic
 * confirmation regardless of outcome — never reveals whether the email is
 * registered (mirrors the backend's constant-response guarantee).
 */
export const ForgotPasswordScreen = () => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await requestPasswordReset(email);
    } catch {
      // Intentionally silent: the confirmation below is shown either way.
    } finally {
      setBusy(false);
      setSent(true);
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
        <p className="auth-app-name">{t('forgotPassword.title')}</p>

        {sent ? (
          <>
            <p className="auth-notice" role="status">{t('forgotPassword.sentNotice')}</p>
            <button type="button" className="auth-link auth-guest" onClick={() => navigate('/login')}>
              {t('forgotPassword.backToLogin')}
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="auth-form">
            <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
              {t('forgotPassword.description')}
            </p>
            <label className="auth-field" htmlFor="forgot-email">
              <span>{t('auth.email')}</span>
              <input
                id="forgot-email"
                className="modal-input"
                type="email"
                required
                aria-required="true"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
              {t('forgotPassword.submit')}
            </button>

            <button type="button" className="auth-link" onClick={() => navigate('/login')}>
              {t('forgotPassword.backToLogin')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

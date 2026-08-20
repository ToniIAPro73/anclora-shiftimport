import { FormEvent, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { login, register, SessionInfo } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { navigate } from '../lib/route';

interface AuthScreenProps {
  onAuthenticated: (session: SessionInfo) => void;
  /** Guest mode: local-first flow without an account. */
  onContinueAsGuest: () => void;
  onClose?: () => void;
  /** Preselect the register card, e.g. when routed via /signup. Defaults to login. */
  initialMode?: 'login' | 'register';
}

/**
 * Contractual login screen (ANCLORA_AUTH_LOGIN_SCREEN_CONTRACT v1.3.0).
 * Full-screen card: logo → divider → app name → email → password → primary
 * CTA → forgot → no-account box → disabled social → legal. Register mode is
 * a toggle of the same card. No OAuth: social buttons render disabled
 * (documented absence, never simulated).
 */
export const AuthScreen = ({ onAuthenticated, onContinueAsGuest, onClose, initialMode = 'login' }: AuthScreenProps) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setBusy(true);
    try {
      const session = mode === 'login'
        ? await login(email, password)
        : await register(email, password, displayName);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-blob auth-blob-a" aria-hidden="true" />
      <div className="auth-blob auth-blob-b" aria-hidden="true" />

      <div className="auth-card">
        {onClose && (
          <button type="button" className="theme-toggle auth-close" onClick={onClose} aria-label={t('auth.closeAria')}>
            <X size={18} />
          </button>
        )}

        <div className="auth-logo">
          <img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" />
        </div>
        <div className="auth-divider" aria-hidden="true" />
        <p className="auth-app-name">Anclora ShiftImport</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label className="auth-field" htmlFor="auth-name">
              <span>{t('auth.nameLabel')}</span>
              <input
                id="auth-name"
                className="modal-input"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}

          <label className="auth-field" htmlFor="auth-email">
            <span>{t('auth.email')}</span>
            <input
              id="auth-email"
              className="modal-input"
              type="email"
              required
              aria-required="true"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field" htmlFor="auth-password">
            <span>{t('auth.password')}</span>
            <span className="auth-password-wrap">
              <input
                id="auth-password"
                className="modal-input"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                aria-required="true"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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

          {mode === 'register' && (
            <label className="auth-field" htmlFor="auth-password-confirm">
              <span>{t('auth.confirmPassword')}</span>
              <input
                id="auth-password-confirm"
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
          )}

          {error && (
            <p role="alert" aria-live="polite" aria-atomic="true" className="auth-error">{error}</p>
          )}
          {notice && <p className="auth-notice">{notice}</p>}

          <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
            {busy
              ? t('auth.signingIn')
              : mode === 'login' ? t('auth.signIn') : t('auth.signUp')}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              className="auth-link"
              onClick={() => navigate('/forgot-password')}
            >
              {t('auth.forgotPassword')}
            </button>
          )}
        </form>

        <div className="auth-noaccount">
          {mode === 'login' ? (
            <>
              <span>{t('auth.noAccount')}</span>
              <button type="button" className="auth-link" onClick={() => { setMode('register'); setError(''); setNotice(''); }}>
                {t('auth.signUp')}
              </button>
            </>
          ) : (
            <button type="button" className="auth-link" onClick={() => { setMode('login'); setError(''); setNotice(''); }}>
              {t('auth.switchToLogin')}
            </button>
          )}
        </div>

        <div className="auth-social-separator">
          <span>{t('auth.socialAccess')}</span>
        </div>
        <div className="auth-social-row">
          <button type="button" className="auth-social" disabled title={t('auth.comingSoon')}>Google</button>
          <button type="button" className="auth-social" disabled title={t('auth.comingSoon')}>GitHub</button>
        </div>

        <p className="auth-legal">
          {t('auth.legalPrefix')}{' '}
          <a href="/terms">{t('auth.terms')}</a> · <a href="/privacy">{t('auth.privacy')}</a>
        </p>

        <button type="button" className="auth-link auth-guest" onClick={onContinueAsGuest}>
          {t('auth.guestContinue')}
        </button>
      </div>
    </div>
  );
};

import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { login, register, SessionInfo } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { useEscapeClose } from '../lib/use-escape-close';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (session: SessionInfo) => void;
}

/** Minimal email/password auth (Fase 1). Guest mode stays available. */
export const AuthModal = ({ isOpen, onClose, onAuthenticated }: AuthModalProps) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEscapeClose(isOpen, onClose);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const session = mode === 'login'
        ? await login(email, password)
        : await register(email, password, displayName);
      onAuthenticated(session);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </h3>
          <button type="button" className="theme-toggle" onClick={onClose} aria-label={t('auth.closeAria')}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
          {mode === 'register' && (
            <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('auth.nameLabel')}
              <input
                className="modal-input"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                style={{ padding: '10px 12px' }}
              />
            </label>
          )}
          <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {t('auth.emailLabel')}
            <input
              className="modal-input"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{ padding: '10px 12px' }}
            />
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {t('auth.passwordLabel')}
            <input
              className="modal-input"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{ padding: '10px 12px' }}
            />
          </label>

          {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}

          <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '10px 14px', fontWeight: 800 }}>
            {busy ? t('auth.working') : mode === 'login' ? t('auth.loginAction') : t('auth.registerAction')}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            style={{ padding: '10px 14px', fontWeight: 700 }}
          >
            {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>
        </form>
      </div>
    </div>
  );
};

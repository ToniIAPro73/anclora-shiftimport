import { FormEvent, useCallback, useEffect, useState } from 'react';
import { navigate } from '../lib/route';
import { acceptRemoteAccessInvitation, InvitationValidation, validateRemoteAccessInvitation } from '../lib/remote';
import { ApiError } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { useTheme } from '../lib/use-theme';
import { PasswordInput } from './ui/PasswordInput';

type ViewState = 'loading' | 'valid' | 'success' | 'error';

export function AcceptInvitationScreen() {
  const { locale, setLocale, t } = useI18n();
  const { themeMode, setThemeMode } = useTheme();
  const [state, setState] = useState<ViewState>('loading');
  const [invitation, setInvitation] = useState<InvitationValidation | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  const validate = useCallback(async () => {
    setState('loading');
    try {
      const result = await validateRemoteAccessInvitation(token);
      setInvitation(result);
      setEmail(result.email);
      setState('valid');
    } catch {
      setState('error');
    }
  }, [token]);

  useEffect(() => { void validate(); }, [validate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!invitation) return;
    setBusy(true);
    try {
      await acceptRemoteAccessInvitation({
        token,
        email,
        displayName,
        password: password || undefined,
        passwordConfirmation: passwordConfirmation || undefined,
        locale,
        theme: themeMode,
      });
      setState('success');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PASSWORD_MISMATCH') {
        setPasswordConfirmation('');
      }
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card" data-testid="accept-invitation-screen">
        <div className="auth-logo"><img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" /></div>
        <div className="auth-divider" aria-hidden="true" />
        <p className="auth-app-name">Anclora ShiftImport</p>
        <h1 style={{ fontSize: '1.4rem', margin: '0 0 18px' }}>{t('acceptInvitation.title')}</h1>

        {state === 'loading' && <p role="status">{t('acceptInvitation.loading')}</p>}
        {state === 'error' && (
          <div>
            <p role="alert" className="auth-error">{t('acceptInvitation.error')}</p>
            <button type="button" className="auth-submit" onClick={() => void validate()}>{t('acceptInvitation.retry')}</button>
          </div>
        )}
        {state === 'success' && (
          <div>
            <p role="status" className="auth-notice">{t('acceptInvitation.success')}</p>
            <button type="button" className="auth-submit" onClick={() => navigate('/app')}>{t('acceptInvitation.goToApp')}</button>
          </div>
        )}
        {state === 'valid' && invitation && (
          <form className="auth-form" onSubmit={submit}>
            <p>{t('acceptInvitation.validIntro', { organization: invitation.organizationName })}</p>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('acceptInvitation.role', { role: t(`role.${invitation.role.toLowerCase()}`) })}</p>
            {invitation.employeeName && <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('acceptInvitation.employee', { name: invitation.employeeName })}</p>}
            <label className="auth-field" htmlFor="invitation-email">
              <span>{t('acceptInvitation.email')}</span>
              <input id="invitation-email" className="modal-input" type="email" value={email} readOnly autoComplete="email" />
            </label>
            <label className="auth-field" htmlFor="invitation-display-name">
              <span>{t('acceptInvitation.displayName')}</span>
              <input id="invitation-display-name" className="modal-input" type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
            </label>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('acceptInvitation.existingAccount')}</p>
            <label className="auth-field" htmlFor="invitation-password">
              <span>{t('acceptInvitation.password')}</span>
              <PasswordInput id="invitation-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
            </label>
            <label className="auth-field" htmlFor="invitation-password-confirm">
              <span>{t('acceptInvitation.confirmPassword')}</span>
              <PasswordInput id="invitation-password-confirm" minLength={8} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
            </label>
            <small>{t('acceptInvitation.passwordHint')}</small>
            <label className="auth-field" htmlFor="invitation-locale">
              <span>{t('acceptInvitation.locale')}</span>
              <select id="invitation-locale" className="modal-input" value={locale} onChange={(event) => setLocale(event.target.value as 'es' | 'en')}>
                <option value="es">{t('acceptInvitation.languageSpanish')}</option>
                <option value="en">{t('acceptInvitation.languageEnglish')}</option>
              </select>
            </label>
            <label className="auth-field" htmlFor="invitation-theme">
              <span>{t('acceptInvitation.theme')}</span>
              <select id="invitation-theme" className="modal-input" value={themeMode} onChange={(event) => setThemeMode(event.target.value as 'system' | 'light' | 'dark')}>
                <option value="system">{t('acceptInvitation.themeSystem')}</option>
                <option value="light">{t('acceptInvitation.themeLight')}</option>
                <option value="dark">{t('acceptInvitation.themeDark')}</option>
              </select>
            </label>
            <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
              {busy ? t('acceptInvitation.accepting') : t('acceptInvitation.accept')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

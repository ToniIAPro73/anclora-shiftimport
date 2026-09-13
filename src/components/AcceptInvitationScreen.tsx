import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../lib/route';
import { acceptRemoteAccessInvitation, InvitationValidation, validateRemoteAccessInvitation } from '../lib/remote';
import { ApiError } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { useTheme } from '../lib/use-theme';
import { consumeInvitationToken } from '../lib/invitation-link';
import { PasswordInput } from './ui/PasswordInput';

type ViewState = 'loading' | 'valid' | 'success' | 'invalid';
type FieldName = 'displayName' | 'password' | 'passwordConfirmation';

function errorCodeForValidation(error: unknown): string {
  return error instanceof ApiError ? (error.code ?? 'INVITATION_INVALID') : 'NETWORK_ERROR';
}

export function AcceptInvitationScreen() {
  const { locale, setLocale, t } = useI18n();
  const { themeMode, setThemeMode } = useTheme();
  const [state, setState] = useState<ViewState>('loading');
  const [invitation, setInvitation] = useState<InvitationValidation | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [validationError, setValidationError] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = useState(false);
  const [token] = useState(() => consumeInvitationToken());

  const isCreateAccount = invitation?.acceptanceMode === 'CREATE_ACCOUNT';
  const firstErrorField = useMemo(() => (['displayName', 'password', 'passwordConfirmation'] as FieldName[])
    .find((field) => fieldErrors[field]), [fieldErrors]);

  useEffect(() => {
    if (firstErrorField) document.getElementById(`invitation-${firstErrorField}`)?.focus();
  }, [firstErrorField]);

  const validate = useCallback(async () => {
    if (!token) {
      setValidationError('INVITATION_INVALID');
      setState('invalid');
      return;
    }
    setState('loading');
    setValidationError('');
    try {
      const result = await validateRemoteAccessInvitation(token);
      setInvitation(result);
      setEmail(result.email);
      setState('valid');
    } catch (error) {
      setValidationError(errorCodeForValidation(error));
      setState('invalid');
    }
  }, [token]);

  useEffect(() => { void validate(); }, [validate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!invitation || busy) return;
    setFormError('');
    const nextFieldErrors: Partial<Record<FieldName, string>> = {};
    if (isCreateAccount && !displayName.trim()) nextFieldErrors.displayName = 'DISPLAY_NAME_REQUIRED';
    if (isCreateAccount && !password) nextFieldErrors.password = 'PASSWORD_REQUIRED';
    if (isCreateAccount && password && password.length < 8) nextFieldErrors.password = 'PASSWORD_TOO_SHORT';
    if (isCreateAccount && password !== passwordConfirmation) nextFieldErrors.passwordConfirmation = 'PASSWORD_MISMATCH';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setBusy(true);
    try {
      await acceptRemoteAccessInvitation({
        token,
        email,
        ...(isCreateAccount ? { displayName, password, passwordConfirmation } : {}),
        locale,
        theme: themeMode,
      });
      setState('success');
    } catch (error) {
      const code = error instanceof ApiError ? (error.code ?? 'ACCEPT_ERROR') : 'NETWORK_ERROR';
      if (code === 'PASSWORD_MISMATCH') setPasswordConfirmation('');
      setFieldErrors({
        ...(code === 'DISPLAY_NAME_REQUIRED' ? { displayName: code } : {}),
        ...(code.startsWith('PASSWORD_') ? { [code === 'PASSWORD_MISMATCH' ? 'passwordConfirmation' : 'password']: code } : {}),
      });
      setFormError(code);
    } finally {
      setBusy(false);
    }
  };

  const translatedError = (code: string) => t(`acceptInvitation.errors.${code}`);

  return (
    <div className="auth-screen">
      <div className="auth-card" data-testid="accept-invitation-screen">
        <div className="auth-logo"><img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" /></div>
        <div className="auth-divider" aria-hidden="true" />
        <p className="auth-app-name">Anclora ShiftImport</p>
        <h1 style={{ fontSize: '1.4rem', margin: '0 0 18px' }}>{t('acceptInvitation.title')}</h1>

        {state === 'loading' && <p role="status" aria-live="polite">{t('acceptInvitation.loading')}</p>}
        {state === 'invalid' && (
          <div>
            <p role="alert" className="auth-error">{translatedError(validationError || 'INVITATION_INVALID')}</p>
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
          <form className="auth-form" onSubmit={submit} noValidate>
            <p>{t('acceptInvitation.validIntro', { organization: invitation.organizationName })}</p>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('acceptInvitation.role', { role: t(`role.${invitation.role.toLowerCase()}`) })}</p>
            {invitation.employeeName && <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('acceptInvitation.employee', { name: invitation.employeeName })}</p>}
            <label className="auth-field" htmlFor="invitation-email">
              <span>{t('acceptInvitation.email')}</span>
              <input id="invitation-email" className="modal-input" type="email" value={email} readOnly autoComplete="email" aria-readonly="true" />
            </label>

            {isCreateAccount ? (
              <>
                <label className="auth-field" htmlFor="invitation-displayName">
                  <span>{t('acceptInvitation.displayName')}</span>
                  <input id="invitation-displayName" className="modal-input" type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? 'invitation-displayName-error' : undefined} />
                  {fieldErrors.displayName && <small id="invitation-displayName-error" role="alert">{translatedError(fieldErrors.displayName)}</small>}
                </label>
                <label className="auth-field" htmlFor="invitation-password">
                  <span>{t('acceptInvitation.password')}</span>
                  <PasswordInput id="invitation-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'invitation-password-error' : undefined} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
                  {fieldErrors.password && <small id="invitation-password-error" role="alert">{translatedError(fieldErrors.password)}</small>}
                </label>
                <label className="auth-field" htmlFor="invitation-passwordConfirmation">
                  <span>{t('acceptInvitation.confirmPassword')}</span>
                  <PasswordInput id="invitation-passwordConfirmation" required minLength={8} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.passwordConfirmation)} aria-describedby={fieldErrors.passwordConfirmation ? 'invitation-passwordConfirmation-error' : undefined} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
                  {fieldErrors.passwordConfirmation && <small id="invitation-passwordConfirmation-error" role="alert">{translatedError(fieldErrors.passwordConfirmation)}</small>}
                </label>
                <small>{t('acceptInvitation.passwordHint')}</small>
              </>
            ) : (
              <p className="auth-notice">{t('acceptInvitation.existingAccount')}</p>
            )}

            {formError && <p role="alert" aria-live="polite" aria-atomic="true" className="auth-error">{translatedError(formError)}</p>}
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
              {busy ? t('acceptInvitation.accepting') : isCreateAccount ? t('acceptInvitation.createAndAccept') : t('acceptInvitation.linkAndAccept')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

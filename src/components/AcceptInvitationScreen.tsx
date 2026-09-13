import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../lib/route';
import { acceptRemoteAccessInvitation, InvitationValidation, validateRemoteAccessInvitation } from '../lib/remote';
import { ApiError } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { consumeInvitationToken } from '../lib/invitation-link';
import { PasswordInput } from './ui/PasswordInput';

type ViewState = 'loading' | 'valid' | 'success' | 'invalid';
type FieldName = 'password' | 'passwordConfirmation';

function errorCodeForValidation(error: unknown): string {
  return error instanceof ApiError ? (error.code ?? 'INVITATION_INVALID') : 'NETWORK_ERROR';
}

export function AcceptInvitationScreen() {
  const { t } = useI18n();
  const [state, setState] = useState<ViewState>('loading');
  const [invitation, setInvitation] = useState<InvitationValidation | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [validationError, setValidationError] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = useState(false);
  const [token] = useState(() => consumeInvitationToken());

  const isCreateAccount = invitation?.acceptanceMode === 'CREATE_ACCOUNT';
  const firstErrorField = useMemo(() => (['password', 'passwordConfirmation'] as FieldName[])
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
    if (isCreateAccount && !password) nextFieldErrors.password = 'PASSWORD_REQUIRED';
    if (isCreateAccount && password && password.length < 8) nextFieldErrors.password = 'PASSWORD_TOO_SHORT';
    // Confirmation match is a client-only check — it is never sent to the server.
    if (isCreateAccount && password !== passwordConfirmation) nextFieldErrors.passwordConfirmation = 'PASSWORD_MISMATCH';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setBusy(true);
    try {
      await acceptRemoteAccessInvitation({
        token,
        ...(isCreateAccount ? { password } : {}),
      });
      setState('success');
    } catch (error) {
      const code = error instanceof ApiError ? (error.code ?? 'ACCEPT_ERROR') : 'NETWORK_ERROR';
      if (code === 'PASSWORD_MISMATCH') setPasswordConfirmation('');
      setFieldErrors(code.startsWith('PASSWORD_') ? { [code === 'PASSWORD_MISMATCH' ? 'passwordConfirmation' : 'password']: code } : {});
      setFormError(code);
    } finally {
      setBusy(false);
    }
  };

  const translatedError = (code: string) => t(`acceptInvitation.errors.${code}`);

  return (
    <div className="auth-screen">
      <div className="invite-card" data-testid="accept-invitation-screen">
        {(state === 'loading' || state === 'invalid' || state === 'success') && (
          <div className="invite-simple">
            <div className="invite-header">
              <div className="auth-logo"><img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" /></div>
              <div className="auth-divider" aria-hidden="true" />
              <p className="auth-app-name">Anclora ShiftImport</p>
              <h1 className="invite-title">{t('acceptInvitation.title')}</h1>
            </div>
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
          </div>
        )}

        {state === 'valid' && invitation && (
          <form className="invite-grid" onSubmit={submit} noValidate>
            <section className="invite-summary">
              <div className="invite-header">
                <div className="auth-logo"><img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" /></div>
                <div className="auth-divider" aria-hidden="true" />
                <p className="auth-app-name">Anclora ShiftImport</p>
                <h1 className="invite-title">{t('acceptInvitation.title')}</h1>
              </div>
              <p className="invite-summary-org">{invitation.organizationName}</p>
              <p className="invite-summary-line">{t('acceptInvitation.role', { role: t(`role.${invitation.role.toLowerCase()}`) })}</p>
              {invitation.employeeName && (
                <p className="invite-summary-line">{t('acceptInvitation.employee', { name: invitation.employeeName })}</p>
              )}
            </section>

            <section className="invite-panel">
              <div className="invite-email-info">
                <span>{t('acceptInvitation.email')}</span>
                <strong data-testid="invitation-email-display">{invitation.email}</strong>
              </div>

              {isCreateAccount ? (
                <>
                  <div className="invite-password-row">
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
                  </div>
                  <small className="invite-password-hint">{t('acceptInvitation.passwordHint')}</small>
                </>
              ) : (
                <p className="auth-notice">{t('acceptInvitation.existingAccount')}</p>
              )}

              {formError && <p role="alert" aria-live="polite" aria-atomic="true" className="auth-error">{translatedError(formError)}</p>}

              <div className="invite-footer">
                <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
                  {busy ? t('acceptInvitation.accepting') : isCreateAccount ? t('acceptInvitation.createAndAccept') : t('acceptInvitation.linkAndAccept')}
                </button>
              </div>
            </section>
          </form>
        )}
      </div>
    </div>
  );
}

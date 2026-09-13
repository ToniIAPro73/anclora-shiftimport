import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info, Link2Off, Loader2 } from 'lucide-react';
import { navigate } from '../lib/route';
import { acceptRemoteAccessInvitation, InvitationValidation, validateRemoteAccessInvitation } from '../lib/remote';
import { ApiError } from '../lib/session';
import { useI18n } from '../lib/use-i18n';
import { consumeInvitationToken } from '../lib/invitation-link';
import { PasswordInput } from './ui/PasswordInput';

type ViewState = 'loading' | 'valid' | 'success' | 'conflict' | 'invalid';
type FieldName = 'password' | 'passwordConfirmation';

// The 4 terminal validation codes below all mean the same thing to the
// recipient ("this link doesn't work anymore") — a network failure is the
// only one worth a distinct message + a retry action instead of "go home".
const UNAVAILABLE_CODES = new Set(['INVITATION_INVALID', 'INVITATION_EXPIRED', 'INVITATION_REVOKED', 'INVITATION_ALREADY_ACCEPTED']);

function errorCodeForValidation(error: unknown): string {
  return error instanceof ApiError ? (error.code ?? 'INVITATION_INVALID') : 'NETWORK_ERROR';
}

function TerminalCard({ children }: { children: ReactNode }) {
  return (
    <div className="invite-card invite-card--terminal" data-testid="accept-invitation-screen">
      {children}
    </div>
  );
}

interface AcceptInvitationScreenProps {
  /** Called only for the session-conflict case (accepting while signed in as
   * a different identity), with the invited email to prefill on /login. The
   * caller owns the actual logout — this screen never touches cookies or
   * client auth state directly. */
  onSwitchAccount?: (invitedEmail: string) => void;
}

export function AcceptInvitationScreen({ onSwitchAccount }: AcceptInvitationScreenProps = {}) {
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
  const [conflictCurrentEmail, setConflictCurrentEmail] = useState('');

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
      const result = await acceptRemoteAccessInvitation({
        token,
        ...(isCreateAccount ? { password } : {}),
      });
      if (result.requiresAccountSwitch) {
        setConflictCurrentEmail(result.currentEmail ?? '');
        setState('conflict');
      } else {
        setState('success');
      }
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

  if (state === 'loading') {
    return (
      <div className="auth-screen">
        <TerminalCard>
          <Loader2 className="invite-terminal-icon icon-spin" size={28} aria-hidden="true" />
          <p role="status" aria-live="polite" className="invite-terminal-text">{t('acceptInvitation.loading')}</p>
        </TerminalCard>
      </div>
    );
  }

  if (state === 'invalid') {
    const code = validationError || 'INVITATION_INVALID';
    const isNetworkIssue = code === 'NETWORK_ERROR';
    return (
      <div className="auth-screen">
        <TerminalCard>
          {isNetworkIssue
            ? <Info className="invite-terminal-icon" size={28} aria-hidden="true" />
            : <Link2Off className="invite-terminal-icon" size={28} aria-hidden="true" />}
          <h1 className="invite-terminal-title">
            {isNetworkIssue ? t('acceptInvitation.errorTitle') : t('acceptInvitation.unavailableTitle')}
          </h1>
          <p role="alert" className="invite-terminal-text">
            {isNetworkIssue ? translatedError(code) : (UNAVAILABLE_CODES.has(code) ? t('acceptInvitation.unavailableText') : translatedError(code))}
          </p>
          <div className="invite-terminal-cta">
            {isNetworkIssue ? (
              <button type="button" className="btn-gold invite-cta" onClick={() => void validate()}>{t('acceptInvitation.retry')}</button>
            ) : (
              <button type="button" className="btn-gold invite-cta" onClick={() => navigate('/')}>{t('acceptInvitation.backToApp')}</button>
            )}
          </div>
        </TerminalCard>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="auth-screen">
        <TerminalCard>
          <CheckCircle2 className="invite-terminal-icon invite-terminal-icon--success" size={28} aria-hidden="true" />
          <h1 className="invite-terminal-title">{t('acceptInvitation.successTitle')}</h1>
          <p role="status" className="invite-terminal-text">
            {t('acceptInvitation.success', { organization: invitation?.organizationName ?? '' })}
          </p>
          <div className="invite-terminal-cta">
            <button type="button" className="btn-gold invite-cta" onClick={() => navigate('/app')}>{t('acceptInvitation.goToApp')}</button>
          </div>
        </TerminalCard>
      </div>
    );
  }

  if (state === 'conflict') {
    const invitedEmail = invitation?.email ?? '';
    return (
      <div className="auth-screen">
        <TerminalCard>
          <CheckCircle2 className="invite-terminal-icon invite-terminal-icon--success" size={28} aria-hidden="true" />
          <h1 className="invite-terminal-title">{t('acceptInvitation.conflictTitle')}</h1>
          <p role="status" className="invite-terminal-text">{t('acceptInvitation.conflictReady', { email: invitedEmail })}</p>
          <p className="invite-terminal-text">{t('acceptInvitation.conflictCurrent', { email: conflictCurrentEmail })}</p>
          <div className="invite-terminal-cta">
            <button type="button" className="btn-gold invite-cta" onClick={() => onSwitchAccount?.(invitedEmail)}>
              {t('acceptInvitation.switchAccount')}
            </button>
          </div>
          <button type="button" className="auth-link" onClick={() => navigate('/app')}>
            {t('acceptInvitation.keepSession')}
          </button>
        </TerminalCard>
      </div>
    );
  }

  if (!invitation) return null;

  return (
    <div className="auth-screen">
      <div className={`invite-card ${isCreateAccount ? 'invite-card--new' : 'invite-card--existing'}`} data-testid="accept-invitation-screen">
        <form className={isCreateAccount ? 'invite-grid' : 'invite-stack'} onSubmit={submit} noValidate>
          <section className="invite-summary">
            <div className="invite-header">
              <div className="auth-logo"><img src="/brand/anclora-shiftimport.webp" alt="" aria-hidden="true" /></div>
              <div className="auth-divider" aria-hidden="true" />
              <p className="auth-app-name">Anclora ShiftImport</p>
              <h1 className="invite-title">{t('acceptInvitation.title')}</h1>
            </div>
            <p className="invite-summary-org">{invitation.organizationName}</p>
            <p className="invite-summary-line">{t('acceptInvitation.invitedToJoin')}</p>
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
              <button type="submit" className="btn-gold invite-cta" disabled={busy} aria-busy={busy}>
                {busy ? t('acceptInvitation.accepting') : isCreateAccount ? t('acceptInvitation.createAndAccept') : t('acceptInvitation.linkAndAccept')}
              </button>
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}

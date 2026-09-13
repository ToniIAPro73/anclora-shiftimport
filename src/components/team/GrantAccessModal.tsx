import { useState } from 'react';
import { createRemoteAccessInvitation } from '../../lib/remote';
import type { Persona } from '../../lib/personas';
import { ApiError } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface GrantAccessModalProps {
  persona: Persona;
  locale: 'es' | 'en';
  onClose: () => void;
  /** Invitation created successfully — caller refreshes the team data and
   * shows its own success confirmation. */
  onGranted: () => void;
}

/**
 * Grants access to an EXISTING person who already has a name and (usually) an
 * employee record — never the "Añadir nueva persona" wizard. It only ever
 * calls `createRemoteAccessInvitation` with the person's existing
 * `employeeId`; it never creates a new person, employee record, or user.
 */
export function GrantAccessModal({ persona, locale, onClose, onGranted }: GrantAccessModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [email, setEmail] = useState(persona.email ?? '');
  const [role, setRole] = useState<'ADMIN' | 'PLANNER' | 'EMPLOYEE'>(persona.role === 'ADMIN' || persona.role === 'PLANNER' ? persona.role : 'EMPLOYEE');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scopeLabel = role === 'EMPLOYEE'
    ? (persona.areaName || t('teamWorkspace.noArea'))
    : t('teamWorkspace.scopeWholeOrg');

  const roleLabel = role === 'ADMIN' ? t('teamWorkspace.roleAdmin')
    : role === 'PLANNER' ? t('teamWorkspace.rolePlanner')
      : t('teamWorkspace.roleEmployee');

  const goToReview = () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError(t('teamWorkspace.errors.INVALID_EMAIL'));
      return;
    }
    setEmailError(null);
    setStep('review');
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createRemoteAccessInvitation({
        email: email.trim(),
        displayName: persona.name,
        role,
        employeeId: persona.employeeId,
        locale,
      });
      if (res.delivery.status !== 'SENT') {
        setSubmitError(t('teamWorkspace.invitationCreatedEmailFailed'));
        return;
      }
      onGranted();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setSubmitError(code ? t(`teamWorkspace.errors.${code}`) : (err instanceof Error ? err.message : t('teamWorkspace.actionFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={step === 'form' ? t('teamWorkspace.grantAccessModalTitle', { name: persona.name }) : t('teamWorkspace.reviewAccessTitle')}
      closeAriaLabel={t('teamWorkspace.close')}
      maxWidth="480px"
      initialFocus={step === 'form' ? '#grant-access-email' : undefined}
      footer={step === 'form' ? (
        <>
          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={onClose}>
            {t('teamWorkspace.cancel')}
          </button>
          <button type="button" className="equipo-btn equipo-btn--primary" onClick={goToReview} data-testid="grant-access-next">
            {t('teamWorkspace.next')}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => setStep('form')} disabled={submitting}>
            {t('teamWorkspace.back')}
          </button>
          <button
            type="button"
            className="equipo-btn equipo-btn--primary"
            onClick={() => void submit()}
            disabled={submitting}
            aria-busy={submitting}
            data-testid="grant-access-submit"
          >
            {submitting ? t('teamWorkspace.sendingInvitation') : t('teamWorkspace.sendInvitation')}
          </button>
        </>
      )}
    >
      {step === 'form' ? (
        <div className="equipo-wizard__form-group" data-testid="grant-access-form">
          <label htmlFor="grant-access-email" style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>
            {t('teamWorkspace.accessEmail')} *
          </label>
          <input
            id="grant-access-email"
            type="email"
            className="equipo-modal__search"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'grant-access-email-error' : undefined}
            data-testid="grant-access-email-input"
          />
          {emailError && <small id="grant-access-email-error" role="alert" style={{ display: 'block', color: 'var(--danger, #ef4444)', marginTop: '4px' }}>{emailError}</small>}
          {!persona.email && (
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('teamWorkspace.grantAccessEmailHint')}</p>
          )}

          <label htmlFor="grant-access-role" style={{ display: 'block', fontWeight: 600, margin: '16px 0 4px' }}>
            {t('teamWorkspace.roleInOrganization')} *
          </label>
          <select
            id="grant-access-role"
            className="equipo-modal__select"
            style={{ width: '100%' }}
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            data-testid="grant-access-role-select"
          >
            <option value="EMPLOYEE">{t('teamWorkspace.roleEmployee')}</option>
            <option value="PLANNER">{t('teamWorkspace.rolePlanner')}</option>
            <option value="ADMIN">{t('teamWorkspace.roleAdmin')}</option>
          </select>

          <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {t('teamWorkspace.invitationPasswordNote')}
          </p>
        </div>
      ) : (
        <div className="equipo-wizard__form-group" data-testid="grant-access-review">
          <div className="equipo-panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div><strong>{t('teamWorkspace.person')}:</strong> {persona.name}</div>
            <div><strong>{t('teamWorkspace.accessEmail')}:</strong> {email.trim()}</div>
            <div><strong>{t('teamWorkspace.filterRole')}:</strong> {roleLabel}</div>
            <div><strong>{t('teamWorkspace.scopeLabel')}:</strong> {scopeLabel}</div>
          </div>
          {submitError && (
            <p role="alert" style={{ margin: '12px 0 0', color: 'var(--danger, #ef4444)' }}>{submitError}</p>
          )}
        </div>
      )}
    </ModalShell>
  );
}

import { useRef, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

interface OnboardingChoiceModalProps {
  isOpen: boolean;
  onConfirm: (organizationName: string, ownerIsEmployee: boolean, employeeName?: string) => Promise<void>;
  onLogout: () => void;
}

/**
 * Unified onboarding choice after signup. Owner and Employee remain separate;
 * the checkbox is the explicit opt-in for creating a self-linked Employee.
 * Blocking modal — only way out without completing is logout.
 */
export const OnboardingChoiceModal = ({ isOpen, onConfirm, onLogout }: OnboardingChoiceModalProps) => {
  const { t } = useI18n();
  const [organizationName, setOrganizationName] = useState('');
  const [ownerIsEmployee, setOwnerIsEmployee] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<'organization' | 'employee' | null>(null);
  const [busy, setBusy] = useState(false);
  const organizationNameRef = useRef<HTMLInputElement>(null);
  const employeeNameRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setErrorField(null);

    const trimmedOrg = organizationName.trim();
    const trimmedEmp = employeeName.trim();

    if (!trimmedOrg) {
      setError(t('onboardingChoice.orgNameRequired'));
      setErrorField('organization');
      organizationNameRef.current?.focus();
      return;
    }
    if (ownerIsEmployee && !trimmedEmp) {
      setError(t('onboardingChoice.employeeNameRequired'));
      setErrorField('employee');
      employeeNameRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      await onConfirm(trimmedOrg, ownerIsEmployee, ownerIsEmployee ? trimmedEmp : undefined);
    } catch {
      setError(t('onboardingChoice.failed'));
      setErrorField(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onLogout}
      title={t('onboardingChoice.title')}
      blocking
      maxWidth="460px"
    >
      <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>
        {t('onboardingChoice.description')}
      </p>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label style={{ display: 'grid', gap: '6px', marginBottom: '14px' }}>
          <span>{t('onboardingChoice.orgNameLabel')}</span>
          <input
            id="onboarding-choice-organization"
            className="modal-input"
            ref={organizationNameRef}
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            aria-describedby={errorField === 'organization' ? 'onboarding-choice-organization-error' : undefined}
            aria-invalid={errorField === 'organization' ? 'true' : undefined}
            autoFocus
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: ownerIsEmployee ? '12px' : '14px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ownerIsEmployee}
            onChange={(event) => setOwnerIsEmployee(event.target.checked)}
            style={{ marginTop: '3px', accentColor: 'var(--accent-gold)' }}
          />
          <span style={{ display: 'grid', gap: '3px' }}>
            <span>{t('onboardingChoice.ownerIsEmployeeLabel')}</span>
            <small style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {t('onboardingChoice.ownerIsEmployeeDescription')}
            </small>
          </span>
        </label>
        {ownerIsEmployee && (
          <label style={{ display: 'grid', gap: '6px', marginBottom: '14px' }}>
            <span>{t('onboardingChoice.employeeNameLabel')}</span>
            <input
              id="onboarding-choice-employee"
              className="modal-input"
              ref={employeeNameRef}
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              placeholder={t('onboardingChoice.employeeNamePlaceholder')}
              aria-describedby={errorField === 'employee' ? 'onboarding-choice-employee-error' : undefined}
              aria-invalid={errorField === 'employee' ? 'true' : undefined}
            />
          </label>
        )}
        {error && (
          <p
            id={errorField === 'employee' ? 'onboarding-choice-employee-error' : errorField === 'organization' ? 'onboarding-choice-organization-error' : undefined}
            style={{ margin: '0 0 14px', color: 'var(--danger)', fontSize: '0.85rem' }}
            role="alert"
          >
            {error}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={onLogout}
            disabled={busy}
            style={{ padding: '10px 14px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
          >
            {t('auth.logoutAction')}
          </button>
          <button type="submit" className="btn-gold" disabled={busy} aria-busy={busy} style={{ padding: '10px 16px', fontWeight: 800 }}>
            {t('onboardingChoice.confirm')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

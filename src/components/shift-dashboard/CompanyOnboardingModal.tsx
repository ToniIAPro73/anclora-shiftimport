import { FormEvent, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

interface CompanyOnboardingModalProps {
  isOpen: boolean;
  /** Only asked when the account has no display name yet. */
  requireAdminName: boolean;
  onConfirm: (companyName: string, adminName?: string) => Promise<void>;
  onBack: () => void;
}

/**
 * Fase 1.2C.4: minimal company onboarding form — company name always,
 * administrator name only when missing from the account. No other fields:
 * spec explicitly forbids unnecessary commercial friction here.
 */
export const CompanyOnboardingModal = ({ isOpen, requireAdminName, onConfirm, onBack }: CompanyOnboardingModalProps) => {
  const { t } = useI18n();
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    const trimmedCompany = companyName.trim();
    const trimmedAdmin = adminName.trim();

    if (!trimmedCompany) {
      setError(t('companyOnboarding.companyNameRequired'));
      return;
    }
    if (requireAdminName && !trimmedAdmin) {
      setError(t('companyOnboarding.adminNameRequired'));
      return;
    }

    setBusy(true);
    try {
      await onConfirm(trimmedCompany, requireAdminName ? trimmedAdmin : undefined);
    } catch {
      setError(t('onboardingChoice.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onBack} title={t('companyOnboarding.title')} blocking maxWidth="440px">
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label style={{ display: 'grid', gap: '6px', marginBottom: '14px' }}>
          <span>{t('companyOnboarding.companyNameLabel')}</span>
          <input
            className="modal-input"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            autoFocus
          />
        </label>
        {requireAdminName && (
          <label style={{ display: 'grid', gap: '6px', marginBottom: '14px' }}>
            <span>{t('companyOnboarding.adminNameLabel')}</span>
            <input
              className="modal-input"
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
            />
          </label>
        )}
        {error && (
          <p style={{ margin: '0 0 14px', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={onBack}
            disabled={busy}
            style={{ padding: '10px 14px', fontWeight: 700 }}
          >
            {t('companyOnboarding.back')}
          </button>
          <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '10px 16px', fontWeight: 800 }}>
            {t('companyOnboarding.confirm')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

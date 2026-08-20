import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

interface OnboardingChoiceModalProps {
  isOpen: boolean;
  onSelectPersonal: () => void;
  onSelectCompany: () => void;
  onLogout: () => void;
}

/**
 * Fase 1.2C.2: mandatory "Para mí" / "Para mi empresa" choice right after
 * signup, for a session with zero memberships (never shown to a user who
 * already onboarded — resolveContext returns memberships.length === 0 only
 * for that exact state). Blocking, same escape hatch pattern as
 * OrgSelectorModal: the only way out without choosing is logout.
 */
export const OnboardingChoiceModal = ({ isOpen, onSelectPersonal, onSelectCompany, onLogout }: OnboardingChoiceModalProps) => {
  const { t } = useI18n();

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
      <div style={{ display: 'grid', gap: '10px' }}>
        <button
          type="button"
          className="btn-outline"
          onClick={onSelectPersonal}
          style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'left', display: 'grid', gap: '4px', width: '100%' }}
        >
          <span>{t('onboardingChoice.personalTitle')}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', fontWeight: 500 }}>
            {t('onboardingChoice.personalDescription')}
          </span>
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={onSelectCompany}
          style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'left', display: 'grid', gap: '4px', width: '100%' }}
        >
          <span>{t('onboardingChoice.companyTitle')}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', fontWeight: 500 }}>
            {t('onboardingChoice.companyDescription')}
          </span>
        </button>
      </div>
      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn-outline"
          onClick={onLogout}
          style={{ padding: '10px 14px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          {t('auth.logoutAction')}
        </button>
      </div>
    </ModalShell>
  );
};

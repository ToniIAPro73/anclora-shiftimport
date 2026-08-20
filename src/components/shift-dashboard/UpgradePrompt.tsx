import { useI18n } from '../../lib/use-i18n';
import { navigate } from '../../lib/route';
import { ModalShell } from '../ui/ModalShell';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Fase 1.2G.22: shown instead of a raw error whenever the backend refuses a
 * request with code 'PLAN_LIMIT' (api/_lib/plans.js) — no checkout, just a
 * clear explanation and a link to /pricing.
 */
export const UpgradePrompt = ({ isOpen, onClose }: UpgradePromptProps) => {
  const { t } = useI18n();

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('upgrade.title')} maxWidth="420px">
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>
        {t('upgrade.description')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button type="button" className="btn-outline" onClick={onClose} style={{ padding: '10px 14px', fontWeight: 700 }}>
          {t('upgrade.close')}
        </button>
        <button
          type="button"
          className="btn-gold"
          style={{ padding: '10px 16px', fontWeight: 800 }}
          onClick={() => {
            onClose();
            navigate('/pricing');
          }}
        >
          {t('upgrade.cta')}
        </button>
      </div>
    </ModalShell>
  );
};

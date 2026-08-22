import { useI18n } from '../../lib/use-i18n';
import { navigate } from '../../lib/route';
import { ModalShell } from '../ui/ModalShell';
import type { PlanId } from '../../lib/plans';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  /** Active organization's plan — always 'unrestricted' now. */
  currentPlan?: PlanId | null;
  switchTarget?: { id: string; name: string } | null;
  onSwitchOrg?: (organizationId: string) => void;
}

/**
 * Shown when a feature gate is hit. Since all plans are unrestricted,
 * PLAN_LIMIT errors no longer occur, but the component stays for backward compat.
 */
export const UpgradePrompt = ({ isOpen, onClose }: UpgradePromptProps) => {
  const { t } = useI18n();

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('upgrade.title')} maxWidth="420px">
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>
        {t('upgrade.description')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
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

import { useI18n } from '../../lib/use-i18n';
import { navigate } from '../../lib/route';
import { ModalShell } from '../ui/ModalShell';
import { PlanId } from '../../lib/session';
import { getPlanDefinition } from '../../lib/plans';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  /** Active organization's plan, for the contextual "This org is on Free..."
   * line — omitted keeps the generic copy only. */
  currentPlan?: PlanId | null;
  /** A sibling org on the Team plan the user already belongs to, if any —
   * offers "Switch to X" as an alternative to /pricing. Never switches
   * automatically; the user must click. */
  switchTarget?: { id: string; name: string } | null;
  onSwitchOrg?: (organizationId: string) => void;
}

/**
 * Fase 1.2G.22: shown instead of a raw error whenever the backend refuses a
 * request with code 'PLAN_LIMIT' (api/_lib/plans.js) — no checkout, just a
 * clear explanation and a link to /pricing. Optionally contextualized with
 * the org's current plan and a same-account Team org to switch to instead.
 */
export const UpgradePrompt = ({ isOpen, onClose, currentPlan, switchTarget, onSwitchOrg }: UpgradePromptProps) => {
  const { t } = useI18n();

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('upgrade.title')} maxWidth="420px">
      {currentPlan && (
        <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>
          {t('upgrade.currentPlanContext', { plan: getPlanDefinition(currentPlan).label })}
        </p>
      )}
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>
        {t('upgrade.description')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="btn-outline" onClick={onClose} style={{ padding: '10px 14px', fontWeight: 700 }}>
          {t('upgrade.close')}
        </button>
        {switchTarget && onSwitchOrg && (
          <button
            type="button"
            className="btn-outline"
            style={{ padding: '10px 14px', fontWeight: 700 }}
            onClick={() => {
              onClose();
              onSwitchOrg(switchTarget.id);
            }}
          >
            {t('upgrade.switchTo', { name: switchTarget.name })}
          </button>
        )}
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

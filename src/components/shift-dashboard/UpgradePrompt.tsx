import type { ReactNode } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { navigate } from '../../lib/route';
import { ModalShell } from '../ui/ModalShell';
import type { PlanId } from '../../lib/plans';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  /** Active organization's plan — may be free/personal/team depending on subscription state. */
  currentPlan?: PlanId | null;
  switchTarget?: { id: string; name: string } | null;
  onSwitchOrg?: (organizationId: string) => void;
}

interface PlanGateNoticeProps {
  id: string;
  children: ReactNode;
}

/** Inline, non-error notice used before a gated form. */
export const PlanGateNotice = ({ id, children }: PlanGateNoticeProps) => {
  const { t } = useI18n();
  return (
    <div
      id={id}
      role="note"
      style={{
        display: 'grid', gap: '6px', padding: '10px 12px', borderRadius: '12px',
        border: '1px solid var(--color-gold)', background: 'var(--gold-tint-bg)',
        color: 'var(--text)', fontSize: '0.8rem', lineHeight: 1.45,
      }}
    >
      <strong>{t('upgrade.title')}</strong>
      <span style={{ color: 'var(--text-muted)' }}>{children}</span>
      <button
        type="button"
        className="btn-outline"
        onClick={() => navigate('/pricing')}
        style={{ padding: '6px 10px', fontWeight: 800, justifySelf: 'start' }}
      >
        {t('upgrade.cta')}
      </button>
    </div>
  );
};

/**
 * Shown when a feature gate (e.g. PLAN_LIMIT) is hit after other upgrade paths
 * have been attempted. The component stays for backward compatibility with routes
 that may still render it if limits apply on the deployed plan tier.
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

import type { PlanBaselineInfo } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

interface PlanBaselineCardProps {
  baseline: PlanBaselineInfo;
  busy?: boolean;
  onCreate: () => void;
  /** The calendar belongs to the viewer (self-service): "your calendar"; otherwise "the calendar". */
  ownCalendar?: boolean;
  testId?: string;
}

/**
 * Shown when the document is a company-plan source, the calendar already holds (some of) its shifts and no versioned
 * company reference was ever recorded (user-facing: "Primera referencia de la empresa"). The action records the plan only: it never duplicates shifts and never rewrites the
 * effective calendar. Internal vocabulary (revisions, fingerprints, scopes) is deliberately absent from the copy.
 */
export function PlanBaselineCard({ baseline, busy = false, onCreate, ownCalendar = false, testId = 'plan-baseline-card' }: PlanBaselineCardProps) {
  const { t } = useI18n();
  return (
    <section
      data-testid={testId}
      style={{ marginTop: '12px', padding: '12px', border: '1px solid var(--color-gold)', borderRadius: '10px', display: 'grid', gap: '6px', fontSize: '0.86rem' }}
    >
      <strong>{t('importModal.planBaselineTitle')}</strong>
      <span>{t(ownCalendar ? 'importModal.planBaselineIntro' : 'importModal.planBaselineIntroOther')}</span>
      {baseline.existingEquivalentRows > 0 && <span data-testid={`${testId}-existing`}>{t('importModal.planBaselineExisting', { count: baseline.existingEquivalentRows })}</span>}
      {baseline.newRows > 0 && <span>{t('importModal.planBaselineNew', { count: baseline.newRows })}</span>}
      {baseline.reviewRows > 0 && <span style={{ color: 'var(--color-gold)' }}>{t('importModal.planBaselineReview', { count: baseline.reviewRows })}</span>}
      <span style={{ color: 'var(--text-muted)' }}>{t('importModal.planBaselineSafe')}</span>
      <button type="button" className="btn-gold" disabled={busy} onClick={onCreate} data-testid={`${testId}-create`} style={{ marginTop: '4px', minHeight: '44px' }}>
        {busy ? t('importModal.planBaselineCreating') : t('importModal.planBaselineCreate')}
      </button>
    </section>
  );
}

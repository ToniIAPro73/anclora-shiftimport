import type { FutureImportDecision } from '../../lib/import-temporal';
import type { PlanImportPreview } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

interface FutureImportConsentProps {
  decision: FutureImportDecision;
  onChange: (decision: FutureImportDecision) => void;
  testId: string;
  /** Rows of the document before / from today (operational date). */
  historicalCount?: number;
  futureCount?: number;
  /** Optional read-only comparison against CURRENT (planning roles only). */
  preview?: PlanImportPreview | null;
  previewLoading?: boolean;
}

/**
 * The one temporal decision surface shared by individual and team imports (rendered only for roles
 * allowed to plan). Source format is intentionally not part of this component's contract.
 * "Plan" here means creating/updating the planning (drafts); nothing is ever published by importing.
 */
export const FutureImportConsent = ({
  decision, onChange, testId, historicalCount = 0, futureCount = 0, preview = null, previewLoading = false,
}: FutureImportConsentProps) => {
  const { t } = useI18n();
  const mixed = historicalCount > 0;
  const changes = preview?.plan.changes;
  // The third option exists only when the server simulated auto-publication for this actor and file (deployment switch + scope).
  const autoPublish = preview && typeof preview.autoPublish === 'object' && preview.autoPublish.eligible ? preview.autoPublish : null;
  const plural = (count: number, many: string, one: string) => t(count === 1 ? one : many, { count });

  return (
    <fieldset
      data-testid={testId}
      style={{ marginTop: '12px', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px', display: 'grid', gap: '10px' }}
    >
      <legend style={{ padding: '0 6px', fontWeight: 700 }}>
        {mixed ? t('importModal.planConsentMixedTitle') : t('importModal.planConsentFutureTitle')}
      </legend>
      <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.45 }} data-testid={`${testId}-counts`}>
        {mixed
          ? t('importModal.planConsentCounts', { historical: historicalCount, future: futureCount })
          : t('importModal.planConsentFutureCount', { future: futureCount })}
      </p>
      {mixed && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <input
            type="radio"
            name={`${testId}-decision`}
            value="historical-only"
            checked={decision === 'historical-only'}
            onChange={() => onChange('historical-only')}
          />
          <span>{t('importModal.planOptionHistoricalOnly')}</span>
        </label>
      )}
      {autoPublish && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <input
            type="radio"
            name={`${testId}-decision`}
            value="historical-and-auto-publish"
            checked={decision === 'historical-and-auto-publish'}
            onChange={() => onChange('historical-and-auto-publish')}
          />
          <span>{t('importModal.planOptionAutoPublish')}</span>
        </label>
      )}
      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <input
          type="radio"
          name={`${testId}-decision`}
          value="historical-and-plan"
          checked={decision === 'historical-and-plan'}
          onChange={() => onChange('historical-and-plan')}
        />
        <span>{mixed ? t('importModal.planOptionHistoricalAndPlan') : t('importModal.planOptionPlanOnly')}</span>
      </label>
      {decision === 'historical-and-auto-publish' && autoPublish && (
        <div data-testid={`${testId}-auto-publish-summary`} style={{ display: 'grid', gap: '6px', padding: '10px', borderRadius: '8px', background: 'var(--panel-muted-bg)', fontSize: '0.82rem' }}>
          <span>{t('importModal.autoPublishNote')}</span>
          {autoPublish.willPublishShiftCount === 0 ? (
            <span role="status" data-testid={`${testId}-auto-publish-nothing`}>{t('importModal.autoPublishNothing')}</span>
          ) : (
            <span data-testid={`${testId}-auto-publish-counts`} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: 'var(--text-muted)' }}>
              <span>{plural(autoPublish.willPublishShiftCount, 'importModal.autoPublishWillPublish', 'importModal.autoPublishWillPublishOne')}</span>
              {autoPublish.willRetain.length > 0 && <span>{plural(autoPublish.willRetain.length, 'importModal.autoPublishWillRetain', 'importModal.autoPublishWillRetainOne')}</span>}
              {autoPublish.reviewConflicts.length > 0 && (
                <span style={{ color: 'var(--color-gold)', fontWeight: 700 }}>{plural(autoPublish.reviewConflicts.length, 'importModal.autoPublishWillReview', 'importModal.autoPublishWillReviewOne')}</span>
              )}
            </span>
          )}
          {previewLoading && <span role="status" style={{ color: 'var(--text-subtle)' }}>{t('importModal.planPreviewLoading')}</span>}
        </div>
      )}
      {decision === 'historical-and-plan' && (
        <div data-testid={`${testId}-plan-summary`} style={{ display: 'grid', gap: '6px', padding: '10px', borderRadius: '8px', background: 'var(--panel-muted-bg)', fontSize: '0.82rem' }}>
          <span>{t(mixed ? 'importModal.planDraftNote' : 'importModal.planDraftNoteFutureOnly')}</span>
          {previewLoading && <span role="status" style={{ color: 'var(--text-subtle)' }}>{t('importModal.planPreviewLoading')}</span>}
          {preview && (
            <>
              <span data-testid={`${testId}-document-class`}>{t(`importModal.documentClass.${preview.document.documentClass}`)}</span>
              {changes && (
                <span data-testid={`${testId}-changes`} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: 'var(--text-muted)' }}>
                  {changes.new > 0 && <span>{t('importModal.planChangeNew', { count: changes.new })}</span>}
                  {changes.modified > 0 && <span>{t('importModal.planChangeModified', { count: changes.modified })}</span>}
                  {changes.unchanged > 0 && <span>{t('importModal.planChangeUnchanged', { count: changes.unchanged })}</span>}
                  {changes.requiresReview > 0 && <span style={{ color: 'var(--color-gold)', fontWeight: 700 }}>{t('importModal.planChangeReview', { count: changes.requiresReview })}</span>}
                </span>
              )}
            </>
          )}
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-subtle)' }}>{t('importModal.futureConsentCancelHint')}</p>
    </fieldset>
  );
};

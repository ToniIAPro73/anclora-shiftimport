import type { FutureImportDecision } from '../../lib/import-temporal';
import { useI18n } from '../../lib/use-i18n';

interface FutureImportConsentProps {
  decision: FutureImportDecision;
  onChange: (decision: FutureImportDecision) => void;
  testId: string;
}

/**
 * The one temporal consent surface shared by individual and team imports.
 * Source format is intentionally not part of this component's contract.
 */
export const FutureImportConsent = ({ decision, onChange, testId }: FutureImportConsentProps) => {
  const { t } = useI18n();

  return (
    <fieldset
      data-testid={testId}
      style={{ marginTop: '12px', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '10px', display: 'grid', gap: '10px' }}
    >
      <legend style={{ padding: '0 6px', fontWeight: 700 }}>{t('importModal.futureConsentTitle')}</legend>
      <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.45 }}>{t('importModal.futureConsentDescription')}</p>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <input
          type="radio"
          name={`${testId}-decision`}
          value="historical-only"
          checked={decision === 'historical-only'}
          onChange={() => onChange('historical-only')}
        />
        <span>{t('importModal.futureConsentHistoricalOnly')}</span>
      </label>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <input
          type="radio"
          name={`${testId}-decision`}
          value="draft"
          checked={decision === 'draft'}
          onChange={() => onChange('draft')}
        />
        <span>{t('importModal.futureConsentDraft')}</span>
      </label>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-subtle)' }}>{t('importModal.futureConsentCancelHint')}</p>
    </fieldset>
  );
};

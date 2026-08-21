import { ReconciliationReport } from '../../lib/import-reconciliation';
import { useI18n } from '../../lib/use-i18n';

interface ImportResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReconciliationReport;
}

/**
 * Shown after every session-mode import confirm — success or failure —
 * never a silent close. A PASS still gets an explicit "N of N saved"
 * confirmation; a FAIL shows exactly which dates/shifts didn't make it,
 * instead of a generic "something went wrong" alert.
 */
export const ImportResultModal = ({ isOpen, onClose, report }: ImportResultModalProps) => {
  const { t } = useI18n();
  if (!isOpen) {
    return null;
  }

  const isPass = report.status === 'PASS';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="import-result-title" className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <h3 id="import-result-title" style={{ margin: 0 }}>
          {isPass ? t('importResult.titlePass') : t('importResult.titleFail')}
        </h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('importResult.counts', { persisted: report.matchedCount, expected: report.expectedCount })}
        </p>
        {!isPass && report.mismatches.length > 0 ? (
          <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {report.mismatches.map((mismatch) => (
              <div
                key={mismatch.id}
                role="alert"
                style={{
                  border: '1px solid var(--glass-border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 13,
                }}
              >
                <strong>{mismatch.date}</strong>
                {' — '}
                {mismatch.reason === 'missing_in_persisted'
                  ? t('importResult.reasonMissing')
                  : t('importResult.reasonFieldMismatch', { fields: (mismatch.diffFields ?? []).join(', ') })}
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn-gold" type="button" onClick={onClose}>{t('importResult.close')}</button>
        </div>
      </div>
    </div>
  );
};

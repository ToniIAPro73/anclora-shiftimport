import { ReconciliationReport } from '../../lib/import-reconciliation';
import { ModalShell } from '../ui/ModalShell';
import { useI18n } from '../../lib/use-i18n';
import './ImportResultModal.css';

export interface ImportOutcomeReport {
  status: 'partial' | 'blocked' | 'failed';
  reason: string;
  blockingEmployeeId?: string | null;
  blockingEmployeeName?: string | null;
  attemptedCount: number;
  createdShiftCount: number;
  existingShiftCount: number;
  outcomeDetail?: Record<string, unknown> | null;
}

export interface TemporalImportReport {
  status: 'COMPLETED';
  historical: { submittedCount: number; persistedCount: number; existingCount: number };
  future: {
    submittedCount: number;
    createdAssignmentCount: number;
    existingAssignmentCount: number;
    affectedWeekCount: number;
    publishedWeekCount: number;
    publishedShiftCount: number;
    publicationResults: Array<{ periodStart: string; status: string; createdShiftCount: number }>;
    /** Weeks whose draft plan was created/updated (import never publishes). */
    draftWeekCount?: number;
  };
  duplicate?: 'DUPLICATE_FILE' | 'DUPLICATE_DOCUMENT' | 'DUPLICATE_PLAN' | null;
  plan?: {
    revisionNumber: number | null;
    revisionCreated: boolean;
    changes: { new: number; unchanged: number; modified: number; keptLocal: number; companyAdoptedLocal: number; requiresReview: number };
  };
}

interface ImportResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReconciliationReport | ImportOutcomeReport | TemporalImportReport;
  onCompleteEmployee?: (employeeId: string) => void;
  onRetry?: () => void;
}

/**
 * Shown after every session-mode import confirm — success or failure —
 * never a silent close. A PASS still gets an explicit "N of N saved"
 * confirmation; a FAIL shows exactly which dates/shifts didn't make it,
 * instead of a generic "something went wrong" alert.
 */
export const ImportResultModal = ({ isOpen, onClose, report, onCompleteEmployee, onRetry }: ImportResultModalProps) => {
  const { t } = useI18n();
  if (!isOpen) {
    return null;
  }

  const isPass = report.status === 'PASS';

  if (report.status === 'COMPLETED') {
    const changes = report.plan?.changes;
    const review = changes?.requiresReview ?? 0;
    const weeks = report.future.draftWeekCount ?? report.future.affectedWeekCount;
    const metrics: Array<[string, number, string]> = [
      ['historical', report.historical.persistedCount, 'importResult.metricHistorical'],
      ['existing', report.historical.existingCount, 'importResult.metricExisting'],
      ['future', report.future.createdAssignmentCount, 'importResult.metricFuture'],
      ['weeks', weeks, 'importResult.metricWeeks'],
    ];
    const changeChips: Array<[string, number, string]> = changes ? [
      ['modified', changes.modified, 'importResult.changeModified'],
      ['adopted', changes.companyAdoptedLocal, 'importResult.changeAdopted'],
      ['kept', changes.keptLocal, 'importResult.changeKept'],
    ] : [];
    return (
      <ModalShell isOpen onClose={onClose} title={t('importResult.titleTemporalComplete')} closeAriaLabel={t('importResult.close')} maxWidth="780px" width="min(96vw, 780px)">
        <div className="import-result" role="status" aria-live="polite" data-testid="import-result-complete">
          <p className="import-result__subtitle">{t('importResult.temporalSubtitle')}</p>

          <div className="import-result__metrics" data-testid="import-result-metrics">
            {metrics.map(([key, value, label]) => (
              <div key={key} className="import-result__metric" data-testid={`import-result-metric-${key}`}>
                <strong>{value}</strong>
                <span>{t(label)}</span>
              </div>
            ))}
          </div>

          <div className="import-result__columns">
            <section className="import-result__panel" aria-label={t('importResult.doneTitle')}>
              <h4>{t('importResult.doneTitle')}</h4>
              {report.duplicate ? (
                <p data-testid="import-result-duplicate">
                  {t(report.duplicate === 'DUPLICATE_FILE' ? 'importResult.planDuplicateFile' : report.duplicate === 'DUPLICATE_DOCUMENT' ? 'importResult.planDuplicateDocument' : 'importResult.planDuplicatePlan')}
                </p>
              ) : report.plan?.revisionCreated && report.plan.revisionNumber !== null ? (
                <p data-testid="import-result-revision" className="import-result__plan">{t('importResult.planVersion', { revision: report.plan.revisionNumber })}</p>
              ) : null}
              {changeChips.some(([, value]) => value > 0) && (
                <ul className="import-result__chips" data-testid="import-result-changes">
                  {changeChips.filter(([, value]) => value > 0).map(([key, value, label]) => (
                    <li key={key}><strong>{value}</strong> {t(label)}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`import-result__panel${review > 0 ? ' import-result__panel--attention' : ''}`} aria-label={t('importResult.pendingTitle')}>
              <h4>{t('importResult.pendingTitle')}</h4>
              <p data-testid="import-result-pending">{review > 0 ? t('importResult.pendingSome', { count: review }) : t('importResult.pendingNone')}</p>
            </section>
          </div>

          <div className="import-result__next">
            <div>
              <strong>{t('importResult.nextStepTitle')}</strong>
              <p>{t('importResult.nextStepBody')}</p>
            </div>
            <button className="btn-gold" type="button" onClick={onClose}>{t('importResult.understood')}</button>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (report.status !== 'PASS' && report.status !== 'FAIL') {
    const outcomeReport = report as ImportOutcomeReport;
    const reasonKey = ({
      EMPLOYEE_PENDING_ACCESS: 'importResult.reasonEmployeePending',
      EMPLOYEE_INACTIVE: 'importResult.reasonEmployeeInactive',
      EMPLOYEE_AMBIGUOUS: 'importResult.reasonEmployeeAmbiguous',
      EMPLOYEE_UNKNOWN: 'importResult.reasonEmployeeUnknown',
      SELF_IDENTITY_NOT_FOUND: 'importResult.reasonSelfIdentity',
      SELF_FUTURE_ROWS_EXCLUDED: 'importResult.reasonSelfFutureExcluded',
      FUTURE_ROWS_NOT_CONFIRMED: 'importResult.reasonFutureNotConfirmed',
      PLAN_LIMIT: 'importResult.reasonPlanLimit',
      AREA_MISMATCH_DECLINED: 'importResult.reasonAreaMismatch',
      DOCUMENT_ERROR: 'importResult.reasonDocument',
      SYSTEM_ERROR: 'importResult.reasonSystem',
    } as Record<string, string>)[outcomeReport.reason] ?? 'importResult.reasonGeneric';
    const isBlocked = outcomeReport.status === 'blocked' || outcomeReport.status === 'partial';
    const hasEmployeeAction = Boolean(outcomeReport.blockingEmployeeId && onCompleteEmployee);

    return (
      <ModalShell
        isOpen
        onClose={onClose}
        title={outcomeReport.status === 'failed' ? t('importResult.titleOutcomeFailed') : t('importResult.titleOutcomeBlocked')}
        closeAriaLabel={t('importResult.close')}
        maxWidth="520px"
      >
        <div role={isBlocked ? 'alert' : 'status'} aria-live="polite">
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 0 }}>
            {t('importResult.outcomeCounts', {
              attempted: outcomeReport.attemptedCount,
              created: outcomeReport.createdShiftCount,
              existing: outcomeReport.existingShiftCount,
            })}
          </p>
          {outcomeReport.outcomeDetail && (
            <p style={{ lineHeight: 1.5 }}>
              {t('importResult.selfImportBreakdown', {
                totalRows: Number(outcomeReport.outcomeDetail.totalRows ?? outcomeReport.attemptedCount),
                ownRows: Number(outcomeReport.outcomeDetail.ownRows ?? outcomeReport.attemptedCount),
                ignoredRows: Number(outcomeReport.outcomeDetail.ignoredRows ?? 0),
                unidentifiedRows: Number(outcomeReport.outcomeDetail.unidentifiedRows ?? 0),
                futureRows: Number(outcomeReport.outcomeDetail.futureOwnRows ?? outcomeReport.outcomeDetail.futureRows ?? 0),
              })}
            </p>
          )}
          {outcomeReport.blockingEmployeeName ? (
            <p style={{ lineHeight: 1.5 }}>
              <strong>{outcomeReport.blockingEmployeeName}</strong>
            </p>
          ) : null}
          <p style={{ lineHeight: 1.5 }}>{t(reasonKey)}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {hasEmployeeAction ? (
            <button
              className="btn-outline"
              type="button"
              onClick={() => onCompleteEmployee?.(outcomeReport.blockingEmployeeId as string)}
            >
              {t('importResult.completeEmployee')}
            </button>
          ) : null}
          {onRetry ? (
            <button className="btn-gold" type="button" onClick={onRetry}>
              {t('importResult.retry')}
            </button>
          ) : null}
          <button className="btn-outline" type="button" onClick={onClose}>{t('importResult.close')}</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell isOpen onClose={onClose} title={isPass ? t('importResult.titlePass') : t('importResult.titleFail')} closeAriaLabel={t('importResult.close')}>
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
    </ModalShell>
  );
};

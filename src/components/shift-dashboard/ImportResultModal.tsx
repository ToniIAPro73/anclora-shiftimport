import { ReconciliationReport } from '../../lib/import-reconciliation';
import { ModalShell } from '../ui/ModalShell';
import { useI18n } from '../../lib/use-i18n';

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
  future: { submittedCount: number; createdAssignmentCount: number; existingAssignmentCount: number; draftCount: number };
  firstDraftPeriodStart?: string;
}

interface ImportResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReconciliationReport | ImportOutcomeReport | TemporalImportReport;
  onCompleteEmployee?: (employeeId: string) => void;
  onRetry?: () => void;
  onViewPlanning?: () => void;
}

/**
 * Shown after every session-mode import confirm — success or failure —
 * never a silent close. A PASS still gets an explicit "N of N saved"
 * confirmation; a FAIL shows exactly which dates/shifts didn't make it,
 * instead of a generic "something went wrong" alert.
 */
export const ImportResultModal = ({ isOpen, onClose, report, onCompleteEmployee, onRetry, onViewPlanning }: ImportResultModalProps) => {
  const { t } = useI18n();
  if (!isOpen) {
    return null;
  }

  const isPass = report.status === 'PASS';

  if (report.status === 'COMPLETED') {
    return (
      <ModalShell isOpen onClose={onClose} title={t('importResult.titleTemporalComplete')} closeAriaLabel={t('importResult.close')}>
        <div role="status" aria-live="polite">
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 0 }}>
            {t('importResult.temporalCounts', {
              historical: report.historical.persistedCount,
              historicalExisting: report.historical.existingCount,
              future: report.future.createdAssignmentCount,
              drafts: report.future.draftCount,
            })}
          </p>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('importResult.temporalNotPublished')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {report.future.draftCount > 0 && onViewPlanning ? (
            <button className="btn-gold" type="button" onClick={onViewPlanning}>{t('importResult.viewPlanning')}</button>
          ) : null}
          <button className="btn-outline" type="button" onClick={onClose}>{t('importResult.close')}</button>
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

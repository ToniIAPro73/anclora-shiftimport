import { useCallback, useEffect, useRef, useState } from 'react';
import {
  confirmImportReversion, previewImportReversion, type ReversionPlan, type ReversionResult,
} from '../../lib/remote';
import { ApiError } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';
import './ReversionPreviewModal.css';

interface ReversionPreviewModalProps {
  isOpen: boolean;
  importIds: string[];
  onClose: () => void;
  /** The operation completed (also when the confirmation was an idempotent replay). */
  onReverted: (result: ReversionResult) => void;
}

const BLOCKER_KEYS: Record<string, string> = {
  LATER_MANUAL_CHANGE_UNSAFE: 'reversion.blockers.laterManual',
  PUBLISHED_DEPENDENCY: 'reversion.blockers.published',
  LEGACY_PROVENANCE_INSUFFICIENT: 'reversion.blockers.legacy',
  ALREADY_REVERTED: 'reversion.blockers.alreadyReverted',
  NO_REVERSIBLE_EFFECTS: 'reversion.blockers.noEffects',
  REVERSION_DEPENDENCY_CYCLE: 'reversion.blockers.cycle',
};

const formatDate = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-GB');

/**
 * Reversion preview: shows the SCOPE (what will be reverted, which related imports are included because they depend on the selection,
 * what is kept) — never the order, which the server computes. READY previews can be confirmed; a stale state is recomputed.
 */
export function ReversionPreviewModal({ isOpen, importIds, onClose, onReverted }: ReversionPreviewModalProps) {
  const { t, locale } = useI18n();
  const [plan, setPlan] = useState<ReversionPlan | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'executing'>('loading');
  const [notice, setNotice] = useState<'stale' | 'failed' | null>(null);
  const [reason, setReason] = useState('');
  const requestRef = useRef(0);

  const load = useCallback(async (afterStale = false) => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setStatus('loading');
    setNotice(afterStale ? 'stale' : null);
    try {
      const next = await previewImportReversion(importIds);
      if (requestRef.current !== request) return;
      setPlan(next);
      setStatus('ready');
    } catch {
      if (requestRef.current !== request) return;
      setPlan(null);
      setStatus('error');
    }
  }, [importIds]);

  useEffect(() => {
    if (isOpen) { setReason(''); void load(); }
    return () => { requestRef.current += 1; };
  }, [isOpen, load]);

  if (!isOpen) return null;

  const confirm = async () => {
    if (!plan || plan.status !== 'READY' || status === 'executing') return;
    setStatus('executing');
    try {
      const result = await confirmImportReversion({ importIds, planHash: plan.planHash, reason: reason.trim() || undefined });
      onReverted(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REVERSION_PLAN_STALE') {
        await load(true); // never execute an out-of-date plan: recompute and show it again
        return;
      }
      setNotice('failed');
      setStatus('ready');
    }
  };

  const impact = plan?.impact;
  const related = plan?.imports.filter((item) => item.autoIncluded) ?? [];
  const requested = plan?.imports.filter((item) => item.requestedByUser) ?? [];
  const shiftsAffected = (impact?.shiftsRemoved ?? 0) + (impact?.shiftsRestored ?? 0);
  const planning = (impact?.assignmentsRemoved ?? 0) + (impact?.assignmentsRestored ?? 0) + (impact?.draftVersionsRemoved ?? 0) + (impact?.planRevisionsReverted ?? 0);
  const annotations = (impact?.dcfRemoved ?? 0) + (impact?.commentsRemoved ?? 0);
  const blocked = plan?.status === 'BLOCKED';
  const lines: Array<[string, number]> = impact ? [
    ['reversion.lineShiftsRemoved', impact.shiftsRemoved],
    ['reversion.lineShiftsRestored', impact.shiftsRestored],
    ['reversion.lineRevisions', impact.planRevisionsReverted],
    ['reversion.lineAssignmentsRemoved', impact.assignmentsRemoved],
    ['reversion.lineAssignmentsRestored', impact.assignmentsRestored],
    ['reversion.lineDrafts', impact.draftVersionsRemoved],
    ['reversion.lineDcf', impact.dcfRemoved],
    ['reversion.lineComments', impact.commentsRemoved],
    ['reversion.lineReview', impact.reviewCleared],
  ] : [];

  return (
    <ModalShell
      isOpen
      onClose={status === 'executing' ? () => undefined : onClose}
      title={t('reversion.title')}
      closeAriaLabel={t('common.close')}
      maxWidth="820px"
      width="min(96vw, 820px)"
    >
      <div className="reversion" data-testid="reversion-preview">
        <p className="reversion__subtitle">{t('reversion.subtitle')}</p>

        {status === 'loading' && <p role="status" className="reversion__muted">{t('reversion.loading')}</p>}
        {status === 'error' && (
          <div role="alert" className="reversion__muted">
            <p>{t('reversion.error')}</p>
            <button type="button" className="btn-outline" onClick={() => void load()}>{t('reversion.retry')}</button>
          </div>
        )}
        {notice === 'stale' && <p role="status" className="reversion__notice" data-testid="reversion-stale">{t('reversion.stale')}</p>}
        {notice === 'failed' && <p role="alert" className="reversion__notice reversion__notice--error">{t('reversion.failed')}</p>}

        {plan && status !== 'loading' && status !== 'error' && (
          <>
            <div className="reversion__metrics" data-testid="reversion-metrics">
              <div className="reversion__metric"><strong>{requested.length}</strong><span>{t('reversion.metricRequested')}</span></div>
              <div className="reversion__metric"><strong>{related.length}</strong><span>{t('reversion.metricRelated')}</span></div>
              <div className="reversion__metric"><strong>{shiftsAffected}</strong><span>{t('reversion.metricShifts')}</span></div>
              <div className="reversion__metric"><strong>{planning}</strong><span>{t('reversion.metricPlanning')}</span></div>
              <div className="reversion__metric"><strong>{annotations}</strong><span>{t('reversion.metricAnnotations')}</span></div>
            </div>

            {blocked ? (
              <section className="reversion__panel reversion__panel--blocked" data-testid="reversion-blocked">
                <h4>{t('reversion.blockedTitle')}</h4>
                <ul>
                  {plan.blockers.map((blocker, index) => (
                    <li key={`${blocker.code}-${index}`}>{t(BLOCKER_KEYS[blocker.code] ?? 'reversion.blockers.generic', { count: blocker.count })}</li>
                  ))}
                </ul>
                <p className="reversion__muted">{t('reversion.blockedHint')}</p>
              </section>
            ) : (
              <div className="reversion__columns">
                <section className="reversion__panel">
                  <h4>{t('reversion.willRevert')}</h4>
                  <ul data-testid="reversion-lines">
                    {lines.filter(([, count]) => count > 0).map(([key, count]) => <li key={key}>{t(key, { count })}</li>)}
                    {lines.every(([, count]) => count === 0) && <li>{t('reversion.lineNothing')}</li>}
                  </ul>
                </section>
                <section className="reversion__panel">
                  <h4>{t('reversion.willKeep')}</h4>
                  <ul>
                    <li>{t('reversion.keepManual')}</li>
                    <li>{t('reversion.keepIdentity')}</li>
                    {(impact?.dcfPreserved ?? 0) > 0 && <li data-testid="reversion-keep-dcf">{t('reversion.keepDcf', { count: impact?.dcfPreserved ?? 0 })}</li>}
                  </ul>
                </section>
              </div>
            )}

            {related.length > 0 && (
              <section className="reversion__panel reversion__panel--related" data-testid="reversion-related">
                <h4>{t('reversion.relatedTitle')}</h4>
                <p className="reversion__muted">{t('reversion.relatedBody', { count: related.length })}</p>
                <ul>
                  {related.map((item) => (
                    <li key={item.id}>{item.fileName || t('reversion.unnamed')} · {formatDate(item.createdAt, locale)}</li>
                  ))}
                </ul>
              </section>
            )}

            {plan.order.length > 1 && (
              <details className="reversion__details">
                <summary>{t('reversion.technicalDetails')}</summary>
                <p data-testid="reversion-order">
                  {plan.order.map((id, index) => {
                    const item = plan.imports.find((entry) => entry.id === id);
                    return <span key={id}>{index > 0 ? ' → ' : ''}{item?.fileName || formatDate(item?.createdAt ?? '', locale)}</span>;
                  })}
                </p>
              </details>
            )}

            {!blocked && (
              <label className="reversion__reason">
                <span>{t('reversion.reasonLabel')}</span>
                <input className="modal-input" type="text" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
            )}
          </>
        )}

        <div className="reversion__footer">
          <button type="button" className="btn-outline" onClick={onClose} disabled={status === 'executing'}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn-gold"
            data-testid="reversion-confirm"
            disabled={!plan || blocked || status !== 'ready'}
            onClick={() => void confirm()}
          >
            {status === 'executing' ? t('reversion.executing') : t('reversion.confirm')}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

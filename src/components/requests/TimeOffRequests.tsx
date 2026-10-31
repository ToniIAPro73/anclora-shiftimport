import { Ban, CalendarDays, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  cancelRemoteTimeOffRequest,
  loadRemoteTimeOffRequests,
  TimeOffRequest,
  TimeOffSummary,
} from '../../lib/remote';
import { getOperationalDate } from '../../lib/operational-date';
import { ApiError } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { TimeOffRequestForm } from './TimeOffRequestForm';
import './TimeOffRequests.css';

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; requests: TimeOffRequest[]; summary: TimeOffSummary }
  | { status: 'error' }
  | { status: 'unavailable' };

const STATUS_KEY = {
  PENDING: 'timeOff.statusPending',
  APPROVED: 'timeOff.statusApproved',
  REJECTED: 'timeOff.statusRejected',
  CANCELLED: 'timeOff.statusCancelled',
} as const;

const HISTORY_KEY = {
  CREATED: 'timeOff.historyCreated',
  APPROVED: 'timeOff.historyApproved',
  REJECTED: 'timeOff.historyRejected',
  CANCELLED: 'timeOff.historyCancelled',
} as const;

/**
 * "Vacaciones y ausencias" for the employee portal (F2-M05): own requests, year selector, summary, new request, cancel.
 * Mounted only behind `VITE_TIME_OFF_ENABLED`; a 404 from the server (server flag off) hides the whole section.
 */
export function TimeOffRequests() {
  const { t, locale } = useI18n();
  const currentYear = Number(getOperationalDate().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [formOpen, setFormOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'status' | 'alert'; text: string } | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { requests, summary } = await loadRemoteTimeOffRequests({ year });
      setState({ status: 'ready', requests, summary });
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? { status: 'unavailable' } : { status: 'error' });
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${iso}T00:00:00Z`));

  const handleCancel = async (request: TimeOffRequest) => {
    if (cancellingId) return;
    setCancellingId(request.id);
    setFeedback(null);
    try {
      const cancelled = await cancelRemoteTimeOffRequest(request.id);
      setState((current) => current.status === 'ready'
        ? { ...current, requests: current.requests.map((r) => (r.id === cancelled.id ? cancelled : r)) }
        : current);
      setFeedback({ tone: 'status', text: t('timeOff.cancelled') });
      void load();
    } catch (error) {
      const notPending = error instanceof ApiError && error.code === 'TIME_OFF_NOT_PENDING';
      setFeedback({ tone: 'alert', text: notPending ? t('timeOff.cancelNotPending') : t('timeOff.cancelError') });
      if (notPending) void load();
    } finally {
      setCancellingId(null);
    }
  };

  if (state.status === 'unavailable') return null;

  return (
    <section className="time-off" aria-labelledby="time-off-title" data-testid="time-off-section">
      <div className="time-off__heading">
        <div>
          <p className="time-off__eyebrow">{t('timeOff.eyebrow')}</p>
          <h2 id="time-off-title"><CalendarDays size={20} aria-hidden="true" />{t('timeOff.title')}</h2>
          <p className="time-off__description">{t('timeOff.description')}</p>
        </div>
        {!formOpen && (
          <button type="button" className="time-off__new" onClick={() => setFormOpen(true)} data-testid="time-off-new">
            <Plus size={15} aria-hidden="true" />
            {t('timeOff.newRequest')}
          </button>
        )}
      </div>

      {formOpen && (
        <TimeOffRequestForm
          onClose={() => setFormOpen(false)}
          onCreated={() => { setFormOpen(false); setFeedback({ tone: 'status', text: t('timeOff.sent') }); void load(); }}
        />
      )}

      {feedback && (
        <p className={`time-off__feedback time-off__feedback--${feedback.tone}`} role={feedback.tone} data-testid="time-off-feedback">{feedback.text}</p>
      )}

      <div className="time-off__year">
        <label htmlFor="time-off-year">{t('timeOff.yearLabel')}</label>
        <select id="time-off-year" className="field-select" value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {[currentYear - 1, currentYear, currentYear + 1].map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      {state.status === 'loading' && <p className="time-off__state" role="status" aria-busy="true">{t('timeOff.listLoading')}</p>}
      {state.status === 'error' && (
        <div className="time-off__state time-off__state--error" role="alert" data-testid="time-off-list-error">
          <p>{t('timeOff.listError')}</p>
          <button type="button" onClick={() => void load()}><RotateCcw size={15} aria-hidden="true" />{t('timeOff.retry')}</button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <dl className="time-off__summary" data-testid="time-off-summary">
            <div><dt>{t('timeOff.summaryApproved', { year })}</dt><dd>{state.summary.approvedDaysInYear}</dd></div>
            <div><dt>{t('timeOff.summaryPending')}</dt><dd>{state.summary.pendingDays}</dd></div>
          </dl>
          {state.requests.length === 0 ? (
            <p className="time-off__state" data-testid="time-off-empty">{t('timeOff.listEmpty')}</p>
          ) : (
            <ol className="time-off__list" aria-label={t('timeOff.listTitle')}>
              {state.requests.map((request) => (
                <li key={request.id} className="time-off__item" data-testid="time-off-item" data-status={request.status}>
                  <div className="time-off__item-head">
                    <strong>{t('timeOff.range', { start: formatDate(request.startDate), end: formatDate(request.endDate) })}</strong>
                    <span className={`time-off__badge time-off__badge--${request.status.toLowerCase()}`}>{t(STATUS_KEY[request.status])}</span>
                  </div>
                  <p className="time-off__days">{t('timeOff.days', { count: request.requestedDays })}</p>
                  {request.comment && <p className="time-off__comment">{request.comment}</p>}
                  {request.status === 'APPROVED' && request.appliedDays != null && request.appliedStartDate && (
                    <p className="time-off__applied" data-testid="time-off-applied">
                      {t('timeOff.applied', { applied: request.appliedDays, requested: request.requestedDays, start: formatDate(request.appliedStartDate) })}
                      {(request.skippedPastDays ?? 0) > 0 && <> {t('timeOff.skippedPast', { count: request.skippedPastDays ?? 0 })}</>}
                    </p>
                  )}
                  {request.status === 'REJECTED' && request.rejectionReason && (
                    <p className="time-off__rejection">{t('timeOff.rejectionReason', { reason: request.rejectionReason })}</p>
                  )}
                  <details className="time-off__history">
                    <summary>{t('timeOff.historyTitle')}</summary>
                    <ol>
                      {request.history.map((event, index) => (
                        <li key={`${event.type}-${index}`}>
                          {t(HISTORY_KEY[event.type])}
                          {event.byName ? ` ${t('timeOff.historyBy', { name: event.byName })}` : ''}
                          {event.at ? ` · ${formatDate(event.at.slice(0, 10))}` : ''}
                        </li>
                      ))}
                    </ol>
                  </details>
                  {request.status === 'PENDING' && (
                    <button
                      type="button"
                      className="time-off__cancel"
                      onClick={() => void handleCancel(request)}
                      disabled={cancellingId !== null}
                      aria-busy={cancellingId === request.id}
                      data-testid="time-off-cancel"
                    >
                      <Ban size={15} aria-hidden="true" />
                      {cancellingId === request.id ? t('timeOff.cancelling') : t('timeOff.cancel')}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

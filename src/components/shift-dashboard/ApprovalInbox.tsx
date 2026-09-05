import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApprovalRequest, approveRemoteApprovalRequest, listRemoteApprovalRequests, rejectRemoteApprovalRequest } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

type InboxState =
  | { status: 'loading'; requests: ApprovalRequest[] }
  | { status: 'ready'; requests: ApprovalRequest[] }
  | { status: 'error'; requests: ApprovalRequest[] };

export function ApprovalInbox() {
  const { t } = useI18n();
  const [state, setState] = useState<InboxState>({ status: 'loading', requests: [] });
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionError, setRejectionError] = useState('');

  const load = useCallback(async () => {
    setState((current) => ({ status: 'loading', requests: current.requests }));
    try {
      const requests = await listRemoteApprovalRequests();
      setState({ status: 'ready', requests });
    } catch {
      setState((current) => ({ status: 'error', requests: current.requests }));
    }
  }, []);

  const handleApprove = async (request: ApprovalRequest) => {
    if (approvingId || rejectingRequestId) return;
    setApprovingId(request.id);
    setApprovalError('');
    try {
      await approveRemoteApprovalRequest(request.id);
      setState((current) => ({
        status: current.status === 'error' ? 'ready' : current.status,
        requests: current.requests.filter((item) => item.id !== request.id),
      }));
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number(error.status)
        : 0;
      setApprovalError(status === 409
        ? t('approvalInbox.conflict')
        : t('approvalInbox.approveError'));
      if (status === 409) void load();
    } finally {
      setApprovingId(null);
    }
  };

  const openRejectForm = (requestId: string) => {
    if (approvingId || rejectingRequestId) return;
    setRejectingId(requestId);
    setRejectionReason('');
    setRejectionError('');
  };

  const closeRejectForm = () => {
    if (rejectingRequestId) return;
    setRejectingId(null);
    setRejectionReason('');
    setRejectionError('');
  };

  const handleReject = async (request: ApprovalRequest) => {
    const trimmedReason = rejectionReason.trim();
    if (!trimmedReason) {
      setRejectionError(t('approvalInbox.reasonRequired'));
      return;
    }
    if (approvingId || rejectingRequestId) return;
    setRejectingRequestId(request.id);
    setRejectionError('');
    try {
      await rejectRemoteApprovalRequest(request.id, trimmedReason);
      setState((current) => ({
        status: current.status === 'error' ? 'ready' : current.status,
        requests: current.requests.filter((item) => item.id !== request.id),
      }));
      setRejectingId(null);
      setRejectionReason('');
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number(error.status)
        : 0;
      setRejectionError(status === 409
        ? t('approvalInbox.conflict')
        : status === 400
          ? t('approvalInbox.rejectError')
          : t('approvalInbox.rejectError'));
      if (status === 409) void load();
    } finally {
      setRejectingRequestId(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const countLabel = state.requests.length === 1
    ? t('approvalInbox.countOne')
    : t('approvalInbox.count', { count: state.requests.length });

  return (
    <section className="approval-inbox" aria-labelledby="approval-inbox-title" data-testid="approval-inbox">
      <div className="approval-inbox__heading">
        <div>
          <p className="approval-inbox__eyebrow">{t('approvalInbox.eyebrow')}</p>
          <h2 id="approval-inbox-title">{t('approvalInbox.title')}</h2>
        </div>
        <span className="approval-inbox__count" aria-live="polite" aria-label={countLabel}>{state.requests.length}</span>
      </div>
      {approvalError && <p className="approval-inbox__feedback" role="alert">{approvalError}</p>}

      {state.status === 'loading' && (
        <p className="approval-inbox__state" role="status" aria-busy="true" data-testid="approval-inbox-loading">
          {t('approvalInbox.loading')}
        </p>
      )}

      {state.status === 'error' && (
        <div className="approval-inbox__state approval-inbox__state--error" role="alert" data-testid="approval-inbox-error">
          <h3>{t('approvalInbox.errorTitle')}</h3>
          <p>{t('approvalInbox.errorDescription')}</p>
          <button type="button" onClick={() => void load()}>
            <RotateCcw size={15} aria-hidden="true" />
            {t('approvalInbox.retry')}
          </button>
        </div>
      )}

      {state.status === 'ready' && state.requests.length === 0 && (
        <div className="approval-inbox__state" data-testid="approval-inbox-empty">
          <h3>{t('approvalInbox.emptyTitle')}</h3>
          <p>{t('approvalInbox.emptyDescription')}</p>
        </div>
      )}

      {state.status === 'ready' && state.requests.length > 0 && (
        <ol className="approval-inbox__list" aria-label={t('approvalInbox.title')}>
          {state.requests.map((request) => {
            const requestType = request.requestType === 'TIME_CHANGE'
              ? t('approvalInbox.timeChange')
              : t('approvalInbox.other');
            return (
              <li className="approval-inbox__item" key={request.id}>
                <article>
                  <div className="approval-inbox__item-head">
                    <div>
                      <p className="approval-inbox__item-type">{requestType}</p>
                      <time dateTime={request.createdAt}>{request.createdAt}</time>
                    </div>
                    <span className="approval-inbox__badge" aria-label={t('approvalInbox.statusPending')}>
                      {t('approvalInbox.statusPending')}
                    </span>
                  </div>
                  <dl className="approval-inbox__facts">
                    <div><dt>{t('approvalInbox.requestedBy')}</dt><dd>{request.employeeName}</dd></div>
                    <div><dt>{t('approvalInbox.area')}</dt><dd>{request.areaName || t('approvalInbox.noArea')}</dd></div>
                    <div><dt>{t('approvalInbox.shift')}</dt><dd>{request.shiftDate} · {request.shiftStartTime} — {request.shiftEndTime}</dd></div>
                    <div><dt>{t('approvalInbox.reason')}</dt><dd>{request.reason}</dd></div>
                  </dl>
                  <p className="approval-inbox__location">{request.shiftLocation || t('approvalInbox.noLocation')}</p>
                  <div className="approval-inbox__actions">
                    <button
                      type="button"
                      className="approval-inbox__approve"
                      disabled={Boolean(approvingId || rejectingRequestId)}
                      onClick={() => void handleApprove(request)}
                    >
                      {approvingId === request.id ? t('approvalInbox.approving') : t('approvalInbox.approve')}
                    </button>
                    <button
                      type="button"
                      className="approval-inbox__reject-trigger"
                      disabled={Boolean(approvingId || rejectingRequestId)}
                      onClick={() => openRejectForm(request.id)}
                    >
                      {t('approvalInbox.reject')}
                    </button>
                  </div>
                  {rejectingId === request.id && (
                    <form className="approval-inbox__reject-form" onSubmit={(event) => { event.preventDefault(); void handleReject(request); }}>
                      <label htmlFor={`approval-rejection-${request.id}`}>{t('approvalInbox.rejectionReasonLabel')}</label>
                      <textarea
                        id={`approval-rejection-${request.id}`}
                        value={rejectionReason}
                        onChange={(event) => { setRejectionReason(event.target.value); setRejectionError(''); }}
                        placeholder={t('approvalInbox.rejectionReasonPlaceholder')}
                        maxLength={2000}
                        rows={3}
                        required
                        aria-describedby={rejectionError ? `approval-rejection-error-${request.id}` : undefined}
                        autoFocus
                      />
                      {rejectionError && <p id={`approval-rejection-error-${request.id}`} className="approval-inbox__feedback" role="alert">{rejectionError}</p>}
                      <div className="approval-inbox__reject-actions">
                        <button type="submit" className="approval-inbox__approve" disabled={!rejectionReason.trim() || Boolean(rejectingRequestId)}>
                          {rejectingRequestId === request.id ? t('approvalInbox.rejecting') : t('approvalInbox.confirmReject')}
                        </button>
                        <button type="button" className="approval-inbox__reject-cancel" disabled={Boolean(rejectingRequestId)} onClick={closeRejectForm}>
                          {t('approvalInbox.cancelReject')}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

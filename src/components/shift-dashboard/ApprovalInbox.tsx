import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApprovalRequest, listRemoteApprovalRequests } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

type InboxState =
  | { status: 'loading'; requests: ApprovalRequest[] }
  | { status: 'ready'; requests: ApprovalRequest[] }
  | { status: 'error'; requests: ApprovalRequest[] };

export function ApprovalInbox() {
  const { t } = useI18n();
  const [state, setState] = useState<InboxState>({ status: 'loading', requests: [] });

  const load = useCallback(async () => {
    setState((current) => ({ status: 'loading', requests: current.requests }));
    try {
      const requests = await listRemoteApprovalRequests();
      setState({ status: 'ready', requests });
    } catch {
      setState((current) => ({ status: 'error', requests: current.requests }));
    }
  }, []);

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
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

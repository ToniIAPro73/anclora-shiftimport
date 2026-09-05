import { ArrowRight, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChangeRequest, ChangeRequestStatus, loadRemoteChangeRequests } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

type RequestStatusState =
  | { status: 'loading'; requests: ChangeRequest[] }
  | { status: 'ready'; requests: ChangeRequest[] }
  | { status: 'error'; requests: ChangeRequest[] };

type StatusFilter = 'ALL' | ChangeRequestStatus;

interface RequestStatusProps {
  onSelectShift?: (shiftId: string) => void;
}

const STATUS_OPTIONS: StatusFilter[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export function RequestStatus({ onSelectShift }: RequestStatusProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [state, setState] = useState<RequestStatusState>({ status: 'loading', requests: [] });

  const load = useCallback(async () => {
    setState((current) => ({ status: 'loading', requests: current.requests }));
    try {
      const requests = await loadRemoteChangeRequests();
      setState({ status: 'ready', requests });
    } catch {
      setState((current) => ({ status: 'error', requests: current.requests }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRequests = useMemo(
    () => filter === 'ALL' ? state.requests : state.requests.filter((request) => request.status === filter),
    [filter, state.requests],
  );

  const statusLabel = (status: ChangeRequestStatus): string => {
    const key = status.toLowerCase() as 'pending' | 'approved' | 'rejected' | 'cancelled';
    return t(`employeeRequestStatus.${key}`);
  };

  return (
    <section className="employee-request-status" aria-labelledby="employee-request-status-title" data-testid="request-status">
      <div className="employee-request-status__heading">
        <p className="employee-request-status__eyebrow">{t('employeeRequestStatus.eyebrow')}</p>
        <h2 id="employee-request-status-title">{t('employeeRequestStatus.title')}</h2>
        <p>{t('employeeRequestStatus.description')}</p>
      </div>

      <div className="employee-request-status__filter">
        <label htmlFor="employee-request-status-filter">{t('employeeRequestStatus.filterLabel')}</label>
        <select
          id="employee-request-status-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'ALL' ? t('employeeRequestStatus.all') : statusLabel(option)}
            </option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && (
        <p className="employee-request-status__state" role="status" aria-busy="true" data-testid="request-status-loading">
          {t('employeeRequestStatus.loading')}
        </p>
      )}

      {state.status === 'error' && (
        <div className="employee-request-status__state employee-request-status__state--error" role="alert" data-testid="request-status-error">
          <h3>{t('employeeRequestStatus.errorTitle')}</h3>
          <p>{t('employeeRequestStatus.errorDescription')}</p>
          <button type="button" onClick={() => void load()}>
            <RotateCcw size={15} aria-hidden="true" />
            {t('employeeRequestStatus.retry')}
          </button>
        </div>
      )}

      {state.status !== 'loading' && state.status !== 'error' && visibleRequests.length === 0 && (
        <div className="employee-request-status__state" data-testid="request-status-empty">
          <h3>{t('employeeRequestStatus.emptyTitle')}</h3>
          <p>{t('employeeRequestStatus.emptyDescription')}</p>
        </div>
      )}

      {state.status === 'ready' && visibleRequests.length > 0 && (
        <ol className="employee-request-status__list" aria-label={t('employeeRequestStatus.title')}>
          {visibleRequests.map((request) => {
            const readableStatus = statusLabel(request.status);
            const requestType = request.requestType === 'TIME_CHANGE'
              ? t('employeeRequestStatus.requestTypeTimeChange')
              : t('employeeRequestStatus.requestTypeOther');
            return (
              <li className="employee-request-status__item" key={request.id}>
                <div className="employee-request-status__item-head">
                  <div>
                    <p className="employee-request-status__item-type">{requestType}</p>
                    <time dateTime={request.createdAt}>{request.createdAt}</time>
                  </div>
                  <span
                    className={`employee-request-status__badge employee-request-status__badge--${request.status.toLowerCase()}`}
                    aria-label={t('employeeRequestStatus.statusLabel', { status: readableStatus })}
                  >
                    {readableStatus}
                  </span>
                </div>
                <p className="employee-request-status__item-label">{t('employeeRequestStatus.reason')}</p>
                <p className="employee-request-status__reason">{request.reason}</p>
                {request.status === 'REJECTED' && request.rejectionReason && (
                  <>
                    <p className="employee-request-status__item-label">{t('employeeRequestStatus.rejectionReason')}</p>
                    <p className="employee-request-status__reason">{request.rejectionReason}</p>
                  </>
                )}
                <div className="employee-request-status__shift">
                  <div>
                    <p className="employee-request-status__item-label">{t('employeeRequestStatus.shift')}</p>
                    <p>
                      {request.shiftDate ?? request.shiftId}
                      {request.shiftStartTime && ` · ${request.shiftStartTime} — ${request.shiftEndTime ?? ''}`}
                    </p>
                    <p className="employee-request-status__location">
                      {request.shiftLocation || t('employeeRequestStatus.noLocation')}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-shift-id={request.shiftId}
                    aria-label={`${t('employeeRequestStatus.openShift')}: ${request.shiftDate ?? request.shiftId}`}
                    onClick={() => onSelectShift?.(request.shiftId)}
                  >
                    <span>{t('employeeRequestStatus.openShift')}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

import { ArrowLeft, ArrowRight, Ban, Calendar, ChevronLeft, ChevronRight, Eye, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelRemoteChangeRequest,
  ChangeRequest,
  ChangeRequestStatus,
  loadRemoteChangeRequests,
  loadRemoteShifts,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { Shift } from '../../lib/types';
import { ChangeRequestForm } from './ChangeRequestForm';
import { ShiftPicker } from './ShiftPicker';
import { formatRequestDateTime } from '../../lib/format-request';

type RequestStatusState =
  | { status: 'loading'; requests: ChangeRequest[] }
  | { status: 'ready'; requests: ChangeRequest[] }
  | { status: 'error'; requests: ChangeRequest[] };

type StatusFilter = 'ALL' | ChangeRequestStatus;

export type RequestView = 'list' | 'create' | 'detail';

interface RequestStatusProps {
  employeeId?: string;
  onSelectShift?: (shiftId: string) => void;
  onNewRequest?: () => void;
  refreshSignal?: number;
  view?: RequestView;
  onViewChange?: (view: RequestView) => void;
  onRefresh?: () => void;
}

const STATUS_OPTIONS: StatusFilter[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const PAGE_SIZE = 5;

export function RequestStatus({
  employeeId,
  onSelectShift,
  onNewRequest,
  refreshSignal = 0,
  view: controlledView,
  onViewChange,
  onRefresh,
}: RequestStatusProps) {
  const { t, locale } = useI18n();
  const [internalView, setInternalView] = useState<RequestView>('list');
  const activeView = controlledView ?? internalView;

  const changeView = (nextView: RequestView) => {
    if (onViewChange) {
      onViewChange(nextView);
    } else {
      setInternalView(nextView);
    }
  };

  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<RequestStatusState>({ status: 'loading', requests: [] });
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);

  // Shifts for 'create' subview
  const [shiftsState, setShiftsState] = useState<{ status: 'loading' | 'ready' | 'error'; shifts: Shift[] }>({
    status: 'loading',
    shifts: [],
  });
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState('');

  const loadRequests = useCallback(async () => {
    setState((current) => ({ status: 'loading', requests: current.requests }));
    try {
      const requests = await loadRemoteChangeRequests();
      setState({ status: 'ready', requests });
    } catch {
      setState((current) => ({ status: 'error', requests: current.requests }));
    }
  }, []);

  const loadShifts = useCallback(async () => {
    if (!employeeId) return;
    setShiftsState({ status: 'loading', shifts: [] });
    try {
      const shifts = await loadRemoteShifts(employeeId);
      setShiftsState({ status: 'ready', shifts });
      setSelectedShiftId((current) => (current && shifts.some((s) => s.id === current) ? current : shifts[0]?.id ?? ''));
    } catch {
      setShiftsState({ status: 'error', shifts: [] });
      setSelectedShiftId('');
    }
  }, [employeeId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests, refreshSignal]);

  useEffect(() => {
    if (activeView === 'create' && employeeId) {
      void loadShifts();
    }
  }, [activeView, employeeId, loadShifts]);

  const visibleRequests = useMemo(
    () => (filter === 'ALL' ? state.requests : state.requests.filter((request) => request.status === filter)),
    [filter, state.requests],
  );

  const totalPages = Math.max(1, Math.ceil(visibleRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRequests.slice(start, start + PAGE_SIZE);
  }, [visibleRequests, currentPage]);

  const statusLabel = (status: ChangeRequestStatus): string => {
    const key = status.toLowerCase() as 'pending' | 'approved' | 'rejected' | 'cancelled';
    return t(`employeeRequestStatus.${key}`);
  };

  const handleOpenCreate = () => {
    if (employeeId) {
      changeView('create');
    } else if (onNewRequest) {
      onNewRequest();
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (isCancelling) return;
    setIsCancelling(true);
    setCancelFeedback('');
    try {
      const cancelled = await cancelRemoteChangeRequest(requestId);
      setState((current) => ({
        ...current,
        requests: current.requests.map((r) => (r.id === requestId ? cancelled : r)),
      }));
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(cancelled);
      }
      onRefresh?.();
      setCancelFeedback(t('employeeChangeRequest.cancelled'));
    } catch {
      setCancelFeedback(t('employeeChangeRequest.cancelError'));
    } finally {
      setIsCancelling(false);
    }
  };

  const selectedShift = useMemo(
    () => shiftsState.shifts.find((s) => s.id === selectedShiftId) ?? null,
    [selectedShiftId, shiftsState.shifts],
  );

  // --------------------------------------------------------------------------
  // SUBVIEW: CREATE NEW REQUEST
  // --------------------------------------------------------------------------
  if (activeView === 'create') {
    return (
      <section className="employee-request-status employee-request-status--subview" data-testid="request-status-create" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <button
            type="button"
            className="employee-request-status__back-btn"
            onClick={() => changeView('list')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: 'var(--panel-muted-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={15} />
            <span>Volver a solicitudes</span>
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
          <div style={{ marginBottom: '16px' }}>
            <p className="employee-change-request__eyebrow">{t('employeeChangeRequest.eyebrow')}</p>
            <h3 style={{ margin: '4px 0 8px', fontSize: '1.25rem', fontWeight: 800 }}>{t('employeePortal.newRequest')}</h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>{t('employeePortal.newRequestDescription')}</p>
          </div>

          {shiftsState.status === 'loading' && (
            <p role="status" aria-busy="true" style={{ padding: '20px', color: 'var(--text-muted)' }}>{t('employeePortal.loadingOwnShifts')}</p>
          )}

          {shiftsState.status === 'error' && (
            <div role="alert" style={{ padding: '16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: '0.86rem' }}>{t('employeePortal.ownShiftsError')}</p>
              <button type="button" onClick={() => void loadShifts()} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                {t('employeeRequestStatus.retry')}
              </button>
            </div>
          )}

          {shiftsState.status === 'ready' && shiftsState.shifts.length === 0 && (
            <p className="employee-new-request__empty" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('employeePortal.noOwnShiftsForRequest')}</p>
          )}

          {shiftsState.status === 'ready' && shiftsState.shifts.length > 0 && selectedShift && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="employee-new-request-shift" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  {t('employeePortal.requestShiftLabel')}
                </label>
                <ShiftPicker
                  id="employee-new-request-shift"
                  shifts={shiftsState.shifts}
                  selectedShiftId={selectedShiftId}
                  onSelectShift={setSelectedShiftId}
                />
              </div>

              <ChangeRequestForm
                key={selectedShift.id}
                shiftId={selectedShift.id}
                shiftStartTime={selectedShift.startTime}
                shiftEndTime={selectedShift.endTime}
                onCreated={() => {
                  onRefresh?.();
                  void loadRequests();
                  changeView('list');
                }}
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  // --------------------------------------------------------------------------
  // SUBVIEW: REQUEST DETAIL
  // --------------------------------------------------------------------------
  if (activeView === 'detail' && selectedRequest) {
    const readableStatus = statusLabel(selectedRequest.status);
    const requestType = selectedRequest.requestType === 'TIME_CHANGE'
      ? t('employeeRequestStatus.requestTypeTimeChange')
      : t('employeeRequestStatus.requestTypeOther');

    return (
      <section className="employee-request-status employee-request-status--subview" data-testid="request-status-detail" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <button
            type="button"
            className="employee-request-status__back-btn"
            onClick={() => changeView('list')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: 'var(--panel-muted-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={15} />
            <span>Volver a solicitudes</span>
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
          <div style={{ padding: '20px', borderRadius: '14px', background: 'var(--panel-muted-bg)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <p className="employee-request-status__eyebrow">{t('employeeRequestStatus.eyebrow')}</p>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.15rem', fontWeight: 800 }}>{requestType}</h3>
                <time dateTime={selectedRequest.createdAt} style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                  {formatRequestDateTime(selectedRequest.createdAt, locale)}
                </time>
              </div>
              <span className={`employee-request-status__badge employee-request-status__badge--${selectedRequest.status.toLowerCase()}`}>
                {readableStatus}
              </span>
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
              <p className="employee-request-status__item-label" style={{ margin: '0 0 4px' }}>{t('employeeRequestStatus.reason')}</p>
              <p className="employee-request-status__reason" style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{selectedRequest.reason}</p>
            </div>

            {selectedRequest.status === 'REJECTED' && selectedRequest.rejectionReason && (
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="employee-request-status__item-label" style={{ color: 'var(--color-danger, #ef4444)', margin: '0 0 4px' }}>{t('employeeRequestStatus.rejectionReason')}</p>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{selectedRequest.rejectionReason}</p>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <p className="employee-request-status__item-label" style={{ margin: '0 0 4px' }}>{t('employeeRequestStatus.shift')}</p>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>
                  {selectedRequest.shiftDate ?? selectedRequest.shiftId}
                  {selectedRequest.shiftStartTime && ` · ${selectedRequest.shiftStartTime} — ${selectedRequest.shiftEndTime ?? ''}`}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {selectedRequest.shiftLocation || t('employeeRequestStatus.noLocation')}
                </p>
              </div>

              <button
                type="button"
                className="employee-request-status__shift-btn"
                data-shift-id={selectedRequest.shiftId}
                aria-label={`${t('employeeRequestStatus.openShift')}: ${selectedRequest.shiftDate ?? selectedRequest.shiftId}`}
                onClick={() => onSelectShift?.(selectedRequest.shiftId)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '34px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                <span>{t('employeeRequestStatus.openShift')}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>

            {selectedRequest.status === 'PENDING' && (
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => void handleCancelRequest(selectedRequest.id)}
                  disabled={isCancelling}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '34px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--color-danger, #ef4444)',
                    color: 'var(--color-danger, #ef4444)',
                    fontSize: '0.8rem',
                    cursor: isCancelling ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  <Ban size={15} />
                  <span>{isCancelling ? t('employeeChangeRequest.cancelling') : t('employeeChangeRequest.cancel')}</span>
                </button>
                {cancelFeedback && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{cancelFeedback}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // --------------------------------------------------------------------------
  // SUBVIEW: LIST REQUESTS (MAIN TABLE)
  // --------------------------------------------------------------------------
  return (
    <section className="employee-request-status" aria-labelledby="employee-request-status-title" data-testid="request-status" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <h2 id="employee-request-status-title" className="sr-only">{t('employeeRequestStatus.title')}</h2>
      {/* Pinned Toolbar: Filter on left, New Request CTA on right */}
      <div
        className="employee-request-status__toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '14px',
          flexShrink: 0,
        }}
      >
        <div className="employee-request-status__filter" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <label htmlFor="employee-request-status-filter" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('employeeRequestStatus.filterLabel')}
          </label>
          <select
            id="employee-request-status-filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as StatusFilter);
              setPage(1);
            }}
            style={{
              minHeight: '34px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'var(--panel-muted-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'ALL' ? t('employeeRequestStatus.all') : statusLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="employee-request-status__new"
          onClick={handleOpenCreate}
          data-testid="request-status-new-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            minHeight: '34px',
            padding: '0 14px',
            borderRadius: '8px',
            background: 'var(--color-accent)',
            color: 'var(--background, #0f172a)',
            fontWeight: 700,
            fontSize: '0.82rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          }}
        >
          <Plus size={15} />
          <span>{t('employeeRequestStatus.newRequest')}</span>
        </button>
      </div>

      {/* States */}
      {state.status === 'loading' && (
        <p className="employee-request-status__state" role="status" aria-busy="true" data-testid="request-status-loading">
          {t('employeeRequestStatus.loading')}
        </p>
      )}

      {state.status === 'error' && (
        <div className="employee-request-status__state employee-request-status__state--error" role="alert" data-testid="request-status-error">
          <h3>{t('employeeRequestStatus.errorTitle')}</h3>
          <p>{t('employeeRequestStatus.errorDescription')}</p>
          <button type="button" onClick={() => void loadRequests()}>
            <RotateCcw size={15} aria-hidden="true" />
            {t('employeeRequestStatus.retry')}
          </button>
        </div>
      )}

      {state.status !== 'loading' && state.status !== 'error' && visibleRequests.length === 0 && (
        <div className="employee-request-status__state employee-request-status__state--empty" data-testid="request-status-empty" style={{ textAlign: 'center', padding: '36px 20px', margin: 'auto 0' }}>
          <Calendar size={36} style={{ color: 'var(--text-subtle)', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 700 }}>{t('employeeRequestStatus.emptyTitle')}</h3>
          <p style={{ margin: '0 auto 18px', maxWidth: '42ch', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            {t('employeeRequestStatus.emptyDescription')}
          </p>
          <button
            type="button"
            className="employee-request-status__new"
            onClick={handleOpenCreate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              background: 'var(--color-accent)',
              color: 'var(--background, #0f172a)',
              fontWeight: 700,
              fontSize: '0.82rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Plus size={15} />
            <span>{t('employeeRequestStatus.newRequest')}</span>
          </button>
        </div>
      )}

      {/* Compact Table */}
      {state.status === 'ready' && visibleRequests.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="employee-request-table-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '12px', background: 'var(--panel-muted-bg)' }}>
            <table className="employee-request-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                  <th style={{ padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fecha</th>
                  <th style={{ padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Turno</th>
                  <th style={{ padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tipo / Motivo</th>
                  <th style={{ padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</th>
                  <th style={{ padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRequests.map((req) => {
                  const readableStatus = statusLabel(req.status);
                  const requestType = req.requestType === 'TIME_CHANGE'
                    ? t('employeeRequestStatus.requestTypeTimeChange')
                    : t('employeeRequestStatus.requestTypeOther');

                  return (
                    <tr
                      key={req.id}
                      style={{
                        borderBottom: '1px solid var(--glass-border)',
                        transition: 'background 0.12s ease',
                      }}
                    >
                      {/* Fecha creación */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <time dateTime={req.createdAt} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                          {formatRequestDateTime(req.createdAt, locale)}
                        </time>
                      </td>

                      {/* Turno afectado */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                          {req.shiftDate ?? req.shiftId}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {req.shiftStartTime && req.shiftEndTime ? `${req.shiftStartTime} — ${req.shiftEndTime}` : (locale === 'es' ? 'Libre' : 'Off')}
                          {req.shiftLocation ? ` · ${req.shiftLocation}` : ''}
                        </div>
                      </td>

                      {/* Tipo y Motivo */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', maxWidth: '220px' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                          {requestType}
                        </span>
                        <p className="employee-request-status__reason" style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.reason}
                        </p>
                        {req.status === 'REJECTED' && req.rejectionReason && (
                          <div style={{ marginTop: '4px' }}>
                            <p className="employee-request-status__item-label" style={{ margin: 0, fontSize: '0.68rem', color: 'var(--color-danger, #ef4444)' }}>
                              {t('employeeRequestStatus.rejectionReason')}
                            </p>
                            <p className="employee-request-status__reason" style={{ margin: '1px 0 0', fontSize: '0.74rem', color: 'var(--color-danger, #ef4444)' }}>
                              {req.rejectionReason}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <span
                          className={`employee-request-status__badge employee-request-status__badge--${req.status.toLowerCase()}`}
                          aria-label={t('employeeRequestStatus.statusLabel', { status: readableStatus })}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px' }}
                        >
                          {readableStatus}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="employee-request-status__shift-btn"
                            data-shift-id={req.shiftId}
                            aria-label={`${t('employeeRequestStatus.openShift')}: ${req.shiftDate ?? req.shiftId}`}
                            onClick={() => onSelectShift?.(req.shiftId)}
                            title={t('employeeRequestStatus.openShift')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              minHeight: '28px',
                              padding: '0 8px',
                              borderRadius: '6px',
                              background: 'transparent',
                              border: '1px solid var(--glass-border)',
                              color: 'var(--text-muted)',
                              fontSize: '0.74rem',
                              cursor: 'pointer',
                            }}
                          >
                            <ArrowRight size={13} aria-hidden="true" />
                            <span>{t('employeeRequestStatus.openShift')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRequest(req);
                              changeView('detail');
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              minHeight: '28px',
                              padding: '0 8px',
                              borderRadius: '6px',
                              background: 'transparent',
                              border: '1px solid var(--glass-border)',
                              color: 'var(--text-primary)',
                              fontSize: '0.74rem',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            <Eye size={13} />
                            <span>Ver</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pinned Pagination Controls: ‹ 1 / 3 › */}
          <div
            className="employee-request-pagination"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              paddingTop: '10px',
              marginTop: '10px',
              borderTop: '1px solid var(--glass-border)',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              className="month-nav-button"
              aria-label="Página anterior"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--panel-muted-bg)',
                border: '1px solid var(--glass-border)',
                color: currentPage <= 1 ? 'var(--text-subtle)' : 'var(--text-primary)',
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: '70px', textAlign: 'center', fontWeight: 600 }}>
              ‹ {currentPage} / {totalPages} ›
            </span>
            <button
              type="button"
              className="month-nav-button"
              aria-label="Página siguiente"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--panel-muted-bg)',
                border: '1px solid var(--glass-border)',
                color: currentPage >= totalPages ? 'var(--text-subtle)' : 'var(--text-primary)',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

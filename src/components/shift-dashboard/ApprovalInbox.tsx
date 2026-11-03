import { AlertCircle, AlertTriangle, CalendarRange, Check, RotateCcw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ApprovalItem,
  type ApprovalKind,
  type BulkApproveResponse,
  type TimeOffApprovalItem,
  approveRemoteApprovalRequest,
  bulkApproveRemoteApprovals,
  listRemoteApprovals,
  rejectRemoteApprovalRequest,
} from '../../lib/remote';
import { isTimeOffUiEnabled } from '../../lib/flags';
import { BULK_APPROVE_MAX, bulkSelectable, cannotDecideKey, isDecidable } from '../../lib/approvals';
import { useI18n } from '../../lib/use-i18n';
import './ApprovalInbox.css';

export interface ApprovalInboxProps {
  /** PENDING (default) is the actionable inbox; HISTORY is the read-only team history. */
  mode?: 'PENDING' | 'HISTORY';
  currentEmployeeId?: string | null;
  currentUserId?: string | null;
  /** Active areas for the area filter (omitted ⇒ no area filter). */
  areas?: Array<{ id: string; name: string }>;
  /** Reports the number of loaded pending items so the shell can show the badge. */
  onPendingCountChange?: (count: number) => void;
}

type InboxState =
  | { status: 'loading'; requests: ApprovalItem[] }
  | { status: 'ready'; requests: ApprovalItem[] }
  | { status: 'error'; requests: ApprovalItem[] };

const PAGE_SIZE = 25;

export function ApprovalInbox({ mode = 'PENDING', currentEmployeeId, areas, onPendingCountChange }: ApprovalInboxProps = {}) {
  const { t } = useI18n();
  const timeOffEnabled = isTimeOffUiEnabled();
  const history = mode === 'HISTORY';
  const [state, setState] = useState<InboxState>({ status: 'loading', requests: [] });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [kind, setKind] = useState<ApprovalKind>(timeOffEnabled ? 'ALL' : 'SHIFT_CHANGE');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [areaId, setAreaId] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState('');
  const [approvalNotice, setApprovalNotice] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionError, setRejectionError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkApproveResponse | null>(null);
  // The «Approve selected» button leaves with the selection: hand focus to the result so it never falls back to <body> (outside the dialog).
  useEffect(() => { if (bulkResult) bulkResultRef.current?.focus(); }, [bulkResult]);
  const loadToken = useRef(0);
  const bulkResultRef = useRef<HTMLDivElement>(null);

  const conflictMessage = (error: unknown): string => {
    const details = typeof error === 'object' && error !== null && 'details' in error
      ? error.details
      : null;
    const by = typeof details === 'object' && details !== null && 'by' in details ? details.by : null;
    const at = typeof details === 'object' && details !== null && 'at' in details ? details.at : null;
    return by && at
      ? t('approvalInbox.conflictWithDecision', { by: String(by), at: String(at) })
      : t('approvalInbox.conflict');
  };

  // The search box applies after a short pause; the filters below reload immediately.
  useEffect(() => {
    const handle = window.setTimeout(() => setAppliedSearch(search), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    const token = ++loadToken.current;
    setState((current) => ({ status: 'loading', requests: current.requests }));
    try {
      const page = await listRemoteApprovals({
        kind, status: mode, areaId: areaId || null, q: appliedSearch, limit: PAGE_SIZE,
      });
      if (token !== loadToken.current) return;
      setState({ status: 'ready', requests: page.requests });
      setNextCursor(page.nextCursor);
      setSelected(new Set());
    } catch {
      if (token !== loadToken.current) return;
      setState((current) => ({ status: 'error', requests: current.requests }));
    }
  }, [kind, mode, areaId, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listRemoteApprovals({
        kind, status: mode, areaId: areaId || null, q: appliedSearch, limit: PAGE_SIZE, cursor: nextCursor,
      });
      setState((current) => ({ status: 'ready', requests: [...current.requests, ...page.requests] }));
      setNextCursor(page.nextCursor);
    } catch {
      setApprovalError(t('approvalInbox.loadMoreError'));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!history && state.status === 'ready' && kind === (timeOffEnabled ? 'ALL' : 'SHIFT_CHANGE') && !areaId && !appliedSearch && !nextCursor) {
      onPendingCountChange?.(state.requests.length);
    }
  }, [history, state, kind, areaId, appliedSearch, nextCursor, timeOffEnabled, onPendingCountChange]);

  const isSelfForbiddenError = (error: unknown, status: number): boolean => {
    if (status === 403) return true;
    if (typeof error === 'object' && error !== null) {
      const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
      const message = 'message' in error ? String((error as { message?: unknown }).message) : '';
      if (code === 'self_approval_forbidden' || message.includes('self_approval_forbidden') || message.includes('own request')) {
        return true;
      }
    }
    return false;
  };

  const removeFromList = (id: string) => setState((current) => ({
    status: current.status === 'error' ? 'ready' : current.status,
    requests: current.requests.filter((item) => item.id !== id),
  }));

  const handleApprove = async (request: ApprovalItem) => {
    if (approvingId || rejectingRequestId || bulkBusy) return;
    setApprovingId(request.id);
    setApprovalError('');
    setApprovalNotice('');
    try {
      const outcome = await approveRemoteApprovalRequest(request.id);
      removeFromList(request.id);
      setSelected((current) => { const next = new Set(current); next.delete(request.id); return next; });
      if (request.kind === 'TIME_OFF' && outcome && typeof outcome.materializedDays === 'number') {
        setApprovalNotice(outcome.skippedPastDays
          ? t('approvalInbox.approvedPartial', { name: request.employeeName, applied: outcome.materializedDays, requested: outcome.requestedDays ?? request.requestedDays, skipped: outcome.skippedPastDays })
          : t('approvalInbox.approvedFull', { name: request.employeeName, applied: outcome.materializedDays }));
      }
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number(error.status)
        : 0;
      setApprovalError(
        status === 409
          ? conflictMessage(error)
          : isSelfForbiddenError(error, status)
            ? t('approvalInbox.selfApprovalForbidden')
            : t('approvalInbox.approveError'),
      );
      if (status === 409) void load();
    } finally {
      setApprovingId(null);
    }
  };

  const openRejectForm = (requestId: string) => {
    if (approvingId || rejectingRequestId || bulkBusy) return;
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

  const handleReject = async (request: ApprovalItem) => {
    const trimmedReason = rejectionReason.trim();
    if (!trimmedReason) {
      setRejectionError(t('approvalInbox.reasonRequired'));
      return;
    }
    if (approvingId || rejectingRequestId || bulkBusy) return;
    setRejectingRequestId(request.id);
    setRejectionError('');
    try {
      await rejectRemoteApprovalRequest(request.id, trimmedReason);
      removeFromList(request.id);
      setRejectingId(null);
      setRejectionReason('');
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number(error.status)
        : 0;
      setRejectionError(
        status === 409
          ? conflictMessage(error)
          : isSelfForbiddenError(error, status)
            ? t('approvalInbox.selfApprovalForbidden')
            : t('approvalInbox.rejectError'),
      );
      if (status === 409) void load();
    } finally {
      setRejectingRequestId(null);
    }
  };

  const selectable = useMemo(
    () => (history ? [] : state.requests.filter((item): item is TimeOffApprovalItem => bulkSelectable(item))),
    [history, state.requests],
  );
  const atLimit = selected.size >= BULK_APPROVE_MAX;

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else if (next.size < BULK_APPROVE_MAX) next.add(id);
    return next;
  });
  const allSelected = selectable.length > 0 && selectable.slice(0, BULK_APPROVE_MAX).every((item) => selected.has(item.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.slice(0, BULK_APPROVE_MAX).map((item) => item.id)));

  const handleBulkApprove = async () => {
    if (bulkBusy || selected.size === 0 || approvingId || rejectingRequestId) return;
    setBulkBusy(true);
    setApprovalError('');
    setApprovalNotice('');
    setBulkResult(null);
    try {
      const response = await bulkApproveRemoteApprovals([...selected]);
      setBulkResult(response);
      const approvedIds = new Set(response.results.filter((item) => item.ok).map((item) => item.id));
      setState((current) => ({ status: current.status, requests: current.requests.filter((item) => !approvedIds.has(item.id)) }));
      setSelected(new Set());
      if (response.summary.failed > 0) void load();
    } catch {
      setApprovalError(t('approvalInbox.bulkError'));
    } finally {
      setBulkBusy(false);
    }
  };

  const reasonLabel = (code: string): string => {
    const known = ['self_approval_forbidden', 'NOT_FOUND', 'ALREADY_RESOLVED', 'POLICY', 'FORBIDDEN', 'TIME_OFF_START_PASSED_ALL', 'BULK_KIND_UNSUPPORTED'];
    return known.includes(code) ? t(`approvalInbox.bulkReasons.${code}`) : t('approvalInbox.bulkReasons.ERROR');
  };
  const nameOf = (id: string) => state.requests.find((item) => item.id === id)?.employeeName ?? id.slice(0, 8);

  const countLabel = state.requests.length === 1
    ? t('approvalInbox.countOne')
    : t('approvalInbox.count', { count: state.requests.length });
  const filtered = kind !== (timeOffEnabled ? 'ALL' : 'SHIFT_CHANGE') || Boolean(areaId) || Boolean(appliedSearch);
  const heading = history ? t('approvalInbox.historyTitle') : t('approvalInbox.title');

  const renderTimeOff = (request: TimeOffApprovalItem) => {
    const overlaps = request.overlapping.length;
    return (
      <>
        <dl className="approval-inbox__facts">
          <div><dt>{t('approvalInbox.requestedBy')}</dt><dd>{request.employeeName}</dd></div>
          <div><dt>{t('approvalInbox.area')}</dt><dd>{request.areaName || t('approvalInbox.noArea')}</dd></div>
          <div>
            <dt>{t('approvalInbox.dates')}</dt>
            <dd>{request.startDate} → {request.endDate} · {t(request.requestedDays === 1 ? 'approvalInbox.daysOne' : 'approvalInbox.days', { count: request.requestedDays })}</dd>
          </div>
          {request.comment && <div><dt>{t('approvalInbox.reason')}</dt><dd>{request.comment}</dd></div>}
        </dl>
        {!history && (
          <>
            <p className="approval-inbox__impact" data-testid="time-off-affected">
              <CalendarRange size={14} aria-hidden="true" />
              <span>{t('approvalInbox.affected', { published: request.affectedShifts.published, draft: request.affectedShifts.draft })}</span>
            </p>
            <p
              className={`approval-inbox__overlap approval-inbox__overlap--${overlaps > 0 ? 'warn' : 'clear'}`}
              data-testid="time-off-overlap-badge"
              data-state={overlaps > 0 ? 'overlap' : 'clear'}
            >
              {overlaps > 0 ? <AlertTriangle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              <span>
                {overlaps > 0
                  ? `${t(overlaps === 1 ? 'approvalInbox.overlapOne' : 'approvalInbox.overlap', { count: overlaps })}: ${request.overlapping.map((entry) => `${entry.name} (${entry.startDate} → ${entry.endDate})`).join('; ')}`
                  : t('approvalInbox.overlapNone')}
              </span>
            </p>
            {request.alreadyStarted && (
              <p className="approval-inbox__started" role="note" data-testid="time-off-already-started">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{t('approvalInbox.alreadyStarted', { applied: request.materializableDays, requested: request.requestedDays, from: request.effectiveStartDate, skipped: request.skippedPastDays })}</span>
              </p>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <section className="approval-inbox" aria-labelledby="approval-inbox-title" data-testid="approval-inbox" data-mode={mode}>
      <div className="approval-inbox__heading">
        <div>
          <p className="approval-inbox__eyebrow">{t('approvalInbox.eyebrow')}</p>
          <h2 id="approval-inbox-title">{heading}</h2>
        </div>
        <span className="approval-inbox__count" aria-live="polite" aria-label={countLabel}>{state.requests.length}{nextCursor ? '+' : ''}</span>
      </div>

      <div className="approval-inbox__filters" role="search" aria-label={t('approvalInbox.filters')}>
        {timeOffEnabled && (
          <label className="approval-inbox__filter">
            <span>{t('approvalInbox.kindLabel')}</span>
            <select className="field-select" value={kind} onChange={(event) => setKind(event.target.value as ApprovalKind)} data-testid="approval-filter-kind">
              <option value="ALL">{t('approvalInbox.kindAll')}</option>
              <option value="SHIFT_CHANGE">{t('approvalInbox.kindShiftChange')}</option>
              <option value="TIME_OFF">{t('approvalInbox.kindVacation')}</option>
            </select>
          </label>
        )}
        {areas && areas.length > 0 && (
          <label className="approval-inbox__filter">
            <span>{t('approvalInbox.area')}</span>
            <select className="field-select" value={areaId} onChange={(event) => setAreaId(event.target.value)} data-testid="approval-filter-area">
              <option value="">{t('approvalInbox.areaAll')}</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </label>
        )}
        <label className="approval-inbox__filter approval-inbox__filter--search">
          <span>{t('approvalInbox.searchLabel')}</span>
          <span className="approval-inbox__search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              className="field-input"
              value={search}
              placeholder={t('approvalInbox.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
              data-testid="approval-filter-search"
            />
          </span>
        </label>
      </div>

      {approvalError && <p className="approval-inbox__feedback" role="alert">{approvalError}</p>}
      {approvalNotice && <p className="approval-inbox__notice" role="status" data-testid="approval-notice">{approvalNotice}</p>}

      {bulkResult && (
        <div ref={bulkResultRef} tabIndex={-1} className="approval-inbox__bulk-result" role="status" data-testid="approval-bulk-result">
          <p><strong>{t('approvalInbox.bulkSummary', { approved: bulkResult.summary.approved, failed: bulkResult.summary.failed })}</strong></p>
          {bulkResult.summary.failed > 0 && (
            <ul>
              {bulkResult.results.filter((item) => !item.ok).map((item) => (
                <li key={item.id} data-testid={`approval-bulk-failure-${item.id}`}>
                  <X size={13} aria-hidden="true" />
                  <span>{t('approvalInbox.bulkFailure', { name: nameOf(item.id), reason: reasonLabel(item.ok ? '' : item.code) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          <h3>{filtered ? t('approvalInbox.emptyFilteredTitle') : history ? t('approvalInbox.emptyHistoryTitle') : t('approvalInbox.emptyTitle')}</h3>
          <p>{filtered ? t('approvalInbox.emptyFilteredDescription') : history ? t('approvalInbox.emptyHistoryDescription') : t('approvalInbox.emptyDescription')}</p>
        </div>
      )}

      {state.status === 'ready' && !history && selectable.length > 0 && (
        <div className="approval-inbox__bulk-bar" data-testid="approval-bulk-bar">
          <label className="approval-inbox__check">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={bulkBusy} data-testid="approval-select-all" />
            <span>{t('approvalInbox.selectAll', { count: Math.min(selectable.length, BULK_APPROVE_MAX) })}</span>
          </label>
          <button
            type="button"
            className="approval-inbox__approve"
            disabled={selected.size === 0 || bulkBusy}
            aria-busy={bulkBusy}
            onClick={() => void handleBulkApprove()}
            data-testid="approval-bulk-approve"
          >
            {bulkBusy ? t('approvalInbox.bulkApproving') : t('approvalInbox.bulkApprove', { count: selected.size })}
          </button>
          {atLimit && <span className="approval-inbox__hint">{t('approvalInbox.bulkLimit', { max: BULK_APPROVE_MAX })}</span>}
        </div>
      )}

      {state.status === 'ready' && state.requests.length > 0 && (
        <ol className="approval-inbox__list" aria-label={heading}>
          {state.requests.map((request) => {
            const isSelfRequest = request.kind === 'TIME_OFF'
              ? request.cannotDecideReason === 'SELF_REQUEST'
              : Boolean(currentEmployeeId && request.employeeId === currentEmployeeId);
            const decidable = isDecidable(request, currentEmployeeId);
            const lockedKey = cannotDecideKey(request, currentEmployeeId);
            const typeLabel = request.kind === 'TIME_OFF'
              ? t('approvalInbox.kindVacation')
              : request.requestType === 'TIME_CHANGE'
                ? t('approvalInbox.timeChange')
                : t('approvalInbox.other');
            const resolvedStatus = request.status !== 'PENDING';
            return (
              <li className="approval-inbox__item" key={request.id} data-kind={request.kind}>
                <article>
                  <div className="approval-inbox__item-head">
                    <div className="approval-inbox__item-title">
                      {bulkSelectable(request) && (
                        <input
                          type="checkbox"
                          checked={selected.has(request.id)}
                          disabled={bulkBusy || (!selected.has(request.id) && atLimit)}
                          onChange={() => toggle(request.id)}
                          aria-label={t('approvalInbox.selectRequest', { name: request.employeeName })}
                          data-testid={`approval-select-${request.id}`}
                        />
                      )}
                      <div>
                        <p className="approval-inbox__item-type">{typeLabel}</p>
                        <time dateTime={request.createdAt}>{request.createdAt}</time>
                      </div>
                    </div>
                    <span className={`approval-inbox__badge approval-inbox__badge--${request.status.toLowerCase()}`}>
                      {t(`approvalInbox.status.${request.status}`)}
                    </span>
                  </div>
                  {request.kind === 'TIME_OFF' ? renderTimeOff(request) : (
                    <>
                      <dl className="approval-inbox__facts">
                        <div><dt>{t('approvalInbox.requestedBy')}</dt><dd>{request.employeeName}</dd></div>
                        <div><dt>{t('approvalInbox.area')}</dt><dd>{request.areaName || t('approvalInbox.noArea')}</dd></div>
                        <div><dt>{t('approvalInbox.shift')}</dt><dd>{request.shiftDate} · {request.shiftStartTime} — {request.shiftEndTime}</dd></div>
                        <div><dt>{t('approvalInbox.reason')}</dt><dd>{request.reason}</dd></div>
                      </dl>
                      <p className="approval-inbox__location">{request.shiftLocation || t('approvalInbox.noLocation')}</p>
                    </>
                  )}
                  {resolvedStatus && (
                    <p className="approval-inbox__resolution" data-testid={`approval-resolution-${request.id}`}>
                      {request.resolvedByName ? t('approvalInbox.resolvedBy', { name: request.resolvedByName, date: request.resolvedAt ?? '' }) : t('approvalInbox.resolvedAt', { date: request.resolvedAt ?? '' })}
                      {request.rejectionReason ? ` · ${t('approvalInbox.rejectionShown', { reason: request.rejectionReason })}` : ''}
                    </p>
                  )}
                  {!resolvedStatus && isSelfRequest && (
                    <div className="approval-inbox__self-warning" role="note" data-testid={`self-approval-warning-${request.id}`}>
                      <AlertCircle size={15} aria-hidden="true" />
                      <span>{t('approvalInbox.selfApprovalForbidden')}</span>
                    </div>
                  )}
                  {!resolvedStatus && !isSelfRequest && !decidable && lockedKey && (
                    <div className="approval-inbox__self-warning" role="note" data-testid={`cannot-decide-${request.id}`}>
                      <AlertCircle size={15} aria-hidden="true" />
                      <span>{t(lockedKey)}</span>
                    </div>
                  )}
                  {!resolvedStatus && !history && (
                    <div className="approval-inbox__actions">
                      <button
                        type="button"
                        className="approval-inbox__approve"
                        disabled={!decidable || Boolean(approvingId || rejectingRequestId || bulkBusy)}
                        title={!decidable && lockedKey ? t(lockedKey) : undefined}
                        onClick={() => void handleApprove(request)}
                        data-testid={`approve-btn-${request.id}`}
                      >
                        {approvingId === request.id ? t('approvalInbox.approving') : t('approvalInbox.approve')}
                      </button>
                      <button
                        type="button"
                        className="approval-inbox__reject-trigger"
                        disabled={!decidable || Boolean(approvingId || rejectingRequestId || bulkBusy)}
                        title={!decidable && lockedKey ? t(lockedKey) : undefined}
                        onClick={() => openRejectForm(request.id)}
                        data-testid={`reject-btn-${request.id}`}
                      >
                        {t('approvalInbox.reject')}
                      </button>
                    </div>
                  )}
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

      {state.status === 'ready' && nextCursor && (
        <div className="approval-inbox__more">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} data-testid="approval-load-more">
            {loadingMore ? t('approvalInbox.loading') : t('approvalInbox.loadMore')}
          </button>
        </div>
      )}
    </section>
  );
}

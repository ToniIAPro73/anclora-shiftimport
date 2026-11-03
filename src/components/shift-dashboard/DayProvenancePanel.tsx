import { useCallback, useEffect, useState } from 'react';
import '../scheduling/StaleAssignment.css';
import { AlertTriangle, Lock } from 'lucide-react';
import { loadDayHistory, reconcileCalendarDayRemote, type RemoteDayHistory } from '../../lib/remote';
import { ApiError } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { classifyReason, hasSemanticDayChange, normalizeChangeRows, uniqueKeepOptions } from './reconciliation-display';

interface DayProvenancePanelProps {
  employeeId: string;
  date: string;
  canReconcile: boolean;
  /** OWNER/ADMIN only: replacing an approved vacation with an import proposal is an audited override. */
  canOverrideProtectedAbsence?: boolean;
  onChanged?: () => void;
}

const clock = (value: string | null): string => (value ? String(value).slice(0, 5) : '');
/** `2026-08-12` → `12/08` (the vacation range in conflict messages). */
const dayMonth = (iso?: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

function RowList({ rows, empty, stateLabel }: { rows: Array<{ id?: string | null; shiftType?: string | null; startTime?: string | null; endTime?: string | null }>; empty: string; stateLabel?: string }) {
  if (rows.length === 0) return <p className="day-history__empty">{empty}</p>;
  return (
    <ul className="day-history__rows">
      {rows.map((row, index) => (
        <li key={row.id ?? index}>
          <strong>{row.shiftType || '—'}</strong>
          {row.startTime && row.endTime ? ` ${clock(row.startTime)}–${clock(row.endTime)}` : ''}
          {stateLabel && <span className="day-history__state"> · {stateLabel}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Day provenance: current calendar, detected alternatives, chronological
 * change trail and explicit resolution for days awaiting review.
 */
export function DayProvenancePanel({ employeeId, date, canReconcile, canOverrideProtectedAbsence = false, onChanged }: DayProvenancePanelProps) {
  const { t, locale } = useI18n();
  const [history, setHistory] = useState<RemoteDayHistory | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [keepIds, setKeepIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [reconcileError, setReconcileError] = useState(false);
  const [overrideForbidden, setOverrideForbidden] = useState(false);
  const [dayChanged, setDayChanged] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setHistory(await loadDayHistory(employeeId, date));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [employeeId, date]);

  useEffect(() => { void load(); }, [load]);

  if (status === 'loading') return <p className="day-history__empty" role="status">{t('dayHistory.loading')}</p>;
  if (status === 'error' || !history) return <p className="day-history__empty" role="alert">{t('dayHistory.error')}</p>;

  const { provenance } = history;
  // Newest first: the latest change is what the user wants to see; the stored trail itself is never rewritten.
  const changes = [...history.changes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const supersededRows = history.rows
    .filter((row) => row.effectiveState === 'SUPERSEDED')
    .sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '') || 0);
  const formatWhen = (iso: string) => new Date(iso).toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES');
  const describe = (list: Array<{ shiftType: string; startTime: string | null; endTime: string | null }>) =>
    list.length === 0
      ? '—'
      : list.map((r) => `${r.shiftType}${r.startTime && r.endTime ? ` ${clock(r.startTime)}–${clock(r.endTime)}` : ''}`).join(' + ');

  const submitReconcile = async (ids: string[] = keepIds) => {
    setSaving(true);
    setReconcileError(false);
    setOverrideForbidden(false);
    setDayChanged(false);
    try {
      await reconcileCalendarDayRemote({ employeeId, date, keepShiftIds: ids, reason, expectedDayToken: history.dayToken });
      setKeepIds([]);
      setReason('');
      await load();
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN') setOverrideForbidden(true);
      else if (error instanceof ApiError && error.code === 'DAY_CHANGED') {
        // The day moved under the decision: drop it, reload the fresh state and let the user decide again.
        setDayChanged(true);
        setKeepIds([]);
        await load();
      } else setReconcileError(true);
    } finally {
      setSaving(false);
    }
  };

  const VISIBLE_CHANGES = 2;
  // Semantically unique choices: the same shift state is never offered twice, whatever internal row it comes from.
  const keepOptions = uniqueKeepOptions(provenance.current ?? provenance.effective, provenance.proposed ?? history.rows.filter((row) => row.effectiveState === 'REQUIRES_REVIEW'));
  const lineOf = (row: { shiftType?: string | null; startTime?: string | null; endTime?: string | null }) => `${row.shiftType || '—'}${row.startTime && row.endTime ? ` ${clock(row.startTime)}–${clock(row.endTime)}` : ''}`;
  const reasonText = (reason: string | null | undefined) => {
    const { kind, text } = classifyReason(reason);
    return kind === 'matchesCalendar' ? t('dayHistory.reasonMatchesCalendar') : kind === 'automatic' ? t('dayHistory.reasonAutomatic') : text;
  };
  const renderChange = (source: (typeof changes)[number]) => {
    const change = { ...source, before: normalizeChangeRows(source.before), after: normalizeChangeRows(source.after) };
    const rowsHaveData = [...change.before, ...change.after].every((row) => row.shiftType !== '');
    // History is not the same as a change: before === after (ignoring ids / provenance) is a technical event only.
    const visibleChange = rowsHaveData ? hasSemanticDayChange(change.before, change.after) : true;
    if (!visibleChange && change.actorRole === 'SYSTEM') {
      const { kind } = classifyReason(change.reason);
      return (
        <li key={change.id} data-testid={`day-history-change-${change.id}`} data-semantic-change="false">
          <div className="day-history__change-head">
            <strong>{t('dayHistory.automaticCheck')}</strong>
            <span>{formatWhen(change.createdAt)}</span>
          </div>
          <div className="day-history__change-reason">{t('dayHistory.noChange')} · {kind === 'text' ? reasonText(change.reason) : t('dayHistory.reasonMatchesCalendar')}</div>
        </li>
      );
    }
    return (
      <li key={change.id} data-testid={`day-history-change-${change.id}`} data-semantic-change={visibleChange ? 'true' : 'false'}>
        <div className="day-history__change-head">
          <strong>{t(`dayHistory.changeTypes.${change.changeType}`)}</strong>
          <span>{formatWhen(change.createdAt)}</span>
        </div>
        <div className="day-history__change-who">
          {change.actorRole === 'SYSTEM' ? t('dayHistory.systemActor') : t('dayHistory.byActor', { name: change.actorName ?? '—', role: change.actorRole })}
          {change.selfChange ? ` · ${t('dayHistory.selfChange')}` : ''}
        </div>
        {rowsHaveData && visibleChange && (
          <div className="day-history__change-diff">{describe(change.before)} → {describe(change.after)}</div>
        )}
        {change.reason && (() => {
          const readable = reasonText(change.reason);
          return <div className="day-history__change-reason" title={readable}>{t('dayHistory.reason')}: {readable}</div>;
        })()}
      </li>
    );
  };

  const absence = history.protectedAbsence ?? null;
  const replaced = history.replacedAbsence ?? null;
  const inConflict = Boolean(absence) && provenance.requiresReview;
  const range = { start: dayMonth(absence?.startDate), end: dayMonth(absence?.endDate) };
  const proposalIds = (provenance.proposed ?? history.rows.filter((row) => row.effectiveState === 'REQUIRES_REVIEW'))
    .map((row) => row.id).filter((id): id is string => Boolean(id));

  return (
    <section className="day-history" aria-label={t('dayHistory.title')} data-testid="day-history">
      {absence && (
        <p className="day-history__origin" data-testid="day-history-origin">
          <Lock size={14} aria-hidden="true" />
          <strong>{t('dayHistory.protectedBadge')}</strong> · {t('dayHistory.originTimeOff', range)}
        </p>
      )}
      {replaced && (
        <p className="day-history__origin day-history__origin--replaced" role="status" data-testid="day-history-absence-replaced">
          {t('dayHistory.absenceReplaced', { start: dayMonth(replaced.startDate), end: dayMonth(replaced.endDate) })}
        </p>
      )}
      {inConflict && (
        <div className="day-history__conflict" role="alert" data-testid="day-history-conflict">
          <p className="day-history__conflict-title">
            <AlertTriangle size={16} aria-hidden="true" />
            <strong>{t('dayHistory.vacationConflict.title', range)}</strong>
          </p>
          <p>{t('dayHistory.vacationConflict.what')}</p>
          <p>{t('dayHistory.vacationConflict.written')}</p>
          <p>{t('dayHistory.vacationConflict.notWritten')}</p>
          <p>{t('dayHistory.vacationConflict.why')}</p>
          <p><strong>{t('dayHistory.vacationConflict.action')}</strong></p>
          {canReconcile ? (
            <>
              <label className="day-history__reason">
                <span>{t('dayHistory.reconcileReason')}</span>
                <textarea value={reason} maxLength={2000} rows={2} onChange={(event) => setReason(event.target.value)} data-testid="day-history-conflict-reason" />
              </label>
              <div className="day-history__conflict-actions">
                <button
                  type="button" className="eff-button eff-button--primary" disabled={saving || !reason.trim() || !absence?.shiftId}
                  onClick={() => void submitReconcile(absence?.shiftId ? [absence.shiftId] : [])} data-testid="day-history-keep-current"
                >
                  {t('dayHistory.vacationConflict.keepCurrent')}
                </button>
                <button
                  type="button" className="eff-button" disabled={saving || !reason.trim() || !canOverrideProtectedAbsence || proposalIds.length === 0}
                  aria-describedby={canOverrideProtectedAbsence ? undefined : 'day-history-use-proposal-note'}
                  onClick={() => void submitReconcile(proposalIds)} data-testid="day-history-use-proposal"
                >
                  {t('dayHistory.vacationConflict.useProposal')}
                </button>
              </div>
              {!canOverrideProtectedAbsence && (
                <p id="day-history-use-proposal-note" className="day-history__conflict-note" data-testid="day-history-use-proposal-note">
                  {t('dayHistory.vacationConflict.useProposalForbidden')}
                </p>
              )}
            </>
          ) : (
            <p className="day-history__conflict-note">{t('dayHistory.vacationConflict.useProposalForbidden')}</p>
          )}
          {overrideForbidden && (
            <div className="day-history__conflict-error" role="alert" data-testid="day-history-override-forbidden">
              <strong>{t('dayHistory.vacationConflict.forbiddenTitle')}</strong>
              <p>{t('dayHistory.vacationConflict.forbiddenWhy')}</p>
              <p>{t('dayHistory.vacationConflict.forbiddenKept')}</p>
              <p>{t('dayHistory.vacationConflict.forbiddenAction')}</p>
            </div>
          )}
          {dayChanged && <p role="alert" data-testid="day-changed">{t('dayHistory.dayChanged')}</p>}
          {reconcileError && <p role="alert">{t('dayHistory.reconcileError')}</p>}
        </div>
      )}
      {provenance.requiresReview && !inConflict && (
        <div className="day-history__pending" role="status" data-testid="day-history-pending">
          <div className="day-history__pending-head">
            <strong>{t('dayHistory.pendingTitle')}</strong>
            <p>{provenance.countedProvisionally ? t('dayHistory.pendingBodyCounted') : t('dayHistory.pendingBody')}</p>
            <p className="day-history__pending-note" data-testid="day-history-pending-note">{t('dayHistory.pendingNote')}</p>
          </div>
          {canReconcile && (
            <>
              <span id="day-history-keep-label" className="day-history__group-label">{t('dayHistory.keepLabel')}</span>
              <div className="day-history__options" role="group" aria-labelledby="day-history-keep-label">
                {keepOptions.map((row) => (
                  <label key={row.id} className={`day-history__keep${keepIds.includes(row.id as string) ? ' is-selected' : ''}`}>
                    <input
                      type="checkbox"
                      aria-label={t('dayHistory.keepOptionAria', { line: lineOf(row) })}
                      checked={keepIds.includes(row.id as string)}
                      onChange={(event) => setKeepIds((ids) => (event.target.checked ? [...ids, row.id as string] : ids.filter((id) => id !== row.id)))}
                    />
                    <span>{lineOf(row)}</span>
                  </label>
                ))}
              </div>
              <label className="day-history__reason">
                <span>{t('dayHistory.reconcileReason')}</span>
                <textarea value={reason} maxLength={2000} rows={2} onChange={(event) => setReason(event.target.value)} />
              </label>
              {dayChanged && <p role="alert" data-testid="day-changed">{t('dayHistory.dayChanged')}</p>}
              {reconcileError && <p role="alert">{t('dayHistory.reconcileError')}</p>}
              <button type="button" className="eff-button eff-button--primary day-history__cta" disabled={saving || !reason.trim()} onClick={() => void submitReconcile()}>
                {saving ? t('dayHistory.reconciling') : t('dayHistory.reconcile')}
              </button>
            </>
          )}
        </div>
      )}

      {/* A pending difference is decided in the block above: repeating the same shifts as comparison cards only adds height. */}
      {!provenance.requiresReview && (
      <div className="day-history__compare day-history__compare--1" data-testid="day-history-compare">
        <div className="day-history__card">
          <h4>{t('dayHistory.effective')}</h4>
          <RowList rows={provenance.effective} empty={t('dayHistory.noRows')} stateLabel={t('dayHistory.stateEffective')} />
        </div>
      </div>
      )}

      {supersededRows.length > 0 && (
        <div className="day-history__card" data-testid="day-history-superseded">
          <h4>{t('dayHistory.superseded')}</h4>
          <RowList rows={supersededRows} empty={t('dayHistory.noRows')} stateLabel={t('dayHistory.stateSuperseded')} />
        </div>
      )}

      <div className="day-history__trail">
        <h4>{t('dayHistory.changes')}</h4>
        {changes.length === 0 ? (
          <p className="day-history__empty">{t('dayHistory.noChanges')}</p>
        ) : (
          <>
            <ol className="day-history__changes">{changes.slice(0, VISIBLE_CHANGES).map(renderChange)}</ol>
            {changes.length > VISIBLE_CHANGES && (
              <details className="day-history__more">
                <summary>{t('dayHistory.showMore', { count: changes.length - VISIBLE_CHANGES })}</summary>
                <ol className="day-history__changes">{changes.slice(VISIBLE_CHANGES).map(renderChange)}</ol>
              </details>
            )}
          </>
        )}
      </div>
      {provenance.legacyDutyRows.length > 0 && <p className="day-history__note">{t('dayHistory.dutyRole')}</p>}
    </section>
  );
}

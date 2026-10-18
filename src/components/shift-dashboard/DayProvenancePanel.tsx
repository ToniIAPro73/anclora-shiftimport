import { useCallback, useEffect, useState } from 'react';
import { loadDayHistory, reconcileCalendarDayRemote, type RemoteDayHistory } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import type { NormalizedCalendarRow } from '../../lib/effective-calendar.js';
import { classifyReason, hasSemanticDayChange, uniqueKeepOptions } from './reconciliation-display';

interface DayProvenancePanelProps {
  employeeId: string;
  date: string;
  canReconcile: boolean;
  onChanged?: () => void;
}

const clock = (value: string | null): string => (value ? String(value).slice(0, 5) : '');

function RowList({ rows, empty }: { rows: NormalizedCalendarRow[]; empty: string }) {
  if (rows.length === 0) return <p className="day-history__empty">{empty}</p>;
  return (
    <ul className="day-history__rows">
      {rows.map((row, index) => (
        <li key={row.id ?? index}>
          <strong>{row.shiftType || '—'}</strong>
          {row.startTime && row.endTime ? ` ${clock(row.startTime)}–${clock(row.endTime)}` : ''}
        </li>
      ))}
    </ul>
  );
}

/**
 * Day provenance: effective state, original and current company plan, the
 * chronological change trail and, for administrators, explicit reconciliation
 * of days marked REQUIRES_REVIEW.
 */
export function DayProvenancePanel({ employeeId, date, canReconcile, onChanged }: DayProvenancePanelProps) {
  const { t, locale } = useI18n();
  const [history, setHistory] = useState<RemoteDayHistory | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [keepIds, setKeepIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [reconcileError, setReconcileError] = useState(false);

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

  const { provenance, changes, rows } = history;
  const pendingRows = rows.filter((row) => row.effectiveState === 'REQUIRES_REVIEW');
  const formatWhen = (iso: string) => new Date(iso).toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES');
  const describe = (list: Array<{ shiftType: string; startTime: string | null; endTime: string | null }>) =>
    list.length === 0
      ? '—'
      : list.map((r) => `${r.shiftType}${r.startTime && r.endTime ? ` ${clock(r.startTime)}–${clock(r.endTime)}` : ''}`).join(' + ');

  const submitReconcile = async () => {
    setSaving(true);
    setReconcileError(false);
    try {
      await reconcileCalendarDayRemote({ employeeId, date, keepShiftIds: keepIds, reason });
      setKeepIds([]);
      setReason('');
      await load();
      onChanged?.();
    } catch {
      setReconcileError(true);
    } finally {
      setSaving(false);
    }
  };

  const VISIBLE_CHANGES = 2;
  // Semantically unique choices: the same shift state is never offered twice, whatever internal row it comes from.
  const keepOptions = uniqueKeepOptions(provenance.companyCurrent, pendingRows);
  const lineOf = (row: { shiftType?: string | null; startTime?: string | null; endTime?: string | null }) => `${row.shiftType || '—'}${row.startTime && row.endTime ? ` ${clock(row.startTime)}–${clock(row.endTime)}` : ''}`;
  const showCurrent = provenance.revisions.length > 1;
  const showOriginal = provenance.companyOriginal.length > 0;
  const reasonText = (reason: string | null | undefined) => {
    const { kind, text } = classifyReason(reason);
    return kind === 'matchesCalendar' ? t('dayHistory.reasonMatchesCalendar') : kind === 'automatic' ? t('dayHistory.reasonAutomatic') : text;
  };
  const renderChange = (change: (typeof changes)[number]) => {
    const rowsHaveData = [...change.before, ...change.after].every((row) => typeof row?.shiftType === 'string');
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
          <div className="day-history__change-who">{t('dayHistory.systemCheck')}</div>
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

  return (
    <section className="day-history" aria-label={t('dayHistory.title')} data-testid="day-history">
      {provenance.requiresReview && (
        <div className="day-history__pending" role="status" data-testid="day-history-pending">
          <div className="day-history__pending-head">
            <strong>{t('dayHistory.pendingTitle')}</strong>
            <p>{t('dayHistory.pendingBody')}</p>
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
      <div className={`day-history__compare day-history__compare--${1 + Number(showOriginal) + Number(showCurrent)}`} data-testid="day-history-compare">
        <div className="day-history__card">
          <h4>{t('dayHistory.effective')}</h4>
          <RowList rows={provenance.effective} empty={t('dayHistory.noRows')} />
        </div>
        {showOriginal && (
          <div className="day-history__card">
            <h4>{t('dayHistory.companyOriginal')}</h4>
            <RowList rows={provenance.companyOriginal} empty={t('dayHistory.noRows')} />
          </div>
        )}
        {showCurrent && (
          <div className="day-history__card">
            <h4>{t('dayHistory.companyCurrent')}</h4>
            <RowList rows={provenance.companyCurrent} empty={t('dayHistory.noRows')} />
          </div>
        )}
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

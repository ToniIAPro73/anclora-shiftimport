import { useCallback, useEffect, useState } from 'react';
import { loadDayHistory, reconcileCalendarDayRemote, type RemoteDayHistory } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import type { NormalizedCalendarRow } from '../../lib/effective-calendar.js';

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

  return (
    <section className="day-history" aria-label={t('dayHistory.title')} data-testid="day-history">
      {provenance.requiresReview && (
        <div className="day-history__pending" role="status" data-testid="day-history-pending">
          <strong>{t('dayHistory.pendingTitle')}</strong>
          <p>{t('dayHistory.pendingBody')}</p>
          {canReconcile && (
            <>
              {[...provenance.companyCurrent, ...pendingRows].map((row) => row.id && (
                <label key={row.id} className="day-history__keep">
                  <input
                    type="checkbox"
                    checked={keepIds.includes(row.id)}
                    onChange={(event) => setKeepIds((ids) => (event.target.checked ? [...ids, row.id as string] : ids.filter((id) => id !== row.id)))}
                  />
                  {t('dayHistory.keepLabel')}: {row.shiftType}{row.startTime && row.endTime ? ` ${clock(row.startTime)}–${clock(row.endTime)}` : ''}
                </label>
              ))}
              <label className="day-history__reason">
                <span>{t('dayHistory.reconcileReason')}</span>
                <textarea value={reason} maxLength={2000} rows={2} onChange={(event) => setReason(event.target.value)} />
              </label>
              {reconcileError && <p role="alert">{t('dayHistory.reconcileError')}</p>}
              <button type="button" className="eff-button eff-button--primary" disabled={saving || !reason.trim()} onClick={() => void submitReconcile()}>
                {saving ? t('dayHistory.reconciling') : t('dayHistory.reconcile')}
              </button>
            </>
          )}
        </div>
      )}

      <h4>{t('dayHistory.effective')}</h4>
      <RowList rows={provenance.effective} empty={t('dayHistory.noRows')} />

      {provenance.companyOriginal.length > 0 && (
        <>
          <h4>{t('dayHistory.companyOriginal')}{provenance.revisions[0] ? ` · ${t('dayHistory.revision', { n: provenance.revisions[0] })}` : ''}</h4>
          <RowList rows={provenance.companyOriginal} empty={t('dayHistory.noRows')} />
        </>
      )}
      {provenance.revisions.length > 1 && (
        <>
          <h4>{t('dayHistory.companyCurrent')} · {t('dayHistory.revision', { n: provenance.revisions[provenance.revisions.length - 1] })}</h4>
          <RowList rows={provenance.companyCurrent} empty={t('dayHistory.noRows')} />
        </>
      )}

      <h4>{t('dayHistory.changes')}</h4>
      {changes.length === 0 ? (
        <p className="day-history__empty">{t('dayHistory.noChanges')}</p>
      ) : (
        <ol className="day-history__changes">
          {changes.map((change) => (
            <li key={change.id} data-testid={`day-history-change-${change.id}`}>
              <strong>{t(`dayHistory.changeTypes.${change.changeType}`)}</strong> · {formatWhen(change.createdAt)}
              <div>{change.actorRole === 'SYSTEM' ? t('dayHistory.systemActor') : t('dayHistory.byActor', { name: change.actorName ?? '—', role: change.actorRole })}{change.selfChange ? ` · ${t('dayHistory.selfChange')}` : ''}</div>
              <div>{describe(change.before)} → {describe(change.after)}</div>
              <div>{t('dayHistory.reason')}: {change.reason}</div>
            </li>
          ))}
        </ol>
      )}
      {provenance.legacyDutyRows.length > 0 && <p className="day-history__note">{t('dayHistory.dutyRole')}</p>}
    </section>
  );
}

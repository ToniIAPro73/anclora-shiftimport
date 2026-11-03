import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import {
  applyKeepCurrentRemote,
  previewKeepCurrentRemote,
  type KeepCurrentDayResult,
  type KeepCurrentPreviewDay,
} from '../../lib/remote';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import './KeepCurrentDialog.css';

export const KEEP_CURRENT_MAX = 50;
const MAX_REASON = 2000;

interface KeepCurrentDialogProps {
  isOpen: boolean;
  employeeId: string;
  /** Pending days chosen in the worklist (one employee, at most 50). */
  dates: string[];
  onClose: () => void;
  /** At least one day was resolved: the worklist reloads. */
  onDone: () => void;
}

const formatDate = (date: string) => { const [y, m, d] = date.split('-'); return `${d}/${m}/${y}`; };

/**
 * «Mantener actual» for several pending days of ONE employee (F4-M03 / OD-F4-04, v1). Shows, per day, the shifts that stay and the
 * proposals that are discarded, asks ONE common reason (recorded on each day) and applies only after confirmation. Each day is its own
 * resolution with its own result: a day that changed since the preview is reported as such and nothing is written for it.
 */
export function KeepCurrentDialog({ isOpen, employeeId, dates, onClose, onDone }: KeepCurrentDialogProps) {
  const { t, locale } = useI18n();
  // The days are read when the dialog opens: the worklist may empty its selection when the first results arrive, and that must not
  // restart the dialog (and erase the results the user is reading).
  const datesRef = useRef(dates);
  datesRef.current = dates;
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'applying' | 'done'>('loading');
  const [days, setDays] = useState<KeepCurrentPreviewDay[]>([]);
  const [reason, setReason] = useState('');
  const [results, setResults] = useState<KeepCurrentDayResult[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const label = (row: { type: string; startTime: string | null; endTime: string | null }) => {
    const type = translateShiftTypeLabel(row.type, locale, row.type);
    return row.startTime && row.endTime ? `${type} ${row.startTime}–${row.endTime}` : type;
  };
  const describe = (rows: KeepCurrentPreviewDay['keep']) => (rows.length ? rows.map(label).join(' · ') : '—');

  const load = useCallback(async () => {
    setState('loading');
    setResults([]);
    try {
      setDays(await previewKeepCurrentRemote(employeeId, datesRef.current));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [employeeId]);

  useEffect(() => { if (isOpen) { setReason(''); void load(); } }, [isOpen, load]);

  // The confirm button disappears when the results arrive: hand focus to «Close» so it never falls back to <body>.
  useEffect(() => { if (state === 'done') closeRef.current?.focus(); }, [state]);

  const eligible = days.filter((day) => day.eligible);
  const trimmed = reason.trim();
  const canConfirm = state === 'ready' && eligible.length > 0 && trimmed.length > 0 && trimmed.length <= MAX_REASON;

  const apply = async () => {
    setState('applying');
    try {
      const response = await applyKeepCurrentRemote({
        employeeId,
        dates: eligible.map((day) => day.date),
        reason: trimmed,
        dayTokens: Object.fromEntries(eligible.map((day) => [day.date, day.dayToken])),
      });
      setResults(response.results);
      setState('done');
      if (response.summary.applied > 0) onDone();
    } catch {
      setState('error');
    }
  };

  const codeText = (code: string, status?: number) => (status === 422 ? t('reconModal.keepCurrent.codes.RESULT_INCONSISTENT') : ['DAY_CHANGED', 'ALREADY_RECONCILED', 'NO_CURRENT_TO_KEEP', 'NOTHING_TO_RECONCILE', 'RESULT_INCONSISTENT'].includes(code)
    ? t(`reconModal.keepCurrent.codes.${code}`)
    : t('reconModal.keepCurrent.codes.ERROR'));

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (state !== 'applying') onClose(); }}
      title={t('reconModal.keepCurrent.title')}
      closeAriaLabel={t('common.close')}
      maxWidth="720px"
      workspace
      height="auto"
      footer={(
        <>
          <button type="button" ref={closeRef} className="btn-outline" onClick={onClose} disabled={state === 'applying'} data-testid="keep-current-cancel">{state === 'done' ? t('common.close') : t('common.cancel')}</button>
          {state !== 'done' && (
            <button type="button" className="btn-gold" onClick={() => void apply()} disabled={!canConfirm} aria-busy={state === 'applying'} data-testid="keep-current-confirm">
              {state === 'applying' ? <><Loader2 className="icon-spin" size={16} aria-hidden="true" /> {t('reconModal.keepCurrent.applying')}</> : t('reconModal.keepCurrent.confirm', { count: eligible.length })}
            </button>
          )}
        </>
      )}
    >
      <div className="keep-current" data-testid="keep-current-dialog">
        <p>{t('reconModal.keepCurrent.intro')}</p>
        {state === 'loading' && <p role="status" aria-busy="true"><Loader2 className="icon-spin" size={16} aria-hidden="true" /> {t('reconModal.keepCurrent.loading')}</p>}
        {state === 'error' && <p role="alert" className="keep-current__error" data-testid="keep-current-error">{t('reconModal.keepCurrent.error')}</p>}

        {(state === 'ready' || state === 'applying') && (
          <>
            <ul className="keep-current__days" tabIndex={0} aria-label={t('reconModal.keepCurrent.title')} data-testid="keep-current-days">
              {days.map((day) => (
                <li key={day.date} data-eligible={day.eligible} data-testid={`keep-current-day-${day.date}`}>
                  <strong>{formatDate(day.date)}</strong>
                  {day.eligible ? (
                    <>
                      <span><Check size={13} aria-hidden="true" /> {t('reconModal.keepCurrent.keeps')}: {describe(day.keep)}</span>
                      <span className="keep-current__drop">{t('reconModal.keepCurrent.discards')}: {describe(day.drop)}</span>
                      {day.protectedAbsence && <span className="keep-current__protected"><ShieldCheck size={13} aria-hidden="true" /> {t('reconModal.keepCurrent.protected')}</span>}
                    </>
                  ) : (
                    <span className="keep-current__skip" data-testid={`keep-current-skip-${day.date}`}><AlertTriangle size={13} aria-hidden="true" /> {t('reconModal.keepCurrent.skipped')} · {codeText(day.code ?? 'ERROR')}</span>
                  )}
                </li>
              ))}
            </ul>
            <label htmlFor="keep-current-reason" className="keep-current__label">{t('reconModal.keepCurrent.reasonLabel')} <abbr title={t('reconModal.keepCurrent.required')} aria-hidden="true">*</abbr></label>
            <textarea
              id="keep-current-reason"
              className="field-textarea"
              rows={2}
              maxLength={MAX_REASON}
              value={reason}
              placeholder={t('reconModal.keepCurrent.reasonPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
              data-testid="keep-current-reason"
            />
            <p className="keep-current__hint">{t('reconModal.keepCurrent.reasonHint')}</p>
          </>
        )}

        {state === 'done' && (
          <div role="status" data-testid="keep-current-results">
          <ul className="keep-current__days" tabIndex={0} aria-label={t('reconModal.keepCurrent.title')}>
            {results.map((item) => (
              <li key={item.date} data-ok={item.ok} data-testid={`keep-current-result-${item.date}`}>
                <strong>{formatDate(item.date)}</strong>
                {item.ok
                  ? <span><Check size={13} aria-hidden="true" /> {t('reconModal.keepCurrent.done')}</span>
                  : <span className="keep-current__skip"><AlertTriangle size={13} aria-hidden="true" /> {t('reconModal.keepCurrent.notDone')} · {codeText(item.code, item.status)}</span>}
              </li>
            ))}
          </ul>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

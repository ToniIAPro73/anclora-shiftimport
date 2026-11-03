import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Copy, Info, Loader2, MinusCircle } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { copyRemoteScheduleWeek, type CopyWeekResult } from '../../lib/remote';
import { ApiError } from '../../lib/session';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import './CopyWeekDialog.css';

interface CopyWeekDialogProps {
  isOpen: boolean;
  scheduleId: string;
  versionId: string;
  /** First day of the draft's week; the source week defaults to the one before it. */
  periodStart: string;
  onClose: () => void;
  /** The copy was applied: the planner reloads its draft. */
  onCopied: (created: number) => void;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const range = (row: { startTime: string | null; endTime: string | null }) => (row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : '');

/**
 * «Copiar semana anterior»: previews what the previous week's PUBLISHED plan would add to this draft and what would be left out (with
 * the reason), and only copies after an explicit confirmation. The preview never writes; the copy never overwrites, publishes or
 * creates a version, and the server re-checks every row (what is applied is what the server reports, not what this screen showed).
 */
export function CopyWeekDialog({ isOpen, scheduleId, versionId, periodStart, onClose, onCopied }: CopyWeekDialogProps) {
  const { t, locale } = useI18n();
  const sourceWeekStart = useMemo(() => addDays(periodStart, -7), [periodStart]);
  const [preview, setPreview] = useState<CopyWeekResult | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'applying' | 'done'>('loading');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [applied, setApplied] = useState<CopyWeekResult | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const day = useCallback((value: string) => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)), [locale]);
  const type = (value: string | null) => translateShiftTypeLabel(value ?? '', locale, value ?? '');

  const loadPreview = useCallback(async () => {
    setState('loading');
    setErrorKey(null);
    setApplied(null);
    try {
      setPreview(await copyRemoteScheduleWeek(scheduleId, versionId, { sourceWeekStart, mode: 'preview' }));
      setState('ready');
    } catch (error) {
      setPreview(null);
      setErrorKey(error instanceof ApiError && error.code === 'SOURCE_NOT_PUBLISHED' ? 'sourceNotPublished' : error instanceof ApiError && error.code === 'VERSION_NOT_EDITABLE' ? 'notEditable' : 'generic');
      setState('error');
    }
  }, [scheduleId, versionId, sourceWeekStart]);

  useEffect(() => {
    if (isOpen) void loadPreview();
  }, [isOpen, loadPreview]);

  // The confirm button disappears when the results arrive: hand focus to «Close» so it never falls back to <body>.
  useEffect(() => { if (state === 'done') closeRef.current?.focus(); }, [state]);

  const confirm = async () => {
    setState('applying');
    setErrorKey(null);
    try {
      const result = await copyRemoteScheduleWeek(scheduleId, versionId, { sourceWeekStart, mode: 'apply' });
      setApplied(result);
      setState('done');
      onCopied(result.created);
    } catch (error) {
      setErrorKey(error instanceof ApiError && error.code === 'VERSION_NOT_EDITABLE' ? 'notEditable' : 'generic');
      setState('ready');
    }
  };

  const busy = state === 'loading' || state === 'applying';
  const result = applied ?? preview;
  const candidates = preview?.candidates ?? [];
  const skipped = (applied ?? preview)?.skipped ?? [];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (state !== 'applying') onClose(); }}
      title={t('planner.copyWeek.title')}
      closeAriaLabel={t('common.close')}
      maxWidth="720px"
      workspace
      height="auto"
      footer={(
        <>
          <button type="button" ref={closeRef} className="btn-outline" onClick={onClose} disabled={state === 'applying'} data-testid="copy-week-cancel">
            {state === 'done' ? t('common.close') : t('common.cancel')}
          </button>
          {state !== 'done' && (
            <button type="button" className="btn-gold" onClick={() => void confirm()} disabled={busy || state === 'error' || candidates.length === 0} aria-busy={state === 'applying'} data-testid="copy-week-confirm">
              {state === 'applying' ? <><Loader2 className="icon-spin" size={16} aria-hidden="true" /> {t('planner.copyWeek.copying')}</> : t('planner.copyWeek.confirm', { count: candidates.length })}
            </button>
          )}
        </>
      )}
    >
      <div className="copy-week" data-testid="copy-week-dialog">
        <p>{t('planner.copyWeek.intro')}</p>
        <dl className="copy-week__weeks">
          <div><dt>{t('planner.copyWeek.source')}</dt><dd>{day(sourceWeekStart)} – {day(addDays(sourceWeekStart, 6))}{result ? ` · ${t('planner.copyWeek.version', { number: result.source.versionNumber })}` : ''}</dd></div>
          <div><dt>{t('planner.copyWeek.target')}</dt><dd>{day(periodStart)} – {day(addDays(periodStart, 6))}</dd></div>
        </dl>

        {state === 'loading' && <p role="status" aria-busy="true" className="copy-week__state"><Loader2 className="icon-spin" size={16} aria-hidden="true" /> {t('planner.copyWeek.loading')}</p>}
        {state === 'error' && errorKey && <p role="alert" className="copy-week__error" data-testid="copy-week-error">{t(`planner.copyWeek.errors.${errorKey}`)}</p>}
        {state === 'ready' && errorKey && <p role="alert" className="copy-week__error" data-testid="copy-week-error">{t(`planner.copyWeek.errors.${errorKey}`)}</p>}

        {state === 'done' && applied && (
          <p role="status" className="copy-week__done" data-testid="copy-week-done"><CalendarCheck size={16} aria-hidden="true" /> {t('planner.copyWeek.done', { created: applied.created, skipped: applied.skipped.length })}</p>
        )}

        {(state === 'ready' || state === 'applying') && preview && (
          <>
            <p className="copy-week__note"><Info size={14} aria-hidden="true" /> {t('planner.copyWeek.note')}</p>
            <section aria-labelledby="copy-week-will">
              <h3 id="copy-week-will">{t(candidates.length === 1 ? 'planner.copyWeek.willCopyOne' : 'planner.copyWeek.willCopy', { count: candidates.length })}</h3>
              {candidates.length === 0 ? <p className="copy-week__empty" data-testid="copy-week-nothing">{t('planner.copyWeek.nothing')}</p> : (
                <ul className="copy-week__list" tabIndex={0} aria-labelledby="copy-week-will" data-testid="copy-week-candidates">
                  {candidates.map((item) => (
                    <li key={item.sourceAssignmentId}><Copy size={13} aria-hidden="true" /><strong>{item.employeeName ?? '—'}</strong><span>{day(item.targetDate)}</span><span>{type(item.shiftType)} {range(item)}</span></li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {(state === 'ready' || state === 'applying' || state === 'done') && skipped.length > 0 && (
          <section aria-labelledby="copy-week-skip">
            <h3 id="copy-week-skip">{t(skipped.length === 1 ? 'planner.copyWeek.willSkipOne' : 'planner.copyWeek.willSkip', { count: skipped.length })}</h3>
            <ul className="copy-week__list copy-week__list--skipped" tabIndex={0} aria-labelledby="copy-week-skip" data-testid="copy-week-skipped">
              {skipped.map((item, index) => (
                <li key={`${item.sourceAssignmentId ?? 'hidden'}-${index}`} data-reason={item.reason}>
                  <MinusCircle size={13} aria-hidden="true" />
                  <strong>{item.employeeName ?? t('planner.copyWeek.hiddenEmployee')}</strong>
                  <span>{day(item.targetDate)}</span>
                  <span className="copy-week__reason">{t(`planner.copyWeek.reasons.${item.reason}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ModalShell>
  );
}

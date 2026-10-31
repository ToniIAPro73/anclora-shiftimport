import { CalendarDays, Send, X } from 'lucide-react';
import { FormEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  createRemoteTimeOffRequest,
  loadRemoteTimeOffImpact,
  TimeOffImpact,
  TimeOffRequest,
} from '../../lib/remote';
import { ApiError } from '../../lib/session';
import { getOperationalDate } from '../../lib/operational-date';
import {
  countTimeOffDays,
  describeTimeOffError,
  TimeOffField,
  validateTimeOffForm,
} from '../../lib/time-off-form';
import { useI18n } from '../../lib/use-i18n';

type ImpactState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; impact: TimeOffImpact }
  | { status: 'unavailable' };

interface SubmitFailure {
  whyKey: string;
  actionKey: string;
}

interface TimeOffRequestFormProps {
  onCreated?: (request: TimeOffRequest) => void;
  onClose?: () => void;
  /** Override for tests; defaults to the operational (Europe/Madrid) date. */
  today?: string;
}

/**
 * Employee form for a VACATION request (F2-M05). The type is fixed to "Vacaciones" while the server allow-list has a single
 * enabled type, so there is no select. Validation is inline and blocks the submit; the server stays authoritative and every
 * failure is explained with the five answers of §15 (what / written / not written / why / what to do) in a persistent alert.
 */
export function TimeOffRequestForm({ onCreated, onClose, today: todayProp }: TimeOffRequestFormProps) {
  const { t } = useI18n();
  const uid = useId();
  const today = todayProp ?? getOperationalDate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState<Record<TimeOffField, boolean>>({ startDate: false, endDate: false, comment: false });
  const [impact, setImpact] = useState<ImpactState>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [success, setSuccess] = useState(false);

  const errors = useMemo(() => validateTimeOffForm({ startDate, endDate, comment }, today), [startDate, endDate, comment, today]);
  const errorFor = (field: TimeOffField) => errors.find((error) => error.field === field);
  const days = errors.length === 0 ? countTimeOffDays(startDate, endDate) : null;

  useEffect(() => {
    if (errors.length > 0) {
      setImpact({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setImpact({ status: 'loading' });
    const timer = window.setTimeout(() => {
      void loadRemoteTimeOffImpact(startDate, endDate)
        .then((result) => { if (!cancelled) setImpact({ status: 'ready', impact: result }); })
        .catch(() => { if (!cancelled) setImpact({ status: 'unavailable' }); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [errors.length, startDate, endDate]);

  const overlaps = impact.status === 'ready' ? impact.impact.overlapsOwn : [];
  const blockedByOverlap = overlaps.length > 0;
  const canSubmit = errors.length === 0 && !blockedByOverlap && !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ startDate: true, endDate: true, comment: true });
    if (!canSubmit) return;
    setSubmitting(true);
    setFailure(null);
    setSuccess(false);
    try {
      const created = await createRemoteTimeOffRequest({ requestType: 'VACATION', startDate, endDate, comment: comment.trim() });
      setSuccess(true);
      setStartDate('');
      setEndDate('');
      setComment('');
      setTouched({ startDate: false, endDate: false, comment: false });
      onCreated?.(created);
    } catch (error) {
      setFailure(describeTimeOffError(error instanceof ApiError ? error.code : undefined));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldProps = (field: TimeOffField) => {
    const error = touched[field] ? errorFor(field) : undefined;
    return {
      'aria-invalid': Boolean(error),
      'aria-describedby': error ? `${uid}-${field}-msg` : undefined,
      error,
    };
  };
  const start = fieldProps('startDate');
  const end = fieldProps('endDate');
  const commentField = fieldProps('comment');

  return (
    <section className="time-off-form" aria-labelledby={`${uid}-title`} data-testid="time-off-form">
      <div className="time-off-form__heading">
        <h3 id={`${uid}-title`}>
          <CalendarDays size={18} aria-hidden="true" />
          {t('timeOff.formTitle')}
        </h3>
        {onClose && (
          <button type="button" className="time-off-form__close" onClick={onClose} aria-label={t('timeOff.close')}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {failure && (
        <div className="time-off-form__alert" role="alert" data-testid="time-off-error">
          <p><strong>{t('timeOff.errorWhat')}</strong></p>
          <p>{t('timeOff.errorKept')}</p>
          <p>{t('timeOff.errorNothing')}</p>
          <p><strong>{t('timeOff.errorWhyLabel')}:</strong> {t(failure.whyKey)}</p>
          <p><strong>{t('timeOff.errorActionLabel')}:</strong> {t(failure.actionKey)}</p>
          <button type="button" onClick={() => setFailure(null)}>{t('timeOff.errorClose')}</button>
        </div>
      )}
      {success && (
        <p className="time-off-form__success" role="status" data-testid="time-off-success">{t('timeOff.sent')}</p>
      )}

      <form className="time-off-form__form" onSubmit={handleSubmit} noValidate>
        <div className="time-off-form__dates">
          <div className="ac-form-field" data-invalid={start.error ? true : undefined}>
            <div className="ac-form-field__head">
              <label className="ac-form-field__label" htmlFor={`${uid}-start`}>{t('timeOff.startLabel')} <abbr title="required" aria-hidden="true">*</abbr></label>
            </div>
            <div className="ac-form-field__control">
              <input
                id={`${uid}-start`}
                className="field-input"
                type="date"
                min={today}
                value={startDate}
                onChange={(event) => { setStartDate(event.target.value); setSuccess(false); }}
                onBlur={() => setTouched((current) => ({ ...current, startDate: true }))}
                disabled={submitting}
                required
                aria-invalid={start['aria-invalid']}
                aria-describedby={start['aria-describedby']}
                data-testid="time-off-start"
              />
              <p id={`${uid}-startDate-msg`} className="ac-form-field__message" data-tone={start.error ? 'danger' : undefined}>
                {start.error ? t(start.error.key) : ''}
              </p>
            </div>
          </div>
          <div className="ac-form-field" data-invalid={end.error ? true : undefined}>
            <div className="ac-form-field__head">
              <label className="ac-form-field__label" htmlFor={`${uid}-end`}>{t('timeOff.endLabel')} <abbr title="required" aria-hidden="true">*</abbr></label>
            </div>
            <div className="ac-form-field__control">
              <input
                id={`${uid}-end`}
                className="field-input"
                type="date"
                min={startDate || today}
                value={endDate}
                onChange={(event) => { setEndDate(event.target.value); setSuccess(false); }}
                onBlur={() => setTouched((current) => ({ ...current, endDate: true }))}
                disabled={submitting}
                required
                aria-invalid={end['aria-invalid']}
                aria-describedby={end['aria-describedby']}
                data-testid="time-off-end"
              />
              <p id={`${uid}-endDate-msg`} className="ac-form-field__message" data-tone={end.error ? 'danger' : undefined}>
                {end.error ? t(end.error.key) : ''}
              </p>
            </div>
          </div>
        </div>

        {days !== null && (
          <p className="time-off-form__days" data-testid="time-off-days">{t('timeOff.daysSummary', { count: days })}</p>
        )}

        <div className="time-off-form__impact" aria-live="polite" data-testid="time-off-impact">
          {impact.status === 'loading' && <p>{t('timeOff.impactChecking')}</p>}
          {impact.status === 'unavailable' && <p>{t('timeOff.impactUnavailable')}</p>}
          {impact.status === 'ready' && (
            <>
              <p className="time-off-form__impact-title">{t('timeOff.impactTitle')}</p>
              {impact.impact.publishedShifts === 0 && impact.impact.draftAssignments === 0 && !blockedByOverlap && (
                <p>{t('timeOff.impactNone')}</p>
              )}
              {impact.impact.publishedShifts > 0 && <p>{t('timeOff.impactPublished', { count: impact.impact.publishedShifts })}</p>}
              {impact.impact.draftAssignments > 0 && <p>{t('timeOff.impactDraft', { count: impact.impact.draftAssignments })}</p>}
              {overlaps.map((overlap) => (
                <p key={overlap.id} className="time-off-form__impact-overlap" role="alert" data-testid="time-off-overlap">
                  {t('timeOff.impactOverlap', { start: overlap.startDate, end: overlap.endDate })}
                </p>
              ))}
            </>
          )}
        </div>

        <div className="ac-form-field" data-invalid={commentField.error ? true : undefined}>
          <div className="ac-form-field__head">
            <label className="ac-form-field__label" htmlFor={`${uid}-comment`}>{t('timeOff.commentLabel')}</label>
          </div>
          <div className="ac-form-field__control">
            <textarea
              id={`${uid}-comment`}
              className="field-textarea"
              rows={3}
              value={comment}
              placeholder={t('timeOff.commentPlaceholder')}
              onChange={(event) => { setComment(event.target.value); setSuccess(false); }}
              onBlur={() => setTouched((current) => ({ ...current, comment: true }))}
              disabled={submitting}
              aria-invalid={commentField['aria-invalid']}
              aria-describedby={[commentField['aria-describedby'], `${uid}-count`].filter(Boolean).join(' ')}
              data-testid="time-off-comment"
            />
            <p id={`${uid}-comment-msg`} className="ac-form-field__message" data-tone={commentField.error ? 'danger' : undefined}>
              {commentField.error ? t(commentField.error.key) : ''}
            </p>
          </div>
        </div>

        <div className="time-off-form__footer">
          <span id={`${uid}-count`} className="time-off-form__count">{t('timeOff.characterCount', { count: comment.length })}</span>
          <button type="submit" className="time-off-form__submit" disabled={!canSubmit} aria-busy={submitting} data-testid="time-off-submit">
            <Send size={15} aria-hidden="true" />
            {submitting ? t('timeOff.submitting') : t('timeOff.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}

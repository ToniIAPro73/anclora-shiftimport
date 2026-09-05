import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Layers3, MapPin, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeRemoteShift, loadRemoteShiftDetail } from '../../lib/remote';
import { Shift } from '../../lib/types';
import { useI18n } from '../../lib/use-i18n';
import { ChangeRequestForm } from './ChangeRequestForm';
import { ShiftComments } from './ShiftComments';

type DetailState =
  | { status: 'loading' }
  | {
    status: 'ready';
    shift: Shift;
    areaName: string | null;
    acknowledgementStatus: 'PENDING' | 'ACKNOWLEDGED';
    acknowledgedAt: string | null;
  }
  | { status: 'error' };

type AcknowledgementActionState = 'idle' | 'saving' | 'success' | 'error';

interface ShiftDetailProps {
  shiftId: string;
  onBack: () => void;
}

export function ShiftDetail({ shiftId, onBack }: ShiftDetailProps) {
  const { t } = useI18n();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [acknowledgementAction, setAcknowledgementAction] = useState<AcknowledgementActionState>('idle');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setAcknowledgementAction('idle');
    try {
      const result = await loadRemoteShiftDetail(shiftId);
      setState({ status: 'ready', ...result });
    } catch {
      setState({ status: 'error' });
    }
  }, [shiftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledgementStatus = state.status === 'ready' ? state.acknowledgementStatus : null;
  const acknowledge = useCallback(async () => {
    if (acknowledgementStatus !== 'PENDING') {
      return;
    }
    setAcknowledgementAction('saving');
    try {
      const result = await acknowledgeRemoteShift(shiftId);
      setState((current) => current.status === 'ready'
        ? { ...current, acknowledgementStatus: result.status, acknowledgedAt: result.acknowledgedAt }
        : current);
      setAcknowledgementAction('success');
    } catch {
      setAcknowledgementAction('error');
    }
  }, [acknowledgementStatus, shiftId]);

  useEffect(() => {
    if (state.status === 'ready') {
      headingRef.current?.focus();
    }
  }, [state.status, shiftId]);

  return (
    <section className="employee-shift-detail" aria-labelledby="employee-shift-detail-title" data-testid="shift-detail">
      <button type="button" className="employee-shift-detail__back" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" />
        {t('employeeDetail.back')}
      </button>

      {state.status === 'loading' && (
        <div className="employee-shift-detail__status" role="status" aria-busy="true" data-testid="shift-detail-loading">
          <p className="employee-shift-detail__eyebrow">{t('employeeDetail.eyebrow')}</p>
          <h2 id="employee-shift-detail-title">{t('employeeDetail.loading')}</h2>
        </div>
      )}

      {state.status === 'error' && (
        <div className="employee-shift-detail__status employee-shift-detail__status--error" role="alert" data-testid="shift-detail-error">
          <p className="employee-shift-detail__eyebrow">{t('employeeDetail.eyebrow')}</p>
          <h2 id="employee-shift-detail-title">{t('employeeDetail.errorTitle')}</h2>
          <p>{t('employeeDetail.errorDescription')}</p>
          <button type="button" className="employee-shift-detail__retry" onClick={() => void load()}>
            <RotateCcw size={16} aria-hidden="true" />
            {t('employeeDetail.retry')}
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="employee-shift-detail__heading">
            <p className="employee-shift-detail__eyebrow">{t('employeeDetail.eyebrow')}</p>
            <div className="employee-shift-detail__title-row">
              <h2 id="employee-shift-detail-title" ref={headingRef} tabIndex={-1}>{t('employeeDetail.title')}</h2>
              <span className="employee-shift-detail__status-pill">
                <CheckCircle2 size={14} aria-hidden="true" />
                {t('employeeDetail.published')}
              </span>
              <span className={`employee-shift-detail__ack-pill${state.acknowledgementStatus === 'ACKNOWLEDGED' ? ' is-acknowledged' : ''}`}>
                <CheckCircle2 size={14} aria-hidden="true" />
                {state.acknowledgementStatus === 'ACKNOWLEDGED'
                  ? t('employeeDetail.acknowledged')
                  : t('employeeDetail.acknowledgementPending')}
              </span>
            </div>
          </div>

          <dl className="employee-shift-detail__facts">
            <div>
              <dt><CalendarDays size={15} aria-hidden="true" />{t('employeeDetail.date')}</dt>
              <dd><time dateTime={state.shift.date}>{state.shift.date}</time></dd>
            </div>
            <div>
              <dt><Clock3 size={15} aria-hidden="true" />{t('employeeDetail.hours')}</dt>
              <dd>
                <time dateTime={`${state.shift.date}T${state.shift.startTime}`}>{state.shift.startTime}</time>
                <span aria-hidden="true"> — </span>
                <time dateTime={`${state.shift.date}T${state.shift.endTime}`}>{state.shift.endTime}</time>
              </dd>
            </div>
            <div>
              <dt><MapPin size={15} aria-hidden="true" />{t('employeeDetail.location')}</dt>
              <dd>{state.shift.location.trim() || t('employeeDetail.noLocation')}</dd>
            </div>
            <div>
              <dt><Layers3 size={15} aria-hidden="true" />{t('employeeDetail.area')}</dt>
              <dd>{state.areaName || t('employeeDetail.noArea')}</dd>
            </div>
          </dl>

          <div className="employee-shift-detail__actions" aria-labelledby="employee-shift-detail-actions-title">
            <p id="employee-shift-detail-actions-title" className="employee-shift-detail__actions-heading">{t('employeeDetail.actions')}</p>
            <div className="employee-shift-detail__action-list">
              <button
                type="button"
                disabled={state.acknowledgementStatus === 'ACKNOWLEDGED' || acknowledgementAction === 'saving'}
                aria-label={state.acknowledgementStatus === 'ACKNOWLEDGED'
                  ? t('employeeDetail.acknowledged')
                  : t('employeeDetail.acknowledgeAria', { date: state.shift.date })}
                onClick={() => void acknowledge()}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                {state.acknowledgementStatus === 'ACKNOWLEDGED'
                  ? t('employeeDetail.acknowledged')
                  : acknowledgementAction === 'saving'
                    ? t('employeeDetail.acknowledging')
                    : t('employeeDetail.acknowledge')}
              </button>
            </div>
            {acknowledgementAction === 'success' && (
              <p className="employee-shift-detail__acknowledgement-feedback" role="status" aria-live="polite">
                {t('employeeDetail.acknowledged')}
              </p>
            )}
            {acknowledgementAction === 'error' && (
              <p className="employee-shift-detail__acknowledgement-error" role="alert">
                {t('employeeDetail.acknowledgementError')}
              </p>
            )}
          </div>
          <ShiftComments shiftId={state.shift.id} />
          <ChangeRequestForm key={state.shift.id} shiftId={state.shift.id} />
        </>
      )}
    </section>
  );
}

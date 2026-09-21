import { Ban, Send } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import {
  cancelRemoteChangeRequest,
  ChangeRequest,
  ChangeRequestType,
  createRemoteChangeRequest,
  loadRemoteChangeRequests,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

type ActionState = 'idle' | 'submitting' | 'cancelling' | 'error';

interface ChangeRequestFormProps {
  shiftId: string;
  shiftStartTime: string;
  shiftEndTime: string;
  onCreated?: (request: ChangeRequest) => void;
}

const MAX_REASON_LENGTH = 2000;

export function ChangeRequestForm({ shiftId, shiftStartTime, shiftEndTime, onCreated }: ChangeRequestFormProps) {
  const { t } = useI18n();
  const [requestType, setRequestType] = useState<ChangeRequestType>('TIME_CHANGE');
  const [reason, setReason] = useState('');
  const [requestedStartTime, setRequestedStartTime] = useState(shiftStartTime);
  const [requestedEndTime, setRequestedEndTime] = useState(shiftEndTime);
  const [request, setRequest] = useState<ChangeRequest | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [feedback, setFeedback] = useState('');
  const [reasonInvalid, setReasonInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadRemoteChangeRequests().then((requests) => {
      if (cancelled) return;
      const existing = requests.find((candidate) => candidate.shiftId === shiftId);
      if (existing) {
        setRequest((current) => current ?? existing);
      }
    }).catch(() => {
      // Keep the form usable for a new request if the status read fails.
    });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setReasonInvalid(true);
      setFeedback(t('employeeChangeRequest.emptyValidation'));
      return;
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      setReasonInvalid(true);
      setFeedback(t('employeeChangeRequest.tooLong'));
      return;
    }

    setReasonInvalid(false);
    setActionState('submitting');
    setFeedback('');
    try {
      const created = await createRemoteChangeRequest(
        shiftId,
        requestType,
        trimmedReason,
        requestType === 'TIME_CHANGE' ? requestedStartTime : undefined,
        requestType === 'TIME_CHANGE' ? requestedEndTime : undefined,
      );
      setRequest(created);
      onCreated?.(created);
      setReason('');
      setReasonInvalid(false);
      setActionState('idle');
      setFeedback(t('employeeChangeRequest.sent'));
    } catch {
      setActionState('error');
      setFeedback(t('employeeChangeRequest.sendError'));
    }
  };

  const handleCancel = async () => {
    if (!request || request.status !== 'PENDING' || actionState === 'cancelling') {
      return;
    }
    setActionState('cancelling');
    setFeedback('');
    try {
      const cancelled = await cancelRemoteChangeRequest(request.id);
      setRequest(cancelled);
      setActionState('idle');
      setFeedback(t('employeeChangeRequest.cancelled'));
    } catch {
      setActionState('error');
      setFeedback(t('employeeChangeRequest.cancelError'));
    }
  };

  return (
    <section className="employee-change-request" aria-labelledby="employee-change-request-title" data-testid="change-request-form">
      <div className="employee-change-request__heading">
        <p className="employee-change-request__eyebrow">{t('employeeChangeRequest.eyebrow')}</p>
        <h3 id="employee-change-request-title">{t('employeeChangeRequest.title')}</h3>
        <p>{t('employeeChangeRequest.description')}</p>
      </div>

      {request && (
        <div className="employee-change-request__submitted" aria-live="polite" data-testid="change-request-submitted">
          <div className="employee-change-request__submitted-header">
            <strong>{request.requestType === 'TIME_CHANGE'
              ? t('employeeChangeRequest.timeChange')
              : t('employeeChangeRequest.other')}</strong>
            <span className={`employee-change-request__status employee-change-request__status--${request.status.toLowerCase()}`}>
              {request.status === 'PENDING'
                ? t('employeeChangeRequest.pending')
                : request.status === 'APPROVED'
                  ? t('employeeChangeRequest.approved')
                  : request.status === 'REJECTED'
                    ? t('employeeChangeRequest.rejected')
                    : t('employeeChangeRequest.cancelledStatus')}
            </span>
          </div>
          <p className="employee-change-request__reason-label">{t('employeeChangeRequest.reasonLabel')}</p>
          <p className="employee-change-request__reason">{request.reason}</p>
          {request.status === 'PENDING' && (
            <button
              type="button"
              className="employee-change-request__cancel"
              onClick={() => void handleCancel()}
              disabled={actionState === 'cancelling'}
            >
              <Ban size={15} aria-hidden="true" />
              {actionState === 'cancelling' ? t('employeeChangeRequest.cancelling') : t('employeeChangeRequest.cancel')}
            </button>
          )}
        </div>
      )}

      <form className="employee-change-request__form" onSubmit={handleSubmit}>
        <div className="ac-form-field employee-change-request__field">
          <div className="ac-form-field__head">
            <label className="ac-form-field__label" htmlFor="employee-change-request-type">{t('employeeChangeRequest.typeLabel')}</label>
          </div>
          <div className="ac-form-field__control">
            <select
              id="employee-change-request-type"
              className="field-select"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as ChangeRequestType)}
              disabled={actionState === 'submitting'}
            >
              <option value="TIME_CHANGE">{t('employeeChangeRequest.timeChange')}</option>
              <option value="OTHER">{t('employeeChangeRequest.other')}</option>
            </select>
          </div>
        </div>

        {requestType === 'TIME_CHANGE' && (
          <div className="employee-change-request__time-fields">
            <div className="ac-form-field">
              <div className="ac-form-field__head">
                <label className="ac-form-field__label" htmlFor="employee-change-request-start-time">{t('employeeChangeRequest.requestedStartTime')}</label>
              </div>
              <div className="ac-form-field__control">
              <input
                id="employee-change-request-start-time"
                className="field-input"
                type="time"
                value={requestedStartTime}
                onChange={(event) => setRequestedStartTime(event.target.value)}
                disabled={actionState === 'submitting'}
                required
              />
              </div>
            </div>
            <div className="ac-form-field">
              <div className="ac-form-field__head">
                <label className="ac-form-field__label" htmlFor="employee-change-request-end-time">{t('employeeChangeRequest.requestedEndTime')}</label>
              </div>
              <div className="ac-form-field__control">
              <input
                id="employee-change-request-end-time"
                className="field-input"
                type="time"
                value={requestedEndTime}
                onChange={(event) => setRequestedEndTime(event.target.value)}
                disabled={actionState === 'submitting'}
                required
              />
              </div>
            </div>
          </div>
        )}

        <div className="ac-form-field employee-change-request__field" data-invalid={reasonInvalid || undefined}>
          <div className="ac-form-field__head">
            <label className="ac-form-field__label" htmlFor="employee-change-request-reason">{t('employeeChangeRequest.reasonLabel')} <abbr title="required" aria-hidden="true">*</abbr></label>
          </div>
          <div className="ac-form-field__control">
            <textarea
              id="employee-change-request-reason"
              className="field-textarea"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonInvalid(false);
                if (feedback) setFeedback('');
              }}
              placeholder={t('employeeChangeRequest.placeholder')}
              maxLength={MAX_REASON_LENGTH}
              rows={4}
              required
              aria-invalid={reasonInvalid}
              aria-describedby="employee-change-request-hint employee-change-request-feedback"
              disabled={actionState === 'submitting'}
            />
            <p id="employee-change-request-feedback" className="ac-form-field__message" data-tone={reasonInvalid ? 'danger' : undefined} role={feedback ? (reasonInvalid || actionState === 'error' ? 'alert' : 'status') : undefined} aria-live="polite">
              {feedback}
            </p>
          </div>
        </div>
        <div className="employee-change-request__form-footer">
          <span id="employee-change-request-hint">{t('employeeChangeRequest.characterCount', { count: reason.length })}</span>
          <button type="submit" disabled={actionState === 'submitting'}>
            <Send size={15} aria-hidden="true" />
            {actionState === 'submitting' ? t('employeeChangeRequest.submitting') : t('employeeChangeRequest.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}

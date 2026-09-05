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
}

const MAX_REASON_LENGTH = 2000;

export function ChangeRequestForm({ shiftId, shiftStartTime, shiftEndTime }: ChangeRequestFormProps) {
  const { t } = useI18n();
  const [requestType, setRequestType] = useState<ChangeRequestType>('TIME_CHANGE');
  const [reason, setReason] = useState('');
  const [requestedStartTime, setRequestedStartTime] = useState(shiftStartTime);
  const [requestedEndTime, setRequestedEndTime] = useState(shiftEndTime);
  const [request, setRequest] = useState<ChangeRequest | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [feedback, setFeedback] = useState('');

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
      setFeedback(t('employeeChangeRequest.emptyValidation'));
      return;
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      setFeedback(t('employeeChangeRequest.tooLong'));
      return;
    }

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
      setReason('');
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
        <label htmlFor="employee-change-request-type">{t('employeeChangeRequest.typeLabel')}</label>
        <select
          id="employee-change-request-type"
          value={requestType}
          onChange={(event) => setRequestType(event.target.value as ChangeRequestType)}
          disabled={actionState === 'submitting'}
        >
          <option value="TIME_CHANGE">{t('employeeChangeRequest.timeChange')}</option>
          <option value="OTHER">{t('employeeChangeRequest.other')}</option>
        </select>

        {requestType === 'TIME_CHANGE' && (
          <div className="employee-change-request__time-fields">
            <div>
              <label htmlFor="employee-change-request-start-time">{t('employeeChangeRequest.requestedStartTime')}</label>
              <input
                id="employee-change-request-start-time"
                type="time"
                value={requestedStartTime}
                onChange={(event) => setRequestedStartTime(event.target.value)}
                disabled={actionState === 'submitting'}
                required
              />
            </div>
            <div>
              <label htmlFor="employee-change-request-end-time">{t('employeeChangeRequest.requestedEndTime')}</label>
              <input
                id="employee-change-request-end-time"
                type="time"
                value={requestedEndTime}
                onChange={(event) => setRequestedEndTime(event.target.value)}
                disabled={actionState === 'submitting'}
                required
              />
            </div>
          </div>
        )}

        <label htmlFor="employee-change-request-reason">{t('employeeChangeRequest.reasonLabel')}</label>
        <textarea
          id="employee-change-request-reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            if (feedback) setFeedback('');
          }}
          placeholder={t('employeeChangeRequest.placeholder')}
          maxLength={MAX_REASON_LENGTH}
          rows={4}
          aria-describedby="employee-change-request-hint employee-change-request-feedback"
          disabled={actionState === 'submitting'}
        />
        <div className="employee-change-request__form-footer">
          <span id="employee-change-request-hint">{t('employeeChangeRequest.characterCount', { count: reason.length })}</span>
          <button type="submit" disabled={actionState === 'submitting'}>
            <Send size={15} aria-hidden="true" />
            {actionState === 'submitting' ? t('employeeChangeRequest.submitting') : t('employeeChangeRequest.submit')}
          </button>
        </div>
        <p
          id="employee-change-request-feedback"
          className="employee-change-request__feedback"
          role={feedback ? (actionState === 'error' ? 'alert' : 'status') : undefined}
          aria-live="polite"
        >
          {feedback}
        </p>
      </form>
    </section>
  );
}

import { MessageSquare, RotateCcw, Send } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createRemoteShiftComment, loadRemoteShiftComments, ShiftComment } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

type CommentsState =
  | { status: 'loading'; comments: ShiftComment[] }
  | { status: 'ready'; comments: ShiftComment[] }
  | { status: 'error'; comments: ShiftComment[] };

type SubmitState = 'idle' | 'submitting' | 'error';

interface ShiftCommentsProps {
  shiftId: string;
}

const MAX_COMMENT_LENGTH = 2000;

export function ShiftComments({ shiftId }: ShiftCommentsProps) {
  const { t } = useI18n();
  const [state, setState] = useState<CommentsState>({ status: 'loading', comments: [] });
  const [body, setBody] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setState((current) => ({ status: 'loading', comments: current.comments }));
    try {
      const comments = await loadRemoteShiftComments(shiftId);
      setState({ status: 'ready', comments });
    } catch {
      setState((current) => ({ status: 'error', comments: current.comments }));
    }
  }, [shiftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody || submitState === 'submitting') {
      setFeedback(t('employeeComments.emptyValidation'));
      return;
    }
    if (trimmedBody.length > MAX_COMMENT_LENGTH) {
      setFeedback(t('employeeComments.tooLong'));
      return;
    }

    setSubmitState('submitting');
    setFeedback('');
    try {
      const comment = await createRemoteShiftComment(shiftId, trimmedBody);
      setState((current) => ({
        status: 'ready',
        comments: current.comments.concat(comment),
      }));
      setBody('');
      setSubmitState('idle');
      setFeedback(t('employeeComments.sent'));
    } catch {
      setSubmitState('error');
      setFeedback(t('employeeComments.sendError'));
    }
  };

  return (
    <section className="employee-shift-comments" aria-labelledby="employee-shift-comments-title" data-testid="shift-comments">
      <div className="employee-shift-comments__heading">
        <div>
          <p className="employee-shift-comments__eyebrow">{t('employeeComments.eyebrow')}</p>
          <h3 id="employee-shift-comments-title">
            <MessageSquare size={18} aria-hidden="true" />
            {t('employeeComments.title')}
          </h3>
        </div>
        <span className="employee-shift-comments__count" aria-label={t('employeeComments.count', { count: state.comments.length })}>
          {state.comments.length}
        </span>
      </div>

      {state.status === 'loading' && (
        <p className="employee-shift-comments__status" role="status" aria-busy="true">{t('employeeComments.loading')}</p>
      )}

      {state.status === 'error' && (
        <div className="employee-shift-comments__status employee-shift-comments__status--error" role="alert">
          <p>{t('employeeComments.error')}</p>
          <button type="button" className="employee-shift-comments__retry" onClick={() => void load()}>
            <RotateCcw size={15} aria-hidden="true" />
            {t('employeeComments.retry')}
          </button>
        </div>
      )}

      {state.status !== 'loading' && state.comments.length === 0 && (
        <p className="employee-shift-comments__empty">{t('employeeComments.empty')}</p>
      )}

      {state.comments.length > 0 && (
        <ol className="employee-shift-comments__list" aria-label={t('employeeComments.listLabel')}>
          {state.comments.map((comment) => (
            <li key={comment.id}>
              <time dateTime={comment.createdAt}>{comment.createdAt}</time>
              <p>{comment.body}</p>
            </li>
          ))}
        </ol>
      )}

      <form className="employee-shift-comments__form" onSubmit={handleSubmit}>
        <label htmlFor="employee-shift-comment-body">{t('employeeComments.label')}</label>
        <textarea
          id="employee-shift-comment-body"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            if (feedback) setFeedback('');
          }}
          placeholder={t('employeeComments.placeholder')}
          maxLength={MAX_COMMENT_LENGTH}
          rows={3}
          aria-describedby="employee-shift-comment-hint employee-shift-comment-feedback"
          disabled={submitState === 'submitting'}
        />
        <div className="employee-shift-comments__form-footer">
          <span id="employee-shift-comment-hint">{t('employeeComments.characterCount', { count: body.length })}</span>
          <button type="submit" disabled={submitState === 'submitting'}>
            <Send size={15} aria-hidden="true" />
            {submitState === 'submitting' ? t('employeeComments.submitting') : t('employeeComments.submit')}
          </button>
        </div>
        <p id="employee-shift-comment-feedback" className="employee-shift-comments__feedback" role={feedback ? (submitState === 'error' ? 'alert' : 'status') : undefined} aria-live="polite">
          {feedback}
        </p>
      </form>
    </section>
  );
}

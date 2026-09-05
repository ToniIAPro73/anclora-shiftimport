import { Clock3, MapPin, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Shift } from '../../lib/types';
import { loadRemoteTodayShifts } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

type TodayState =
  | { status: 'loading'; shifts: Shift[] }
  | { status: 'ready'; shifts: Shift[] }
  | { status: 'error'; shifts: Shift[] };

export function Today() {
  const { t } = useI18n();
  const [state, setState] = useState<TodayState>({ status: 'loading', shifts: [] });

  const load = useCallback(async () => {
    setState({ status: 'loading', shifts: [] });
    try {
      const shifts = await loadRemoteTodayShifts();
      setState({ status: 'ready', shifts });
    } catch {
      setState({ status: 'error', shifts: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <section className="employee-today" aria-labelledby="employee-today-title" aria-busy="true" data-testid="today-loading">
        <p className="employee-today__eyebrow">{t('employeeToday.eyebrow')}</p>
        <h2 id="employee-today-title">{t('employeeToday.loading')}</h2>
        <div className="employee-today__skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="employee-today employee-today--error" aria-labelledby="employee-today-title" role="alert" data-testid="today-error">
        <p className="employee-today__eyebrow">{t('employeeToday.eyebrow')}</p>
        <h2 id="employee-today-title">{t('employeeToday.errorTitle')}</h2>
        <p className="employee-today__description">{t('employeeToday.errorDescription')}</p>
        <button type="button" className="employee-today__retry" onClick={() => void load()}>
          <RotateCcw size={16} aria-hidden="true" />
          {t('employeeToday.retry')}
        </button>
      </section>
    );
  }

  if (state.shifts.length === 0) {
    return (
      <section className="employee-today" aria-labelledby="employee-today-title" data-testid="today-empty">
        <p className="employee-today__eyebrow">{t('employeeToday.eyebrow')}</p>
        <h2 id="employee-today-title">{t('employeeToday.emptyTitle')}</h2>
        <p className="employee-today__description">{t('employeeToday.emptyDescription')}</p>
      </section>
    );
  }

  return (
    <section className="employee-today" aria-labelledby="employee-today-title" data-testid="today-shifts">
      <p className="employee-today__eyebrow">{t('employeeToday.eyebrow')}</p>
      <h2 id="employee-today-title">{t('employeeToday.title')}</h2>
      <p className="employee-today__description">{t('employeeToday.description')}</p>
      <div className="employee-today__list">
        {state.shifts.map((shift) => (
          <article className="employee-today__card" key={shift.id} aria-label={t('employeeToday.shiftLabel', { start: shift.startTime, end: shift.endTime })}>
            <div className="employee-today__card-head">
              <span className="employee-today__status">{t('employeeToday.published')}</span>
              <span className="employee-today__date">{shift.date}</span>
            </div>
            <div className="employee-today__time">
              <Clock3 size={22} aria-hidden="true" />
              <span>
                <time dateTime={`${shift.date}T${shift.startTime}`}>{shift.startTime}</time>
                <span aria-hidden="true"> — </span>
                <time dateTime={`${shift.date}T${shift.endTime}`}>{shift.endTime}</time>
              </span>
            </div>
            <p className="employee-today__meta">
              <MapPin size={16} aria-hidden="true" />
              <span>{shift.location.trim() || t('employeeToday.noLocation')}</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

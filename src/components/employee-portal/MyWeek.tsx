import { ChevronLeft, ChevronRight, Clock3, MapPin, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addWeeks, fromISODate, getWeekDaysISO, getWeekStartMonday, toISODate } from '../../lib/week';
import { Shift } from '../../lib/types';
import { loadRemoteWeekShifts } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

type WeekState =
  | { status: 'loading'; shifts: Shift[] }
  | { status: 'ready'; shifts: Shift[] }
  | { status: 'error'; shifts: Shift[] };

const localeFor = (locale: string): string => (locale === 'es' ? 'es-ES' : 'en-GB');

function formatDayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(localeFor(locale), { weekday: 'long', day: 'numeric', month: 'short' })
    .format(fromISODate(date));
}

function formatWeekRange(days: string[], locale: string): string {
  const formatter = new Intl.DateTimeFormat(localeFor(locale), { day: 'numeric', month: 'short', year: 'numeric' });
  return `${formatter.format(fromISODate(days[0]))} — ${formatter.format(fromISODate(days[6]))}`;
}

export function MyWeek() {
  const { locale, t } = useI18n();
  const [weekStart, setWeekStart] = useState(() => toISODate(getWeekStartMonday(new Date())));
  const [state, setState] = useState<WeekState>({ status: 'loading', shifts: [] });
  const weekDays = useMemo(() => getWeekDaysISO(weekStart), [weekStart]);
  const today = toISODate(new Date());

  const load = useCallback(async () => {
    setState({ status: 'loading', shifts: [] });
    try {
      const result = await loadRemoteWeekShifts(weekStart);
      setState({ status: 'ready', shifts: result.shifts });
    } catch {
      setState({ status: 'error', shifts: [] });
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const navigateWeek = (offset: number) => setWeekStart((current) => addWeeks(current, offset));
  const rangeLabel = formatWeekRange(weekDays, locale);

  return (
    <section className="employee-week" aria-labelledby="employee-week-title" data-testid="my-week">
      <div className="employee-week__heading">
        <div>
          <p className="employee-week__eyebrow">{t('employeeWeek.eyebrow')}</p>
          <h2 id="employee-week-title">{t('employeeWeek.title')}</h2>
          <p className="employee-week__range" aria-live="polite">{rangeLabel}</p>
        </div>
        <div className="employee-week__controls" aria-label={t('employeeWeek.weekNavigation')}>
          <button type="button" onClick={() => navigateWeek(-1)} aria-label={t('employeeWeek.previousWeek')}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => navigateWeek(1)} aria-label={t('employeeWeek.nextWeek')}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="employee-week__status" role="status" aria-busy="true" data-testid="my-week-loading">
          {t('employeeWeek.loading')}
        </div>
      )}

      {state.status === 'error' && (
        <div className="employee-week__status employee-week__status--error" role="alert" data-testid="my-week-error">
          <p>{t('employeeWeek.errorDescription')}</p>
          <button type="button" className="employee-week__retry" onClick={() => void load()}>
            <RotateCcw size={15} aria-hidden="true" />
            {t('employeeWeek.retry')}
          </button>
        </div>
      )}

      {state.status !== 'error' && (
        <div className="employee-week__days" aria-label={t('employeeWeek.daysLabel')}>
          {weekDays.map((day) => {
            const shifts = state.shifts.filter((shift) => shift.date === day);
            const isToday = day === today;
            return (
              <article className={`employee-week__day${isToday ? ' employee-week__day--today' : ''}`} key={day}>
                <header className="employee-week__day-header">
                  <h3>{formatDayLabel(day, locale)}</h3>
                  {isToday && <span className="employee-week__today-label">{t('employeeWeek.today')}</span>}
                </header>
                {state.status === 'loading' ? (
                  <p className="employee-week__day-status" aria-hidden="true">…</p>
                ) : shifts.length === 0 ? (
                  <p className="employee-week__day-status">{t('employeeWeek.free')}</p>
                ) : (
                  <div className="employee-week__shifts">
                    {shifts.map((shift) => (
                      <div className="employee-week__shift" key={shift.id} aria-label={t('employeeWeek.shiftLabel', { start: shift.startTime, end: shift.endTime })}>
                        <p className="employee-week__shift-time">
                          <Clock3 size={15} aria-hidden="true" />
                          <span>{shift.startTime} — {shift.endTime}</span>
                        </p>
                        <p className="employee-week__shift-location">
                          <MapPin size={13} aria-hidden="true" />
                          <span>{shift.location.trim() || t('employeeWeek.noLocation')}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

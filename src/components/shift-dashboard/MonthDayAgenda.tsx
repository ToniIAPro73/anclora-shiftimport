import { Plus } from 'lucide-react';
import type { Shift } from '../../lib/types';
import { getShiftOrigin, getShiftType, hasShiftTimes } from '../../lib/shifts';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';

interface MonthDayAgendaProps {
  date: string;
  shifts: Shift[];
  /** Same policy as the per-cell `+` of the month grid (role × date × editable draft). */
  addDisabled: boolean;
  addLabel: string;
  onAdd: () => void;
  onOpenDetail: () => void;
  onOpenShift: (shift: Shift) => void;
}

/** Compact (≤640px) day panel: the cell only shows a short chip, the full detail lives here. */
export const MonthDayAgenda = ({ date, shifts, addDisabled, addLabel, onAdd, onOpenDetail, onOpenShift }: MonthDayAgendaProps) => {
  const { locale, t } = useI18n();
  const headingId = `month-day-agenda-title-${date}`;
  const dateLabel = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

  return (
    <section className="month-day-agenda" data-testid="month-day-agenda" data-date={date} aria-labelledby={headingId}>
      <header className="month-day-agenda__header">
        <h3 id={headingId} className="month-day-agenda__title">{t('calendar.agendaTitle', { date: dateLabel })}</h3>
        <div className="month-day-agenda__actions">
          <button
            type="button"
            className="month-day-agenda__action"
            onClick={onAdd}
            disabled={addDisabled}
            aria-label={addLabel}
            title={addLabel}
            data-testid="month-day-agenda-add"
          >
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" className="month-day-agenda__detail" onClick={onOpenDetail} data-testid="month-day-agenda-detail">
            {t('calendar.agendaDetail')}
          </button>
        </div>
      </header>
      {shifts.length === 0 ? (
        <p className="month-day-agenda__empty" role="status">{t('calendar.agendaEmpty')}</p>
      ) : (
        <ul className="month-day-agenda__list">
          {shifts.map((shift) => {
            const typeId = getShiftType(shift);
            const label = translateShiftTypeLabel(typeId, locale, typeId);
            const origin = shift.isDraft
              ? t('calendar.draftBadge')
              : getShiftOrigin(shift) === 'IMP' ? t('importConflict.describeImported') : t('importConflict.describeManual');
            return (
              <li key={shift.id}>
                <button
                  type="button"
                  className="month-shift-badge month-day-agenda__shift"
                  data-shift-type={typeId}
                  data-shift-visual={getShiftVisualTokenKey(typeId)}
                  data-draft={shift.isDraft || undefined}
                  onClick={() => onOpenShift(shift)}
                >
                  {origin} {label}{hasShiftTimes(shift) ? ` ${shift.startTime}–${shift.endTime}` : ''}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

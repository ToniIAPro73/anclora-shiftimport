import { useEffect, useId, useState } from 'react';
import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronRight, ChevronUp, Clock, Hourglass, History, Lock, MessageSquare, Plus } from 'lucide-react';
import type { Shift } from '../../lib/types';
import { getShiftOrigin, getShiftType, hasShiftTimes } from '../../lib/shifts';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';

export const AGENDA_VISIBLE_ROWS = 3;

/** What the selected day carries besides its shifts. Only what exists (and is allowed) is shown. */
export interface DayAgendaExtras {
  /** Pending proposals (REQUIRES_REVIEW) of the day. */
  warnings: number;
  dcf: number;
  comments: number;
  /** A visible change (change layer / history that differs), never a technical event alone. */
  changed: boolean;
  /** Own vacation request awaiting a decision: a visual layer, never a shift. */
  pendingVacation: boolean;
}

export type DayAgendaSection = 'warnings' | 'dcf' | 'comments' | 'history';

interface MonthDayAgendaProps {
  date: string;
  /** Effective (CURRENT) shifts of the day, already sorted. */
  shifts: Shift[];
  extras: DayAgendaExtras;
  /** Same policy as the desktop per-cell `+` (role × date × editable draft). */
  addDisabled: boolean;
  /** Visible reason when adding is blocked; also the accessible description of the disabled button. */
  addBlockedReason: string | null;
  onAdd: () => void;
  onOpenDetail: () => void;
  onOpenSection: (section: DayAgendaSection) => void;
  onOpenShift: (shift: Shift) => void;
}

/**
 * Compact (≤640px) day panel, right under the month grid: the cells only choose a day and summarise it with dots;
 * everything actionable about that day lives here. Empty days show a single line and the add action.
 */
export const MonthDayAgenda = ({ date, shifts, extras, addDisabled, addBlockedReason, onAdd, onOpenDetail, onOpenSection, onOpenShift }: MonthDayAgendaProps) => {
  const { locale, t } = useI18n();
  const headingId = `month-day-agenda-title-${date}`;
  const reasonId = useId();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [date]);

  const date_ = new Date(`${date}T00:00:00Z`);
  const intl = locale === 'es' ? 'es-ES' : 'en-GB';
  const short = new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(date_);
  const pick = (type: string) => short.find((part) => part.type === type)?.value ?? '';
  const capital = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  // One short line ("Jue 5 nov." / "Thu 5 Nov"); the complete weekday + month stays available to assistive technology.
  const weekday = pick('weekday').replace('.', '');
  const month = pick('month');
  const title = locale === 'es' ? `${capital(weekday)} ${pick('day')} ${month.endsWith('.') ? month : `${month}.`}` : `${capital(weekday)} ${pick('day')} ${capital(month)}`;
  const fullDate = new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date_);

  const hidden = Math.max(0, shifts.length - AGENDA_VISIBLE_ROWS);
  const rows = expanded ? shifts : shifts.slice(0, AGENDA_VISIBLE_ROWS);
  const hasExtras = extras.warnings > 0 || extras.dcf > 0 || extras.comments > 0 || extras.changed;
  // "See details" is the way into the day detail; when warnings/DCF/comments/history are shown they already open it, so it would be a duplicate.
  const hasDetail = shifts.length > 0 || hasExtras || extras.pendingVacation;
  const countLabel = shifts.length === 1 ? t('calendar.agendaCountOne') : t('calendar.agendaCountMany', { count: shifts.length });

  const pills: Array<{ section: DayAgendaSection; label: string; count: number | null; icon: JSX.Element }> = [];
  if (extras.warnings > 0) pills.push({ section: 'warnings', label: t('calendar.agendaWarnings'), count: extras.warnings, icon: <AlertTriangle size={14} aria-hidden="true" /> });
  if (extras.dcf > 0) pills.push({ section: 'dcf', label: t('calendar.agendaDcf'), count: extras.dcf > 1 ? extras.dcf : null, icon: <Clock size={14} aria-hidden="true" /> });
  if (extras.comments > 0) pills.push({ section: 'comments', label: t('calendar.agendaComments'), count: extras.comments, icon: <MessageSquare size={14} aria-hidden="true" /> });
  if (extras.changed) pills.push({ section: 'history', label: t('calendar.agendaHistory'), count: null, icon: <History size={14} aria-hidden="true" /> });

  return (
    <section className="month-day-agenda" data-testid="month-day-agenda" data-date={date} data-empty={shifts.length === 0 || undefined} aria-labelledby={headingId}>
      <header className="month-day-agenda__header">
        <h3 id={headingId} className="month-day-agenda__title" aria-label={fullDate}>{title}</h3>
        <div className="month-day-agenda__header-actions">
          {hasDetail && pills.length === 0 && (
            <button type="button" className="month-day-agenda__detail" onClick={onOpenDetail} aria-label={t('calendar.agendaDetail')} title={t('calendar.agendaDetail')} data-testid="month-day-agenda-detail">
              <ArrowUpRight size={18} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="month-day-agenda__add"
            onClick={onAdd}
            disabled={addDisabled}
            aria-label={t('calendar.agendaAdd')}
            aria-describedby={addDisabled && addBlockedReason ? reasonId : undefined}
            data-testid="month-day-agenda-add"
          >
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            <span aria-hidden="true">{t('calendar.agendaAddShort')}</span>
          </button>
        </div>
      </header>

      {addDisabled && addBlockedReason && <p id={reasonId} className="month-day-agenda__blocked" data-testid="month-day-agenda-blocked">{addBlockedReason}</p>}

      {shifts.length === 0 ? (
        <p className="month-day-agenda__empty" role="status">{t('calendar.agendaEmpty')}</p>
      ) : (
        <ul className="month-day-agenda__list" aria-label={countLabel} data-testid="month-day-agenda-list">
          {rows.map((shift) => {
            const typeId = getShiftType(shift);
            const label = translateShiftTypeLabel(typeId, locale, typeId);
            const origin = shift.isDraft
              ? t('calendar.draftBadge')
              : getShiftOrigin(shift) === 'IMP' ? t('importConflict.describeImported') : t('importConflict.describeManual');
            const times = hasShiftTimes(shift) ? `${shift.startTime}–${shift.endTime}` : '';
            const protectedAbsence = Boolean(shift.timeOffRequestId) && shift.effectiveState !== 'SUPERSEDED';
            return (
              <li key={shift.id}>
                <button
                  type="button"
                  className="month-day-agenda__row"
                  data-shift-type={typeId}
                  data-shift-visual={getShiftVisualTokenKey(typeId)}
                  data-draft={shift.isDraft || undefined}
                  data-testid={`month-day-agenda-shift-${shift.id}`}
                  aria-label={`${origin} ${label}${times ? ` ${times}` : ''}${protectedAbsence ? ` — ${t('calendar.protectedVacation')}` : ''}`}
                  onClick={() => onOpenShift(shift)}
                >
                  <span className="month-dot" data-shift-type={typeId} data-shift-visual={getShiftVisualTokenKey(typeId)} data-draft={shift.isDraft || undefined} aria-hidden="true" />
                  <span className="month-day-agenda__row-main">
                    <strong>{label}</strong>
                    {times && <span className="month-day-agenda__row-times">{times}</span>}
                    <span className="month-day-agenda__row-origin" aria-hidden="true">· {origin.replace(/[()]/g, '')}</span>
                  </span>
                  {protectedAbsence && <Lock size={13} className="month-day-agenda__row-lock" aria-hidden="true" />}
                  <ChevronRight size={16} className="month-day-agenda__row-chevron" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 && (
        <button type="button" className="month-day-agenda__more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} data-testid="month-day-agenda-more">
          {expanded ? t('calendar.agendaLess') : t('calendar.agendaMore', { count: hidden })}
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      )}

      {extras.pendingVacation && (
        <p className="month-day-agenda__pending" data-testid="month-day-agenda-pending-vacation">
          <Hourglass size={14} aria-hidden="true" /> {t('calendar.agendaPending')}
        </p>
      )}

      {pills.length > 0 && (
        <div className="month-day-agenda__pills" role="group" aria-label={t('calendar.agendaActionsLabel')}>
          {pills.map((pill) => (
            <button key={pill.section} type="button" className="month-day-agenda__pill" data-kind={pill.section} data-testid={`month-day-agenda-${pill.section}`} onClick={() => onOpenSection(pill.section)}>
              {pill.icon}
              <span>{pill.label}</span>
              {pill.count !== null && <span className="month-day-agenda__pill-count">{pill.count}</span>}
            </button>
          ))}
        </div>
      )}

    </section>
  );
};

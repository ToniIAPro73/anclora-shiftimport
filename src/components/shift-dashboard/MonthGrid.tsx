import { useEffect, useMemo, useRef, useState } from 'react';
import { Shift } from '../../lib/types';
import { getDaysInMonth, getFirstWeekdayOfMonth, orderWeekdayLabels } from '../../lib/week';
import { getShiftOrigin, getShiftType, hasShiftTimes } from '../../lib/shifts';
import { getWeekStartsOn, translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { getOperationalDate, isHistoricalDate } from '../../lib/operational-date';
import { AlertTriangle, History, MessageSquare, Plus } from 'lucide-react';
import type { Role } from '../../lib/session';
import { calendarActionReason, getCalendarAction } from '../../lib/calendar-actions';
import { sortDayShifts } from '../../lib/shifts';
import { DayDetailModal } from './DayDetailModal';
import type { DayAnnotation } from '../../lib/remote';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';

export const MAX_VISIBLE_DAY_ITEMS = 2;

interface MonthGridProps {
  year: number;
  month: number;
  shifts: Shift[];
  onEditShift: (id: string) => void;
  onDeleteShift?: (id: string) => void | Promise<void>;
  onCreateShift: (date: string) => void;
  role?: Role | null;
  editableScheduleDates?: ReadonlySet<string>;
  /** Employee whose effective calendar is displayed (backend sessions). */
  employeeId?: string | null;
  /** Day provenance is only available with a backend session. */
  provenanceEnabled?: boolean;
  canReconcile?: boolean;
  /** Opens the day detail from outside (e.g. unresolved-day links). */
  requestedDetailDate?: string | null;
  /** Changes on every request so the same date can be opened again. */
  requestedDetailNonce?: number;
  onDayChanged?: () => void;
  /** DCF incidences / observations of the visible month. */
  annotations?: DayAnnotation[];
  canEditAnnotations?: boolean;
  onAnnotationsChanged?: () => void;
}

export const MonthGrid = ({
  year,
  month,
  shifts,
  onEditShift,
  onDeleteShift,
  onCreateShift,
  role = null,
  editableScheduleDates = new Set<string>(),
  employeeId = null,
  provenanceEnabled = false,
  canReconcile = false,
  requestedDetailDate = null,
  requestedDetailNonce = 0,
  onDayChanged,
  annotations = [],
  canEditAnnotations = false,
  onAnnotationsChanged,
}: MonthGridProps) => {
  const { locale, t, tl } = useI18n();
  const weekStartsOn = getWeekStartsOn(locale);
  const weekdayLabels = orderWeekdayLabels(tl('calendar.weekdays'), weekStartsOn);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [isTouchUi, setIsTouchUi] = useState(false);
  const [selectedDayDetailDate, setSelectedDayDetailDate] = useState<string | null>(null);
  const dayDetailTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (requestedDetailDate) {
      setSelectedDayDetailDate(requestedDetailDate);
    }
  }, [requestedDetailDate, requestedDetailNonce]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(pointer: coarse), (hover: none)');
    const update = () => setIsTouchUi(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  useEffect(() => {
    setExpandedShiftId(null);
  }, [month, year, shifts.length]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekdayOfMonth(year, month, weekStartsOn);
  const todayISO = getOperationalDate();

  const cells: Array<number | null> = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const getShiftsForDay = (day: number) => {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return shifts.filter((shift) => shift.date === iso);
  };

  const handleShiftPress = (shift: Shift) => {
    // Planning drafts are reviewed and published from Planning; from the Calendar they only open the day.
    if (shift.isDraft) {
      setSelectedDayDetailDate(shift.date);
      return;
    }
    if (!isTouchUi) {
      onEditShift(shift.id);
      return;
    }

    if (expandedShiftId === shift.id) {
      setExpandedShiftId(null);
      onEditShift(shift.id);
      return;
    }

    setExpandedShiftId(shift.id);
  };

  const renderShiftBadge = (shift: Shift) => {
    const shiftTypeId = getShiftType(shift);
    const shiftType = translateShiftTypeLabel(shiftTypeId, locale, shiftTypeId);
    const shiftOrigin = getShiftOrigin(shift);
    const hasTimes = hasShiftTimes(shift);
    const originPrefix = shift.isDraft ? t('calendar.draftBadge') : shiftOrigin === 'IMP' ? t('importConflict.describeImported') : t('importConflict.describeManual');
    const isExpanded = expandedShiftId === shift.id;

    return (
      <button
        type="button"
        key={shift.id}
        data-shift-type={shiftTypeId}
        data-shift-visual={getShiftVisualTokenKey(shiftTypeId)}
        className={`month-shift-badge${isExpanded ? ' is-expanded' : ''}${shift.isDraft ? ' is-draft' : ''}`}
        data-draft={shift.isDraft || undefined}
        onClick={(event) => {
          event.stopPropagation();
          handleShiftPress(shift);
        }}
        onBlur={() => {
          if (expandedShiftId === shift.id) {
            setExpandedShiftId(null);
          }
        }}
        title={`${originPrefix} ${shiftType}${hasTimes ? ` ${shift.startTime}-${shift.endTime}` : ''}`}
      >
        {originPrefix} {shiftType}{hasTimes ? ` ${shift.startTime}–${shift.endTime}` : ''}
      </button>
    );
  };

  const renderShiftStack = (dayShifts: Shift[]) => (
    <div
      className="month-origin-section"
      data-shift-count={dayShifts.length}
    >
      {dayShifts.map((shift) => renderShiftBadge(shift))}
    </div>
  );

  const currentDayDetailShifts = useMemo(() => {
    if (!selectedDayDetailDate) return [];
    return shifts.filter((s) => s.date === selectedDayDetailDate);
  }, [shifts, selectedDayDetailDate]);

  return (
    <div className="month-grid-shell">
      <div className="month-grid-root">
        <div className="month-weekdays-row">
          {weekdayLabels.map((label, index) => (
            <div
              key={label}
              className="month-weekday-cell"
              style={{ color: index >= 5 ? 'var(--color-gold)' : 'var(--text-subtle)' }}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="month-grid-cells" style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(0, 1fr))` }}>
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`blank-${index}`} className="month-grid-blank" />;
            }

            const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayShifts = getShiftsForDay(day);
            const sortedDayShifts = sortDayShifts(dayShifts);
            const visibleShifts = sortedDayShifts.slice(0, MAX_VISIBLE_DAY_ITEMS);
            const hiddenCount = sortedDayShifts.length - MAX_VISIBLE_DAY_ITEMS;
            const isToday = iso === todayISO;
            const isWeekend = index % 7 >= 5;
            const hasVacationShift = dayShifts.some((shift) => getShiftType(shift) === 'Vacaciones');
            const isHistorical = isHistoricalDate(iso, todayISO);
            const needsReview = dayShifts.some((shift) => shift.effectiveState === 'REQUIRES_REVIEW');
            const dayAnnotations = annotations.filter((item) => item.date === iso);
            const hasDcf = dayAnnotations.some((item) => item.kind === 'DCF');
            const hasComment = dayAnnotations.some((item) => item.kind === 'COMMENT');
            const hasChange = dayShifts.some((shift) => shift.layer === 'CHANGE' || Boolean(shift.changeId) || shift.hasHistory === true);
            const actionInput = { date: iso, today: todayISO, role, hasEditableSchedule: editableScheduleDates.has(iso), hasVacation: hasVacationShift };
            const action = getCalendarAction(actionInput);
            const reason = calendarActionReason(action, actionInput);
            const actionDisabled = action === 'DISABLED';
            const actionLabel = reason === 'employee_future'
              ? t('calendar.employeeFutureBlocked')
              : reason === 'no_schedule'
                ? t('calendar.noEditableSchedule')
                : hasVacationShift
                  ? t('calendar.addShiftBlockedAria', { date: iso })
                  : isHistorical ? t('calendar.addShiftAria', { date: iso }) : t('calendar.planShiftAria', { date: iso });

            return (
              <div
                key={day}
                className={hasVacationShift ? 'month-day-cell has-add-disabled' : 'month-day-cell'}
                data-today={isToday || undefined}
                onClick={() => {
                  if (expandedShiftId) {
                    setExpandedShiftId(null);
                  }
                }}
                style={{
                  background: isToday ? 'var(--day-today-bg)' : 'var(--glass-bg)',
                  border: isToday ? '1px solid var(--color-gold)' : '1px solid var(--border-soft)',
                }}
              >
                <div className="month-day-header">
                  <div
                    className="month-day-number"
                    style={{ color: isToday ? 'var(--color-gold)' : isWeekend ? 'var(--text-muted)' : 'var(--text-primary)' }}
                  >
                    {day}
                  </div>
                  {(hasDcf || hasComment) && (
                    <span className="month-day-annotations" data-testid={`day-annotations-${iso}`}>
                      {hasDcf && (
                        <button
                          type="button"
                          className="month-day-dcf-chip"
                          onClick={(event) => { event.stopPropagation(); dayDetailTriggerRef.current = event.currentTarget; setSelectedDayDetailDate(iso); }}
                          aria-label={t('annotations.dcfIndicatorAria', { date: iso })}
                          title={t('annotations.dcfName')}
                          data-testid={`day-dcf-${iso}`}
                        >
                          DCF
                        </button>
                      )}
                      {hasComment && (
                        <button
                          type="button"
                          className="month-day-comment-chip"
                          onClick={(event) => { event.stopPropagation(); dayDetailTriggerRef.current = event.currentTarget; setSelectedDayDetailDate(iso); }}
                          aria-label={t('annotations.commentIndicatorAria', { date: iso })}
                          title={t('annotations.commentsTitle')}
                          data-testid={`day-comment-${iso}`}
                        >
                          <MessageSquare size={11} strokeWidth={2.2} />
                        </button>
                      )}
                    </span>
                  )}
                  {provenanceEnabled && (needsReview || hasChange) && (
                    <button
                      type="button"
                      className="month-day-history-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        dayDetailTriggerRef.current = event.currentTarget;
                        setSelectedDayDetailDate(iso);
                      }}
                      aria-label={needsReview ? t('calendarTools.dayWarning') : `${t('dayHistory.changedBadge')} — ${t('dayHistory.open')}`}
                      title={needsReview ? t('calendarTools.dayWarning') : t('dayHistory.changedBadge')}
                      data-testid={`day-history-btn-${iso}`}
                      data-review={needsReview || undefined}
                    >
                      {needsReview ? <AlertTriangle size={13} strokeWidth={2.2} /> : <History size={13} strokeWidth={2.2} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className="month-day-add-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpandedShiftId(null);

                      if (!actionDisabled) {
                        onCreateShift(iso);
                      }
                    }}
                    disabled={actionDisabled}
                    aria-label={actionLabel}
                    title={reason === 'employee_future' ? t('calendar.employeeFutureBlocked') : reason === 'no_schedule' ? t('calendar.noEditableSchedule') : hasVacationShift ? t('calendar.addShiftBlockedTitle') : isHistorical ? t('calendar.addShiftTitle') : t('calendar.planShiftTitle')}
                  >
                    <Plus size={14} strokeWidth={2.2} />
                  </button>
                </div>

                <div className="month-day-sections">
                  {renderShiftStack(visibleShifts)}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="month-day-more-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        dayDetailTriggerRef.current = event.currentTarget;
                        setSelectedDayDetailDate(iso);
                      }}
                      aria-label={t(
                        hiddenCount === 1 ? 'calendar.showMoreShiftsAriaOne' : 'calendar.showMoreShiftsAriaMany',
                        { count: hiddenCount },
                      )}
                      data-testid={`day-more-btn-${iso}`}
                    >
                      {t('calendar.showMoreShifts', { count: hiddenCount })}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDayDetailDate && (
        <DayDetailModal
          isOpen={Boolean(selectedDayDetailDate)}
          onClose={() => setSelectedDayDetailDate(null)}
          date={selectedDayDetailDate}
          shifts={currentDayDetailShifts}
          onEditShift={onEditShift}
          onDeleteShift={onDeleteShift}
          triggerRef={dayDetailTriggerRef}
          provenance={provenanceEnabled && employeeId
            ? { employeeId, canReconcile, onChanged: onDayChanged }
            : undefined}
          annotations={annotations.filter((item) => item.date === selectedDayDetailDate)}
          canEditAnnotations={canEditAnnotations}
          onAnnotationsChanged={onAnnotationsChanged}
        />
      )}
    </div>
  );
};

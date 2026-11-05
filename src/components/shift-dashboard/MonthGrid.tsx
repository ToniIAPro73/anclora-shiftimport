import { useEffect, useMemo, useRef, useState } from 'react';
import { Shift } from '../../lib/types';
import { getDaysInMonth, getFirstWeekdayOfMonth, orderWeekdayLabels } from '../../lib/week';
import { getShiftOrigin, getShiftType, hasShiftTimes } from '../../lib/shifts';
import { getWeekStartsOn, translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { getOperationalDate, isHistoricalDate } from '../../lib/operational-date';
import { AlertTriangle, History, Info, Lock, MessageSquare, Plus } from 'lucide-react';
import type { Role } from '../../lib/session';
import { calendarActionReason, getCalendarAction } from '../../lib/calendar-actions';
import { sortDayShifts } from '../../lib/shifts';
import { DayDetailModal } from './DayDetailModal';
import { MonthDayAgenda, type DayAgendaExtras } from './MonthDayAgenda';
import { useMediaQuery } from '../../lib/use-media-query';
import { getShiftTypeDefinition } from '../../lib/shift-types';
import type { DayAnnotation } from '../../lib/remote';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';
import { projectCurrentCalendarRows } from '../../lib/effective-calendar.js';

export const MAX_VISIBLE_DAY_ITEMS = 2;
/** Compact (≤640px) cells show one dot per effective shift, up to this many, then +N. */
export const MAX_COMPACT_DOTS = 3;

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
  /** Own vacation requests still awaiting a decision (visual layer only: they never count in the statistics). */
  pendingTimeOff?: ReadonlyArray<{ id: string; startDate: string; endDate: string }>;
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
  pendingTimeOff = [],
}: MonthGridProps) => {
  const { locale, t, tl } = useI18n();
  const weekStartsOn = getWeekStartsOn(locale);
  const weekdayLabels = orderWeekdayLabels(tl('calendar.weekdays'), weekStartsOn);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [isTouchUi, setIsTouchUi] = useState(false);
  const [selectedDayDetailDate, setSelectedDayDetailDate] = useState<string | null>(null);
  const isCompact = useMediaQuery('(max-width: 640px)');
  const [agendaDate, setAgendaDate] = useState<string | null>(null);
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
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const selectedAgendaDate = agendaDate && agendaDate.startsWith(monthPrefix)
    ? agendaDate
    : todayISO.startsWith(monthPrefix) ? todayISO : `${monthPrefix}01`;

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
    const protectedAbsence = Boolean(shift.timeOffRequestId) && shift.effectiveState !== 'SUPERSEDED';
    const fullLabel = `${originPrefix} ${shiftType}${hasTimes ? ` ${shift.startTime}–${shift.endTime}` : ''}${protectedAbsence ? ` — ${t('calendar.protectedVacation')}` : ''}`;
    const definition = getShiftTypeDefinition(shiftTypeId);
    const shortLabel = locale === 'es' ? (definition?.shortLabel ?? shiftType) : shiftType;

    return (
      <button
        type="button"
        key={shift.id}
        data-shift-type={shiftTypeId}
        data-shift-visual={getShiftVisualTokenKey(shiftTypeId)}
        className={`month-shift-badge${isExpanded ? ' is-expanded' : ''}${shift.isDraft ? ' is-draft' : ''}`}
        data-draft={shift.isDraft || undefined}
        data-protected-absence={protectedAbsence || undefined}
        onClick={(event) => {
          event.stopPropagation();
          handleShiftPress(shift);
        }}
        onBlur={() => {
          if (expandedShiftId === shift.id) {
            setExpandedShiftId(null);
          }
        }}
        title={fullLabel}
        aria-label={fullLabel}
      >
        {protectedAbsence && <Lock size={10} className="month-shift-badge__lock" aria-hidden="true" />}
        <span className="month-shift-badge__origin">{originPrefix} </span>
        <span className="month-shift-badge__label">{shiftType}</span>
        <span className="month-shift-badge__short" aria-hidden="true">{shortLabel}</span>
        {hasTimes && <span className="month-shift-badge__times"> {shift.startTime}–{shift.endTime}</span>}
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
    return projectCurrentCalendarRows(shifts.filter((s) => s.date === selectedDayDetailDate));
  }, [shifts, selectedDayDetailDate]);

  const agendaModel = useMemo(() => {
    if (!isCompact) return null;
    const dayShifts = shifts.filter((shift) => shift.date === selectedAgendaDate);
    const current = sortDayShifts(projectCurrentCalendarRows(dayShifts));
    const hasVacation = current.some((shift) => getShiftType(shift) === 'Vacaciones');
    const input = { date: selectedAgendaDate, today: todayISO, role, hasEditableSchedule: editableScheduleDates.has(selectedAgendaDate), hasVacation };
    const action = getCalendarAction(input);
    const reason = calendarActionReason(action, input);
    const addBlockedReason = action !== 'DISABLED'
      ? null
      : reason === 'employee_future'
        ? t('calendar.employeeFutureBlocked')
        : reason === 'no_schedule'
          ? t('calendar.noEditableSchedule')
          : reason === 'vacation' ? t('calendar.addShiftBlockedTitle') : null;
    const dayAnnotations = annotations.filter((item) => item.date === selectedAgendaDate);
    const extras: DayAgendaExtras = {
      warnings: provenanceEnabled ? dayShifts.filter((shift) => shift.effectiveState === 'REQUIRES_REVIEW').length : 0,
      dcf: dayAnnotations.filter((item) => item.kind === 'DCF').length,
      comments: dayAnnotations.filter((item) => item.kind === 'COMMENT').length,
      changed: provenanceEnabled && dayShifts.some((shift) => shift.layer === 'CHANGE' || shift.hasHistory === true),
      pendingVacation: pendingTimeOff.some((request) => request.startDate <= selectedAgendaDate && selectedAgendaDate <= request.endDate) && !hasVacation,
    };
    return { date: selectedAgendaDate, shifts: current, extras, addDisabled: action === 'DISABLED', addBlockedReason };
  }, [isCompact, shifts, selectedAgendaDate, todayISO, role, editableScheduleDates, t, annotations, provenanceEnabled, pendingTimeOff]);

  /** Opens the day detail from the panel; focus returns to the control that opened it. */
  const openDayDetailFromPanel = (date: string) => {
    dayDetailTriggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setSelectedDayDetailDate(date);
  };

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

        <div className="month-grid-cells" style={isCompact ? undefined : { gridTemplateRows: `repeat(${cells.length / 7}, minmax(0, 1fr))` }}>
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`blank-${index}`} className="month-grid-blank" />;
            }

            const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayShifts = getShiftsForDay(day);
            const pendingRows = dayShifts.some((shift) => shift.effectiveState === 'REQUIRES_REVIEW');
            const currentShifts = projectCurrentCalendarRows(dayShifts);
            const sortedDayShifts = sortDayShifts(currentShifts);
            const visibleShifts = sortedDayShifts.slice(0, MAX_VISIBLE_DAY_ITEMS);
            const hiddenCount = sortedDayShifts.length - MAX_VISIBLE_DAY_ITEMS;
            const isToday = iso === todayISO;
            const isWeekend = index % 7 >= 5;
            const hasVacationShift = currentShifts.some((shift) => getShiftType(shift) === 'Vacaciones');
            const isHistorical = isHistoricalDate(iso, todayISO);
            const needsReview = pendingRows;
            const vacationConflict = needsReview && currentShifts.some((shift) => Boolean(shift.timeOffRequestId));
            const pendingVacation = pendingTimeOff.some((request) => request.startDate <= iso && iso <= request.endDate)
              && !currentShifts.some((shift) => getShiftType(shift) === 'Vacaciones');
            const dayAnnotations = annotations.filter((item) => item.date === iso);
            const hasDcf = dayAnnotations.some((item) => item.kind === 'DCF');
            const hasComment = dayAnnotations.some((item) => item.kind === 'COMMENT');
            // Visible change only: a change-layer row, or history whose business state really differs (computed by the server).
            // A technical event alone (changeId, or history that equals what is shown) is audit trail, not a changed day.
            const hasChange = dayShifts.some((shift) => shift.layer === 'CHANGE' || shift.hasHistory === true);
            const actionInput = { date: iso, today: todayISO, role, hasEditableSchedule: editableScheduleDates.has(iso), hasVacation: hasVacationShift };
            const action = getCalendarAction(actionInput);
            const reason = calendarActionReason(action, actionInput);
            const actionDisabled = action === 'DISABLED';
            const actionLabel = reason === 'employee_future'
              ? t('calendar.employeeFutureBlocked')
              : reason === 'no_schedule'
                ? t('calendar.noEditableSchedule')
                : reason === 'vacation'
                  ? t('calendar.addShiftBlockedAria', { date: iso })
                  : action === 'DIRECT_ADD' || isHistorical ? t('calendar.addShiftAria', { date: iso }) : t('calendar.planShiftAria', { date: iso });

            if (isCompact) {
              const isSelected = iso === selectedAgendaDate;
              const dots = sortedDayShifts.slice(0, MAX_COMPACT_DOTS);
              const dotsMore = sortedDayShifts.length - MAX_COMPACT_DOTS;
              const showWarning = provenanceEnabled && needsReview;
              const showChange = provenanceEnabled && hasChange && !needsReview;
              // Decorative, non-interactive markers (the whole cell stays the single touch target; their meaning is in the cell's aria-label).
              // Info: extra information that exists and is allowed (DCF, comments, visible change/history). Warning: a real REQUIRES_REVIEW only.
              const showInfo = hasDcf || hasComment || (provenanceEnabled && hasChange);
              const summary = [
                sortedDayShifts.length === 0 ? t('calendar.daySummaryNone') : sortedDayShifts.length === 1 ? t('calendar.agendaCountOne') : t('calendar.agendaCountMany', { count: sortedDayShifts.length }),
                showWarning ? t('calendar.daySummaryWarning') : null,
                hasDcf ? t('calendar.daySummaryDcf') : null,
                hasComment ? t('calendar.daySummaryComment') : null,
                showChange ? t('calendar.daySummaryChange') : null,
                pendingVacation ? t('calendar.daySummaryPending') : null,
              ].filter(Boolean).join(', ');
              return (
                <div
                  key={day}
                  className="month-day-cell"
                  data-today={isToday || undefined}
                  data-selected={isSelected ? 'true' : undefined}
                  data-weekend={isWeekend || undefined}
                >
                  <button
                    type="button"
                    className="month-day-select"
                    aria-pressed={isSelected}
                    aria-label={t('calendar.selectDaySummaryAria', { date: iso, summary })}
                    data-testid={`month-day-select-${iso}`}
                    onClick={() => setAgendaDate(iso)}
                  >
                    <span className="month-day-select__top">
                      <span className="month-day-select__slot month-day-select__slot--start">
                        {showInfo && <span className="month-day-marker" data-marker="info" aria-hidden="true"><Info size={10} strokeWidth={2.4} /></span>}
                      </span>
                      <span className="month-day-select__number">{day}</span>
                      <span className="month-day-select__slot month-day-select__slot--end">
                        {showWarning && <span className="month-day-marker" data-marker="warning" aria-hidden="true"><AlertTriangle size={10} strokeWidth={2.4} /></span>}
                      </span>
                    </span>
                    <span className="month-day-dots" data-testid={`month-day-dots-${iso}`} data-count={sortedDayShifts.length} data-more={dotsMore > 0 || undefined} aria-hidden="true">
                      {dots.map((shift) => {
                        const typeId = getShiftType(shift);
                        return <span key={shift.id} className="month-dot" data-shift-type={typeId} data-shift-visual={getShiftVisualTokenKey(typeId)} data-draft={shift.isDraft || undefined} />;
                      })}
                      {dotsMore > 0 && <span className="month-dot-more">+{dotsMore}</span>}
                    </span>
                  </button>
                </div>
              );
            }

            return (
              <div
                key={day}
                className={hasVacationShift && actionDisabled ? 'month-day-cell has-add-disabled' : 'month-day-cell'}
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
                      aria-label={vacationConflict ? t('calendar.vacationConflictAria') : needsReview ? t('calendarTools.dayWarning') : `${t('dayHistory.changedBadge')} — ${t('dayHistory.open')}`}
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
                    title={reason === 'employee_future' ? t('calendar.employeeFutureBlocked') : reason === 'no_schedule' ? t('calendar.noEditableSchedule') : reason === 'vacation' ? t('calendar.addShiftBlockedTitle') : action === 'DIRECT_ADD' || isHistorical ? t('calendar.addShiftTitle') : t('calendar.planShiftTitle')}
                  >
                    <Plus size={14} strokeWidth={2.2} />
                  </button>
                </div>

                <div className="month-day-sections">
                  {renderShiftStack(visibleShifts)}
                  {pendingVacation && (
                    <span
                      className="month-pending-vacation"
                      data-pending-request="true"
                      data-testid={`day-pending-vacation-${iso}`}
                      role="img"
                      aria-label={t('calendar.pendingVacationAria')}
                      title={t('calendar.pendingVacationAria')}
                    >
                      {t('calendar.pendingVacationChip')}
                    </span>
                  )}
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

      {isCompact && agendaModel && (
        <MonthDayAgenda
          date={agendaModel.date}
          shifts={agendaModel.shifts}
          extras={agendaModel.extras}
          addDisabled={agendaModel.addDisabled}
          addBlockedReason={agendaModel.addBlockedReason}
          onAdd={() => { if (!agendaModel.addDisabled) onCreateShift(agendaModel.date); }}
          onOpenDetail={() => openDayDetailFromPanel(agendaModel.date)}
          onOpenSection={() => openDayDetailFromPanel(agendaModel.date)}
          onOpenShift={(shift) => {
            if (shift.isDraft) { openDayDetailFromPanel(shift.date); return; }
            onEditShift(shift.id);
          }}
        />
      )}

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
            ? { employeeId, canReconcile, canOverrideProtectedAbsence: role === 'OWNER' || role === 'ADMIN', onChanged: onDayChanged }
            : undefined}
          annotations={annotations.filter((item) => item.date === selectedDayDetailDate)}
          canEditAnnotations={canEditAnnotations}
          onAnnotationsChanged={onAnnotationsChanged}
        />
      )}
    </div>
  );
};

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Copy, FilePlus2, History, Layers, LayoutGrid, Lock, Pencil, Plus, Send, Table2, Undo2, UploadCloud, X } from 'lucide-react';
import './PlannerMobile.css';
import type { CalendarScheduleShift, ScheduleSnapshot, ShiftAssignment } from '../../lib/remote';
import { translateShiftTypeLabel, type Locale } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { getAssignmentShiftType } from '../../lib/shifts';
import { getShiftTypeDefinition } from '../../lib/shift-types';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';
import { formatEmployeeProfileLabel } from '../../lib/personas';
import { ModalShell } from '../ui/ModalShell';
import { ScrollHintButtons } from './ScrollHints';
import { useVerticalScrollHints } from './use-vertical-scroll-hints';

import { PLANNER_AGENDA_VISIBLE_ROWS, plannerAssignmentStatus, plannerDayRows, type PlannerDayRow, type PlannerRowStatus } from './planner-mobile-model';

type Employee = ScheduleSnapshot['employees'][number];
type Translate = (key: string, values?: Record<string, string | number>) => string;

function longDay(day: string, locale: Locale): string {
  const text = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function shortDayParts(day: string, locale: Locale): { weekday: string; date: string } {
  const lang = locale === 'es' ? 'es-ES' : 'en-GB';
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
  const rest = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
  return { weekday: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`, date: rest };
}

const timesOf = (item: { startTime?: string | null; endTime?: string | null }): string => (
  item.startTime && item.endTime ? `${item.startTime.slice(0, 5)}–${item.endTime.slice(0, 5)}` : ''
);

function typeLabel(typeId: string, locale: Locale): string {
  return translateShiftTypeLabel(typeId, locale, getShiftTypeDefinition(typeId)?.label ?? typeId);
}

function statusLabel(status: PlannerRowStatus, t: Translate): string {
  return t({ draft: 'planner.mobile.statusDraft', stale: 'planner.mobile.statusStale', published: 'planner.mobile.statusPublished', excluded: 'planner.mobile.statusExcluded' }[status]);
}

function StatusIcon({ status, size = 13 }: { status: PlannerRowStatus; size?: number }) {
  if (status === 'published') return <Check size={size} aria-hidden="true" />;
  if (status === 'excluded') return <Ban size={size} aria-hidden="true" />;
  if (status === 'stale') return <AlertTriangle size={size} aria-hidden="true" />;
  return <Pencil size={size} aria-hidden="true" />;
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Status strip + filters + view switcher + Manage (only the compact planner; the desktop toolbar is untouched)
 * ------------------------------------------------------------------------------------------------------------------ */

export type PlannerMobileView = 'agenda' | 'matrix';

interface PlannerMobileBarProps {
  versionStatus: string;
  statusChips: Array<{ id: string; label: string; icon: ReactNode }>;
  employeeFilter: ReactNode;
  weekStartFilter: ReactNode;
  view: PlannerMobileView;
  onViewChange: (view: PlannerMobileView) => void;
  onManage: () => void;
  manageOpen: boolean;
  readOnly: boolean;
}

export function PlannerMobileBar({ versionStatus, statusChips, employeeFilter, weekStartFilter, view, onViewChange, onManage, manageOpen, readOnly }: PlannerMobileBarProps) {
  const { t } = useI18n();
  return (
    <div className="planner-m-bar" data-testid="planner-mobile-bar">
      <div className="planner-m-status" role="group" aria-label={t('planner.mobile.statusLabel')}>
        <span className={`planner-m-status__mode planner-m-status__mode--${versionStatus.toLowerCase()}`} data-readonly={readOnly || undefined}>
          {readOnly ? <Lock size={13} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}
          {versionStatus === 'DRAFT' ? t('planner.statusDraft') : t('planner.statusReadOnly')}
        </span>
        {/* `planner-count` is the desktop counter's test id, kept as an alias for the compact counters. */}
        <span className="planner-m-status__counts" data-testid="planner-count">
          {statusChips.map((chip) => <span className="planner-m-status__chip" key={chip.id}>{chip.icon}{chip.label}</span>)}
        </span>
      </div>
      <div className="planner-m-filters">
        <div className="planner-m-filter">{employeeFilter}</div>
        <div className="planner-m-filter">{weekStartFilter}</div>
      </div>
      <div className="planner-m-actions">
        <div className="planner-m-views" role="group" aria-label={t('planner.viewModeLabel')}>
          <button type="button" className="planner-m-views__button" aria-pressed={view === 'agenda'} onClick={() => onViewChange('agenda')} data-testid="planner-view-agenda">
            <LayoutGrid size={17} aria-hidden="true" /><span>{t('planner.mobile.agendaTab')}</span>
          </button>
          <button type="button" className="planner-m-views__button" aria-pressed={view === 'matrix'} onClick={() => onViewChange('matrix')} data-testid="planner-view-matrix">
            <Table2 size={17} aria-hidden="true" /><span>{t('planner.mobile.matrixTab')}</span>
          </button>
        </div>
        <button type="button" className="planner-m-manage" onClick={onManage} aria-haspopup="dialog" aria-expanded={manageOpen} data-testid="planner-manage-open">
          <Layers size={17} aria-hidden="true" /><span>{t('planner.mobile.manage')}</span><ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------------------------------------------------------ */

interface PlannerRowProps {
  row: PlannerDayRow;
  versionStatus: string;
  locale: Locale;
  onOpen: (row: PlannerDayRow) => void;
}

function PlannerRow({ row, versionStatus, locale, onOpen }: PlannerRowProps) {
  const { t } = useI18n();
  const employeeLabel = formatEmployeeProfileLabel(row.employee.name, row.employee.externalEmployeeId);
  const identity = (
    <>
      <span className="planner-m-row__name">{row.employee.name}</span>
      {row.employee.externalEmployeeId && <span className="planner-m-row__id">ID {row.employee.externalEmployeeId}</span>}
    </>
  );

  if (row.calendarShift) {
    const shift = row.calendarShift;
    const protectedAbsence = Boolean(shift.timeOffRequestId);
    const times = timesOf(shift);
    return (
      <li className="planner-m-row planner-m-row--calendar" data-testid="planner-agenda-row-calendar" data-protected-absence={protectedAbsence || undefined}
        aria-label={`${employeeLabel}: ${protectedAbsence ? t('planner.protectedVacationAria') : t('planner.alreadyOnCalendar')} ${typeLabel(shift.shiftType, locale)} ${times}`.trim()}>
        <div className="planner-m-row__who">{identity}</div>
        <div className="planner-m-row__what">
          <span className="planner-m-chip" data-shift-type={shift.shiftType} data-shift-visual={getShiftVisualTokenKey(shift.shiftType)}>{typeLabel(shift.shiftType, locale)}</span>
          {times && <span className="planner-m-row__time"><Clock size={13} aria-hidden="true" />{times}</span>}
        </div>
        <span className="planner-m-pill planner-m-pill--calendar">{protectedAbsence && <Lock size={12} aria-hidden="true" />}{protectedAbsence ? t('planner.protectedVacation') : t('planner.alreadyOnCalendar')}</span>
      </li>
    );
  }

  const assignment = row.assignment!;
  const typeId = getAssignmentShiftType(assignment);
  const times = timesOf(assignment);
  const status = plannerAssignmentStatus(versionStatus, assignment);
  const summary = `${typeLabel(typeId, locale)}${times ? ` ${times}` : ''}`;
  return (
    <li className="planner-m-row-item">
      <button type="button" className="planner-m-row" data-status={status} data-testid={`planner-agenda-row-${assignment.id}`} onClick={() => onOpen(row)}
        aria-label={t('planner.mobile.openAssignment', { employee: employeeLabel, summary, status: statusLabel(status, t) })}>
        <span className="planner-m-row__who">{identity}</span>
        <span className="planner-m-row__what">
          <span className="planner-m-chip" data-shift-type={typeId} data-shift-visual={getShiftVisualTokenKey(typeId)}>{typeLabel(typeId, locale)}</span>
          {times && <span className="planner-m-row__time"><Clock size={13} aria-hidden="true" />{times}</span>}
        </span>
        <span className="planner-m-pill" data-status={status}><StatusIcon status={status} />{statusLabel(status, t)}</span>
        <ChevronRight size={16} className="planner-m-row__chevron" aria-hidden="true" />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Agenda: seven day chips + the rows of the selected day
 * ------------------------------------------------------------------------------------------------------------------ */

interface PlannerAgendaProps {
  days: string[];
  activeDay: string;
  today: string;
  locale: Locale;
  versionStatus: string;
  employees: Employee[];
  allEmployees: boolean;
  assignmentsByCell: Map<string, ShiftAssignment[]>;
  calendarShiftsByCell: Map<string, CalendarScheduleShift[]>;
  canAdd: boolean;
  onSelectDay: (day: string) => void;
  onAdd: (day: string) => void;
  onOpen: (row: PlannerDayRow) => void;
}

export function PlannerAgenda({ days, activeDay, today, locale, versionStatus, employees, allEmployees, assignmentsByCell, calendarShiftsByCell, canAdd, onSelectDay, onAdd, onOpen }: PlannerAgendaProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [activeDay]);

  const rowsByDay = useMemo(() => new Map(days.map((day) => [day, plannerDayRows(day, employees, assignmentsByCell, calendarShiftsByCell)])), [days, employees, assignmentsByCell, calendarShiftsByCell]);
  const rows = rowsByDay.get(activeDay) ?? [];
  const planned = rows.filter((row) => row.assignment).length;
  const hidden = Math.max(0, rows.length - PLANNER_AGENDA_VISIBLE_ROWS);
  const shown = expanded ? rows : rows.slice(0, PLANNER_AGENDA_VISIBLE_ROWS);
  const dayIsEditable = canAdd && activeDay >= today && employees.length > 0;

  return (
    <section className="planner-m-agenda" data-testid="planner-agenda" data-date={activeDay}>
      <div className="planner-m-days" role="group" aria-label={t('planner.mobile.daysLabel')}>
        {days.map((day) => {
          const parts = shortDayParts(day, locale);
          const count = (rowsByDay.get(day) ?? []).length;
          return (
            <button type="button" key={day} className="planner-m-day" aria-pressed={activeDay === day} data-today={day === today || undefined} data-past={day < today || undefined} data-has={count > 0 || undefined}
              data-testid={`planner-day-${day}`} onClick={() => onSelectDay(day)}
              aria-label={count > 0 ? `${longDay(day, locale)}, ${t(count === 1 ? 'planner.mobile.dayAssignmentsOne' : 'planner.mobile.dayAssignments', { count })}` : longDay(day, locale)}>
              <span className="planner-m-day__weekday">{parts.weekday}</span>
              <span className="planner-m-day__date">{parts.date}</span>
              <span className="planner-m-day__dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="planner-m-panel" data-testid="planner-agenda-panel">
        <header className="planner-m-panel__header">
          <h2 className="planner-m-panel__title">{longDay(activeDay, locale)}</h2>
          {planned > 0 && <span className="planner-m-panel__count" data-testid="planner-agenda-count">{t(planned === 1 ? 'planner.mobile.dayAssignmentsOne' : 'planner.mobile.dayAssignments', { count: planned })}</span>}
        </header>
        {rows.length === 0 ? (
          <p className="planner-m-panel__empty" role="status" data-testid="planner-agenda-empty">{t(allEmployees ? 'planner.mobile.dayEmpty' : 'planner.mobile.dayEmptyFiltered')}</p>
        ) : (
          <ul className="planner-m-list">
            {shown.map((row) => <PlannerRow key={row.key} row={row} versionStatus={versionStatus} locale={locale} onOpen={onOpen} />)}
          </ul>
        )}
        {hidden > 0 && (
          <button type="button" className="planner-m-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} data-testid="planner-agenda-more">
            {expanded ? t('planner.mobile.lessRows') : t('planner.mobile.moreRows', { count: hidden })}
            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
        )}
        {dayIsEditable && (
          <button type="button" className="planner-m-add" onClick={() => onAdd(activeDay)} data-testid="planner-agenda-add">
            <Plus size={18} strokeWidth={2.4} aria-hidden="true" />{t('planner.mobile.addAssignment')}
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Matrix: employee × seven days, contained horizontal scroll with sticky employee column and day header
 * ------------------------------------------------------------------------------------------------------------------ */

interface PlannerMatrixProps {
  days: string[];
  today: string;
  locale: Locale;
  versionStatus: string;
  employees: Employee[];
  assignmentsByCell: Map<string, ShiftAssignment[]>;
  calendarShiftsByCell: Map<string, CalendarScheduleShift[]>;
  canAdd: boolean;
  onCell: (employee: Employee, day: string, rows: PlannerDayRow[]) => void;
}

export function PlannerMatrix({ days, today, locale, versionStatus, employees, assignmentsByCell, calendarShiftsByCell, canAdd, onCell }: PlannerMatrixProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const [moreLeft, setMoreLeft] = useState(false);
  const vHints = useVerticalScrollHints(scrollRef, [employees.length, days]);
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    setMoreLeft(el.scrollLeft > 4);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, days, employees.length]);
  const scrollByDays = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.6), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <section className="planner-m-matrix" data-testid="planner-matrix">
      <header className="planner-m-matrix__header">
        <h2>{t('planner.mobile.matrixTitle')}</h2>
        <span className="planner-m-matrix__hint" aria-hidden="true">{t('planner.scrollHint')}</span>
      </header>
      <div className="planner-m-matrix__frame" data-more={moreRight || undefined} data-less={moreLeft || undefined}>
      <div ref={scrollRef} onScroll={measure} className="planner-m-matrix__scroll" role="region" aria-label={t('planner.mobile.matrixTitle')} tabIndex={0}>
        <table className="planner-m-matrix__table">
          <caption className="sr-only">{t('planner.mobile.matrixCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('planner.employeeColumn')}</th>
              {days.map((day) => {
                const parts = shortDayParts(day, locale);
                return <th scope="col" key={day} data-today={day === today || undefined}><span>{parts.weekday}</span><span>{parts.date}</span></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <th scope="row"><span className="planner-m-matrix__name">{employee.name}</span>{employee.externalEmployeeId && <span className="planner-m-matrix__id">ID {employee.externalEmployeeId}</span>}</th>
                {days.map((day) => {
                  const rows = plannerDayRows(day, [employee], assignmentsByCell, calendarShiftsByCell);
                  const planned = rows.filter((row) => row.assignment);
                  const dateText = longDay(day, locale);
                  const employeeLabel = formatEmployeeProfileLabel(employee.name, employee.externalEmployeeId);
                  if (rows.length === 0) {
                    const addable = canAdd && day >= today;
                    return (
                      <td key={day} data-today={day === today || undefined}>
                        {addable
                          ? <button type="button" className="planner-m-cell planner-m-cell--empty" onClick={() => onCell(employee, day, rows)} aria-label={t('planner.addAssignment', { employee: employee.name, date: dateText })} data-testid={`planner-cell-${employee.id}-${day}`}><Plus size={16} aria-hidden="true" /></button>
                          : <span className="planner-m-cell planner-m-cell--none" aria-label={t('planner.mobile.matrixCellEmpty', { employee: employeeLabel, date: dateText })}>—</span>}
                      </td>
                    );
                  }
                  const lead = planned[0]?.assignment;
                  const typeId = lead ? getAssignmentShiftType(lead) : rows[0].calendarShift!.shiftType;
                  const status = lead ? plannerAssignmentStatus(versionStatus, lead) : null;
                  const times = lead ? timesOf(lead) : timesOf(rows[0].calendarShift!);
                  const [start, end] = times ? times.split('–') : ['', ''];
                  const summary = rows.map((row) => {
                    const id = row.assignment ? getAssignmentShiftType(row.assignment) : row.calendarShift!.shiftType;
                    return `${typeLabel(id, locale)} ${timesOf(row.assignment ?? row.calendarShift!)}`.trim();
                  }).join('; ');
                  return (
                    <td key={day} data-today={day === today || undefined}>
                      <button type="button" className="planner-m-cell planner-m-chip" data-shift-type={typeId} data-shift-visual={getShiftVisualTokenKey(typeId)} data-status={status ?? 'calendar'}
                        onClick={() => onCell(employee, day, rows)} data-testid={`planner-cell-${employee.id}-${day}`}
                        aria-label={t('planner.mobile.matrixCellAria', { employee: employeeLabel, date: dateText, summary: `${summary}${status ? `, ${statusLabel(status, t)}` : ''}` })}>
                        <span className="planner-m-cell__type">{getShiftTypeDefinition(typeId)?.shortLabel ?? typeId}</span>
                        {start && <span className="planner-m-cell__time">{start}</span>}
                        {end && <span className="planner-m-cell__time">{end}</span>}
                        <span className="planner-m-cell__foot">
                          {status ? <StatusIcon status={status} size={12} /> : <Lock size={12} aria-hidden="true" />}
                          {rows.length > 1 && <span className="planner-m-cell__more">{t('planner.mobile.matrixMore', { count: rows.length - 1 })}</span>}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {moreRight && (
        <button type="button" className="planner-m-matrix__more" onClick={() => scrollByDays(1)} aria-label={t('planner.mobile.scrollMore')} data-testid="planner-matrix-more">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      )}
      <ScrollHintButtons canUp={vHints.up} canDown={vHints.down} onScroll={vHints.scrollBy} />
      {moreLeft && (
        <button type="button" className="planner-m-matrix__more planner-m-matrix__more--back" onClick={() => scrollByDays(-1)} aria-label={t('planner.mobile.scrollBack')} data-testid="planner-matrix-back">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Sheets: Manage, cell (several assignments), read-only assignment detail. All of them are ModalShell dialogs.
 * ------------------------------------------------------------------------------------------------------------------ */

export interface PlannerManageAction {
  id: string;
  label: string;
  hint: string;
  icon: 'history' | 'version' | 'pending' | 'copy' | 'publish' | 'back';
  disabled?: boolean;
  /** Overrides `planner-manage-<id>` where the desktop toolbar button already had a test id (kept as an alias, DO_NOT_BREAK). */
  testId?: string;
  onSelect: () => void;
}

const MANAGE_ICONS = { history: History, version: FilePlus2, pending: UploadCloud, copy: Copy, publish: Send, back: Undo2 };

export function PlannerManageSheet({ isOpen, onClose, actions }: { isOpen: boolean; onClose: () => void; actions: PlannerManageAction[] }) {
  const { t } = useI18n();
  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('planner.mobile.manageTitle')} closeAriaLabel={t('common.close')} hideHeader maxWidth="none" className="planner-sheet planner-sheet--manage">
      <div className="planner-sheet__grabber" aria-hidden="true" />
      <header className="planner-sheet__header">
        <Layers size={22} className="planner-sheet__icon" aria-hidden="true" />
        <div>
          <h2>{t('planner.mobile.manageTitle')}</h2>
          <p>{t('planner.mobile.manageDescription')}</p>
        </div>
        <button type="button" className="planner-sheet__close" onClick={onClose} aria-label={t('common.close')} data-testid="planner-manage-close"><X size={20} aria-hidden="true" /></button>
      </header>
      <ul className="planner-sheet__actions" data-testid="planner-manage-actions">
        {actions.map((action) => {
          const Icon = MANAGE_ICONS[action.icon];
          return (
            <li key={action.id}>
              <button type="button" className="planner-sheet__action" disabled={action.disabled} onClick={action.onSelect} data-testid={action.testId ?? `planner-manage-${action.id}`}>
                <Icon size={21} aria-hidden="true" />
                <span><strong>{action.label}</strong><small>{action.hint}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
}

interface PlannerCellSheetProps {
  target: { employee: Employee; day: string; rows: PlannerDayRow[] } | null;
  versionStatus: string;
  locale: Locale;
  canAdd: boolean;
  today: string;
  onClose: () => void;
  onOpen: (row: PlannerDayRow) => void;
  onAdd: (employeeId: string, day: string) => void;
}

export function PlannerCellSheet({ target, versionStatus, locale, canAdd, today, onClose, onOpen, onAdd }: PlannerCellSheetProps) {
  const { t } = useI18n();
  return (
    <ModalShell isOpen={Boolean(target)} onClose={onClose} title={t('planner.mobile.cellSheetTitle')} closeAriaLabel={t('common.close')} hideHeader maxWidth="none" className="planner-sheet planner-sheet--cell">
      {target && (
        <>
          <div className="planner-sheet__grabber" aria-hidden="true" />
          <header className="planner-sheet__header">
            <div>
              <h2>{longDay(target.day, locale)}</h2>
              <p>{formatEmployeeProfileLabel(target.employee.name, target.employee.externalEmployeeId)}</p>
            </div>
            <button type="button" className="planner-sheet__close" onClick={onClose} aria-label={t('common.close')}><X size={20} aria-hidden="true" /></button>
          </header>
          <ul className="planner-m-list" data-testid="planner-cell-rows">
            {target.rows.map((row) => <PlannerRow key={row.key} row={row} versionStatus={versionStatus} locale={locale} onOpen={onOpen} />)}
          </ul>
          {canAdd && target.day >= today && (
            <button type="button" className="planner-m-add" onClick={() => onAdd(target.employee.id, target.day)}><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{t('planner.mobile.addAssignment')}</button>
          )}
        </>
      )}
    </ModalShell>
  );
}

interface PlannerDetailSheetProps {
  row: PlannerDayRow | null;
  versionStatus: string;
  locale: Locale;
  onClose: () => void;
}

/** Read-only look at one assignment (published/locked versions, past days): the same facts the grid shows, without any write path. */
export function PlannerDetailSheet({ row, versionStatus, locale, onClose }: PlannerDetailSheetProps) {
  const { t } = useI18n();
  const assignment = row?.assignment;
  const typeId = assignment ? getAssignmentShiftType(assignment) : '';
  const status = assignment ? plannerAssignmentStatus(versionStatus, assignment) : null;
  return (
    <ModalShell isOpen={Boolean(row && assignment)} onClose={onClose} title={t('planner.mobile.detailTitle')} closeAriaLabel={t('common.close')} hideHeader maxWidth="none" className="planner-sheet planner-sheet--detail">
      {row && assignment && status && (
        <>
          <div className="planner-sheet__grabber" aria-hidden="true" />
          <header className="planner-sheet__header">
            <div>
              <h2>{t('planner.mobile.detailTitle')}</h2>
              <p>{longDay(row.day, locale)}</p>
            </div>
            <button type="button" className="planner-sheet__close" onClick={onClose} aria-label={t('common.close')} data-testid="planner-detail-close"><X size={20} aria-hidden="true" /></button>
          </header>
          <dl className="planner-sheet__facts" data-testid="planner-detail">
            <div><dt>{t('planner.employeeLabel')}</dt><dd>{formatEmployeeProfileLabel(row.employee.name, row.employee.externalEmployeeId)}</dd></div>
            <div><dt>{t('planner.assignmentColumn')}</dt><dd><span className="planner-m-chip" data-shift-type={typeId} data-shift-visual={getShiftVisualTokenKey(typeId)}>{typeLabel(typeId, locale)}</span> {timesOf(assignment)}</dd></div>
            <div><dt>{t('planner.locationColumn')}</dt><dd>{assignment.location || t('planner.noLocation')}</dd></div>
            <div><dt>{t('planner.mobile.detailStatus')}</dt><dd><span className="planner-m-pill" data-status={status}><StatusIcon status={status} />{statusLabel(status, t)}</span></dd></div>
          </dl>
          {(status === 'stale' || status === 'excluded') && (
            <p className="planner-sheet__note" role="note">{t(status === 'stale' ? 'planner.staleAssignment' : (assignment.staleAgainstCalendar ? 'planner.excludedAssignment' : 'planner.excludedAssignmentGeneric'))}</p>
          )}
          {versionStatus !== 'DRAFT' && <p className="planner-sheet__note">{t('planner.mobile.detailReadOnly')}</p>}
        </>
      )}
    </ModalShell>
  );
}

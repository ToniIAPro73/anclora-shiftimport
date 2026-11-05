import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './StaleAssignment.css';
import { AlertTriangle, Ban, CalendarRange, Check, ChevronLeft, ChevronRight, LayoutGrid, Loader2, Lock, Pencil, Plus, Table2, X } from 'lucide-react';
import { ApiError } from '../../lib/session';
import {
  createRemoteAssignment,
  createRemoteScheduleDraftFromVersion,
  createRemoteScheduleDraft,
  deleteRemoteAssignment,
  listRemoteScheduleVersionHistory,
  listRemoteScheduleVersions,
  loadRemoteScheduleSnapshot,
  publishRemoteScheduleVersion,
  ScheduleSnapshot,
  ScheduleVersionHistoryEntry,
  ShiftAssignment,
  updateRemoteAssignment,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { useMediaQuery } from '../../lib/use-media-query';
import { getOperationalDate } from '../../lib/operational-date';
import { getPlannerWeekStartPreference, PLANNER_WEEK_START_PREFERENCE_KEY } from '../../lib/week';
import { getShiftTypeDefinition, getShiftTypeSemantics, shiftTypeCountsAsWork } from '../../lib/shift-types';
import { getAssignmentShiftType } from '../../lib/shifts';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { SearchableSelect, SearchableSelectOption } from '../ui/SearchableSelect';
import { ModalShell } from '../ui/ModalShell';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { AccessibleScheduleTable } from './AccessibleScheduleTable';
import { AssignmentEditorState, ScheduleAssignmentEditor } from './ScheduleAssignmentEditor';
import { ScheduleVersionHistory } from './ScheduleVersionHistory';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';
import { formatEmployeeProfileLabel } from '../../lib/personas';
import { plannerCounts } from '../../lib/planner-counts';
import { CopyWeekDialog } from './CopyWeekDialog';
import { PublishPendingDialog } from './PublishPendingDialog';
import { ScrollHintButtons } from './ScrollHints';
import { useVerticalScrollHints } from './use-vertical-scroll-hints';
import {
  PlannerAgenda,
  PlannerCellSheet,
  PlannerDetailSheet,
  PlannerManageAction,
  PlannerManageSheet,
  PlannerMatrix,
  PlannerMobileBar,
  PlannerMobileView,
} from './PlannerMobile';
import type { PlannerDayRow } from './planner-mobile-model';

interface WeeklyPlannerProps {
  areaId?: string | null;
  canEdit: boolean;
  onBack?: () => void;
  embedded?: boolean;
  initialDate?: string;
  initialPeriodStart?: string;
  modalHeader?: boolean;
  onClose?: () => void;
}

const VIEW_PREFERENCE_KEY = 'anclora_shiftimport_planner_view_v1';
// Phones have their own preference (Agenda by default) so choosing a view there never rewrites the desktop one.
const MOBILE_VIEW_PREFERENCE_KEY = 'anclora_shiftimport_planner_view_mobile_v1';
type PlannerView = 'grid' | 'table';
type WeekStart = 'monday' | 'sunday';

const pad = (value: number): string => String(value).padStart(2, '0');

function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function startOfWeek(value: Date, weekStart: WeekStart): string {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay();
  const offset = weekStart === 'sunday' ? -day : (day === 0 ? -6 : 1 - day);
  date.setUTCDate(date.getUTCDate() + offset);
  return isoDate(date);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function formatDay(value: string, locale: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function initialEditor(employeeId: string, date: string, assignment?: ShiftAssignment): AssignmentEditorState {
  return {
    id: assignment?.id ?? null,
    employeeId: assignment?.employeeId ?? employeeId,
    date: assignment?.date ?? date,
    shiftType: assignment?.shiftType ?? 'Regular',
    countsAsWork: assignment?.countsAsWork ?? shiftTypeCountsAsWork(assignment?.shiftType ?? 'Regular'),
    startTime: (assignment?.startTime ?? '09:00').slice(0, 5),
    endTime: (assignment?.endTime ?? '17:00').slice(0, 5),
    location: assignment?.location ?? '',
  };
}

function errorCopy(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    if (error.code === 'OVERLAP') return t('planner.errorOverlap');
    if (error.code === 'FULL_DAY_CONFLICT') {
      const fullDayType = String(error.details?.fullDayType ?? '').toLowerCase();
      if (fullDayType === 'vacaciones') return t('conflicts.vacationFullDay');
      if (fullDayType === 'baja') return t('conflicts.leaveFullDay');
      return t('conflicts.dayOffFullDay');
    }
    if (error.code === 'SHIFT_TIMES_REQUIRED') return t('planner.errorTimedTimes');
    if (error.code === 'REST_RULE_VIOLATION') return t('planner.errorRest');
    if (error.code === 'VERSION_NOT_EDITABLE') return t('planner.errorVersion');
    if (error.code === 'SCOPE_FORBIDDEN') return t('planner.errorScope');
    if (error.code === 'PAST_PLANNING_FORBIDDEN') return t('planner.pastDay');
    if (error.code === 'SCHEDULE_DRAFT_EXISTS') return t('planner.errorDraftExists');
    if (error.status === 403) return t('planner.errorPermission');
  }
  return t('planner.errorGeneric');
}

export function WeeklyPlanner({ areaId = null, canEdit, onBack, embedded = false, initialDate, initialPeriodStart, modalHeader = false, onClose }: WeeklyPlannerProps) {
  const { locale, t } = useI18n();
  const today = getOperationalDate();
  const isCompact = useMediaQuery('(max-width: 640px)');
  const [weekStart, setWeekStart] = useState<WeekStart>(getPlannerWeekStartPreference);
  const [periodStart, setPeriodStart] = useState(() => {
    const preference = getPlannerWeekStartPreference();
    if (initialPeriodStart) return initialPeriodStart;
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      return startOfWeek(new Date(`${initialDate}T00:00:00Z`), preference);
    }
    return startOfWeek(new Date(), preference);
  });
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isViewingHistoricalVersion, setIsViewingHistoricalVersion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isCopyWeekOpen, setIsCopyWeekOpen] = useState(false);
  const [isPublishPendingOpen, setIsPublishPendingOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<ScheduleVersionHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<AssignmentEditorState | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [selectedCell, setSelectedCell] = useState<{ employeeId: string; date: string } | null>(null);
  const [activeDay, setActiveDay] = useState(() => {
    if (initialDate) return initialDate;
    // On phones the agenda opens on today when it belongs to the visible week; the desktop grid keeps focusing the first day.
    return isCompact && today >= periodStart && today <= addDays(periodStart, 6) ? today : periodStart;
  });
  const [mobileView, setMobileView] = useState<PlannerMobileView>(() => {
    try {
      return window.localStorage.getItem(MOBILE_VIEW_PREFERENCE_KEY) === 'matrix' ? 'matrix' : 'agenda';
    } catch {
      return 'agenda';
    }
  });
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<PlannerDayRow | null>(null);
  const [cellTarget, setCellTarget] = useState<{ employee: ScheduleSnapshot['employees'][number]; day: string; rows: PlannerDayRow[] } | null>(null);
  const [editorFocusKey, setEditorFocusKey] = useState(0);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [view, setView] = useState<PlannerView>(() => {
    try {
      return window.localStorage.getItem(VIEW_PREFERENCE_KEY) === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const requestId = useRef(0);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const gridHints = useVerticalScrollHints(gridWrapRef, [snapshot, employeeFilter, view, isCompact]);
  const focusReturnKey = useRef<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(periodStart, index)), [periodStart]);
  const activeDayIndex = Math.max(0, days.indexOf(activeDay));
  const assignmentsByCell = useMemo(() => {
    const byCell = new Map<string, ShiftAssignment[]>();
    for (const assignment of snapshot?.assignments ?? []) {
      const key = `${assignment.employeeId}:${assignment.date}`;
      const current = byCell.get(key) ?? [];
      current.push(assignment);
      byCell.set(key, current);
    }
    return byCell;
  }, [snapshot]);
  const calendarShiftsByCell = useMemo(() => {
    const byCell = new Map<string, NonNullable<ScheduleSnapshot['calendarShifts']>>();
    for (const shift of snapshot?.calendarShifts ?? []) {
      const key = `${shift.employeeId}:${shift.date}`;
      const current = byCell.get(key) ?? [];
      current.push(shift);
      byCell.set(key, current);
    }
    return byCell;
  }, [snapshot]);
  const counts = plannerCounts(snapshot?.version.status ?? 'DRAFT', snapshot?.assignments ?? []);
  const editable = canEdit && snapshot?.version.status === 'DRAFT' && !isViewingHistoricalVersion;
  const previousWeekDisabled = addDays(periodStart, -1) < today;

  const visibleEmployees = useMemo(() => {
    if (!snapshot || employeeFilter === 'all') {
      return snapshot?.employees ?? [];
    }
    return snapshot.employees.filter((employee) => employee.id === employeeFilter);
  }, [employeeFilter, snapshot]);
  const visibleSnapshot = useMemo(() => snapshot
    ? { ...snapshot, employees: visibleEmployees }
    : null, [snapshot, visibleEmployees]);
  const employeeOptions = useMemo<SearchableSelectOption[]>(() => [
    { value: 'all', label: t('planner.allEmployees') },
    ...(snapshot?.employees ?? []).map((employee) => ({
      value: employee.id,
      label: formatEmployeeProfileLabel(employee.name, employee.externalEmployeeId),
      searchText: [employee.name, employee.externalEmployeeId ?? ''].filter(Boolean).join(' '),
    })),
  ], [snapshot, t]);
  useEffect(() => {
    if (employeeFilter !== 'all' && !snapshot?.employees.some((employee) => employee.id === employeeFilter)) {
      setEmployeeFilter('all');
    }
  }, [employeeFilter, snapshot]);

  useEffect(() => {
    if (!days.includes(activeDay)) {
      setActiveDay(days[0] ?? periodStart);
    }
  }, [activeDay, days, periodStart]);

  useEffect(() => {
    if (view !== 'grid' || !activeDay) return;
    const gridWrap = gridWrapRef.current;
    const activeHeader = gridWrap?.querySelector<HTMLElement>(`th[data-day="${activeDay}"]`);
    if (!gridWrap || !activeHeader) return;
    const targetScrollLeft = activeHeader.offsetLeft - ((gridWrap.clientWidth - activeHeader.offsetWidth) / 2);
    gridWrap.scrollLeft = Math.max(0, targetScrollLeft);
  }, [activeDay, view, days.length, visibleEmployees.length]);

  useEffect(() => {
    if (selectedCell || !focusReturnKey.current) return;
    const targetKey = focusReturnKey.current;
    focusReturnKey.current = null;
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-editor-target]'))
      .find((element) => element.dataset.editorTarget === targetKey);
    target?.focus();
  }, [selectedCell]);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    setOperationError(null);
    setNotice(null);
    setEditor(null);
    setSelectedCell(null);
    setMobileEditorOpen(false);
    setIsViewingHistoricalVersion(false);
    try {
      const schedules = await listRemoteScheduleVersions(areaId);
      const matching = schedules.find((schedule) => (
        schedule.periodStart === periodStart
        && (schedule.areaId ?? null) === (areaId ?? null)
      ));
      if (!matching) {
        if (currentRequest === requestId.current) setSnapshot(null);
        return;
      }
      const loaded = await loadRemoteScheduleSnapshot(matching.scheduleId, matching.id);
      if (currentRequest === requestId.current) setSnapshot(loaded);
    } catch (requestError) {
      if (currentRequest === requestId.current) {
        setSnapshot(null);
        setError(errorCopy(requestError, t));
      }
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [areaId, periodStart, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_PREFERENCE_KEY, view);
    } catch {
      // Presentation preference is best-effort when storage is unavailable.
    }
  }, [view]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MOBILE_VIEW_PREFERENCE_KEY, mobileView);
    } catch {
      // Presentation preference is best-effort when storage is unavailable.
    }
  }, [mobileView]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLANNER_WEEK_START_PREFERENCE_KEY, weekStart);
    } catch {
      // Presentation preference is best-effort when storage is unavailable.
    }
  }, [weekStart]);

  const shiftWeek = (delta: number) => {
    if (delta < 0 && previousWeekDisabled) return;
    setPeriodStart((current) => addDays(current, delta * 7));
    setActiveDay((current) => addDays(current, delta * 7));
  };

  const handleWeekStartChange = (value: string) => {
    const nextWeekStart: WeekStart = value === 'sunday' ? 'sunday' : 'monday';
    if (nextWeekStart === weekStart) return;
    // Keep the same seven calendar days visible while changing the leading
    // day: Monday→Sunday moves one day back, Sunday→Monday moves one day on.
    // Re-normalizing the current start would drift a week when toggled back.
    const nextPeriodStart = nextWeekStart === 'sunday'
      ? addDays(periodStart, -1)
      : addDays(periodStart, 1);
    setWeekStart(nextWeekStart);
    setPeriodStart(nextPeriodStart);
    setActiveDay(nextPeriodStart);
  };

  const shiftActiveDay = (delta: number) => {
    setActiveDay((current) => days[(activeDayIndex + delta + days.length) % days.length] ?? current);
  };

  const resetEditor = () => {
    if (selectedCell) {
      focusReturnKey.current = `${selectedCell.employeeId}:${selectedCell.date}`;
    }
    setSelectedCell(null);
    setMobileEditorOpen(false);
    setEditor(null);
  };

  const handleAdd = (employeeId: string, date: string) => {
    if (date < today) {
      setOperationError(t('planner.pastDay'));
      return;
    }
    setSelectedCell({ employeeId, date });
    setMobileEditorOpen(true);
    setEditorFocusKey((current) => current + 1);
    setEditor(initialEditor(employeeId, date));
  };

  const handleEdit = (employeeId: string, date: string, assignment: ShiftAssignment) => {
    if (date < today) {
      setOperationError(t('planner.pastDay'));
      return;
    }
    setSelectedCell({ employeeId, date });
    setMobileEditorOpen(true);
    setEditorFocusKey((current) => current + 1);
    setEditor(initialEditor(employeeId, date, assignment));
  };

  const handleEmployeeFilterChange = (value: string) => {
    setEmployeeFilter(value);
    if (selectedCell && value !== 'all' && value !== selectedCell.employeeId) {
      setSelectedCell(null);
    }
  };

  const handleCreateDraft = async () => {
    if (addDays(periodStart, 6) < today) {
      setError(t('planner.pastDay'));
      return;
    }
    setIsCreating(true);
    setError(null);
    setOperationError(null);
    try {
      const created = await createRemoteScheduleDraft({ periodStart, areaId });
      const loaded = await loadRemoteScheduleSnapshot(created.scheduleId, created.id);
      setSnapshot(loaded);
      setNotice(t('planner.draftCreated'));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'SCHEDULE_DRAFT_EXISTS') {
        await refresh();
      } else {
        setError(errorCopy(requestError, t));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateNewVersion = async () => {
    if (!snapshot || snapshot.version.status !== 'PUBLISHED') return;
    setIsCreatingVersion(true);
    setError(null);
    setOperationError(null);
    setNotice(null);
    try {
      await createRemoteScheduleDraftFromVersion(snapshot.version.scheduleId, snapshot.version.id);
      await refresh();
      setNotice(t('planner.newVersionCreated'));
    } catch (requestError) {
      setOperationError(errorCopy(requestError, t));
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const handleOpenHistory = async () => {
    if (!snapshot) return;
    setIsHistoryOpen(true);
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryVersions(await listRemoteScheduleVersionHistory(snapshot.version.scheduleId));
    } catch (requestError) {
      setHistoryError(errorCopy(requestError, t));
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleSelectHistoryVersion = async (selected: ScheduleVersionHistoryEntry) => {
    if (!snapshot) return;
    setIsHistoryOpen(false);
    setIsLoading(true);
    setOperationError(null);
    setNotice(null);
    try {
      const loaded = await loadRemoteScheduleSnapshot(snapshot.version.scheduleId, selected.id);
      setSnapshot(loaded);
      setIsViewingHistoricalVersion(true);
    } catch (requestError) {
      setOperationError(errorCopy(requestError, t));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !snapshot || !editable) return;
    if (editor.date < today) {
      setOperationError(t('planner.pastDay'));
      return;
    }
    const editorSemantics = getShiftTypeSemantics(editor.shiftType);
    if (editorSemantics.timed && (!editor.startTime || !editor.endTime)) {
      setOperationError(t('planner.errorTimedTimes'));
      return;
    }
    setIsSaving(true);
    setOperationError(null);
    setNotice(null);
    try {
      if (editor.id) {
        await updateRemoteAssignment(snapshot.version.scheduleId, snapshot.version.id, editor.id, editor);
      } else {
        await createRemoteAssignment(snapshot.version.scheduleId, snapshot.version.id, editor);
      }
      resetEditor();
      setNotice(t('planner.assignmentSaved'));
      const loaded = await loadRemoteScheduleSnapshot(snapshot.version.scheduleId, snapshot.version.id);
      setSnapshot(loaded);
    } catch (requestError) {
      setOperationError(errorCopy(requestError, t));
    } finally {
      setIsSaving(false);
    }
  };

  const performDelete = async () => {
    const targetId = deleteTargetId;
    if (!targetId || !snapshot || !editable) return;
    setDeleteConfirmationOpen(false);
    setDeleteTargetId(null);
    setIsSaving(true);
    setOperationError(null);
    try {
      await deleteRemoteAssignment(snapshot.version.scheduleId, snapshot.version.id, targetId);
      resetEditor();
      setNotice(t('planner.assignmentDeleted'));
      const loaded = await loadRemoteScheduleSnapshot(snapshot.version.scheduleId, snapshot.version.id);
      setSnapshot(loaded);
    } catch (requestError) {
      setOperationError(errorCopy(requestError, t));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (assignment?: ShiftAssignment) => {
    const targetId = assignment?.id ?? editor?.id;
    if (!targetId || !snapshot || !editable) return;
    setDeleteTargetId(targetId);
    setDeleteConfirmationOpen(true);
  };

  const handlePublish = async () => {
    if (!snapshot || !editable) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const result = await publishRemoteScheduleVersion(snapshot.version.scheduleId, snapshot.version.id);
      setIsPublishOpen(false);
      setNotice(result.excludedAssignmentCount > 0
        ? t('planner.publishedWithExclusions', { created: result.createdShiftCount, excluded: result.excludedAssignmentCount })
        : t('planner.publishedNotice', { count: result.createdShiftCount }));
      await refresh();
    } catch (requestError) {
      setPublishError(errorCopy(requestError, t));
    } finally {
      setIsPublishing(false);
    }
  };

  const openPlannerRow = (row: PlannerDayRow) => {
    setCellTarget(null);
    // Same rule as the desktop grid: only an editable draft on a non-past day opens the editor; anything else is a read-only look.
    if (row.assignment && editable && row.day >= today) handleEdit(row.employee.id, row.day, row.assignment);
    else if (row.assignment) setDetailRow(row);
  };

  const addFromAgenda = (day: string, employeeId?: string) => {
    const target = employeeId ?? (employeeFilter !== 'all' ? employeeFilter : visibleEmployees[0]?.id);
    if (!target) return;
    setCellTarget(null);
    handleAdd(target, day);
  };

  const openMatrixCell = (employee: ScheduleSnapshot['employees'][number], day: string, rows: PlannerDayRow[]) => {
    const planned = rows.filter((row) => row.assignment);
    if (rows.length === 0) addFromAgenda(day, employee.id);
    else if (rows.length === 1 && planned.length === 1) openPlannerRow(planned[0]);
    else setCellTarget({ employee, day, rows });
  };

  const employeeSelect = (
    <SearchableSelect
      label={t('planner.employeeFilter')}
      value={employeeFilter}
      options={employeeOptions}
      onChange={handleEmployeeFilterChange}
      searchPlaceholder={t('planner.employeeSearchPlaceholder')}
      emptyMessage={t('planner.employeeSearchEmpty')}
      ariaLabel={t('planner.employeeFilter')}
      disabled={!snapshot || snapshot.employees.length === 0}
    />
  );
  const weekStartSelect = (
    <SearchableSelect
      label={t('planner.weekStartLabel')}
      value={weekStart}
      options={[
        { value: 'monday', label: t('planner.weekStartMonday') },
        { value: 'sunday', label: t('planner.weekStartSunday') },
      ]}
      onChange={handleWeekStartChange}
      ariaLabel={t('planner.weekStartLabel')}
    />
  );

  const closeManageThen = (action: () => void) => () => { setIsManageOpen(false); action(); };
  // Exactly the actions the desktop toolbar offers, under the same conditions: nothing here is a new capability.
  const manageActions: PlannerManageAction[] = snapshot ? [
    { id: 'history', icon: 'history', label: t('planner.versionHistory'), hint: t('planner.mobile.historyHint'), onSelect: closeManageThen(() => void handleOpenHistory()) },
    ...(isViewingHistoricalVersion ? [{ id: 'back', icon: 'back' as const, label: t('planner.backToCurrent'), hint: t('planner.mobile.backToCurrentHint'), onSelect: closeManageThen(() => void refresh()) }] : []),
    ...(snapshot.version.status === 'PUBLISHED' ? [{ id: 'version', icon: 'version' as const, label: isCreatingVersion ? t('planner.creatingNewVersion') : t('planner.createNewVersion'), hint: t('planner.mobile.createVersionHint'), disabled: isCreatingVersion, onSelect: closeManageThen(() => void handleCreateNewVersion()) }] : []),
    ...(canEdit ? [{ id: 'pending', icon: 'pending' as const, label: t('planner.publishPending.open'), hint: t('planner.mobile.publishPendingHint'), testId: 'publish-pending-open', onSelect: closeManageThen(() => setIsPublishPendingOpen(true)) }] : []),
    ...(editable ? [
      { id: 'copy', icon: 'copy' as const, label: t('planner.copyWeek.open'), hint: t('planner.mobile.copyWeekHint'), testId: 'copy-week-open', onSelect: closeManageThen(() => setIsCopyWeekOpen(true)) },
      { id: 'publish', icon: 'publish' as const, label: isPublishing ? t('planner.publishing') : t('planner.publish'), hint: t('planner.mobile.publishHint'), disabled: isPublishing || snapshot.assignments.length === 0, onSelect: closeManageThen(() => { setPublishError(null); setIsPublishOpen(true); }) },
    ] : []),
  ] : [];
  const statusChips = counts.mode === 'draft'
    ? [
      { id: 'planned', icon: <Pencil size={14} aria-hidden="true" />, label: t(counts.planned === 1 ? 'planner.countPlannedOne' : 'planner.countPlanned', { count: counts.planned }) },
      ...(counts.stale > 0 ? [{ id: 'stale', icon: <AlertTriangle size={14} aria-hidden="true" />, label: t(counts.stale === 1 ? 'planner.countStaleOne' : 'planner.countStale', { count: counts.stale }) }] : []),
    ]
    : [
      { id: 'published', icon: <Check size={14} aria-hidden="true" />, label: t(counts.published === 1 ? 'planner.countPublishedOne' : 'planner.countPublished', { count: counts.published }) },
      ...(counts.excluded > 0 ? [{ id: 'excluded', icon: <Ban size={14} aria-hidden="true" />, label: t(counts.excluded === 1 ? 'planner.countExcludedOne' : 'planner.countExcluded', { count: counts.excluded }) }] : []),
    ];

  return (
    <div className={`weekly-planner${embedded ? ' weekly-planner--embedded' : ''}`} data-compact={isCompact || undefined} data-testid="weekly-planner" data-state={isLoading ? 'loading' : error ? 'error' : snapshot && !editable ? 'disabled' : snapshot ? 'ready' : 'empty'}>
      <header className="weekly-planner__header">
        <div className="weekly-planner__heading">
          {!embedded && onBack && <button type="button" className="weekly-planner__back" onClick={onBack}>
            <ChevronLeft size={16} aria-hidden="true" /> {t('planner.back')}
          </button>}
          {(!embedded || modalHeader) && <p className="weekly-planner__eyebrow">{t('planner.eyebrow')}</p>}
          {(!embedded || modalHeader) && <h1>{t('planner.title')}</h1>}
        </div>
        <div className="weekly-planner__header-tools">
          <div className="weekly-planner__week-control" role="group" aria-label={t('planner.weekNavigation')}>
            <button type="button" className="weekly-planner__icon-button" onClick={() => shiftWeek(-1)} disabled={previousWeekDisabled} aria-label={t('planner.previousWeek')} title={previousWeekDisabled ? t('planner.previousWeekDisabled') : undefined}>
              <ChevronLeft size={18} />
            </button>
            <span>{formatDay(periodStart, locale)} – {formatDay(addDays(periodStart, 6), locale)}</span>
            <button type="button" className="weekly-planner__icon-button" onClick={() => shiftWeek(1)} aria-label={t('planner.nextWeek')}>
              <ChevronRight size={18} />
            </button>
          </div>
          {modalHeader && onClose && <button type="button" className="weekly-planner__close" onClick={onClose} aria-label={t('planner.close')}><X size={20} aria-hidden="true" /></button>}
        </div>
      </header>

      {notice && <p className="weekly-planner__notice" role="status">{notice}</p>}
      {error && (
        <div className="weekly-planner__state weekly-planner__state--error" role="alert">
          <strong>{t('planner.errorTitle')}</strong>
          <p>{error}</p>
          <button type="button" className="btn-outline" onClick={() => void refresh()}>{t('planner.retry')}</button>
        </div>
      )}

      {isLoading && !error && (
        <div className="weekly-planner__state" role="status" aria-live="polite">
          <Loader2 className="icon-spin" size={24} aria-hidden="true" />
          <span>{t('planner.loading')}</span>
        </div>
      )}

      {!isLoading && !error && !snapshot && (
        <div className="weekly-planner__state weekly-planner__state--empty">
          <CalendarRange size={32} aria-hidden="true" />
          <h2>{t('planner.emptyTitle')}</h2>
          <p>{t('planner.emptyDescription')}</p>
          {canEdit && <button type="button" className="btn-gold" onClick={() => void handleCreateDraft()} disabled={isCreating}>
            {isCreating ? <><Loader2 className="icon-spin" size={17} /> {t('planner.creating')}</> : <><Plus size={17} /> {t('planner.createDraft')}</>}
          </button>}
        </div>
      )}

      {!isLoading && !error && snapshot && (
        <>
          {isCompact ? (
            <PlannerMobileBar
              versionStatus={snapshot.version.status}
              readOnly={!editable}
              statusChips={statusChips}
              employeeFilter={employeeSelect}
              weekStartFilter={weekStartSelect}
              view={mobileView}
              onViewChange={setMobileView}
              onManage={() => setIsManageOpen(true)}
              manageOpen={isManageOpen}
            />
          ) : (
          <div className="weekly-planner__toolbar">
            <div className="weekly-planner__toolbar-summary">
              <span className={`weekly-planner__status weekly-planner__status--${snapshot.version.status.toLowerCase()}`}>
                {snapshot.version.status === 'DRAFT' ? t('planner.statusDraft') : t('planner.statusReadOnly')}
              </span>
              <span className="weekly-planner__meta" data-testid="planner-count">
                {counts.mode === 'draft'
                  ? [
                    t(counts.planned === 1 ? 'planner.countPlannedOne' : 'planner.countPlanned', { count: counts.planned }),
                    counts.stale > 0 ? t(counts.stale === 1 ? 'planner.countStaleOne' : 'planner.countStale', { count: counts.stale }) : null,
                  ].filter(Boolean).join(' · ')
                  : [
                    t(counts.published === 1 ? 'planner.countPublishedOne' : 'planner.countPublished', { count: counts.published }),
                    counts.excluded > 0 ? t(counts.excluded === 1 ? 'planner.countExcludedOne' : 'planner.countExcluded', { count: counts.excluded }) : null,
                  ].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className="weekly-planner__employee-filter">
              <SearchableSelect
                label={t('planner.employeeFilter')}
                value={employeeFilter}
                options={employeeOptions}
                onChange={handleEmployeeFilterChange}
                searchPlaceholder={t('planner.employeeSearchPlaceholder')}
                emptyMessage={t('planner.employeeSearchEmpty')}
                ariaLabel={t('planner.employeeFilter')}
                disabled={!snapshot || snapshot.employees.length === 0}
              />
            </div>
            <div className="weekly-planner__week-start">
              <SearchableSelect
                label={t('planner.weekStartLabel')}
                value={weekStart}
                options={[
                  { value: 'monday', label: t('planner.weekStartMonday') },
                  { value: 'sunday', label: t('planner.weekStartSunday') },
                ]}
                onChange={handleWeekStartChange}
                ariaLabel={t('planner.weekStartLabel')}
              />
            </div>
            {view === 'grid' && (
              <div className="weekly-planner__day-focus" role="group" aria-label={t('planner.activeDayLabel')}>
                <button type="button" className="weekly-planner__day-focus-nav" onClick={() => shiftActiveDay(-1)} aria-label={t('planner.previousDay')}>
                  <ChevronLeft size={15} aria-hidden="true" />
                </button>
                {days.map((day) => (
                  <button
                    type="button"
                    className="weekly-planner__day-focus-button"
                    key={day}
                    aria-pressed={activeDay === day}
                    aria-label={formatDay(day, locale)}
                    onClick={() => setActiveDay(day)}
                    disabled={day < today}
                  >
                    {formatDay(day, locale).split(' ')[0]}
                  </button>
                ))}
                <button type="button" className="weekly-planner__day-focus-nav" onClick={() => shiftActiveDay(1)} aria-label={t('planner.nextDay')}>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="weekly-planner__view-switcher" role="group" aria-label={t('planner.viewModeLabel')}>
              <button
                type="button"
                className="weekly-planner__view-button"
                aria-label={t('planner.gridView')}
                aria-pressed={view === 'grid'}
                data-tooltip={t('planner.gridView')}
                title={t('planner.gridView')}
                onClick={() => setView('grid')}
              >
                <LayoutGrid size={17} aria-hidden="true" />
                <span className="sr-only">{t('planner.gridView')}</span>
              </button>
              <button
                type="button"
                className="weekly-planner__view-button"
                aria-label={t('planner.tableView')}
                aria-pressed={view === 'table'}
                data-tooltip={t('planner.tableView')}
                title={t('planner.tableView')}
                onClick={() => setView('table')}
              >
                <Table2 size={17} aria-hidden="true" />
                <span className="sr-only">{t('planner.tableView')}</span>
              </button>
            </div>
            <div className="weekly-planner__toolbar-actions">
              {!editable && <span className="weekly-planner__locked">{t('planner.locked')}</span>}
              {isViewingHistoricalVersion && <button type="button" className="btn-outline" onClick={() => void refresh()}>{t('planner.backToCurrent')}</button>}
              <button type="button" className="btn-outline" onClick={() => void handleOpenHistory()}>{t('planner.versionHistory')}</button>
              {snapshot.version.status === 'PUBLISHED' && <button type="button" className="btn-outline" onClick={() => void handleCreateNewVersion()} disabled={isCreatingVersion}>
                {isCreatingVersion ? <Loader2 className="icon-spin" size={16} aria-hidden="true" /> : null} {isCreatingVersion ? t('planner.creatingNewVersion') : t('planner.createNewVersion')}
              </button>}
              {canEdit && <button type="button" className="btn-outline" onClick={() => setIsPublishPendingOpen(true)} data-testid="publish-pending-open">{t('planner.publishPending.open')}</button>}
              {editable && <button type="button" className="btn-outline" onClick={() => setIsCopyWeekOpen(true)} data-testid="copy-week-open">{t('planner.copyWeek.open')}</button>}
              {editable && <button type="button" className="btn-gold" onClick={() => { setPublishError(null); setIsPublishOpen(true); }} disabled={isPublishing || snapshot.assignments.length === 0}>
                {isPublishing ? <Loader2 className="icon-spin" size={16} aria-hidden="true" /> : null} {isPublishing ? t('planner.publishing') : t('planner.publish')}
              </button>}
            </div>
          </div>
          )}
          {isCompact && operationError && !editor && <p className="weekly-planner__editor-error" role="alert">{operationError}</p>}

          {snapshot.employees.length === 0 ? (
            <div className="weekly-planner__state weekly-planner__state--empty">
              <h2>{t('planner.noEmployeesTitle')}</h2>
              <p>{t('planner.noEmployeesDescription')}</p>
            </div>
          ) : isCompact ? (
            visibleEmployees.length === 0 ? (
              <div className="weekly-planner__state weekly-planner__state--empty">
                <h2>{t('planner.employeeFilterEmptyTitle')}</h2>
                <p>{t('planner.employeeFilterEmptyDescription')}</p>
              </div>
            ) : mobileView === 'agenda' ? (
              <PlannerAgenda
                days={days}
                activeDay={activeDay}
                today={today}
                locale={locale}
                versionStatus={snapshot.version.status}
                employees={visibleEmployees}
                allEmployees={employeeFilter === 'all'}
                assignmentsByCell={assignmentsByCell}
                calendarShiftsByCell={calendarShiftsByCell}
                canAdd={Boolean(editable)}
                onSelectDay={setActiveDay}
                onAdd={(day) => addFromAgenda(day)}
                onOpen={openPlannerRow}
              />
            ) : (
              <PlannerMatrix
                days={days}
                today={today}
                locale={locale}
                versionStatus={snapshot.version.status}
                employees={visibleEmployees}
                assignmentsByCell={assignmentsByCell}
                calendarShiftsByCell={calendarShiftsByCell}
                canAdd={Boolean(editable)}
                onCell={openMatrixCell}
              />
            )
          ) : (
          <div
            className="weekly-planner__workspace"
            data-editor-state={editor ? 'open' : 'closed'}
          >
            <div className="weekly-planner__grid-region">
              {visibleEmployees.length === 0 ? (
                <div className="weekly-planner__state weekly-planner__state--empty">
                  <h2>{t('planner.employeeFilterEmptyTitle')}</h2>
                  <p>{t('planner.employeeFilterEmptyDescription')}</p>
                </div>
              ) : view === 'table' ? (
                <AccessibleScheduleTable
                  days={days}
                  locale={locale}
                  snapshot={visibleSnapshot ?? snapshot}
                  editorSnapshot={snapshot}
                  assignmentsByCell={assignmentsByCell}
                  calendarShiftsByCell={calendarShiftsByCell}
                  editable={Boolean(editable)}
                  minimumDate={today}
                  editor={editor}
                  showEditor={false}
                  isSaving={isSaving}
                  operationError={operationError}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onChangeEditor={setEditor}
                  onCloseEditor={resetEditor}
                  onSave={handleSave}
                  onDelete={(assignment) => void handleDelete(assignment)}
                />
              ) : (
                <>
                  <div className="weekly-planner__overflow-hint" aria-hidden="true" data-testid="planner-overflow-hint">
                    <span>{t('planner.scrollHint')}</span>
                  </div>
                  <div className="scroll-hint-frame" data-has-down={gridHints.down || undefined}>
                  <div ref={gridWrapRef} className="weekly-planner__grid-wrap" role="region" aria-label={t('planner.gridLabel')} tabIndex={0}>
                    <table className="weekly-planner__grid">
                    <caption className="sr-only">{t('planner.gridCaption')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('planner.employeeColumn')}</th>
                        {days.map((day) => <th scope="col" key={day} data-day={day} data-active-day={activeDay === day || undefined} data-today={day === today || undefined} aria-current={activeDay === day ? 'date' : undefined}>{formatDay(day, locale)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEmployees.map((employee) => (
                        <tr key={employee.id}>
                          <th scope="row">
                            <span>{formatEmployeeProfileLabel(employee.name, employee.externalEmployeeId)}</span>
                          </th>
                          {days.map((day) => {
                            const cellAssignments = assignmentsByCell.get(`${employee.id}:${day}`) ?? [];
                            const isSelected = selectedCell?.employeeId === employee.id && selectedCell.date === day;
                            return (
                              <td key={day} data-selected={isSelected || undefined} data-active-day={activeDay === day || undefined} data-today={day === today || undefined}>
                                <div className="weekly-planner__cell" data-empty={cellAssignments.length === 0}>
                                  {cellAssignments.map((assignment) => {
                                    const shiftTypeId = getAssignmentShiftType(assignment);
                                    const displayType = translateShiftTypeLabel(
                                      shiftTypeId,
                                      locale,
                                      getShiftTypeDefinition(shiftTypeId)?.label ?? shiftTypeId,
                                    );
                                    const hasTimes = Boolean(assignment.startTime && assignment.endTime);
                                    const isAssignmentSelected = editor?.id === assignment.id;
                                    const flagged = Boolean(assignment.staleAgainstCalendar || assignment.excludedFromPublication);

                                    return (
                                      <button
                                        type="button"
                                        className="weekly-planner__assignment"
                                        key={assignment.id}
                                        data-shift-type={shiftTypeId}
                                        data-shift-visual={getShiftVisualTokenKey(shiftTypeId)}
                                        data-selected={isAssignmentSelected || undefined}
                                        onClick={() => { if (editable && day >= today) handleEdit(employee.id, day, assignment); }}
                                        disabled={!editable || day < today}
                                        data-editor-target={`${employee.id}:${day}`}
                                        data-stale={flagged || undefined}
                                        title={flagged ? t(snapshot?.version.status === 'DRAFT' ? 'planner.staleAssignmentHint' : assignment.staleAgainstCalendar ? 'planner.excludedAssignmentHint' : 'planner.excludedAssignmentGenericHint') : (editable ? t('planner.editAssignment') : t('planner.locked'))}
                                      >
                                        {hasTimes && <span className="weekly-planner__assignment-type">{displayType}</span>}
                                        <strong>{hasTimes
                                          ? `${assignment.startTime!.slice(0, 5)}–${assignment.endTime!.slice(0, 5)}`
                                          : displayType}</strong>
                                        {assignment.location && <span>{assignment.location}</span>}
                                        {flagged && (
                                          <span className="weekly-planner__stale" data-testid="planner-stale-assignment"><AlertTriangle size={11} aria-hidden="true" /><span className="weekly-planner__stale-full">{t(snapshot?.version.status === 'DRAFT' ? 'planner.staleAssignment' : assignment.staleAgainstCalendar ? 'planner.excludedAssignment' : 'planner.excludedAssignmentGeneric')}</span><span className="weekly-planner__stale-short" aria-hidden="true">{t(snapshot?.version.status === 'DRAFT' ? 'planner.staleAssignmentShort' : 'planner.excludedAssignmentShort')}</span></span>
                                        )}
                                      </button>
                                    );
                                  })}
                                  {(calendarShiftsByCell.get(`${employee.id}:${day}`) ?? []).map((shift) => {
                                    const shiftTypeId = shift.shiftType;
                                    const displayType = translateShiftTypeLabel(
                                      shiftTypeId,
                                      locale,
                                      getShiftTypeDefinition(shiftTypeId)?.label ?? shiftTypeId,
                                    );
                                    const hasTimes = Boolean(shift.startTime && shift.endTime);
                                    const protectedAbsence = Boolean(shift.timeOffRequestId);
                                    return (
                                      <div
                                        className="weekly-planner__assignment weekly-planner__calendar-shift"
                                        key={`calendar-${shift.id}`}
                                        data-shift-type={shiftTypeId}
                                        data-protected-absence={protectedAbsence || undefined}
                                        title={protectedAbsence ? t('planner.protectedVacationAria') : t('planner.alreadyOnCalendar')}
                                        aria-label={protectedAbsence
                                          ? `${t('planner.protectedVacationAria')}: ${displayType}`
                                          : `${t('planner.alreadyOnCalendar')}: ${displayType}${hasTimes ? ` ${shift.startTime}–${shift.endTime}` : ''}`}
                                      >
                                        <span className="weekly-planner__assignment-type">
                                          {protectedAbsence && <Lock size={11} aria-hidden="true" />}{protectedAbsence ? ` ${t('planner.protectedVacation')}` : t('planner.alreadyOnCalendar')}
                                        </span>
                                        <strong>{hasTimes
                                          ? `${displayType} · ${shift.startTime}–${shift.endTime}`
                                          : displayType}</strong>
                                        {shift.location && <span>{shift.location}</span>}
                                      </div>
                                    );
                                  })}
                                  {editable && day >= today && !(calendarShiftsByCell.get(`${employee.id}:${day}`) ?? []).some((shift) => shift.timeOffRequestId) && (
                                    <button type="button" className="weekly-planner__add-cell" onClick={() => handleAdd(employee.id, day)} aria-label={t('planner.addAssignment', { employee: employee.name, date: day })} data-editor-target={`${employee.id}:${day}`}>
                                      <Plus size={16} aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  <ScrollHintButtons canUp={gridHints.up} canDown={gridHints.down} onScroll={gridHints.scrollBy} />
                  </div>
                </>
              )}
            </div>

          </div>
          )}
        </>
      )}

      {isCompact && snapshot && (
        <>
          <PlannerManageSheet isOpen={isManageOpen} onClose={() => setIsManageOpen(false)} actions={manageActions} />
          <PlannerCellSheet target={cellTarget} versionStatus={snapshot.version.status} locale={locale} canAdd={Boolean(editable)} today={today}
            onClose={() => setCellTarget(null)} onOpen={openPlannerRow} onAdd={(employeeId, day) => addFromAgenda(day, employeeId)} />
          <PlannerDetailSheet row={detailRow} versionStatus={snapshot.version.status} locale={locale} onClose={() => setDetailRow(null)} />
        </>
      )}

      {editor && <ModalShell
        isOpen={mobileEditorOpen}
        onClose={resetEditor}
        title={editor.id ? t('planner.editTitle') : t('planner.addTitle')}
        closeAriaLabel={t('common.close')}
        initialFocus="#planner-editor-employee"
        maxWidth="640px"
      >
        {snapshot && <ScheduleAssignmentEditor
          snapshot={snapshot}
          editor={editor}
          focusKey={editorFocusKey}
          mobileOpen
          modal
          isSaving={isSaving}
          operationError={operationError}
          onChange={setEditor}
          onClose={resetEditor}
          onSave={handleSave}
          onDelete={() => void handleDelete()}
          minimumDate={today}
        />}
      </ModalShell>}

      {canEdit && (
        <PublishPendingDialog
          isOpen={isPublishPendingOpen}
          areaId={areaId}
          onClose={() => setIsPublishPendingOpen(false)}
          onPublished={() => { void refresh(); }}
        />
      )}

      {snapshot && editable && (
        <CopyWeekDialog
          isOpen={isCopyWeekOpen}
          scheduleId={snapshot.version.scheduleId}
          versionId={snapshot.version.id}
          periodStart={snapshot.version.periodStart}
          onClose={() => setIsCopyWeekOpen(false)}
          onCopied={() => { void refresh(); }}
        />
      )}

      {snapshot && editable && (
        <ModalShell
          isOpen={isPublishOpen}
          onClose={() => { if (!isPublishing) setIsPublishOpen(false); }}
          title={t('planner.publishTitle')}
          closeAriaLabel={t('common.close')}
          maxWidth="520px"
          footer={(
            <>
              <button type="button" className="btn-outline" onClick={() => setIsPublishOpen(false)} disabled={isPublishing}>{t('common.cancel')}</button>
              <button type="button" className="btn-gold" onClick={() => void handlePublish()} disabled={isPublishing}>
                {isPublishing ? <Loader2 className="icon-spin" size={16} aria-hidden="true" /> : null} {isPublishing ? t('planner.publishing') : t('planner.confirmPublish')}
              </button>
            </>
          )}
        >
          <div className="weekly-planner__publish-summary">
            <p>{t('planner.publishDescription')}</p>
            <strong>{t('planner.publishSummary', { count: snapshot.assignments.filter((assignment) => !assignment.staleAgainstCalendar).length })}</strong>
            {snapshot.assignments.some((assignment) => assignment.staleAgainstCalendar) && (
              <p className="weekly-planner__publish-note" role="status" data-testid="planner-stale-publish-note">
                {t('planner.publishStaleNote', { count: snapshot.assignments.filter((assignment) => assignment.staleAgainstCalendar).length })}
              </p>
            )}
            <p className="weekly-planner__publish-note">{t('planner.publishNote')}</p>
            {publishError && <p className="weekly-planner__editor-error" role="alert" aria-live="polite">{publishError}</p>}
          </div>
        </ModalShell>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmationOpen}
        title={t('planner.deleteTitle')}
        description={t('planner.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDeleteConfirmationOpen(false)}
        onConfirm={performDelete}
      />

      {snapshot && (
        <ModalShell
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          title={t('planner.versionHistoryTitle')}
          closeAriaLabel={t('common.close')}
          maxWidth="860px"
        >
          <p>{t('planner.versionHistoryDescription')}</p>
          <ScheduleVersionHistory
            versions={historyVersions}
            currentVersionId={snapshot.version.id}
            isLoading={isHistoryLoading}
            error={historyError}
            onSelect={(selected) => void handleSelectHistoryVersion(selected)}
          />
        </ModalShell>
      )}
    </div>
  );
}

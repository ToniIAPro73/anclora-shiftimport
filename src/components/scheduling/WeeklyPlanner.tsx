import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { ApiError } from '../../lib/session';
import {
  createRemoteAssignment,
  createRemoteScheduleDraft,
  deleteRemoteAssignment,
  listRemoteScheduleVersions,
  loadRemoteScheduleSnapshot,
  publishRemoteScheduleVersion,
  ScheduleSnapshot,
  ShiftAssignment,
  updateRemoteAssignment,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { LanguageToggle } from '../ui/LanguageToggle';
import { ModalShell } from '../ui/ModalShell';
import { ThemeToggle } from '../ui/ThemeToggle';
import { AccessibleScheduleTable } from './AccessibleScheduleTable';
import { AssignmentEditorState, ScheduleAssignmentEditor } from './ScheduleAssignmentEditor';

interface WeeklyPlannerProps {
  areaId?: string | null;
  canEdit: boolean;
  onBack: () => void;
  initialPeriodStart?: string;
}

const VIEW_PREFERENCE_KEY = 'anclora_shiftimport_planner_view_v1';
type PlannerView = 'grid' | 'table';

const pad = (value: number): string => String(value).padStart(2, '0');

function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function mondayFor(value: Date): string {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
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
    startTime: assignment?.startTime.slice(0, 5) ?? '09:00',
    endTime: assignment?.endTime.slice(0, 5) ?? '17:00',
    location: assignment?.location ?? '',
  };
}

function errorCopy(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    if (error.code === 'OVERLAP') return t('planner.errorOverlap');
    if (error.code === 'REST_RULE_VIOLATION') return t('planner.errorRest');
    if (error.code === 'VERSION_NOT_EDITABLE') return t('planner.errorVersion');
    if (error.code === 'SCOPE_FORBIDDEN') return t('planner.errorScope');
    if (error.code === 'SCHEDULE_DRAFT_EXISTS') return t('planner.errorDraftExists');
    if (error.status === 403) return t('planner.errorPermission');
  }
  return t('planner.errorGeneric');
}

export function WeeklyPlanner({ areaId = null, canEdit, onBack, initialPeriodStart }: WeeklyPlannerProps) {
  const { locale, t } = useI18n();
  const [periodStart, setPeriodStart] = useState(() => initialPeriodStart ?? mondayFor(new Date()));
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<AssignmentEditorState | null>(null);
  const [view, setView] = useState<PlannerView>(() => {
    try {
      return window.localStorage.getItem(VIEW_PREFERENCE_KEY) === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const requestId = useRef(0);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(periodStart, index)), [periodStart]);
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
  const editable = canEdit && snapshot?.version.status === 'DRAFT';

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    setOperationError(null);
    setNotice(null);
    setEditor(null);
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

  const shiftWeek = (delta: number) => setPeriodStart((current) => addDays(current, delta * 7));

  const handleCreateDraft = async () => {
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

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !snapshot || !editable) return;
    setIsSaving(true);
    setOperationError(null);
    setNotice(null);
    try {
      if (editor.id) {
        await updateRemoteAssignment(snapshot.version.scheduleId, snapshot.version.id, editor.id, editor);
      } else {
        await createRemoteAssignment(snapshot.version.scheduleId, snapshot.version.id, editor);
      }
      setEditor(null);
      setNotice(t('planner.assignmentSaved'));
      const loaded = await loadRemoteScheduleSnapshot(snapshot.version.scheduleId, snapshot.version.id);
      setSnapshot(loaded);
    } catch (requestError) {
      setOperationError(errorCopy(requestError, t));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (assignment?: ShiftAssignment) => {
    const targetId = assignment?.id ?? editor?.id;
    if (!targetId || !snapshot || !editable || !window.confirm(t('planner.deleteConfirm'))) return;
    setIsSaving(true);
    setOperationError(null);
    try {
      await deleteRemoteAssignment(snapshot.version.scheduleId, snapshot.version.id, targetId);
      setEditor(null);
      setNotice(t('planner.assignmentDeleted'));
      const loaded = await loadRemoteScheduleSnapshot(snapshot.version.scheduleId, snapshot.version.id);
      setSnapshot(loaded);
    } catch (requestError) {
      setOperationError(errorCopy(requestError, t));
    } finally {
      setIsSaving(false);
    }
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

  return (
    <main className="weekly-planner" data-testid="weekly-planner" data-state={isLoading ? 'loading' : error ? 'error' : snapshot && !editable ? 'disabled' : snapshot ? 'ready' : 'empty'}>
      <header className="weekly-planner__header">
        <div>
          <button type="button" className="weekly-planner__back" onClick={onBack}>
            <ChevronLeft size={16} aria-hidden="true" /> {t('planner.back')}
          </button>
          <p className="weekly-planner__eyebrow">{t('planner.eyebrow')}</p>
          <h1>{t('planner.title')}</h1>
          <p className="weekly-planner__intro">{t('planner.description')}</p>
        </div>
        <div className="weekly-planner__header-tools">
          <div className="weekly-planner__week-control" role="group" aria-label={t('planner.weekNavigation')}>
            <button type="button" className="theme-toggle" onClick={() => shiftWeek(-1)} aria-label={t('planner.previousWeek')}>
              <ChevronLeft size={18} />
            </button>
            <span>{formatDay(periodStart, locale)} – {formatDay(addDays(periodStart, 6), locale)}</span>
            <button type="button" className="theme-toggle" onClick={() => shiftWeek(1)} aria-label={t('planner.nextWeek')}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="weekly-planner__view-tools">
            <div className="weekly-planner__view-switcher" role="group" aria-label={t('planner.viewModeLabel')}>
              <button type="button" className="weekly-planner__view-button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{t('planner.gridView')}</button>
              <button type="button" className="weekly-planner__view-button" aria-pressed={view === 'table'} onClick={() => setView('table')}>{t('planner.tableView')}</button>
            </div>
            <ThemeToggle />
            <LanguageToggle />
          </div>
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
          <div className="weekly-planner__toolbar">
            <div>
              <span className={`weekly-planner__status weekly-planner__status--${snapshot.version.status.toLowerCase()}`}>
                {snapshot.version.status === 'DRAFT' ? t('planner.statusDraft') : t('planner.statusReadOnly')}
              </span>
              <span className="weekly-planner__meta">{t('planner.assignmentCount', { count: snapshot.assignments.length })}</span>
            </div>
            <div className="weekly-planner__toolbar-actions">
              {!editable && <span className="weekly-planner__locked">{t('planner.locked')}</span>}
              {editable && <button type="button" className="btn-gold" onClick={() => { setPublishError(null); setIsPublishOpen(true); }} disabled={isPublishing || snapshot.assignments.length === 0}>
                {isPublishing ? <Loader2 className="icon-spin" size={16} aria-hidden="true" /> : null} {isPublishing ? t('planner.publishing') : t('planner.publish')}
              </button>}
            </div>
          </div>

          {snapshot.employees.length === 0 ? (
            <div className="weekly-planner__state weekly-planner__state--empty">
              <h2>{t('planner.noEmployeesTitle')}</h2>
              <p>{t('planner.noEmployeesDescription')}</p>
            </div>
          ) : view === 'table' ? (
            <AccessibleScheduleTable
              days={days}
              locale={locale}
              snapshot={snapshot}
              assignmentsByCell={assignmentsByCell}
              editable={Boolean(editable)}
              editor={editor}
              isSaving={isSaving}
              operationError={operationError}
              onAdd={(employeeId, date) => setEditor(initialEditor(employeeId, date))}
              onEdit={(employeeId, date, assignment) => setEditor(initialEditor(employeeId, date, assignment))}
              onChangeEditor={setEditor}
              onCloseEditor={() => setEditor(null)}
              onSave={handleSave}
              onDelete={(assignment) => void handleDelete(assignment)}
            />
          ) : (
            <div className="weekly-planner__grid-wrap" role="region" aria-label={t('planner.gridLabel')} tabIndex={0}>
              <table className="weekly-planner__grid">
                <caption className="sr-only">{t('planner.gridCaption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('planner.employeeColumn')}</th>
                    {days.map((day) => <th scope="col" key={day}>{formatDay(day, locale)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.employees.map((employee) => (
                    <tr key={employee.id}>
                      <th scope="row">
                        <span>{employee.name}</span>
                        {employee.externalEmployeeId && <small>{employee.externalEmployeeId}</small>}
                      </th>
                      {days.map((day) => {
                        const cellAssignments = assignmentsByCell.get(`${employee.id}:${day}`) ?? [];
                        return (
                          <td key={day}>
                            <div className="weekly-planner__cell" data-empty={cellAssignments.length === 0}>
                              {cellAssignments.map((assignment) => (
                                <button
                                  type="button"
                                  className="weekly-planner__assignment"
                                  key={assignment.id}
                                  onClick={() => { if (editable) setEditor(initialEditor(employee.id, day, assignment)); }}
                                  disabled={!editable}
                                  title={editable ? t('planner.editAssignment') : t('planner.locked')}
                                >
                                  <strong>{assignment.startTime.slice(0, 5)}–{assignment.endTime.slice(0, 5)}</strong>
                                  {assignment.location && <span>{assignment.location}</span>}
                                </button>
                              ))}
                              {editable && (
                                <button type="button" className="weekly-planner__add-cell" onClick={() => setEditor(initialEditor(employee.id, day))} aria-label={t('planner.addAssignment', { employee: employee.name, date: day })}>
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
          )}

          {view === 'grid' && editor && (
            <ScheduleAssignmentEditor
              snapshot={snapshot}
              editor={editor}
              isSaving={isSaving}
              operationError={operationError}
              onChange={setEditor}
              onClose={() => setEditor(null)}
              onSave={handleSave}
              onDelete={() => void handleDelete()}
            />
          )}
        </>
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
            <strong>{t('planner.publishSummary', { count: snapshot.assignments.length })}</strong>
            <p className="weekly-planner__publish-note">{t('planner.publishNote')}</p>
            {publishError && <p className="weekly-planner__editor-error" role="alert" aria-live="polite">{publishError}</p>}
          </div>
        </ModalShell>
      )}
    </main>
  );
}

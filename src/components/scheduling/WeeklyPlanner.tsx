import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { ApiError } from '../../lib/session';
import {
  createRemoteAssignment,
  createRemoteScheduleDraft,
  deleteRemoteAssignment,
  listRemoteScheduleVersions,
  loadRemoteScheduleSnapshot,
  ScheduleSnapshot,
  ShiftAssignment,
  updateRemoteAssignment,
} from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { LanguageToggle } from '../ui/LanguageToggle';
import { ThemeToggle } from '../ui/ThemeToggle';

interface WeeklyPlannerProps {
  areaId?: string | null;
  canEdit: boolean;
  onBack: () => void;
  initialPeriodStart?: string;
}

interface EditorState {
  id: string | null;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

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

function initialEditor(employeeId: string, date: string, assignment?: ShiftAssignment): EditorState {
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
  const [error, setError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
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

  const handleDelete = async () => {
    if (!editor?.id || !snapshot || !editable || !window.confirm(t('planner.deleteConfirm'))) return;
    setIsSaving(true);
    setOperationError(null);
    try {
      await deleteRemoteAssignment(snapshot.version.scheduleId, snapshot.version.id, editor.id);
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
            {!editable && <span className="weekly-planner__locked">{t('planner.locked')}</span>}
          </div>

          {snapshot.employees.length === 0 ? (
            <div className="weekly-planner__state weekly-planner__state--empty">
              <h2>{t('planner.noEmployeesTitle')}</h2>
              <p>{t('planner.noEmployeesDescription')}</p>
            </div>
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

          {editor && (
            <form className="weekly-planner__editor" onSubmit={handleSave} aria-label={editor.id ? t('planner.editTitle') : t('planner.addTitle')}>
              <div className="weekly-planner__editor-heading">
                <div>
                  <p className="weekly-planner__eyebrow">{editor.id ? t('planner.editEyebrow') : t('planner.addEyebrow')}</p>
                  <h2>{editor.id ? t('planner.editTitle') : t('planner.addTitle')}</h2>
                </div>
                <button type="button" className="theme-toggle" onClick={() => setEditor(null)} aria-label={t('common.close')} disabled={isSaving}><span aria-hidden="true">×</span></button>
              </div>
              <div className="weekly-planner__editor-fields">
                <label>{t('planner.employeeLabel')}
                  <select value={editor.employeeId} onChange={(event) => setEditor({ ...editor, employeeId: event.target.value })} disabled={isSaving}>
                    {snapshot.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}
                  </select>
                </label>
                <label>{t('planner.dateLabel')}
                  <input type="date" value={editor.date} min={snapshot.version.periodStart} max={snapshot.version.periodEnd} onChange={(event) => setEditor({ ...editor, date: event.target.value })} disabled={isSaving} required />
                </label>
                <label>{t('planner.startLabel')}
                  <input type="time" value={editor.startTime} onChange={(event) => setEditor({ ...editor, startTime: event.target.value })} disabled={isSaving} required />
                </label>
                <label>{t('planner.endLabel')}
                  <input type="time" value={editor.endTime} onChange={(event) => setEditor({ ...editor, endTime: event.target.value })} disabled={isSaving} required />
                </label>
                <label>{t('planner.locationLabel')}
                  <input value={editor.location} onChange={(event) => setEditor({ ...editor, location: event.target.value })} disabled={isSaving} placeholder={t('planner.locationPlaceholder')} />
                </label>
              </div>
              {operationError && <p className="weekly-planner__editor-error" role="alert">{operationError}</p>}
              <div className="weekly-planner__editor-actions">
                {editor.id && <button type="button" className="btn-outline weekly-planner__delete" onClick={() => void handleDelete()} disabled={isSaving}><Trash2 size={16} /> {t('planner.deleteAssignment')}</button>}
                <span />
                <button type="button" className="btn-outline" onClick={() => setEditor(null)} disabled={isSaving}>{t('common.cancel')}</button>
                <button type="submit" className="btn-gold" disabled={isSaving}>{isSaving ? <Loader2 className="icon-spin" size={16} /> : <Save size={16} />} {t('common.save')}</button>
              </div>
            </form>
          )}
        </>
      )}
    </main>
  );
}

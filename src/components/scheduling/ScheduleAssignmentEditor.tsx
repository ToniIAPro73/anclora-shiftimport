import { FormEvent, useEffect, useRef } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { ScheduleSnapshot } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';

export interface AssignmentEditorState {
  id: string | null;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

interface ScheduleAssignmentEditorProps {
  snapshot: ScheduleSnapshot;
  editor: AssignmentEditorState;
  isSaving: boolean;
  operationError: string | null;
  onChange: (next: AssignmentEditorState) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}

export function ScheduleAssignmentEditor({
  snapshot,
  editor,
  isSaving,
  operationError,
  onChange,
  onClose,
  onSave,
  onDelete,
}: ScheduleAssignmentEditorProps) {
  const { t } = useI18n();
  const employeeRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    employeeRef.current?.focus();
  }, [editor.id]);

  return (
    <form
      className="weekly-planner__editor"
      onSubmit={onSave}
      aria-label={editor.id ? t('planner.editTitle') : t('planner.addTitle')}
      aria-describedby={operationError ? 'planner-editor-error' : undefined}
    >
      <div className="weekly-planner__editor-heading">
        <div>
          <p className="weekly-planner__eyebrow">{editor.id ? t('planner.editEyebrow') : t('planner.addEyebrow')}</p>
          <h2>{editor.id ? t('planner.editTitle') : t('planner.addTitle')}</h2>
        </div>
        <button type="button" className="theme-toggle" onClick={onClose} aria-label={t('common.close')} disabled={isSaving}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="weekly-planner__editor-fields">
        <label htmlFor="planner-editor-employee">{t('planner.employeeLabel')}
          <select
            id="planner-editor-employee"
            name="employeeId"
            autoComplete="off"
            ref={employeeRef}
            value={editor.employeeId}
            onChange={(event) => onChange({ ...editor, employeeId: event.target.value })}
            disabled={isSaving}
          >
            {snapshot.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}
          </select>
        </label>
        <label htmlFor="planner-editor-date">{t('planner.dateLabel')}
          <input id="planner-editor-date" name="date" type="date" autoComplete="off" value={editor.date} min={snapshot.version.periodStart} max={snapshot.version.periodEnd} onChange={(event) => onChange({ ...editor, date: event.target.value })} disabled={isSaving} required />
        </label>
        <label htmlFor="planner-editor-start">{t('planner.startLabel')}
          <input id="planner-editor-start" name="startTime" type="time" autoComplete="off" value={editor.startTime} onChange={(event) => onChange({ ...editor, startTime: event.target.value })} disabled={isSaving} required />
        </label>
        <label htmlFor="planner-editor-end">{t('planner.endLabel')}
          <input id="planner-editor-end" name="endTime" type="time" autoComplete="off" value={editor.endTime} onChange={(event) => onChange({ ...editor, endTime: event.target.value })} disabled={isSaving} required />
        </label>
        <label htmlFor="planner-editor-location">{t('planner.locationLabel')}
          <input id="planner-editor-location" name="location" autoComplete="off" value={editor.location} onChange={(event) => onChange({ ...editor, location: event.target.value })} placeholder={t('planner.locationPlaceholder')} disabled={isSaving} />
        </label>
      </div>
      {operationError && <p id="planner-editor-error" className="weekly-planner__editor-error" role="alert" aria-live="polite">{operationError}</p>}
      <div className="weekly-planner__editor-actions">
        {editor.id && <button type="button" className="btn-outline weekly-planner__delete" onClick={onDelete} disabled={isSaving}><Trash2 size={16} aria-hidden="true" /> {t('planner.deleteAssignment')}</button>}
        <span aria-hidden="true" />
        <button type="button" className="btn-outline" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</button>
        <button type="submit" className="btn-gold" disabled={isSaving}>{isSaving ? <Loader2 className="icon-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />} {t('common.save')}</button>
      </div>
    </form>
  );
}

import { FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Locale, translateShiftTypeLabel } from '../../lib/i18n';
import { ScheduleSnapshot, ShiftAssignment } from '../../lib/remote';
import { useI18n } from '../../lib/use-i18n';
import { getAssignmentShiftType } from '../../lib/shifts';
import { getShiftTypeDefinition } from '../../lib/shift-types';
import { AssignmentEditorState, ScheduleAssignmentEditor } from './ScheduleAssignmentEditor';

interface AccessibleScheduleTableProps {
  days: string[];
  locale: Locale;
  snapshot: ScheduleSnapshot;
  editorSnapshot?: ScheduleSnapshot;
  assignmentsByCell: Map<string, ShiftAssignment[]>;
  editable: boolean;
  minimumDate?: string;
  editor: AssignmentEditorState | null;
  showEditor?: boolean;
  isSaving: boolean;
  operationError: string | null;
  onAdd: (employeeId: string, date: string) => void;
  onEdit: (employeeId: string, date: string, assignment: ShiftAssignment) => void;
  onChangeEditor: (next: AssignmentEditorState) => void;
  onCloseEditor: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (assignment?: ShiftAssignment) => void;
}

function formatDay(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function rowKey(employeeId: string, day: string, assignment?: ShiftAssignment): string {
  return `${employeeId}:${day}:${assignment?.id ?? 'empty'}`;
}

export function AccessibleScheduleTable({
  days,
  locale,
  snapshot,
  editorSnapshot = snapshot,
  assignmentsByCell,
  editable,
  minimumDate,
  editor,
  showEditor = true,
  isSaving,
  operationError,
  onAdd,
  onEdit,
  onChangeEditor,
  onCloseEditor,
  onSave,
  onDelete,
}: AccessibleScheduleTableProps) {
  const { t } = useI18n();
  const today = minimumDate ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

  return (
    <>
      <div className="weekly-planner__overflow-hint" aria-hidden="true" data-testid="table-overflow-hint">
        <span>{t('planner.scrollHint')}</span>
      </div>
      <div className="weekly-planner__table-wrap" role="region" aria-label={t('planner.tableLabel')} tabIndex={0}>
        <table className="weekly-planner__table">
          <caption className="sr-only">{t('planner.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('planner.employeeColumn')}</th>
              <th scope="col">{t('planner.dateColumn')}</th>
              <th scope="col">{t('planner.assignmentColumn')}</th>
              <th scope="col">{t('planner.locationColumn')}</th>
              <th scope="col">{t('planner.actionsColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.employees.flatMap((employee) => days.flatMap((day) => {
              const cellAssignments = assignmentsByCell.get(`${employee.id}:${day}`) ?? [];
              const dateEditable = editable && day >= today;
              const rows = cellAssignments.length > 0 ? cellAssignments : [undefined];
              return rows.map((assignment) => (
                <tr key={rowKey(employee.id, day, assignment)}>
                  <th scope="row">
                    <span>{employee.name}</span>
                    {employee.externalEmployeeId && <small>{employee.externalEmployeeId}</small>}
                  </th>
                  <td><time dateTime={day}>{formatDay(day, locale)}</time></td>
                  <td>
                    {assignment ? (() => {
                      const shiftTypeId = getAssignmentShiftType(assignment);
                      const displayType = translateShiftTypeLabel(
                        shiftTypeId,
                        locale,
                        getShiftTypeDefinition(shiftTypeId)?.label ?? shiftTypeId,
                      );
                      const hasTimes = Boolean(assignment.startTime && assignment.endTime);
                      return (
                        <strong>
                          {hasTimes
                            ? `${displayType} (${assignment.startTime!.slice(0, 5)}–${assignment.endTime!.slice(0, 5)})`
                            : displayType}
                        </strong>
                      );
                    })() : <span className="weekly-planner__table-muted">{t('planner.noAssignment')}</span>}
                  </td>
                  <td>{assignment?.location || <span className="weekly-planner__table-muted">{t('planner.noLocation')}</span>}</td>
                  <td>
                    <div className="weekly-planner__table-actions">
                      {assignment && <button type="button" className="btn-outline" onClick={() => onEdit(employee.id, day, assignment)} disabled={!dateEditable} aria-label={t('planner.editAssignmentFor', { employee: employee.name, date: formatDay(day, locale) })} data-editor-target={`${employee.id}:${day}`}>
                        <Pencil size={15} aria-hidden="true" /> <span>{t('planner.editShort')}</span>
                      </button>}
                      {dateEditable && <button type="button" className="btn-outline weekly-planner__delete" onClick={() => assignment ? onEdit(employee.id, day, assignment) : onAdd(employee.id, day)} aria-label={assignment ? t('planner.deleteAssignmentFor', { employee: employee.name, date: formatDay(day, locale) }) : t('planner.addAssignment', { employee: employee.name, date: formatDay(day, locale) })} data-editor-target={`${employee.id}:${day}`}>
                        {assignment ? <><Trash2 size={15} aria-hidden="true" /> <span>{t('planner.deleteShort')}</span></> : <><Plus size={15} aria-hidden="true" /> <span>{t('planner.addShort')}</span></>}
                      </button>}
                    </div>
                  </td>
                </tr>
              ));
            }))}
          </tbody>
        </table>
      </div>
      {showEditor && editor && (
        <ScheduleAssignmentEditor
          snapshot={editorSnapshot}
          editor={editor}
          isSaving={isSaving}
          operationError={operationError}
          onChange={onChangeEditor}
          onClose={onCloseEditor}
          onSave={onSave}
          onDelete={onDelete}
          minimumDate={minimumDate}
        />
      )}
    </>
  );
}

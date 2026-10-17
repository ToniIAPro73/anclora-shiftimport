import React, { useMemo, useState } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { Shift } from '../../lib/types';
import { getShiftOrigin, getShiftType, hasShiftTimes, sortDayShifts } from '../../lib/shifts';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';
import './DayDetailModal.css';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';
import { DayProvenancePanel } from './DayProvenancePanel';
import { DayAnnotationsPanel } from './DayAnnotationsPanel';
import type { DayAnnotation } from '../../lib/remote';

export interface DayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  shifts: Shift[];
  onEditShift: (id: string) => void;
  onDeleteShift?: (id: string) => void | Promise<void>;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Effective-calendar provenance (backend sessions only). */
  provenance?: { employeeId: string; canReconcile: boolean; onChanged?: () => void };
  /** DCF incidences / observations of this day (backend sessions). */
  annotations?: DayAnnotation[];
  canEditAnnotations?: boolean;
  onAnnotationsChanged?: () => void;
}

function formatDuration(startTime?: string, endTime?: string): string | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const diffMinutes = endMinutes - startMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  isOpen,
  onClose,
  date,
  shifts,
  onEditShift,
  onDeleteShift,
  triggerRef,
  provenance,
  annotations = [],
  canEditAnnotations = false,
  onAnnotationsChanged,
}) => {
  const { locale, t } = useI18n();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const formattedDate = useMemo(() => {
    if (!date) return '';
    try {
      const d = new Date(date + 'T12:00:00');
      const str = d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
      return date;
    }
  }, [date, locale]);

  const sortedShifts = useMemo(() => sortDayShifts(shifts), [shifts]);

  const allDayShifts = useMemo(() => {
    return sortedShifts.filter((s) => !hasShiftTimes(s));
  }, [sortedShifts]);

  const timedShifts = useMemo(() => {
    return sortedShifts.filter((s) => hasShiftTimes(s));
  }, [sortedShifts]);

  const handleClose = () => {
    setConfirmDeleteId(null);
    onClose();
    if (triggerRef?.current) {
      setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };

  const handleEdit = (shiftId: string) => {
    onEditShift(shiftId);
    handleClose();
  };

  const handleDelete = async (shiftId: string) => {
    if (!onDeleteShift) return;
    setDeleting(true);
    try {
      await onDeleteShift(shiftId);
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const renderShiftItem = (shift: Shift) => {
    const shiftTypeId = getShiftType(shift);
    const shiftType = translateShiftTypeLabel(shiftTypeId, locale, shiftTypeId);
    const shiftOrigin = getShiftOrigin(shift);
    const hasTimes = hasShiftTimes(shift);
    const duration = formatDuration(shift.startTime, shift.endTime);
    const originLabel = shiftOrigin === 'IMP' ? t('importConflict.describeImported') : t('importConflict.describeManual');
    const isConfirming = confirmDeleteId === shift.id;

    return (
      <div
        key={shift.id}
        className="day-detail-item"
        data-shift-type={shiftTypeId}
        data-shift-visual={getShiftVisualTokenKey(shiftTypeId)}
        data-testid={`day-detail-item-${shift.id}`}
      >
        <div className="day-detail-item-info">
          <div className="day-detail-item-primary">
            <span
              className="day-detail-type-badge"
            >
              {shiftType}
            </span>
            <span className="day-detail-origin-badge">
              {originLabel}
            </span>
          </div>

          <div className="day-detail-item-secondary">
            {hasTimes ? (
              <span>
                {shift.startTime} – {shift.endTime}
              </span>
            ) : (
              <span>{t('calendar.allDayEvents')}</span>
            )}
            {duration && (
              <span className="day-detail-item-duration">
                ({duration})
              </span>
            )}
          </div>

          {isConfirming && (
            <div className="day-detail-confirm-delete" data-testid={`confirm-delete-${shift.id}`}>
              <span>{t('calendar.deleteShiftConfirm')}</span>
              <div className="day-detail-confirm-delete-actions">
                <button
                  type="button"
                  className="equipo-btn equipo-btn--danger"
                  onClick={() => void handleDelete(shift.id)}
                  disabled={deleting}
                  data-testid={`confirm-delete-btn-${shift.id}`}
                >
                  {deleting ? '…' : t('calendar.deleteShift')}
                </button>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--secondary"
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={deleting}
                >
                  {t('teamWorkspace.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        {!isConfirming && (
          <div className="day-detail-item-actions">
            <button
              type="button"
              className="day-detail-action-btn"
              onClick={() => handleEdit(shift.id)}
              aria-label={`${t('calendar.editShift')} ${shiftType}`}
              title={t('calendar.editShift')}
              data-testid={`edit-shift-btn-${shift.id}`}
            >
              <Edit3 size={15} />
            </button>
            {onDeleteShift && (
              <button
                type="button"
                className="day-detail-action-btn day-detail-action-btn--delete"
                onClick={() => setConfirmDeleteId(shift.id)}
                aria-label={`${t('calendar.deleteShift')} ${shiftType}`}
                title={t('calendar.deleteShift')}
                data-testid={`delete-shift-btn-${shift.id}`}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={formattedDate || t('calendar.dayDetailTitle')}
      closeAriaLabel={t('teamWorkspace.close')}
      closeTestId="close-day-detail-modal"
      maxWidth="1040px"
      width="min(96vw, 1040px)"
    >
      <div className="day-detail-dialog" data-testid="day-detail-dialog">
        <div className={provenance ? 'day-detail-grid' : undefined}>
        <div className="day-detail-col">
        <div className="day-detail-header-info">
          <span className="day-detail-count-badge" data-testid="day-detail-count-badge">
            {t('calendar.totalItems', { count: shifts.length })}
          </span>
        </div>

        {allDayShifts.length > 0 && (
          <div className="day-detail-section" data-testid="day-detail-allday-section">
            <h4 className="day-detail-section-title">
              {t('calendar.allDayEvents')}
            </h4>
            <div className="day-detail-list">
              {allDayShifts.map(renderShiftItem)}
            </div>
          </div>
        )}

        {timedShifts.length > 0 && (
          <div className="day-detail-section" data-testid="day-detail-timed-section">
            <h4 className="day-detail-section-title">
              {t('calendar.timedShifts')}
            </h4>
            <div className="day-detail-list">
              {timedShifts.map(renderShiftItem)}
            </div>
          </div>
        )}

        {shifts.length === 0 && (
          <p className="day-detail-empty-state" data-testid="day-detail-empty-state">
            {t('calendar.noShiftsForEmployee', { date: formattedDate })}
          </p>
        )}

        {provenance && annotations.length > 0 && (
          <DayAnnotationsPanel
            employeeId={provenance.employeeId}
            date={date}
            annotations={annotations}
            canEdit={canEditAnnotations}
            onChanged={onAnnotationsChanged}
          />
        )}

        </div>
        {provenance && (
          <div className="day-detail-col day-detail-col--aside">
          <DayProvenancePanel
            employeeId={provenance.employeeId}
            date={date}
            canReconcile={provenance.canReconcile}
            onChanged={provenance.onChanged}
          />
          </div>
        )}
        {!provenance && null}
        </div>
      </div>
    </ModalShell>
  );
};

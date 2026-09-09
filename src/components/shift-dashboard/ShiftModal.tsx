import { useState, useEffect } from 'react';
import { Shift } from '../../lib/types';
import { getShiftType, normalizeShiftTypeLabel } from '../../lib/shifts';
import { getShiftTypes, shiftTypeCountsAsWork } from '../../lib/shift-types';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { Trash2, Save, CheckCircle2 } from 'lucide-react';
import { SearchableSelect } from '../ui/SearchableSelect';
import { getOperationalDate } from '../../lib/operational-date';
import { ModalShell } from '../ui/ModalShell';
import { acknowledgeRemoteShift } from '../../lib/remote';
import type { Role } from '../../lib/session';

interface ShiftModalProps {
  isOpen: boolean;
  editingShift: Shift | null;
  defaultDate?: string | null;
  onClose: () => void;
  onSave: (shift: Shift) => void;
  onDelete?: (id: string) => void;
  /** A save is in flight: form inert, close blocked, confirm button shows the
   * working state — mirrors the import-confirm contract (cursor wait,
   * "Procesando…", no interaction until the operation settles). */
  isSaving?: boolean;
  /** Manual shift entry is a historical-only operation in P5.2. */
  maxDate?: string | null;
  sessionRole?: Role | null;
  currentEmployeeId?: string | null;
  onAcknowledged?: (shiftId: string, acknowledgedAt: string | null) => void;
}

export const ShiftModal = ({
  isOpen,
  editingShift,
  defaultDate = null,
  onClose,
  onSave,
  onDelete,
  isSaving = false,
  maxDate = null,
  sessionRole = null,
  currentEmployeeId = null,
  onAcknowledged,
}: ShiftModalProps) => {
  const { locale, t } = useI18n();
  const shiftTypeOptions = getShiftTypes().map((type) => ({ value: type.label, label: translateShiftTypeLabel(type.id, locale, type.label) }));
  const [formData, setFormData] = useState<Shift>({
    id: '',
    date: maxDate ?? new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '14:00',
    location: 'Regular',
    origin: 'MAN',
  });

  const isSelfEmployee = sessionRole === 'EMPLOYEE' && Boolean(currentEmployeeId) && (
    !editingShift?.employeeId || editingShift.employeeId === currentEmployeeId
  );
  const isPublishedShift = Boolean(editingShift && editingShift.origin === 'IMP');
  const isAcknowledgementView = isSelfEmployee && isPublishedShift;

  const [ackStatus, setAckStatus] = useState<'PENDING' | 'ACKNOWLEDGED'>('PENDING');
  const [ackAction, setAckAction] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (editingShift) {
      setFormData({
        ...editingShift,
        location: getShiftType(editingShift),
      });
      setAckStatus(editingShift.acknowledgementStatus ?? 'PENDING');
      setAckAction('idle');
    } else {
      setFormData({
        id: crypto.randomUUID(),
        date: defaultDate ?? maxDate ?? getOperationalDate(),
        startTime: '08:00',
        endTime: '15:00',
        location: 'Regular',
        origin: 'MAN',
      });
      setAckStatus('PENDING');
      setAckAction('idle');
    }
  }, [defaultDate, editingShift, isOpen, maxDate]);

  if (!isOpen) return null;

  const handleAcknowledge = async () => {
    if (!editingShift || ackStatus === 'ACKNOWLEDGED' || ackAction === 'saving') {
      return;
    }
    setAckAction('saving');
    try {
      const res = await acknowledgeRemoteShift(editingShift.id);
      setAckStatus(res.status);
      setAckAction('success');
      onAcknowledged?.(editingShift.id, res.acknowledgedAt);
    } catch (err) {
      console.error('Failed to acknowledge shift', err);
      setAckAction('error');
    }
  };

  if (isAcknowledgementView && editingShift) {
    return (
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={t('employeeDetail.title')}
        closeAriaLabel={t('common.close')}
        maxWidth="520px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }} data-testid="shift-detail-view">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span className="employee-shift-detail__status-pill">
              <CheckCircle2 size={14} aria-hidden="true" />
              {t('employeeDetail.published')}
            </span>
            <span
              className={`employee-shift-detail__ack-pill${ackStatus === 'ACKNOWLEDGED' ? ' is-acknowledged' : ''}`}
              data-testid="ack-status-pill"
            >
              <CheckCircle2 size={14} aria-hidden="true" />
              {ackStatus === 'ACKNOWLEDGED'
                ? t('employeeDetail.acknowledged')
                : t('employeeDetail.acknowledgementPending')}
            </span>
          </div>

          <div style={{ background: 'var(--panel-muted-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {t('employeeDetail.date')}
              </span>
              <p style={{ margin: '4px 0 0 0', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                {editingShift.date}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {t('employeeDetail.hours')}
                </span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {editingShift.startTime && editingShift.endTime ? `${editingShift.startTime} – ${editingShift.endTime}` : '—'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {t('employeeDetail.location')}
                </span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {editingShift.location || t('employeeDetail.noLocation')}
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ackStatus === 'PENDING' ? (
              <button
                type="button"
                className="btn-gold"
                disabled={ackAction === 'saving'}
                aria-busy={ackAction === 'saving'}
                onClick={() => void handleAcknowledge()}
                data-testid="shift-acknowledge-button"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '12px 16px', cursor: ackAction === 'saving' ? 'wait' : 'pointer' }}
              >
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>
                  {ackAction === 'saving'
                    ? t('employeeDetail.acknowledging')
                    : t('employeeDetail.acknowledge')}
                </span>
              </button>
            ) : (
              <p
                className="employee-shift-detail__acknowledgement-feedback"
                role="status"
                aria-live="polite"
                data-testid="ack-success-msg"
                style={{ textAlign: 'center', fontWeight: 600, color: 'var(--success, #10b981)', margin: '8px 0' }}
              >
                {t('employeeDetail.acknowledged')}
              </p>
            )}

            {ackAction === 'error' && (
              <div className="card card--error" role="alert" style={{ padding: '8px 12px' }} data-testid="ack-error-msg">
                <p style={{ color: 'var(--danger, #ef4444)', margin: 0, fontSize: '0.85rem' }}>
                  {t('employeeDetail.acknowledgementError')}
                </p>
              </div>
            )}
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (!isSaving) onClose(); }}
      title={editingShift ? t('shiftModal.titleEdit') : t('shiftModal.titleNew')}
      closeAriaLabel={t('common.close')}
      maxWidth="520px"
      initialFocus="input[type='date']"
    >
        <fieldset disabled={isSaving} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
              {t('shiftModal.dateLabel')}
            </label>
            <input
              type="date"
              className="modal-input"
              value={formData.date}
              max={maxDate ?? undefined}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
            {maxDate && <p className="modal-field-hint" role="note">{t('shiftModal.historicalOnly')}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
                {t('shiftModal.startLabel')}
              </label>
              <input
                type="time"
                className="modal-input"
                value={formData.startTime}
                onChange={e => setFormData({...formData, startTime: e.target.value})}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
                {t('shiftModal.endLabel')}
              </label>
              <input
                type="time"
                className="modal-input"
                value={formData.endTime}
                onChange={e => setFormData({...formData, endTime: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
              {t('shiftModal.typeLabel')}
            </label>
            <SearchableSelect
              label=""
              value={formData.location}
              onChange={(typeId) => {
                const nextType = normalizeShiftTypeLabel(typeId) || 'Regular';
                const isZeroDurationType = !shiftTypeCountsAsWork(nextType);
                setFormData({
                  ...formData,
                  location: nextType,
                  startTime: isZeroDurationType ? '' : (formData.startTime || '08:00'),
                  endTime: isZeroDurationType ? '' : (formData.endTime || '15:00'),
                });
              }}
              searchPlaceholder={t('shiftModal.searchPlaceholder')}
              emptyMessage={t('shiftModal.noShiftTypes')}
              ariaLabel={t('shiftModal.typeLabel')}
              options={[
                { value: '', label: t('shiftModal.typeLabel'), searchText: '' },
                ...shiftTypeOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                  searchText: `${option.label}`.toLowerCase(),
                })),
              ]}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
            <button
              className="btn-gold"
              disabled={isSaving}
              aria-busy={isSaving}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: isSaving ? 'wait' : undefined }}
              onClick={() => { if (!isSaving) onSave(formData); }}
            >
              <Save size={18} /> <span aria-live="polite">{isSaving ? t('shiftModal.working') : t('shiftModal.confirm')}</span>
            </button>
            {editingShift && onDelete && (
              <button
                onClick={() => onDelete(formData.id)}
                aria-label={t('common.delete')}
                style={{
                  padding: 'var(--space-sm) var(--space-md)',
                  color: 'var(--danger)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: '12px',
                  background: 'var(--danger-bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>
        </fieldset>
    </ModalShell>
  );
};

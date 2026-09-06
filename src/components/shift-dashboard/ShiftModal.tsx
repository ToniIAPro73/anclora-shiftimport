import { useState, useEffect } from 'react';
import { Shift } from '../../lib/types';
import { getShiftType, normalizeShiftTypeLabel } from '../../lib/shifts';
import { getShiftTypes, shiftTypeCountsAsWork } from '../../lib/shift-types';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { Trash2, Save } from 'lucide-react';
import { SearchableSelect } from '../ui/SearchableSelect';
import { getOperationalDate } from '../../lib/operational-date';
import { ModalShell } from '../ui/ModalShell';

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
}

export const ShiftModal = ({ isOpen, editingShift, defaultDate = null, onClose, onSave, onDelete, isSaving = false, maxDate = null }: ShiftModalProps) => {
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

  useEffect(() => {
    if (editingShift) {
      setFormData({
        ...editingShift,
        location: getShiftType(editingShift),
      });
    } else {
      setFormData({
        id: crypto.randomUUID(),
        date: defaultDate ?? maxDate ?? getOperationalDate(),
        startTime: '08:00',
        endTime: '15:00',
        location: 'Regular',
        origin: 'MAN',
      });
    }
  }, [defaultDate, editingShift, isOpen, maxDate]);

  if (!isOpen) return null;

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

import { useState, useEffect } from 'react';
import { Shift } from '../../lib/types';
import { getShiftType, normalizeShiftTypeLabel } from '../../lib/shifts';
import { getShiftTypes, shiftTypeCountsAsWork } from '../../lib/shift-types';
import { X, Trash2, Save, Calendar } from 'lucide-react';

interface ShiftModalProps {
  isOpen: boolean;
  editingShift: Shift | null;
  defaultDate?: string | null;
  onClose: () => void;
  onSave: (shift: Shift) => void;
  onDelete?: (id: string) => void;
}

export const ShiftModal = ({ isOpen, editingShift, defaultDate = null, onClose, onSave, onDelete }: ShiftModalProps) => {
  const shiftTypeOptions = getShiftTypes().map((type) => type.label);
  const [formData, setFormData] = useState<Shift>({
    id: '',
    date: new Date().toISOString().split('T')[0],
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
        date: defaultDate ?? new Date().toISOString().split('T')[0],
        startTime: '08:00',
        endTime: '15:00',
        location: 'Regular',
        origin: 'MAN',
      });
    }
  }, [defaultDate, editingShift, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
          <Calendar className="text-gold" size={24} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
            {editingShift ? 'Actualizar Turno' : 'Programar Turno'}
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
              Fecha de Servicio
            </label>
            <input 
              type="date" 
              className="modal-input"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: 'var(--space-xs)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
                Hora Inicio
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
                Hora Fin
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
              Tipo
            </label>
            <select
              className="modal-input"
              value={formData.location}
              onChange={e => {
                const nextType = normalizeShiftTypeLabel(e.target.value) || 'Regular';
                const isZeroDurationType = !shiftTypeCountsAsWork(nextType);
                setFormData({
                  ...formData,
                  location: nextType,
                  startTime: isZeroDurationType ? '' : (formData.startTime || '08:00'),
                  endTime: isZeroDurationType ? '' : (formData.endTime || '15:00'),
                });
              }}
            >
              {shiftTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
            <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => onSave(formData)}>
              <Save size={18} /> Confirmar
            </button>
            {editingShift && onDelete && (
              <button 
                onClick={() => onDelete(formData.id)}
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
      </div>
    </div>
  );
};

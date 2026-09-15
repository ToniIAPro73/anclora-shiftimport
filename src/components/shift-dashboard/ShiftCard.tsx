import { Shift } from '../../lib/types';
import { enrichShift, getShiftType, hasShiftTimes, isZeroDurationShift } from '../../lib/shifts';
import { MapPin, ArrowRight } from 'lucide-react';
import { getShiftVisualTokenKey } from '../../lib/shift-visuals';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';

interface ShiftCardProps {
  shift: Shift;
  onClick: (id: string) => void;
}

export const ShiftCard = ({ shift, onClick }: ShiftCardProps) => {
  const { locale } = useI18n();
  const shiftType = getShiftType(shift);
  const shiftTypeLabel = translateShiftTypeLabel(shiftType, locale, shiftType);
  const shiftIsFree = isZeroDurationShift(shift);
  if (shiftIsFree) {
    return (
      <div
        className="shift-card"
        data-shift-type={shiftType}
        data-shift-visual={getShiftVisualTokenKey(shiftType)}
        onClick={() => onClick(shift.id)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            opacity: 1,
          }}>
            {shiftTypeLabel}
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-accent)' }}>
            0.0h
          </span>
        </div>

        <div style={{
          fontWeight: '700',
          fontSize: '1.1rem',
          marginBottom: '6px',
        }}>
          {shiftTypeLabel}
        </div>

        {shift.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            <MapPin size={12} /> {shift.location}
          </div>
        )}
      </div>
    );
  }

  const enriched = enrichShift(shift);
  
  const getCategoryClass = (cat: string) => {
    switch (cat) {
      case 'Mañana': return 'morning';
      case 'Tarde': return 'afternoon';
      case 'Noche': return 'night';
      default: return '';
    }
  };

  const categoryClass = getCategoryClass(enriched.category);

  return (
    <div 
      className={`shift-card ${categoryClass}`}
      data-shift-type={shiftType}
      data-shift-visual={getShiftVisualTokenKey(shiftType)}
      onClick={() => onClick(shift.id)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
        <span style={{ 
          fontSize: '0.7rem', 
          fontWeight: '800', 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em',
          opacity: 1
        }}>
          {shiftType}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-accent)' }}>
          {enriched.duration.toFixed(1)}h
        </span>
      </div>
      
      <div style={{ 
        fontWeight: '700', 
        fontSize: '1.1rem', 
        marginBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        {hasShiftTimes(shift) ? (
          <>
            {shift.startTime} <ArrowRight size={14} style={{ opacity: 0.5 }} /> {shift.endTime}
          </>
        ) : (
          shiftType
        )}
      </div>

      {shift.location && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          <MapPin size={12} /> {shift.location}
        </div>
      )}
    </div>
  );
};

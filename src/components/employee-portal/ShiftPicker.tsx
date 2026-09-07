import { Calendar, Check, ChevronDown, Clock, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Shift } from '../../lib/types';
import { useI18n } from '../../lib/use-i18n';
import { formatShiftOption } from '../../lib/format-request';

interface ShiftPickerProps {
  shifts: Shift[];
  selectedShiftId: string;
  onSelectShift: (shiftId: string) => void;
  id?: string;
  disabled?: boolean;
}

export function ShiftPicker({
  shifts,
  selectedShiftId,
  onSelectShift,
  id = 'employee-new-request-shift',
  disabled = false,
}: ShiftPickerProps) {
  const { locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const formattedOptions = shifts.map((shift) => ({
    shift,
    formatted: formatShiftOption(shift, locale),
  }));

  const selectedFormatted = formattedOptions.find((opt) => opt.shift.id === selectedShiftId)?.formatted
    ?? (formattedOptions[0]?.formatted ?? null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="shift-picker-container" ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Hidden native select for standard form access, label association and tests */}
      <select
        id={id}
        value={selectedShiftId}
        onChange={(e) => onSelectShift(e.target.value)}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        {shifts.map((shift) => (
          <option key={shift.id} value={shift.id}>
            {formatShiftOption(shift, locale).fullLabel}
          </option>
        ))}
      </select>

      {/* Premium Trigger Button */}
      <button
        type="button"
        className="shift-picker-trigger"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-testid="shift-picker-trigger"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          width: '100%',
          minHeight: '44px',
          padding: '8px 14px',
          background: 'var(--panel-muted-bg)',
          border: `1px solid ${isOpen ? 'var(--color-accent)' : 'var(--glass-border)'}`,
          borderRadius: '12px',
          color: 'var(--text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: isOpen ? '0 0 0 2px rgba(var(--color-accent-rgb, 14, 165, 233), 0.2)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <Calendar size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          {selectedFormatted ? (
            <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                {selectedFormatted.weekday ? `${selectedFormatted.weekday}, ` : ''}{selectedFormatted.dateStr}
              </span>
              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: selectedFormatted.isOff ? 'rgba(148, 163, 184, 0.15)' : 'rgba(var(--color-accent-rgb, 14, 165, 233), 0.15)',
                  color: selectedFormatted.isOff ? 'var(--text-muted)' : 'var(--color-accent)',
                  letterSpacing: '0.02em',
                }}
              >
                {selectedFormatted.timeOrType}
              </span>
              {selectedFormatted.location && (
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <MapPin size={12} />
                  {selectedFormatted.location}
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              Seleccionar turno…
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--text-muted)',
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {/* Dropdown Options List */}
      {isOpen && (
        <div
          role="listbox"
          className="shift-picker-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 999,
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--glass-bg, #1a1e27)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.36)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {formattedOptions.map(({ shift, formatted }) => {
            const isSelected = shift.id === selectedShiftId;
            return (
              <div
                key={shift.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                className={`shift-picker-option ${isSelected ? 'shift-picker-option--selected' : ''}`}
                onClick={() => {
                  onSelectShift(shift.id);
                  setIsOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectShift(shift.id);
                    setIsOpen(false);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(var(--color-accent-rgb, 14, 165, 233), 0.12)' : 'transparent',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ fontWeight: isSelected ? 700 : 500, fontSize: '0.85rem', color: isSelected ? 'var(--text-primary)' : 'inherit' }}>
                    {formatted.weekday ? `${formatted.weekday}, ` : ''}{formatted.dateStr}
                  </span>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: formatted.isOff ? 'rgba(148, 163, 184, 0.12)' : 'rgba(var(--color-accent-rgb, 14, 165, 233), 0.12)',
                      color: formatted.isOff ? 'var(--text-subtle)' : 'var(--color-accent)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    {!formatted.isOff && <Clock size={11} />}
                    {formatted.timeOrType}
                  </span>
                  {formatted.location && (
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      <MapPin size={11} />
                      {formatted.location}
                    </span>
                  )}
                </div>
                {isSelected && (
                  <Check size={16} style={{ color: 'var(--color-accent)', flexShrink: 0, marginLeft: '8px' }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { CalendarImportContext, ParsedCalendarShift } from '../../lib/import-types';
import { detectPdfCalendarContext, parseEmployeeShiftsFromPdf } from '../../ingestion/parsers/pdf';
import { loadUserProfile, saveUserProfile } from '../../lib/profile';
import { Shift } from '../../lib/types';
import { normalizeShiftTypeLabel } from '../../lib/shifts';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (shifts: Shift[], targetPeriod: CalendarImportContext) => Promise<boolean>;
  initialContext: CalendarImportContext;
}

interface ModalSelectOption {
  value: string;
  label: string;
}

const MONTH_OPTIONS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function isFreeShift(shift: Pick<ParsedCalendarShift, 'shiftType'>): boolean {
  return (shift.shiftType ?? '').trim().toLowerCase() === 'libre';
}

function hasImportableShiftData(shift: ParsedCalendarShift): boolean {
  return Boolean((shift.shiftType ?? '').trim()) || shift.startTime !== '??:??' || shift.endTime !== '??:??';
}

function ModalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ModalSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', position: 'relative', minWidth: 0 }}>
      <span>{label}</span>
      <button
        type="button"
        className="modal-select-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '10px 12px',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          background: 'var(--glass-bg)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
        }}
      >
        <span>{selectedOption?.label ?? ''}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div
          className="modal-select-menu"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 30,
            maxHeight: '240px',
            overflowY: 'auto',
            padding: '6px',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            background: 'var(--panel-muted-bg)',
            boxShadow: '0 18px 38px rgba(3, 8, 24, 0.42)',
            boxSizing: 'border-box',
          }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={isSelected ? 'modal-select-option is-selected' : 'modal-select-option'}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={isSelected}
                style={{
                  width: '100%',
                  display: 'block',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: isSelected ? 'rgba(96, 165, 250, 0.28)' : 'transparent',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const ImportModal = ({ isOpen, onClose, onConfirmImport, initialContext }: ImportModalProps) => {
  const now = new Date();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedShifts, setParsedShifts] = useState<ParsedCalendarShift[]>([]);
  const [scanTime, setScanTime] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState(() => loadUserProfile().displayName);
  const [employeeId, setEmployeeId] = useState(() => loadUserProfile().employeeIdentifiers[0] ?? '');
  const [selectedMonth, setSelectedMonth] = useState(String(initialContext.month));
  const [selectedYear, setSelectedYear] = useState(String(initialContext.year));
  const [canStartFreshImport, setCanStartFreshImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableYears = Array.from({ length: 7 }, (_, index) => String(now.getFullYear() - 2 + index));
  const monthSelectOptions = useMemo(
    () => MONTH_OPTIONS.map((label, index) => ({ value: String(index), label })),
    [],
  );
  const yearSelectOptions = useMemo(
    () => availableYears.map((yearOption) => ({ value: yearOption, label: yearOption })),
    [availableYears],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCanStartFreshImport(parsedShifts.length > 0);
    setSelectedMonth(String(initialContext.month));
    setSelectedYear(String(initialContext.year));
  }, [initialContext.month, initialContext.year, isOpen, parsedShifts.length]);

  const resetImportState = () => {
    setFile(null);
    setParsedShifts([]);
    setError(null);
    setScanTime(null);
    setCanStartFreshImport(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      return;
    }

    setFile(selected);
    setParsedShifts([]);
    setError(null);
    setScanTime(null);
  };

  const handleStartImport = async () => {
    if (!file) {
      return;
    }

    setLoading(true);
    setError(null);
    setScanTime(null);

    const startedAt = Date.now();
    try {
      const importContext = await detectPdfCalendarContext(file);
      setSelectedMonth(String(importContext.month));
      setSelectedYear(String(importContext.year));

      const storedIdentifiers = loadUserProfile().employeeIdentifiers;
      const employeeIdentifiers = [...new Set([employeeId.trim(), ...storedIdentifiers].filter(Boolean))];
      const shifts = await parseEmployeeShiftsFromPdf(file, importContext, {
        employeeName,
        employeeIdentifiers,
      });

      setParsedShifts(shifts);
      setScanTime(((Date.now() - startedAt) / 1000).toFixed(1));

      if (shifts.length === 0) {
        setError('No se detectaron turnos para el empleado indicado dentro del PDF.');
      }
    } catch (importError: unknown) {
      console.error('[ImportModal][PDF] Error:', importError);
      const message = importError instanceof Error ? importError.message : 'Error desconocido';
      setError(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateShift = (index: number, field: keyof ParsedCalendarShift, value: string) => {
    const nextShifts = [...parsedShifts];
    nextShifts[index] = { ...nextShifts[index], [field]: value };
    setParsedShifts(nextShifts);
  };

  const handleRemoveShift = (index: number) => {
    setParsedShifts(parsedShifts.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleConfirm = async () => {
    const importContext: CalendarImportContext = {
      month: Number.parseInt(selectedMonth, 10),
      year: Number.parseInt(selectedYear, 10),
    };

    const profile = loadUserProfile();
    saveUserProfile({
      ...profile,
      displayName: employeeName.trim() || profile.displayName,
      employeeIdentifiers: employeeId.trim() ? [employeeId.trim()] : profile.employeeIdentifiers,
    });

    const finalShifts: Shift[] = parsedShifts
      .filter(hasImportableShiftData)
      .map((shift) => {
        const normalizedType = normalizeShiftTypeLabel(shift.shiftType ?? '');

        return {
          id: crypto.randomUUID(),
          date: shift.date,
          startTime: shift.startTime === '??:??' ? '' : shift.startTime,
          endTime: shift.endTime === '??:??' ? '' : shift.endTime,
          location: normalizedType === 'Vacaciones' ? 'Regular' : (normalizedType || 'Regular'),
          origin: 'PDF',
        };
      });

    onConfirmImport(finalShifts, importContext);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  const readyShifts = parsedShifts.filter(hasImportableShiftData);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1380px', width: '96vw', height: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>Importador PDF</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              className="btn-outline modal-reset-button"
              onClick={resetImportState}
              disabled={!canStartFreshImport}
              style={{ padding: '8px 12px', fontWeight: 700 }}
            >
              Nueva Importación
            </button>
            <button onClick={onClose} style={{ color: 'var(--text-subtle)' }}>
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="import-modal-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.1fr)', gap: '18px', flex: 1, overflow: 'hidden' }}>
          <div className="import-modal-left" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Nombre</span>
                <input className="modal-input" type="text" value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Nombre del empleado" style={{ padding: '10px 12px' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>ID</span>
                <input className="modal-input" type="text" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder="ID de empleado" style={{ padding: '10px 12px' }} />
              </label>

              <ModalSelect label="Mes del calendario" value={selectedMonth} options={monthSelectOptions} onChange={setSelectedMonth} />

              <ModalSelect label="Año del calendario" value={selectedYear} options={yearSelectOptions} onChange={setSelectedYear} />
            </div>

            <button
              className="import-upload-zone"
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--glass-border)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                gap: '8px',
                padding: '14px 14px',
                minHeight: '108px',
                background: 'transparent',
                minWidth: 0,
                overflow: 'hidden',
                width: '100%',
                boxSizing: 'border-box',
                alignSelf: 'stretch',
              }}
            >
              <div style={{ background: 'var(--glass-bg)', padding: '12px', borderRadius: '50%' }}>
                <Upload size={28} color="var(--color-accent)" />
              </div>
              <div style={{ textAlign: 'center', minWidth: 0 }}>
                <p style={{ fontWeight: '700', margin: 0 }}>Subir documento PDF</p>
                <p style={{ fontSize: '0.78rem', opacity: 0.6, margin: '4px 0 0', overflowWrap: 'anywhere' }}>
                  Selecciona el PDF para extraer los turnos del empleado indicado
                </p>
              </div>
            </button>

            {file && (
              <div
                className="import-file-summary"
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--panel-muted-bg)',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: 0,
                  overflow: 'hidden',
                  width: '100%',
                  boxSizing: 'border-box',
                  alignSelf: 'stretch',
                }}
              >
                <FileText size={22} color="var(--color-accent)" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.64 }}>
                    Se extraerá la fila del empleado
                  </div>
                </div>
                <button
                  onClick={resetImportState}
                  style={{ background: 'var(--danger-bg-strong)', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0 }}
                >
                  <Trash2 size={16} color="white" />
                </button>
              </div>
            )}

            {error && (
              <div
                style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '0.8rem',
                  color: 'var(--danger)',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <input ref={fileInputRef} type="file" hidden accept=".pdf,application/pdf" onChange={handleFileChange} />

            <div style={{ minWidth: 0, width: '100%', flexShrink: 0 }}>
              <button
                className="btn-gold import-process-button"
                disabled={!file || loading}
                onClick={handleStartImport}
                style={{
                  padding: '14px 16px',
                  opacity: !file || loading ? 0.5 : 1,
                  width: '100%',
                  minHeight: '52px',
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  boxSizing: 'border-box',
                }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    Procesando PDF...
                  </span>
                ) : 'Procesar PDF'}
              </button>
            </div>
          </div>

          <div className="import-modal-right" style={{ display: 'flex', flexDirection: 'column', background: 'var(--panel-muted-bg)', borderRadius: '16px', padding: '16px', overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--color-accent)' }}>Turnos Detectados</h3>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                {parsedShifts.length} encontrados{scanTime ? ` (${scanTime}s)` : ''}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '12px', minHeight: 0 }}>
              {parsedShifts.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--table-head-bg)', zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>Fecha</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>Origen</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>Tipo</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>Inicio</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>Fin</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {parsedShifts.map((shift, index) => {
                      const isLibre = isFreeShift(shift);
                      const incomplete = !isLibre && (shift.startTime === '??:??' || shift.endTime === '??:??');
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border-soft)', background: incomplete ? 'var(--danger-row-bg)' : 'transparent' }}>
                          <td style={{ padding: '8px' }}>
                            <input type="text" className="modal-input" value={shift.date} onChange={(event) => handleUpdateShift(index, 'date', event.target.value)} style={{ padding: '6px', fontSize: '0.8rem' }} />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input type="text" className="modal-input" value="PDF" readOnly style={{ padding: '6px', fontSize: '0.8rem', opacity: 0.85 }} />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input type="text" className="modal-input" value={shift.shiftType ?? ''} onChange={(event) => handleUpdateShift(index, 'shiftType', event.target.value)} style={{ padding: '6px', fontSize: '0.8rem' }} />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              className="modal-input"
                              value={isLibre && shift.startTime === '??:??' ? '' : shift.startTime}
                              onChange={(event) => handleUpdateShift(index, 'startTime', event.target.value)}
                              style={{ padding: '6px', fontSize: '0.8rem', color: !isLibre && shift.startTime === '??:??' ? 'var(--danger)' : 'inherit' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              className="modal-input"
                              value={isLibre && shift.endTime === '??:??' ? '' : shift.endTime}
                              onChange={(event) => handleUpdateShift(index, 'endTime', event.target.value)}
                              style={{ padding: '6px', fontSize: '0.8rem', color: !isLibre && shift.endTime === '??:??' ? 'var(--danger)' : 'inherit' }}
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button onClick={() => handleRemoveShift(index)} style={{ color: 'var(--danger)', padding: '6px' }}>
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
                  <FileText size={40} />
                  <p style={{ marginTop: '12px' }}>Pulsa "Procesar PDF" para detectar turnos</p>
                </div>
              )}
            </div>

            <div style={{ marginTop: '16px' }}>
              <button className="btn-gold import-process-button" style={{ width: '100%', height: '48px', fontSize: '1rem' }} disabled={readyShifts.length === 0 || loading} onClick={handleConfirm}>
                Confirmar Importación ({readyShifts.length}/{parsedShifts.length} listos)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};








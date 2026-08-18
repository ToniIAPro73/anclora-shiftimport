import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { CalendarImportContext, ParsedCalendarShift } from '../../lib/import-types';
import { analyzeDocumentFile, classifyDocument, DocumentAnalysisResult, extractDocumentItems } from '../../ingestion/parsers/file';
import {
  getImportFormatLabel,
  importAcceptAttribute,
  importFormatsDisplayLine,
} from '../../ingestion/formats';
import { analyzeItemsForImport, ItemAnalysis } from '../../ingestion/analysis';
import { EmployeeSelector } from '../../ingestion/core/row-detection';
import { PdfTextItem } from '../../ingestion/core/text-items';
import { loadUserProfile, saveUserProfile } from '../../lib/profile';
import { touchFormatProfile } from '../../lib/format-profiles';
import { ImportQualityState, ImportResult, ImportWarningCode } from '../../lib/import-quality';
import { trackTtfvEvent } from '../../lib/ttfv';
import { Shift } from '../../lib/types';
import { normalizeShiftTypeLabel } from '../../lib/shifts';
import { IngestionError, IngestionErrorCode } from '../../lib/ingestion-errors';
import { useI18n } from '../../lib/use-i18n';
import { useEscapeClose } from '../../lib/use-escape-close';
import { classifyImportChanges } from '../../lib/import-dedup';
import { AssistantCompletion, ProfileAssistantPanel } from './ProfileAssistantPanel';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (shifts: Shift[], targetPeriod: CalendarImportContext) => Promise<boolean>;
  initialContext: CalendarImportContext;
  /** Current calendar shifts, used to preview the new/unchanged/changed/removed diff before confirming. */
  existingShifts?: Shift[];
  /** File pre-selected by the onboarding wizard; analysis starts automatically on open. */
  initialFile?: File | null;
}

/** ImportWarning.code (SCREAMING) → quality.warnings.* i18n key (camelCase). */
const WARNING_I18N_KEYS: Record<ImportWarningCode, string> = {
  UNKNOWN_SHIFT_TOKEN: 'quality.warnings.unknownShiftToken',
  EMPLOYEE_MATCH_WEAK: 'quality.warnings.employeeMatchWeak',
  MULTIPLE_EMPLOYEE_MATCHES: 'quality.warnings.multipleEmployeeMatches',
  DATE_MAPPING_UNCERTAIN: 'quality.warnings.dateMappingUncertain',
  PROFILE_DRIFT: 'quality.warnings.profileDrift',
  PARTIAL_EXTRACTION: 'quality.warnings.partialExtraction',
  UNKNOWN_CELL: 'quality.warnings.unknownCell',
  UNSUPPORTED_SECTION: 'quality.warnings.unsupportedSection',
};

const STATE_I18N_KEYS: Record<ImportQualityState, string> = {
  CORRECT: 'quality.stateCorrect',
  REVIEW: 'quality.stateReview',
  UNRECOGNIZED: 'quality.stateUnrecognized',
};

const STATE_CHIP_STYLES: Record<ImportQualityState, React.CSSProperties> = {
  CORRECT: { background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--color-accent)' },
  REVIEW: { background: 'var(--gold-tint-bg)', border: '1px solid var(--color-gold)', color: 'var(--color-gold)' },
  UNRECOGNIZED: { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)' },
};

const MAX_VISIBLE_WARNINGS = 4;

interface ModalSelectOption {
  value: string;
  label: string;
}

function isFreeShift(shift: Pick<ParsedCalendarShift, 'shiftType'>): boolean {
  return (shift.shiftType ?? '').trim().toLowerCase() === 'libre';
}

function hasImportableShiftData(shift: ParsedCalendarShift): boolean {
  return Boolean((shift.shiftType ?? '').trim()) || shift.startTime !== '??:??' || shift.endTime !== '??:??';
}

/** Maps a reviewed parsed row to the domain Shift the app persists. */
function toDomainShift(shift: ParsedCalendarShift): Shift {
  const normalizedType = normalizeShiftTypeLabel(shift.shiftType ?? '');
  return {
    id: crypto.randomUUID(),
    date: shift.date,
    startTime: shift.startTime === '??:??' ? '' : shift.startTime,
    endTime: shift.endTime === '??:??' ? '' : shift.endTime,
    location: normalizedType === 'Vacaciones' ? 'Regular' : (normalizedType || 'Regular'),
    origin: 'IMP',
    sourceFormat: shift.sourceFormat ?? undefined,
  };
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

export const ImportModal = ({ isOpen, onClose, onConfirmImport, initialContext, existingShifts = [], initialFile = null }: ImportModalProps) => {
  const { t, tl } = useI18n();
  const monthOptions = tl('calendar.months');
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
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  // Phase 1A: analysis-driven quality state + inline assistant session.
  const [analysis, setAnalysis] = useState<DocumentAnalysisResult | null>(null);
  const [qualityOverride, setQualityOverride] = useState<ImportResult | null>(null);
  const [assistantSession, setAssistantSession] = useState<{ items: PdfTextItem[]; itemAnalysis: ItemAnalysis } | null>(null);
  const [assistantDismissed, setAssistantDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialFileHandledRef = useRef<File | null>(null);
  const previewTrackedRef = useRef(false);

  const availableYears = Array.from({ length: 7 }, (_, index) => String(now.getFullYear() - 2 + index));
  const monthSelectOptions = useMemo(
    () => monthOptions.map((label, index) => ({ value: String(index), label })),
    [monthOptions],
  );
  const yearSelectOptions = useMemo(
    () => availableYears.map((yearOption) => ({ value: yearOption, label: yearOption })),
    [availableYears],
  );

  const importDiff = useMemo(() => {
    const readyForDiff = parsedShifts.filter(hasImportableShiftData).map(toDomainShift);
    return classifyImportChanges(existingShifts, readyForDiff);
  }, [parsedShifts, existingShifts]);

  useEscapeClose(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setCanStartFreshImport(parsedShifts.length > 0);
  }, [isOpen, parsedShifts.length]);

  // Sync the period selects from the visible calendar month only on open /
  // navigation — NOT after an analysis completes, so the detected document
  // period (set in runAnalysis) survives.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedMonth(String(initialContext.month));
    setSelectedYear(String(initialContext.year));
  }, [initialContext.month, initialContext.year, isOpen]);

  const buildSelector = useCallback((): EmployeeSelector => {
    const storedIdentifiers = loadUserProfile().employeeIdentifiers;
    return {
      employeeName,
      employeeIdentifiers: [...new Set([employeeId.trim(), ...storedIdentifiers].filter(Boolean))],
    };
  }, [employeeName, employeeId]);

  const runAnalysis = useCallback(async (target: File) => {
    setLoading(true);
    setError(null);
    setScanTime(null);
    setAnalysis(null);
    setQualityOverride(null);
    setAssistantSession(null);
    setAssistantDismissed(false);
    setDetectedFormat(getImportFormatLabel(classifyDocument(target)));

    const startedAt = Date.now();
    try {
      const result = await analyzeDocumentFile(target, buildSelector());
      setAnalysis(result);
      setDetectedFormat(getImportFormatLabel(result.kind));
      setSelectedMonth(String(result.context.month));
      setSelectedYear(String(result.context.year));
      setParsedShifts(result.shifts);
      setScanTime(((Date.now() - startedAt) / 1000).toFixed(1));
    } catch (importError: unknown) {
      console.error('[ImportModal] Error:', importError);
      const message = importError instanceof IngestionError
        ? t(`errors.${importError.code as IngestionErrorCode}`)
        : importError instanceof Error ? importError.message : t('importModal.unknownError');
      setError(t('importModal.errorPrefix', { message }));
    } finally {
      setLoading(false);
    }
  }, [buildSelector, t]);

  // Onboarding handoff: a pre-selected file auto-starts the pipeline once.
  useEffect(() => {
    if (!isOpen) {
      initialFileHandledRef.current = null;
      return;
    }
    if (!initialFile || initialFileHandledRef.current === initialFile) {
      return;
    }
    initialFileHandledRef.current = initialFile;
    setFile(initialFile);
    setParsedShifts([]);
    setError(null);
    setScanTime(null);
    void runAnalysis(initialFile);
  }, [isOpen, initialFile, runAnalysis]);

  // The assistant needs the positioned items + item-level analysis, which
  // DocumentAnalysisResult intentionally does not carry; derive them lazily
  // only when there are questions worth asking. Tabular (CSV) results carry
  // a parsed table instead of a positional structure — the panel works off
  // it directly.
  useEffect(() => {
    if (!isOpen || !analysis || !file || assistantDismissed) {
      return;
    }
    if (analysis.questions.length === 0 || (analysis.structure === null && !analysis.table)) {
      return;
    }
    let cancelled = false;
    void extractDocumentItems(file).then((items) => {
      if (cancelled) {
        return;
      }
      setAssistantSession({
        items,
        itemAnalysis: analyzeItemsForImport(items, analysis.context, buildSelector()),
      });
    }).catch((extractError: unknown) => {
      console.error('[ImportModal] Assistant item extraction failed:', extractError);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, analysis, file, assistantDismissed, buildSelector]);

  // TTFV funnel: first preview with shifts of this import session.
  useEffect(() => {
    if (!previewTrackedRef.current && parsedShifts.length > 0) {
      previewTrackedRef.current = true;
      trackTtfvEvent('preview_ready');
    }
  }, [parsedShifts.length]);

  const resetImportState = () => {
    setFile(null);
    setParsedShifts([]);
    setError(null);
    setScanTime(null);
    setDetectedFormat(null);
    setAnalysis(null);
    setQualityOverride(null);
    setAssistantSession(null);
    setAssistantDismissed(false);
    setCanStartFreshImport(false);
    previewTrackedRef.current = false;
    initialFileHandledRef.current = null;
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
    setAnalysis(null);
    setQualityOverride(null);
    setAssistantSession(null);
    setAssistantDismissed(false);
    previewTrackedRef.current = false;
  };

  const handleStartImport = async () => {
    if (!file) {
      return;
    }
    previewTrackedRef.current = false;
    await runAnalysis(file);
  };

  const handleUpdateShift = (index: number, field: keyof ParsedCalendarShift, value: string) => {
    const nextShifts = [...parsedShifts];
    nextShifts[index] = { ...nextShifts[index], [field]: value };
    setParsedShifts(nextShifts);
  };

  const handleRemoveShift = (index: number) => {
    setParsedShifts(parsedShifts.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleAssistantComplete = (result: AssistantCompletion) => {
    const kind = analysis?.kind;
    setParsedShifts(result.shifts.map((shift) => ({ ...shift, sourceFormat: shift.sourceFormat ?? kind })));
    setQualityOverride(result.quality);
    setAssistantDismissed(true);
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

    // A successful import through a recognized format counts as a profile use.
    const matchedProfileId = quality?.profileId ?? analysis?.structure?.matchedProfile?.profile.id;
    if (matchedProfileId) {
      touchFormatProfile(matchedProfileId);
    }

    const finalShifts: Shift[] = parsedShifts.filter(hasImportableShiftData).map(toDomainShift);

    onConfirmImport(finalShifts, importContext);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  const readyShifts = parsedShifts.filter(hasImportableShiftData);
  const quality = qualityOverride ?? analysis?.quality ?? null;

  // REVIEW row highlighting: rows already flagged incomplete (??:?? / invalid)
  // plus rows linked to a warning — a warning context date, or a row whose
  // rawText carries a token flagged UNKNOWN_SHIFT_TOKEN.
  const warningDates = new Set(
    (quality?.warnings ?? [])
      .map((warning) => warning.context?.date)
      .filter((value): value is string => typeof value === 'string'),
  );
  const unknownTokens = (quality?.warnings ?? [])
    .filter((warning) => warning.code === 'UNKNOWN_SHIFT_TOKEN')
    .map((warning) => String(warning.context?.token ?? ''))
    .filter(Boolean);
  const isWarningLinkedRow = (shift: ParsedCalendarShift): boolean =>
    warningDates.has(shift.date)
    || unknownTokens.some((token) => shift.rawText.includes(token));

  const showAssistant = !assistantDismissed
    && assistantSession !== null
    && analysis !== null
    && analysis.questions.length > 0
    && (quality?.state === 'UNRECOGNIZED'
      || assistantSession.itemAnalysis.employeeMatch === 'none'
      || assistantSession.itemAnalysis.employeeMatch === 'multiple');

  const visibleWarnings = quality?.warnings.slice(0, MAX_VISIBLE_WARNINGS) ?? [];
  const hiddenWarningCount = Math.max(0, (quality?.warnings.length ?? 0) - MAX_VISIBLE_WARNINGS);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1380px', width: '96vw', height: '88vh', display: 'flex', flexDirection: 'column' }}>
        <button
          onClick={onClose}
          aria-label={t('importModal.closeAria')}
          style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '12px', paddingRight: '36px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>{t('importModal.title')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              className="btn-outline modal-reset-button"
              onClick={resetImportState}
              disabled={!canStartFreshImport}
              style={{ padding: '8px 12px', fontWeight: 700 }}
            >
              {t('importModal.newImport')}
            </button>
          </div>
        </div>

        <div className="import-modal-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.1fr)', gap: '18px', flex: 1, overflow: 'hidden' }}>
          <div className="import-modal-left" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>{t('importModal.nameLabel')}</span>
                <input className="modal-input" type="text" value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder={t('importModal.namePlaceholder')} style={{ padding: '10px 12px' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>{t('importModal.idLabel')}</span>
                <input className="modal-input" type="text" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder={t('importModal.idPlaceholder')} style={{ padding: '10px 12px' }} />
              </label>

              <ModalSelect label={t('importModal.monthLabel')} value={selectedMonth} options={monthSelectOptions} onChange={setSelectedMonth} />

              <ModalSelect label={t('importModal.yearLabel')} value={selectedYear} options={yearSelectOptions} onChange={setSelectedYear} />
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
                <p style={{ fontWeight: '700', margin: 0 }}>{t('importModal.uploadTitle')}</p>
                <p style={{ fontSize: '0.78rem', opacity: 0.6, margin: '4px 0 0', overflowWrap: 'anywhere' }}>
                  {importFormatsDisplayLine()}
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
                    {t('importModal.fileSummary')}{detectedFormat ? t('importModal.formatSuffix', { format: detectedFormat }) : ''}
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

            <input ref={fileInputRef} type="file" hidden accept={importAcceptAttribute()} onChange={handleFileChange} />

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
                    {detectedFormat ? t('importModal.processingFormat', { format: detectedFormat }) : t('importModal.processing')}
                  </span>
                ) : t('importModal.process')}
              </button>
            </div>
          </div>

          <div className="import-modal-right" style={{ display: 'flex', flexDirection: 'column', background: 'var(--panel-muted-bg)', borderRadius: '16px', padding: '16px', overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--color-accent)' }}>{t('importModal.detected')}</h3>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                {scanTime ? t('importModal.foundWithTime', { count: parsedShifts.length, seconds: scanTime }) : t('importModal.found', { count: parsedShifts.length })}
              </span>
            </div>

            {quality && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span
                  data-testid="import-quality-state"
                  style={{
                    ...STATE_CHIP_STYLES[quality.state],
                    borderRadius: '999px',
                    padding: '4px 12px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  {t(STATE_I18N_KEYS[quality.state])}
                </span>
                {analysis?.structure?.matchedProfile && (
                  <span
                    style={{
                      background: 'var(--info-bg)',
                      border: '1px solid var(--info-border)',
                      color: 'var(--text-muted)',
                      borderRadius: '999px',
                      padding: '4px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                    }}
                  >
                    {t('quality.profileRecognized', { label: analysis.structure.matchedProfile.profile.label })}
                  </span>
                )}
              </div>
            )}

            {visibleWarnings.length > 0 && (
              <ul style={{ margin: '0 0 10px', padding: '0 0 0 18px', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {visibleWarnings.map((warning, warningIndex) => (
                  <li key={`${warning.code}-${warningIndex}`}>
                    {t(WARNING_I18N_KEYS[warning.code], warning.context)}
                  </li>
                ))}
                {hiddenWarningCount > 0 && (
                  <li>{t('quality.moreWarnings', { count: hiddenWarningCount })}</li>
                )}
              </ul>
            )}

            {showAssistant && assistantSession && analysis && (
              <div style={{ overflowY: 'auto', minHeight: 0 }}>
                <ProfileAssistantPanel
                  questions={analysis.questions}
                  items={assistantSession.items}
                  context={analysis.context}
                  analysis={analysis.structure !== null ? assistantSession.itemAnalysis : null}
                  table={analysis.table ?? null}
                  selector={buildSelector()}
                  onComplete={handleAssistantComplete}
                  onCancel={() => setAssistantDismissed(true)}
                />
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: '12px', minHeight: 0 }}>
              {parsedShifts.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--table-head-bg)', zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>{t('importModal.colDate')}</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>{t('importModal.colOrigin')}</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>{t('importModal.colType')}</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>{t('importModal.colStart')}</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>{t('importModal.colEnd')}</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid var(--glass-border)' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {parsedShifts.map((shift, index) => {
                      const isLibre = isFreeShift(shift);
                      const incomplete = !isLibre && (shift.startTime === '??:??' || shift.endTime === '??:??');
                      // Under REVIEW, also highlight rows tied to a warning
                      // (warning date context / unknown token in the raw cell).
                      const needsAttention = incomplete || (quality?.state === 'REVIEW' && isWarningLinkedRow(shift));
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border-soft)', background: needsAttention ? 'var(--danger-row-bg)' : 'transparent' }}>
                          <td style={{ padding: '8px' }}>
                            <input type="text" className="modal-input" value={shift.date} onChange={(event) => handleUpdateShift(index, 'date', event.target.value)} style={{ padding: '6px', fontSize: '0.8rem' }} />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              className="modal-input"
                              value={shift.sourceFormat ? getImportFormatLabel(shift.sourceFormat) : (detectedFormat ?? '')}
                              readOnly
                              style={{ padding: '6px', fontSize: '0.8rem', opacity: 0.85 }}
                            />
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
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3, padding: '16px', textAlign: 'center' }}>
                  <FileText size={40} />
                  {/* UNRECOGNIZED never fabricates shifts: the hint replaces
                      the neutral empty state so the user knows what to do. */}
                  <p style={{ marginTop: '12px' }}>
                    {quality?.state === 'UNRECOGNIZED' ? t('quality.confidenceHint') : t('importModal.emptyStateHint')}
                  </p>
                </div>
              )}
            </div>

            {readyShifts.length > 0 && (
              <div style={{ marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-subtle)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {importDiff.new.length > 0 && <span>{t('importModal.diffNew', { count: importDiff.new.length })}</span>}
                {importDiff.changed.length > 0 && <span>{t('importModal.diffChanged', { count: importDiff.changed.length })}</span>}
                {importDiff.unchanged.length > 0 && <span>{t('importModal.diffUnchanged', { count: importDiff.unchanged.length })}</span>}
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              <button className="btn-gold import-process-button" style={{ width: '100%', height: '48px', fontSize: '1rem' }} disabled={readyShifts.length === 0 || loading} onClick={handleConfirm}>
                {t('importModal.confirmImport', { ready: readyShifts.length, total: parsedShifts.length })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};








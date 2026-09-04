import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../lib/use-i18n';
import type { PlanId } from '../../lib/plans';
import { detectTeamRoster, DetectedTeamEmployee } from '../../ingestion/team-roster';
import { detectPdfTeamRoster } from '../../ingestion/pdf-team-import';
import { parseXlsxTeamWorkbook, SheetSummary } from '../../ingestion/adapters/xlsx-workbook';
import { parseJsonTeamRoster } from '../../ingestion/adapters/json-adapter';
import { parseXmlTeamRoster } from '../../ingestion/adapters/xml-adapter';
import { RowDiagnostic } from '../../ingestion/adapters/structured-rows';
import { IngestionError } from '../../lib/ingestion-errors';
import {
  RemoteEmployee,
  RemoteArea,
  EmployeeMatchKind,
  matchRemoteEmployee,
  createRemoteEmployee,
  updateRemoteEmployee,
  bulkCreateRemoteEmployees,
  BulkCreateResult,
  createRemoteImport,
  syncRemoteShifts,
  loadRemoteShifts,
} from '../../lib/remote';
import { classifyImportChanges } from '../../lib/import-dedup';
import { normalizeShiftTypeLabel } from '../../lib/shifts';
import { Shift } from '../../lib/types';
import { ApiError, Role } from '../../lib/session';
import { UpgradePrompt } from './UpgradePrompt';
import { SearchableSelect } from '../ui/SearchableSelect';
import { detectImportFlow } from '../../ingestion/import-dispatcher';
import { fingerprintFile } from '../../lib/file-fingerprint';
import { analyzeDocumentFile, DocumentAnalysisResult, extractDocumentItems } from '../../ingestion/parsers/file';
import { buildImportDiagnosis, diagnosisFromError, ImportDiagnosis } from '../../ingestion/diagnostics';
import { analyzeItemsForImport, ItemAnalysis } from '../../ingestion/analysis';
import { EmployeeSelector } from '../../ingestion/core/row-detection';
import { PdfTextItem } from '../../ingestion/core/text-items';
import { AssistantCompletion, ProfileAssistantPanel } from './ProfileAssistantPanel';
import { STATE_CHIP_STYLES, STATE_I18N_KEYS } from './import-state-copy';

/** No employee identity is known yet when the team-roster detectors can't
 * classify the file — this selector only feeds the shared diagnosis
 * pipeline (analyzeDocumentFile/buildImportDiagnosis), the same one
 * ImportModal uses, so TeamImportModal never invents its own taxonomy for
 * NEEDS_USER_INPUT/BLOCKED/FAILED. */
const WILDCARD_SELECTOR: EmployeeSelector = { employeeName: '', employeeIdentifiers: [] };

interface TeamImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful import so the caller can refresh its employee list. */
  onImported: () => void;
  /** Role of the current session — only ADMIN can reactivate inactive matches (Bloque E). */
  sessionRole?: Role | null;
  /** Active organization's plan, threaded to the contextual UpgradePrompt. */
  currentPlan?: PlanId | null;
  /** A sibling Team-plan org to offer switching to instead of upgrading. */
  switchTarget?: { id: string; name: string } | null;
  onSwitchOrg?: (organizationId: string) => void;
  /** Active org areas. Empty means area-less org and no area UI. */
  areas?: RemoteArea[];
  /** Dashboard area context inherited by default (null = whole company). */
  currentAreaId?: string | null;
  /** ADMIN with 2+ areas may choose import target. */
  allowAreaChoice?: boolean;
  /** Automatic dispatcher handoff for a workbook containing one employee. */
  onSingleEmployeeDetected?: (file: File, employee: DetectedTeamEmployee) => void;
  isImporting?: boolean;
  onImportStateChange?: (importing: boolean) => void;
}

interface TeamRow {
  key: string;
  externalEmployeeId: string;
  name: string;
  detected: DetectedTeamEmployee;
  status: EmployeeMatchKind;
  candidates: RemoteEmployee[];
  resolvedEmployeeId: string | null;
  selected: boolean;
  busy: boolean;
}

interface PreviewEntry {
  row: TeamRow;
  newShifts: Shift[];
  newCount: number;
  conflictCount: number;
  unchangedCount: number;
}

interface ImportOutcome {
  row: TeamRow;
  ok: boolean;
  created: number;
}

type Step = 'upload' | 'select' | 'preview' | 'result';

function toDomainShift(shift: DetectedTeamEmployee['shifts'][number], sourceFormat: string): Shift {
  const type = normalizeShiftTypeLabel(shift.shiftType ?? '') || 'Regular';
  return {
    id: crypto.randomUUID(),
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    location: type,
    origin: 'IMP',
    sourceFormat,
  };
}

function periodOf(dateIso: string): { year: number; month: number } {
  const date = new Date(`${dateIso}T00:00:00`);
  return { year: date.getFullYear(), month: date.getMonth() };
}

const statusLabelKey: Record<EmployeeMatchKind, string> = {
  recognized: 'teamImport.statusRecognized',
  recognized_inactive: 'teamImport.statusRecognizedInactive',
  recognized_pending: 'teamImport.statusRecognizedPending',
  new: 'teamImport.statusNew',
  ambiguous: 'teamImport.statusAmbiguous',
};

/**
 * Fase 1.2F: multi-employee team import from a roster CSV (date-column
 * format — see src/ingestion/team-roster.ts). Additive and separate from
 * the existing single-employee ImportModal, which is untouched.
 *
 * Flow: upload → detect + match every distinct employee against the org
 * directory (recognized/new/ambiguous, never auto-matched) → select
 * individually/all → preview (new/conflicting/unchanged per employee,
 * conflicts are never silently overwritten) → import → results summary.
 */
export const TeamImportModal = ({
  isOpen,
  onClose,
  onImported,
  sessionRole = null,
  currentPlan = null,
  switchTarget = null,
  onSwitchOrg,
  areas = [],
  currentAreaId = null,
  allowAreaChoice = false,
  onSingleEmployeeDetected,
  isImporting = false,
  onImportStateChange,
}: TeamImportModalProps) => {
  const { t, tl } = useI18n();
  const defaultImportAreaId = currentAreaId ?? (areas.length === 1 ? areas[0].id : null);
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TeamRow[]>([]);
  // Select-All feedback (GS-team-testing-ux): the exclusion policy itself
  // (recognized+resolved only) is correct — new/ambiguous rows need explicit
  // per-row resolution first. What was missing is visible feedback: without
  // this, clicking "Seleccionar todos" on a fresh org (everything `new`)
  // silently selects 0 rows and looks like nothing happened.
  const rosterCounts = useMemo(() => ({
    total: rows.length,
    recognized: rows.filter((row) => row.status === 'recognized').length,
    recognizedInactive: rows.filter((row) => row.status === 'recognized_inactive').length,
    recognizedPending: rows.filter((row) => row.status === 'recognized_pending').length,
    new: rows.filter((row) => row.status === 'new').length,
    ambiguous: rows.filter((row) => row.status === 'ambiguous').length,
  }), [rows]);
  const [preview, setPreview] = useState<PreviewEntry[]>([]);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [importing, setImporting] = useState(false);
  // Fase 1.2F-PDF §12: PDF batches share ONE Import record across every
  // employee (one document, one source event); CSV keeps its existing
  // per-employee Import (unchanged, regression-safe).
  const [sourceFormat, setSourceFormat] = useState<'csv' | 'pdf' | 'xlsx' | 'json' | 'xml'>('csv');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  // XLSX multi-sheet summary + row-level diagnostics (invalid date,
  // incomplete shift, duplicate, unknown sheet) — additive, never blocks a
  // format that has none (CSV/PDF leave both empty).
  const [sheetSummaries, setSheetSummaries] = useState<SheetSummary[]>([]);
  const [rowDiagnostics, setRowDiagnostics] = useState<RowDiagnostic[]>([]);
  const [importAreaId, setImportAreaId] = useState<string | null>(defaultImportAreaId);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; existing: number; failed: number } | null>(null);
  // Fallback diagnosis (single source of truth: analyzeDocumentFile +
  // buildImportDiagnosis/diagnosisFromError, the same pipeline ImportModal
  // uses) for whenever the team-roster-specific detectors above can't
  // classify the file as a multi-employee roster. Without this, any file
  // they can't parse — regardless of whether it's genuinely a broken team
  // file, a real NEEDS_USER_INPUT/BLOCKED/FAILED case, or simply an
  // unregistered PDF layout — collapsed into one generic uploadError.
  const [fallbackDiagnosis, setFallbackDiagnosis] = useState<ImportDiagnosis | null>(null);
  const [fallbackResult, setFallbackResult] = useState<DocumentAnalysisResult | null>(null);
  const [fallbackAssistantSession, setFallbackAssistantSession] = useState<{ items: PdfTextItem[]; itemAnalysis: ItemAnalysis } | null>(null);
  const fallbackFileRef = useRef<File | null>(null);
  const interactionLocked = importing || isImporting;

  useEffect(() => {
    if (isOpen) {
      setImportAreaId(defaultImportAreaId);
    }
  }, [defaultImportAreaId, isOpen]);

  if (!isOpen) {
    return null;
  }

  const currentAreaName = areas.find((area) => area.id === importAreaId)?.name ?? null;
  const areaSelectOptions = [
    { value: '', label: t('areas.allCompany'), searchText: t('areas.allCompany').toLowerCase() },
    ...areas.map((area) => ({
      value: area.id,
      label: area.name,
      searchText: `${area.name} ${area.code ?? ''}`.toLowerCase(),
    })),
  ];

  const reset = () => {
    setStep('upload');
    setError('');
    setLoading(false);
    setRows([]);
    setPreview([]);
    setOutcomes([]);
    setImporting(false);
    setSourceFormat('csv');
    setSourceFile(null);
    setSheetSummaries([]);
    setRowDiagnostics([]);
    setImportAreaId(defaultImportAreaId);
    setBulkConfirmOpen(false);
    setBulkBusy(false);
    setBulkResult(null);
    setFallbackDiagnosis(null);
    setFallbackResult(null);
    setFallbackAssistantSession(null);
  };

  const handleClose = () => {
    if (importing || isImporting) {
      return;
    }
    reset();
    onClose();
  };

  /**
   * Runs whenever the team-roster-specific detectors above can't classify a
   * file (null detection, zero employees, or a thrown parse error). Instead
   * of collapsing every one of those into the same generic uploadError, this
   * routes the file through the exact same pipeline ImportModal uses
   * (analyzeDocumentFile -> buildImportDiagnosis / diagnosisFromError) so
   * NEEDS_USER_INPUT/BLOCKED/FAILED/PARTIAL are derived from the real
   * ImportDiagnosis, never invented locally. No employee identity is known
   * yet at this point, hence the wildcard selector — it only feeds the
   * shared diagnosis, it never stands in for a resolved employee.
   */
  const runFallbackDiagnosis = async (file: File): Promise<void> => {
    setFallbackAssistantSession(null);
    try {
      const result = await analyzeDocumentFile(file, WILDCARD_SELECTOR, undefined, undefined, {});
      const diagnosis = buildImportDiagnosis(result);
      setFallbackResult(result);
      setFallbackDiagnosis(diagnosis);

      if (diagnosis.recovery.eligible && diagnosis.recovery.strategy === 'answer-question' && result.questions.length > 0) {
        try {
          const items = await extractDocumentItems(file);
          setFallbackAssistantSession({
            items,
            itemAnalysis: analyzeItemsForImport(items, result.context, WILDCARD_SELECTOR),
          });
        } catch (extractError) {
          console.error('Team import fallback: assistant item extraction failed', extractError);
        }
        return;
      }

      if ((diagnosis.state === 'READY' || diagnosis.state === 'PARTIAL') && result.shifts.length > 0) {
        // A single identifiable set of shifts came out of the shared
        // pipeline after all (e.g. exactly one employee, just on a layout
        // the team-roster scanner doesn't recognize) — resolve it against
        // the org directory the same way every other detected row already
        // is, instead of leaving a working file stuck on an error screen.
        const match = await matchRemoteEmployee({ name: '', externalId: '' });
        const employee: DetectedTeamEmployee = {
          key: file.name,
          externalEmployeeId: '',
          name: '',
          shifts: result.shifts,
        };
        setSourceFormat(result.kind === 'pdf' ? 'pdf' : result.kind === 'excel' ? 'xlsx' : 'csv');
        setRows([{
          key: employee.key,
          externalEmployeeId: employee.externalEmployeeId,
          name: employee.name,
          detected: employee,
          status: match.kind,
          candidates: match.kind === 'recognized' ? [] : match.employees,
          resolvedEmployeeId: match.kind === 'recognized' ? match.employees[0]?.id ?? null : null,
          selected: false,
          busy: false,
        }]);
        setStep('select');
      }
    } catch (err) {
      setFallbackResult(null);
      setFallbackDiagnosis(diagnosisFromError(err));
    }
  };

  const handleFallbackAssistantComplete = async (completion: AssistantCompletion): Promise<void> => {
    // The picked row's label is display-only (never persisted, same rule as
    // EmployeeRowCandidate.label) — used here only to re-run the exact same
    // org-directory matching every other detected roster row already goes
    // through, never stored as-is.
    const label = completion.rowLabel ?? '';
    const match = await matchRemoteEmployee({ name: label, externalId: '' });
    const employee: DetectedTeamEmployee = {
      key: fallbackFileRef.current?.name ?? label,
      externalEmployeeId: '',
      name: label,
      shifts: completion.shifts,
    };
    setRows([{
      key: employee.key,
      externalEmployeeId: employee.externalEmployeeId,
      name: employee.name,
      detected: employee,
      status: match.kind,
      candidates: match.kind === 'recognized' ? [] : match.employees,
      resolvedEmployeeId: match.kind === 'recognized' ? match.employees[0]?.id ?? null : null,
      selected: false,
      busy: false,
    }]);
    setFallbackDiagnosis(null);
    setFallbackAssistantSession(null);
    setFallbackResult(null);
    setStep('select');
  };

  const handleFile = async (file: File) => {
    setSourceFile(file);
    fallbackFileRef.current = file;
    setError('');
    setFallbackDiagnosis(null);
    setFallbackResult(null);
    setFallbackAssistantSession(null);
    setLoading(true);
    setSheetSummaries([]);
    setRowDiagnostics([]);
    try {
      const name = file.name.toLowerCase();
      const mime = file.type.toLowerCase();
      const isPdf = name.endsWith('.pdf') || mime.includes('pdf');
      const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls') || mime.includes('spreadsheet') || mime.includes('excel');
      const isJson = name.endsWith('.json') || mime.includes('json');
      const isXml = name.endsWith('.xml') || mime.includes('xml');

      let detection: { employees: DetectedTeamEmployee[]; diagnostics?: RowDiagnostic[] } | null;
      let format: typeof sourceFormat;

      if (isPdf) {
        format = 'pdf';
        detection = await detectPdfTeamRoster(file);
      } else if (isXlsx) {
        format = 'xlsx';
        try {
          const workbook = await parseXlsxTeamWorkbook(file);
          detection = workbook;
          setSheetSummaries(workbook.sheets);
        } catch (err) {
          setError(err instanceof IngestionError
            ? t('teamImport.uploadErrorInvalidXlsx', { detail: err.message })
            : t('teamImport.uploadError'));
          return;
        }
      } else if (isJson) {
        format = 'json';
        try {
          detection = parseJsonTeamRoster(await file.text());
        } catch (err) {
          if (err instanceof IngestionError && err.code === 'INVALID_JSON') {
            setError(t('teamImport.uploadErrorInvalidJson', { detail: err.message }));
          } else if (err instanceof IngestionError && err.code === 'UNKNOWN_STRUCTURED_SCHEMA') {
            setError(t('teamImport.uploadErrorUnknownSchema'));
          } else {
            setError(t('teamImport.uploadError'));
          }
          return;
        }
      } else if (isXml) {
        format = 'xml';
        try {
          detection = parseXmlTeamRoster(await file.text());
        } catch (err) {
          if (err instanceof IngestionError && err.code === 'INVALID_XML') {
            setError(t('teamImport.uploadErrorInvalidXml', { detail: err.message }));
          } else if (err instanceof IngestionError && err.code === 'UNKNOWN_STRUCTURED_SCHEMA') {
            setError(t('teamImport.uploadErrorUnknownSchema'));
          } else {
            setError(t('teamImport.uploadError'));
          }
          return;
        }
      } else {
        format = 'csv';
        detection = detectTeamRoster(await file.text());
      }

      if (!detection || detectImportFlow(detection.employees) === 'blocked') {
        await runFallbackDiagnosis(file);
        return;
      }
      setSourceFormat(format);
      setRowDiagnostics(detection.diagnostics ?? []);

      if (detectImportFlow(detection.employees) === 'individual' && onSingleEmployeeDetected) {
        onSingleEmployeeDetected(file, detection.employees[0]);
        return;
      }

      const matched = await Promise.all(detection.employees.map(async (employee): Promise<TeamRow> => {
        const match = await matchRemoteEmployee({ name: employee.name, externalId: employee.externalEmployeeId });
        const recognized = match.kind === 'recognized' ? match.employees[0] : null;
        const crossArea = importAreaId && recognized?.areaId && recognized.areaId !== importAreaId;
        if (crossArea) {
          return {
            key: employee.key,
            externalEmployeeId: employee.externalEmployeeId,
            name: employee.name,
            detected: employee,
            status: 'ambiguous',
            candidates: match.employees,
            resolvedEmployeeId: null,
            selected: false,
            busy: false,
          };
        }
        return {
          key: employee.key,
          externalEmployeeId: employee.externalEmployeeId,
          name: employee.name,
          detected: employee,
          status: match.kind,
          // recognized_inactive carries its single match in candidates so the
          // Reactivar action knows which employee to PATCH.
          candidates: match.kind === 'recognized' ? [] : match.employees,
          resolvedEmployeeId: match.kind === 'recognized' ? match.employees[0]?.id ?? null : null,
          selected: false,
          busy: false,
        };
      }));

      setRows(matched);
      setStep('select');
    } catch (err) {
      console.error('Team roster detection failed', err);
      await runFallbackDiagnosis(file);
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (key: string, patch: Partial<TeamRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleToggle = (row: TeamRow) => {
    if (row.status !== 'recognized' || !row.resolvedEmployeeId) {
      return;
    }
    updateRow(row.key, { selected: !row.selected });
  };

  const handleSelectAll = () => {
    setRows((current) => current.map((row) => (
      row.status === 'recognized' && row.resolvedEmployeeId ? { ...row, selected: true } : row
    )));
  };

  const handleCreate = async (row: TeamRow) => {
    if (!window.confirm(t('teamImport.createConfirm', { name: row.name }))) {
      return;
    }
    updateRow(row.key, { busy: true });
    try {
      const created = await createRemoteEmployee({
        name: row.name,
        externalEmployeeId: row.externalEmployeeId || undefined,
        areaId: importAreaId ?? undefined,
      });
      updateRow(row.key, { status: 'recognized', resolvedEmployeeId: created.id, selected: true, busy: false });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        setShowUpgrade(true);
      } else {
        console.error('Failed to create employee inline', err);
      }
      updateRow(row.key, { busy: false });
    }
  };

  const handleResolveAmbiguous = (row: TeamRow, employeeId: string) => {
    const candidate = row.candidates.find((entry) => entry.id === employeeId);
    if (candidate?.status === 'inactive') {
      updateRow(row.key, { status: 'recognized_inactive', candidates: [candidate], resolvedEmployeeId: null });
      return;
    }
    updateRow(row.key, { status: 'recognized', resolvedEmployeeId: employeeId, selected: true });
  };

  // Bloque E: reactivating an inactive match is explicit (confirm) and
  // ADMIN-only; the row becomes importable right away, never duplicated.
  const handleReactivate = async (row: TeamRow) => {
    const employee = row.candidates[0];
    if (!employee) {
      return;
    }
    if (!window.confirm(t('teamImport.reactivateConfirm', { name: row.name }))) {
      return;
    }
    updateRow(row.key, { busy: true });
    try {
      await updateRemoteEmployee({ id: employee.id, status: 'active' });
      updateRow(row.key, { status: 'recognized', resolvedEmployeeId: employee.id, selected: true, busy: false });
    } catch (err) {
      console.error('Failed to reactivate employee', err);
      setError(t('teamImport.reactivateFailed'));
      updateRow(row.key, { busy: false });
    }
  };

  // "Crear todos los nuevos" — bulk-create every `new` row in one request
  // instead of one window.confirm per row. The confirm panel below is a
  // pure local render of rows already in state — nothing is created until
  // the user explicitly confirms.
  const newRows = rows.filter((row) => row.status === 'new');
  const newRowNameValid = (row: TeamRow) => row.name.trim().length > 0;
  const duplicateExternalIds = (() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const row of newRows) {
      if (!row.externalEmployeeId) continue;
      if (seen.has(row.externalEmployeeId)) {
        dupes.add(row.externalEmployeeId);
      }
      seen.add(row.externalEmployeeId);
    }
    return dupes;
  })();
  const bulkCandidates = newRows.filter((row) => newRowNameValid(row) && !duplicateExternalIds.has(row.externalEmployeeId));

  const handleBulkCreateConfirm = async () => {
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const results = await bulkCreateRemoteEmployees(bulkCandidates.map((row) => ({
        key: row.key,
        name: row.name,
        externalEmployeeId: row.externalEmployeeId || undefined,
        areaId: importAreaId ?? undefined,
      })));
      const byKey = new Map<string, BulkCreateResult>(results.map((result) => [result.key, result]));

      // Counts come from `results` directly, never from mutating a closure
      // variable inside the setRows updater below — that updater isn't
      // guaranteed to run synchronously, so side-effecting it is unsafe.
      let created = 0;
      let existing = 0;
      let failed = 0;
      let hitPlanLimit = false;
      for (const result of results) {
        if (result.status === 'created') created += 1;
        else if (result.status === 'existing' || result.status === 'existing_inactive') existing += 1;
        else {
          failed += 1;
          if (result.reason === 'plan_limit') hitPlanLimit = true;
        }
      }

      setRows((current) => current.map((row) => {
        const result = byKey.get(row.key);
        if (!result || !result.employee) {
          return row;
        }
        // existing_inactive: matched an inactive employee — never duplicated,
        // surfaced as such (ADMIN can reactivate from the row).
        if (result.status === 'existing_inactive') {
          return { ...row, status: 'recognized_inactive', candidates: [result.employee], resolvedEmployeeId: null };
        }
        // Only an ACTIVE employee is import-ready (backend enforces this
        // too). A row that just got created, or that matched an existing
        // but still pending_access employee, must show as such — never
        // silently marked 'recognized'+selected, which would let the admin
        // believe shifts are about to import when they will be rejected.
        if (result.employee.status !== 'active') {
          return { ...row, status: 'recognized_pending', candidates: [result.employee], resolvedEmployeeId: null, selected: false };
        }
        return { ...row, status: 'recognized', resolvedEmployeeId: result.employee.id, selected: true };
      }));
      setBulkResult({ created, existing, failed });
      setBulkConfirmOpen(false);
      if (hitPlanLimit) {
        setShowUpgrade(true);
      }
    } catch (err) {
      console.error('Bulk employee creation failed', err);
      setError(t('teamImport.uploadError'));
    } finally {
      setBulkBusy(false);
    }
  };

  const selectedRows = rows.filter((row) => row.selected && row.status === 'recognized' && row.resolvedEmployeeId);
  const noneEligible = rosterCounts.recognized === 0 && rosterCounts.total > 0;

  const handleContinueToPreview = async () => {
    if (selectedRows.length === 0) {
      setError(t('teamImport.noSelection'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const entries = await Promise.all(selectedRows.map(async (row): Promise<PreviewEntry> => {
        const existing = await loadRemoteShifts(row.resolvedEmployeeId as string);
        const incoming = row.detected.shifts.map((shift) => toDomainShift(shift, sourceFormat));
        const report = classifyImportChanges(existing, incoming);
        return {
          row,
          newShifts: report.new.map((change) => change.shift),
          newCount: report.new.length,
          conflictCount: report.changed.length,
          unchangedCount: report.unchanged.length,
        };
      }));
      setPreview(entries);
      setStep('preview');
    } catch (err) {
      console.error('Failed to build team import preview', err);
      setError(t('teamImport.uploadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (importing || isImporting) {
      return;
    }
    onImportStateChange?.(true);
    setImporting(true);
    const results: ImportOutcome[] = [];
    try {

    // History fields (import_mode/employee/shift counts) are computed from
    // `preview` up front — it already reflects every matched employee in the
    // uploaded file, independent of which branch below ends up creating the
    // Import row(s).
    const monthNames = tl('calendar.months');
    const fileFingerprint = sourceFile ? await fingerprintFile(sourceFile) : undefined;

    // Sequential, best-effort per employee: one employee's failure never
    // blocks the rest, and never rolls back what already succeeded (Fase
    // 1.2F.8 partial-failure strategy — no cross-employee transaction).
    for (const entry of preview) {
      try {
        if (entry.newShifts.length > 0) {
          const period = periodOf(entry.newShifts[0].date);
          const created = await createRemoteImport({
            fileName: sourceFile?.name ?? '',
            sourceFormat,
            fileFingerprint,
            employeeId: entry.row.resolvedEmployeeId,
            periodYear: period.year,
            periodMonth: period.month,
            areaId: importAreaId ?? null,
            importMode: 'team',
            periodKind: 'single',
            periodLabel: `${monthNames[period.month] ?? period.month} ${period.year}`,
            employeeCount: 1,
            shiftCount: entry.newCount + entry.conflictCount + entry.unchangedCount,
            createdShiftCount: entry.newCount,
            existingShiftCount: entry.unchangedCount,
          });
          await syncRemoteShifts(entry.row.resolvedEmployeeId as string, {
            upserts: entry.newShifts,
            importId: created.id,
          });
        }
        results.push({ row: entry.row, ok: true, created: entry.newShifts.length });
      } catch (err) {
        console.error('Team import failed for employee', entry.row.name, err);
        results.push({ row: entry.row, ok: false, created: 0 });
      }
    }
      setOutcomes(results);
      setStep('result');
      onImported();
    } finally {
      setImporting(false);
      onImportStateChange?.(false);
    }
  };

  const totals = {
    employees: preview.length,
    created: preview.reduce((sum, entry) => sum + entry.newCount, 0),
    conflicts: preview.reduce((sum, entry) => sum + entry.conflictCount, 0),
  };
  const failedOutcomes = outcomes.filter((outcome) => !outcome.ok);

  return (
    <>
    <div className="modal-overlay" data-import-modal>
      <div className="modal-content" role="dialog" aria-modal="true" aria-busy={interactionLocked} aria-label={t('teamImport.title')} style={{ maxWidth: '760px', width: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{t('teamImport.title')}</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('teamImport.teamFlow')}</span>
          </div>
          <button type="button" className="theme-toggle" disabled={interactionLocked} onClick={handleClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        {interactionLocked && <p role="status" aria-live="polite" data-import-progress tabIndex={-1} style={{ margin: '0 0 12px', color: 'var(--color-gold)', fontWeight: 700 }}>{t('importModal.importing')}</p>}

        <fieldset disabled={interactionLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>

        {error && (
          <p role="alert" style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>
        )}

        {fallbackDiagnosis && (
          <div
            data-testid="team-import-fallback-diagnosis"
            role="alert"
            style={{
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: '10px',
              border: `1px solid ${fallbackDiagnosis.state === 'BLOCKED' || fallbackDiagnosis.state === 'FAILED' || fallbackDiagnosis.state === 'UNSUPPORTED' ? 'var(--danger-border)' : 'var(--glass-border)'}`,
              background: fallbackDiagnosis.state === 'BLOCKED' || fallbackDiagnosis.state === 'FAILED' || fallbackDiagnosis.state === 'UNSUPPORTED' ? 'var(--danger-bg)' : 'var(--panel-muted-bg)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <span
              data-testid="team-import-fallback-state"
              style={{
                ...STATE_CHIP_STYLES[fallbackDiagnosis.state],
                alignSelf: 'flex-start',
                borderRadius: '999px',
                padding: '4px 12px',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              {t(STATE_I18N_KEYS[fallbackDiagnosis.state])}
            </span>
            {fallbackDiagnosis.diagnostics.map((diagnostic, diagnosticIndex) => (
              <p key={`${diagnostic.code}-${diagnosticIndex}`} style={{ margin: 0 }}>
                {t(diagnostic.messageKey, diagnostic.details ?? {})}
              </p>
            ))}
            {fallbackDiagnosis.diagnostics.length === 0 && (
              <p style={{ margin: 0 }}>{t('teamImport.uploadError')}</p>
            )}
            {fallbackAssistantSession && fallbackResult && (
              <div style={{ marginTop: '6px' }}>
                <ProfileAssistantPanel
                  questions={fallbackResult.questions}
                  items={fallbackAssistantSession.items}
                  context={fallbackResult.context}
                  analysis={fallbackAssistantSession.itemAnalysis}
                  table={fallbackResult.table ?? null}
                  selector={WILDCARD_SELECTOR}
                  onComplete={(completion) => void handleFallbackAssistantComplete(completion)}
                  onCancel={() => {
                    setFallbackDiagnosis(null);
                    setFallbackAssistantSession(null);
                    setFallbackResult(null);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {step === 'upload' && (
          <div style={{ display: 'grid', gap: '12px' }}>
            {areas.length === 1 && (
              <p data-testid="team-import-area-context" style={{ margin: 0, color: 'var(--text-subtle)', fontSize: '0.82rem' }}>
                {t('areas.contextLabel')}: <strong>{areas[0].name}</strong>
              </p>
            )}
            {areas.length >= 2 && allowAreaChoice && (
              <SearchableSelect
                label={t('importModal.areaLabel')}
                value={importAreaId ?? ''}
                onChange={(value) => setImportAreaId(value || null)}
                searchPlaceholder={t('orgSelector.searchPlaceholder')}
                emptyMessage={t('orgSelector.noResults')}
                ariaLabel={t('importModal.areaLabel')}
                options={areaSelectOptions}
              />
            )}
            {areas.length >= 2 && !allowAreaChoice && currentAreaName && (
              <p data-testid="team-import-area-context" style={{ margin: 0, color: 'var(--text-subtle)', fontSize: '0.82rem' }}>
                {t('areas.contextLabel')}: <strong>{currentAreaName}</strong>
              </p>
            )}
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t('teamImport.uploadHint')}</p>
            <label className="btn-gold" aria-disabled={interactionLocked || loading} style={{ padding: '12px 18px', fontWeight: 800, textAlign: 'center', cursor: interactionLocked || loading ? 'not-allowed' : 'pointer' }}>
              {loading ? t('teamImport.matching') : t('teamImport.chooseFile')}
              <input
                type="file"
                accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.json,application/json,.xml,application/xml,text/xml"
                style={{ display: 'none' }}
                disabled={loading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleFile(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        )}

        {step === 'select' && (
          // `flex: 1, minHeight: 0` on this wrapper AND on the row list
          // below (not just `overflowY: auto` on the list) — a nested flex
          // column only lets an `overflow: auto` child actually shrink and
          // scroll when every ancestor between it and the height-capped
          // `.modal-content` also has `minHeight: 0`; without it the whole
          // `.modal-content` grows to the list's full content height and
          // its OWN scrollbar takes over, hiding the header and the
          // "Continuar" button on a large roster (45+ employees) until the
          // user scrolls the entire panel. No `overflow: hidden` needed
          // here beyond that — a clip boundary would only cut off the
          // hover-elevated buttons on their right edge.
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
              {t('teamImport.rosterSummary', rosterCounts)}
            </p>
            {sheetSummaries.length > 0 && (
              <p data-testid="team-import-workbook-summary" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                {t('teamImport.workbookSummary', {
                  sheetCount: sheetSummaries.length,
                  processed: sheetSummaries.filter((s) => s.status === 'processed').length,
                  ignored: sheetSummaries.filter((s) => s.status !== 'processed').length,
                })}
              </p>
            )}
            {rowDiagnostics.length > 0 && (
              <p data-testid="team-import-row-diagnostics" role="status" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-gold)' }}>
                {t('teamImport.rowDiagnosticsSummary', { count: rowDiagnostics.length })}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                {t('teamImport.selectedCount', { selected: selectedRows.length, total: rosterCounts.total })}
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {rosterCounts.new > 0 && (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => { setBulkResult(null); setBulkConfirmOpen(true); }}
                    style={{ padding: '8px 14px', fontWeight: 700 }}
                  >
                    {t('teamImport.bulkCreateAction', { count: rosterCounts.new })}
                  </button>
                )}
                <button type="button" className="btn-outline" onClick={handleSelectAll} style={{ padding: '8px 14px', fontWeight: 700 }}>
                  {t('teamImport.selectAll')}
                </button>
              </div>
            </div>
            {noneEligible && (
              <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-gold)' }}>
                {t('teamImport.resolveBeforeSelect')}
              </p>
            )}
            {rosterCounts.recognizedPending > 0 && (
              <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-gold)' }}>
                {t('teamImport.pendingActivationHint', { count: rosterCounts.recognizedPending })}
              </p>
            )}
            {bulkResult && (
              <p role="status" style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                {t('teamImport.bulkCreateResult', bulkResult)}
              </p>
            )}
            {bulkConfirmOpen && (
              <div
                style={{
                  display: 'grid', gap: '8px', padding: '12px', borderRadius: '10px',
                  border: '1px solid var(--color-gold)', background: 'var(--gold-tint-bg)',
                }}
              >
                <strong style={{ fontSize: '0.88rem' }}>{t('teamImport.bulkCreateConfirmTitle', { count: bulkCandidates.length })}</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>{t('teamImport.bulkCreateConfirmHint')}</span>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'grid', gap: '2px', fontSize: '0.78rem' }}>
                  {newRows.map((row) => {
                    const invalid = !newRowNameValid(row);
                    const duplicate = row.externalEmployeeId ? duplicateExternalIds.has(row.externalEmployeeId) : false;
                    return (
                      <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span>{row.name || '—'}{row.externalEmployeeId ? ` (ID ${row.externalEmployeeId})` : ''}</span>
                        {invalid && <span style={{ color: 'var(--danger)' }}>{t('teamImport.bulkCreateInvalidRow')}</span>}
                        {!invalid && duplicate && <span style={{ color: 'var(--danger)' }}>{t('teamImport.bulkCreateDuplicateRow')}</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn-outline" disabled={bulkBusy} onClick={() => setBulkConfirmOpen(false)} style={{ padding: '8px 14px', fontWeight: 700 }}>
                    {t('teamImport.bulkCreateCancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-gold"
                    disabled={bulkBusy || bulkCandidates.length === 0}
                    onClick={() => void handleBulkCreateConfirm()}
                    style={{ padding: '8px 14px', fontWeight: 800 }}
                  >
                    {bulkBusy ? t('teamImport.bulkCreateWorking') : t('teamImport.bulkCreateConfirm', { count: bulkCandidates.length })}
                  </button>
                </div>
              </div>
            )}
            <div style={{ overflowY: 'auto', display: 'grid', gap: '8px', paddingRight: '4px', flex: 1, minHeight: 0 }}>
              {rows.map((row) => (
                <div
                  key={row.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '10px',
                    background: 'var(--panel-muted-bg)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={row.selected}
                    disabled={row.status !== 'recognized' || !row.resolvedEmployeeId}
                    onChange={() => handleToggle(row)}
                    aria-label={row.name}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>
                      {row.name}{row.externalEmployeeId ? ` (ID ${row.externalEmployeeId})` : ''}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-subtle)' }}>
                      {t('teamImport.shiftsDetected', { count: row.detected.shifts.length })}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '999px',
                      background: row.status === 'recognized' ? 'var(--info-bg)' : (row.status === 'new' || row.status === 'recognized_pending') ? 'var(--gold-tint-bg)' : 'var(--danger-bg)',
                      color: row.status === 'recognized' ? 'var(--color-accent)' : (row.status === 'new' || row.status === 'recognized_pending') ? 'var(--color-gold)' : 'var(--danger)',
                    }}
                  >
                    {t(statusLabelKey[row.status])}
                  </span>
                  {row.status === 'new' && (
                    <button
                      type="button"
                      className="btn-outline"
                      disabled={row.busy}
                      onClick={() => void handleCreate(row)}
                      style={{ padding: '6px 10px', fontWeight: 700, fontSize: '0.78rem' }}
                    >
                      {t('teamImport.create')}
                    </button>
                  )}
                  {row.status === 'recognized_inactive' && sessionRole === 'ADMIN' && (
                    <button
                      type="button"
                      className="btn-outline"
                      disabled={row.busy}
                      onClick={() => void handleReactivate(row)}
                      style={{ padding: '6px 10px', fontWeight: 700, fontSize: '0.78rem' }}
                    >
                      {t('teamImport.reactivate')}
                    </button>
                  )}
                  {row.status === 'ambiguous' && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <SearchableSelect
                        label=""
                        value=""
                        onChange={(candidateId) => {
                          if (candidateId) {
                            handleResolveAmbiguous(row, candidateId);
                          }
                        }}
                        searchPlaceholder={t('teamImport.searchPlaceholder')}
                        emptyMessage={t('teamImport.noCandidates')}
                        ariaLabel={t('teamImport.chooseMatch')}
                        options={row.candidates.map((candidate) => ({
                          value: candidate.id,
                          label: `${candidate.name}${candidate.externalEmployeeId ? ` (ID ${candidate.externalEmployeeId})` : ''}${candidate.status === 'inactive' ? ` (${t('teamImport.statusRecognizedInactive')})` : ''}${candidate.status === 'pending_access' ? ` (${t('teamImport.statusRecognizedPending')})` : ''}`,
                          searchText: `${candidate.name} ${candidate.externalEmployeeId ?? ''}`.toLowerCase(),
                        }))}
                        style={{ padding: '4px 8px', fontSize: '0.78rem', width: 'auto' }}
                      />
                      <button
                        type="button"
                        className="btn-outline"
                        disabled={row.busy}
                        onClick={() => void handleCreate(row)}
                        style={{ padding: '6px 10px', fontWeight: 700, fontSize: '0.78rem' }}
                      >
                        {t('teamImport.createAsNew')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '6px' }}>
              <button
                type="button"
                className="btn-gold"
                disabled={loading}
                aria-busy={loading}
                onClick={() => void handleContinueToPreview()}
                style={{ padding: '10px 18px', fontWeight: 800 }}
              >
                {loading ? t('teamImport.matching') : t('teamImport.continueToPreview')}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          // Same `flex: 1, minHeight: 0` fix as the select step (see its
          // comment) — otherwise a large batch (45+ employees) grows this
          // wrapper to full content height and `.modal-content`'s own
          // scrollbar takes over, hiding the stat cards and the "Importar"
          // button until the whole panel is scrolled.
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
            <h4 style={{ margin: 0 }}>{t('teamImport.previewTitle')}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--panel-muted-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{totals.employees}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>{t('teamImport.previewEmployees')}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--panel-muted-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{totals.created}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>{t('teamImport.previewNew')}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--panel-muted-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: totals.conflicts > 0 ? 'var(--danger)' : 'inherit' }}>{totals.conflicts}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>{t('teamImport.previewConflicts')}</div>
              </div>
            </div>
            <div style={{ overflowY: 'auto', display: 'grid', gap: '6px', paddingRight: '4px', flex: 1, minHeight: 0 }}>
              {preview.map((entry) => (
                <div
                  key={entry.row.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--panel-muted-bg)',
                    fontSize: '0.82rem',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{entry.row.name}</span>
                  <span style={{ color: 'var(--text-subtle)' }}>
                    +{entry.newCount} · {entry.conflictCount > 0 ? `${entry.conflictCount} ⚠` : t('teamImport.previewUnchanged')}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', paddingTop: '6px' }}>
              <button type="button" className="btn-outline" disabled={interactionLocked} onClick={() => setStep('select')} style={{ padding: '10px 18px', fontWeight: 700 }}>
                {t('teamImport.back')}
              </button>
              <button type="button" className="btn-gold" disabled={interactionLocked} aria-busy={interactionLocked} onClick={() => void handleConfirmImport()} style={{ padding: '10px 18px', fontWeight: 800, cursor: interactionLocked ? 'wait' : undefined }}>
                {interactionLocked ? t('importModal.importing') : t('teamImport.confirmImport')}
              </button>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ margin: 0 }}>{t('teamImport.resultTitle')}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--panel-muted-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{outcomes.filter((outcome) => outcome.ok).length}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>{t('teamImport.resultProcessed')}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--panel-muted-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{outcomes.reduce((sum, outcome) => sum + outcome.created, 0)}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>{t('teamImport.resultCreated')}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--panel-muted-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: totals.conflicts > 0 ? 'var(--danger)' : 'inherit' }}>{totals.conflicts}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>{t('teamImport.resultConflicts')}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--panel-muted-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: failedOutcomes.length > 0 ? 'var(--danger)' : 'inherit' }}>{failedOutcomes.length}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>{t('teamImport.resultFailed')}</div>
              </div>
            </div>
            {failedOutcomes.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--danger)' }}>
                {failedOutcomes.map((outcome) => (
                  <li key={outcome.row.key}>{outcome.row.name}</li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '6px' }}>
              <button type="button" className="btn-gold" onClick={handleClose} style={{ padding: '10px 18px', fontWeight: 800 }}>
                {t('teamImport.close')}
              </button>
            </div>
          </div>
        )}
        </fieldset>
      </div>
    </div>
    <UpgradePrompt
      isOpen={showUpgrade}
      onClose={() => setShowUpgrade(false)}
      currentPlan={currentPlan}
      switchTarget={switchTarget}
      onSwitchOrg={onSwitchOrg}
    />
    </>
  );
};

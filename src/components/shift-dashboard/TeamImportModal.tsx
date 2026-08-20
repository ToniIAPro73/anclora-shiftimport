import { useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { detectTeamRoster, DetectedTeamEmployee } from '../../ingestion/team-roster';
import { detectPdfTeamRoster } from '../../ingestion/pdf-team-import';
import {
  RemoteEmployee,
  EmployeeMatchKind,
  matchRemoteEmployee,
  createRemoteEmployee,
  createRemoteImport,
  syncRemoteShifts,
  loadRemoteShifts,
} from '../../lib/remote';
import { classifyImportChanges } from '../../lib/import-dedup';
import { normalizeShiftTypeLabel } from '../../lib/shifts';
import { Shift } from '../../lib/types';
import { ApiError } from '../../lib/session';
import { UpgradePrompt } from './UpgradePrompt';

interface TeamImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful import so the caller can refresh its employee list. */
  onImported: () => void;
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

function toDomainShift(shift: DetectedTeamEmployee['shifts'][number]): Shift {
  const type = normalizeShiftTypeLabel(shift.shiftType ?? '') || 'Regular';
  return {
    id: crypto.randomUUID(),
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    location: type,
    origin: 'IMP',
    sourceFormat: 'csv',
  };
}

function periodOf(dateIso: string): { year: number; month: number } {
  const date = new Date(`${dateIso}T00:00:00`);
  return { year: date.getFullYear(), month: date.getMonth() };
}

const statusLabelKey: Record<EmployeeMatchKind, string> = {
  recognized: 'teamImport.statusRecognized',
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
export const TeamImportModal = ({ isOpen, onClose, onImported }: TeamImportModalProps) => {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [preview, setPreview] = useState<PreviewEntry[]>([]);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [importing, setImporting] = useState(false);
  // Fase 1.2F-PDF §12: PDF batches share ONE Import record across every
  // employee (one document, one source event); CSV keeps its existing
  // per-employee Import (unchanged, regression-safe).
  const [sourceFormat, setSourceFormat] = useState<'csv' | 'pdf'>('csv');
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!isOpen) {
    return null;
  }

  const reset = () => {
    setStep('upload');
    setError('');
    setLoading(false);
    setRows([]);
    setPreview([]);
    setOutcomes([]);
    setImporting(false);
    setSourceFormat('csv');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.toLowerCase().includes('pdf');
      const detection = isPdf
        ? await detectPdfTeamRoster(file)
        : detectTeamRoster(await file.text());
      if (!detection) {
        setError(t('teamImport.uploadError'));
        return;
      }
      setSourceFormat(isPdf ? 'pdf' : 'csv');

      const matched = await Promise.all(detection.employees.map(async (employee): Promise<TeamRow> => {
        const match = await matchRemoteEmployee({ name: employee.name, externalId: employee.externalEmployeeId });
        return {
          key: employee.key,
          externalEmployeeId: employee.externalEmployeeId,
          name: employee.name,
          detected: employee,
          status: match.kind,
          candidates: match.kind === 'ambiguous' ? match.employees : [],
          resolvedEmployeeId: match.kind === 'recognized' ? match.employees[0]?.id ?? null : null,
          selected: false,
          busy: false,
        };
      }));

      setRows(matched);
      setStep('select');
    } catch (err) {
      console.error('Team roster detection failed', err);
      setError(t('teamImport.uploadError'));
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
    updateRow(row.key, { status: 'recognized', resolvedEmployeeId: employeeId, selected: true });
  };

  const selectedRows = rows.filter((row) => row.selected && row.status === 'recognized' && row.resolvedEmployeeId);

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
        const incoming = row.detected.shifts.map(toDomainShift);
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
    setImporting(true);
    const results: ImportOutcome[] = [];

    // PDF batches share ONE Import record for the whole document (§12):
    // created once, up front, best-effort — if this fails, each employee
    // falls back to its own Import below rather than blocking the batch.
    let sharedImportId: string | undefined;
    if (sourceFormat === 'pdf' && preview.some((entry) => entry.newShifts.length > 0)) {
      const firstDate = preview.find((entry) => entry.newShifts.length > 0)?.newShifts[0]?.date;
      if (firstDate) {
        try {
          const period = periodOf(firstDate);
          const created = await createRemoteImport({
            fileName: '',
            sourceFormat: 'pdf',
            periodYear: period.year,
            periodMonth: period.month,
          });
          sharedImportId = created.id;
        } catch (err) {
          console.error('Failed to create the shared PDF import record; falling back to per-employee imports', err);
        }
      }
    }

    // Sequential, best-effort per employee: one employee's failure never
    // blocks the rest, and never rolls back what already succeeded (Fase
    // 1.2F.8 partial-failure strategy — no cross-employee transaction).
    for (const entry of preview) {
      try {
        if (entry.newShifts.length > 0) {
          let importId = sharedImportId;
          if (!importId) {
            const period = periodOf(entry.newShifts[0].date);
            const created = await createRemoteImport({
              fileName: '',
              sourceFormat,
              periodYear: period.year,
              periodMonth: period.month,
            });
            importId = created.id;
          }
          await syncRemoteShifts(entry.row.resolvedEmployeeId as string, {
            upserts: entry.newShifts,
            importId,
          });
        }
        results.push({ row: entry.row, ok: true, created: entry.newShifts.length });
      } catch (err) {
        console.error('Team import failed for employee', entry.row.name, err);
        results.push({ row: entry.row, ok: false, created: 0 });
      }
    }
    setOutcomes(results);
    setImporting(false);
    setStep('result');
    onImported();
  };

  const totals = {
    employees: preview.length,
    created: preview.reduce((sum, entry) => sum + entry.newCount, 0),
    conflicts: preview.reduce((sum, entry) => sum + entry.conflictCount, 0),
  };
  const failedOutcomes = outcomes.filter((outcome) => !outcome.ok);

  return (
    <>
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '760px', width: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{t('teamImport.title')}</h3>
          <button type="button" className="theme-toggle" onClick={handleClose} aria-label={t('common.close')}>×</button>
        </div>

        {error && (
          <p role="alert" style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>
        )}

        {step === 'upload' && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t('teamImport.uploadHint')}</p>
            <label className="btn-gold" style={{ padding: '12px 18px', fontWeight: 800, textAlign: 'center', cursor: 'pointer' }}>
              {loading ? t('teamImport.matching') : t('teamImport.chooseFile')}
              <input
                type="file"
                accept=".csv,text/csv,.pdf,application/pdf"
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-outline" onClick={handleSelectAll} style={{ padding: '8px 14px', fontWeight: 700 }}>
                {t('teamImport.selectAll')}
              </button>
            </div>
            <div style={{ overflowY: 'auto', display: 'grid', gap: '8px', paddingRight: '4px' }}>
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
                      background: row.status === 'recognized' ? 'var(--info-bg)' : row.status === 'new' ? 'var(--gold-tint-bg)' : 'var(--danger-bg)',
                      color: row.status === 'recognized' ? 'var(--color-accent)' : row.status === 'new' ? 'var(--color-gold)' : 'var(--danger)',
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
                  {row.status === 'ambiguous' && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select
                        className="modal-input"
                        style={{ padding: '4px 8px', fontSize: '0.78rem', width: 'auto' }}
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value) {
                            handleResolveAmbiguous(row, event.target.value);
                          }
                        }}
                      >
                        <option value="" disabled>{t('teamImport.chooseMatch')}</option>
                        {row.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}{candidate.externalEmployeeId ? ` (ID ${candidate.externalEmployeeId})` : ''}
                          </option>
                        ))}
                      </select>
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
                onClick={() => void handleContinueToPreview()}
                style={{ padding: '10px 18px', fontWeight: 800 }}
              >
                {loading ? t('teamImport.matching') : t('teamImport.continueToPreview')}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
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
            <div style={{ overflowY: 'auto', display: 'grid', gap: '6px', paddingRight: '4px' }}>
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
              <button type="button" className="btn-outline" disabled={importing} onClick={() => setStep('select')} style={{ padding: '10px 18px', fontWeight: 700 }}>
                {t('teamImport.back')}
              </button>
              <button type="button" className="btn-gold" disabled={importing} onClick={() => void handleConfirmImport()} style={{ padding: '10px 18px', fontWeight: 800 }}>
                {importing ? t('teamImport.importing') : t('teamImport.confirmImport')}
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
      </div>
    </div>
    <UpgradePrompt isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </>
  );
};

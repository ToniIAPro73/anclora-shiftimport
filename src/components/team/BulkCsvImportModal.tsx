import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  EmployeeCsvRow,
  parseEmployeesCsvDetailed,
  parseUsersCsvDetailed,
  UserCsvRow,
} from '../../lib/bulk-import-csv';
import { downloadCsv, EMPLOYEE_TEMPLATE_HEADERS, EMPLOYEE_TEMPLATE_ROWS, USER_TEMPLATE_HEADERS, USER_TEMPLATE_ROWS } from '../../lib/bulk-import-report';
import {
  bulkCreateRemoteEmployees,
  bulkCreateRemoteInvitations,
  RemoteAccessInvitation,
  RemoteArea,
  RemoteEmployee,
  RemoteMember,
} from '../../lib/remote';
import { Locale } from '../../lib/i18n';
import { ApiError } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

type ImportKind = 'employees' | 'users';
type PreviewRow = (EmployeeCsvRow | UserCsvRow) & { row: number; action: string; message?: string };

interface Props {
  isOpen: boolean;
  kind: ImportKind;
  onClose: () => void;
  employees: RemoteEmployee[];
  members: RemoteMember[];
  invitations: RemoteAccessInvitation[];
  areas: RemoteArea[];
  locale: Locale;
  onChanged: () => void;
}

const normalize = (value: string) => value.trim().toLowerCase();

export function BulkCsvImportModal({ isOpen, kind, onClose, employees, members, invitations, areas, locale, onChanged }: Props) {
  const { t } = useI18n();
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultRows, setResultRows] = useState<Array<Record<string, unknown>> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const areaByKey = useMemo(() => {
    const map = new Map<string, RemoteArea>();
    areas.forEach((area) => {
      map.set(normalize(area.name), area);
      if (area.code) map.set(normalize(area.code), area);
    });
    return map;
  }, [areas]);

  const analyzeEmployees = (input: EmployeeCsvRow[]): PreviewRow[] => {
    const seen = new Map<string, EmployeeCsvRow>();
    return input.map((row, index) => {
      const key = row.externalEmployeeId ? `id:${normalize(row.externalEmployeeId)}` : `name:${normalize(row.name)}`;
      if (!row.name) return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkMissingName') };
      if (seen.has(key)) {
        const previous = seen.get(key)!;
        const same = previous.name === row.name && normalize(previous.areaName ?? '') === normalize(row.areaName ?? '');
        return { ...row, row: index + 1, action: same ? 'SKIP_DUPLICATE' : 'ERROR', message: t('teamWorkspace.bulkDuplicateConflict') };
      }
      seen.set(key, row);
      const area = row.areaName ? areaByKey.get(normalize(row.areaName)) : null;
      if (row.areaName && !area) return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkUnknownArea') };
      const existing = row.externalEmployeeId
        ? employees.find((employee) => normalize(employee.externalEmployeeId ?? '') === normalize(row.externalEmployeeId))
        : employees.find((employee) => normalize(employee.name) === normalize(row.name));
      if (!existing) return { ...row, row: index + 1, action: 'CREATE' };
      const same = existing.name === row.name && (existing.areaId ?? null) === (area?.id ?? null);
      return { ...row, row: index + 1, action: same ? 'UNCHANGED' : 'UPDATE' };
    });
  };

  const analyzeUsers = (input: UserCsvRow[]): PreviewRow[] => {
    const seen = new Map<string, UserCsvRow>();
    return input.map((row, index) => {
      const email = normalize(row.email);
      if (row.rowError === 'missingEmail') return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkMissingEmail') };
      if (row.rowError === 'invalidRole' || row.role === 'OWNER') return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkInvalidRole') };
      if (row.rowError === 'invalidLocale') return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkInvalidLocale') };
      if (seen.has(email)) return { ...row, row: index + 1, action: 'SKIP_DUPLICATE', message: t('teamWorkspace.bulkDuplicateEmail') };
      seen.set(email, row);
      const member = members.find((candidate) => normalize(candidate.email) === email);
      const pending = invitations.find((invitation) => normalize(invitation.email) === email && invitation.status === 'PENDING');
      if (!member && !pending && !row.name) return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkDisplayNameRequired') };
      if (row.externalEmployeeId) {
        const employee = employees.find((candidate) => normalize(candidate.externalEmployeeId ?? '') === normalize(row.externalEmployeeId));
        if (!employee) return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkEmployeeNotFound') };
        const linked = members.find((candidate) => candidate.employeeId === employee.id);
        if (linked && linked.userId !== member?.userId) return { ...row, row: index + 1, action: 'ERROR', message: t('teamWorkspace.bulkEmployeeAlreadyLinked') };
      }
      if (member) return { ...row, email, row: index + 1, action: member.role === row.role ? 'UNCHANGED' : 'UPDATE_ROLE' };
      if (pending) return { ...row, email, row: index + 1, action: 'UNCHANGED_PENDING' };
      return { ...row, email, row: index + 1, action: 'INVITE' };
    });
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setResultRows(null);
    if (!/\.csv$/i.test(file.name) || file.size > 2_000_000) {
      setRows([]); setParseError(t('teamWorkspace.bulkInvalidFile')); return;
    }
    const text = await file.text();
    const parsed = kind === 'employees' ? parseEmployeesCsvDetailed(text) : parseUsersCsvDetailed(text);
    if (parsed.error) {
      setRows([]); setParseError(t(`teamWorkspace.bulkParse_${parsed.error}`)); return;
    }
    setRows(kind === 'employees' ? analyzeEmployees(parsed.rows as EmployeeCsvRow[]) : analyzeUsers(parsed.rows as UserCsvRow[]));
  };

  const processable = rows.filter((row) => !['ERROR', 'SKIP_DUPLICATE', 'UNCHANGED', 'UNCHANGED_PENDING'].includes(row.action));

  /** Every reason/code a confirmed server result can carry is a machine
   * value, never presentation text — translate it here so a raw backend
   * code can never reach the screen or the downloadable report. */
  const translateEmployeeReason = (reason: string | undefined, areaLabel: string | undefined): string => {
    switch (reason) {
      case 'invalid': return t('teamWorkspace.bulkMissingName');
      case 'unknown_area': return areaLabel ? t('teamWorkspace.bulkUnknownArea') + ` (${areaLabel})` : t('teamWorkspace.bulkUnknownArea');
      case 'plan_limit': return t('teamWorkspace.bulkPlanLimit');
      default: return t('teamWorkspace.errors.IMPORT_ROW_FAILED');
    }
  };
  const translateUserCode = (code: string | null | undefined): string => {
    if (!code) return '';
    return t(`teamWorkspace.errors.${code}`);
  };

  const handleImport = async () => {
    if (busy || processable.length === 0) return;
    setBusy(true);
    setParseError(null);
    try {
      if (kind === 'employees') {
        const results = await bulkCreateRemoteEmployees(processable.map((row) => {
          const employee = row as EmployeeCsvRow;
          const area = employee.areaName ? areaByKey.get(normalize(employee.areaName)) : null;
          return { key: String(row.row), name: employee.name, externalEmployeeId: employee.externalEmployeeId || undefined, areaId: area?.id ?? null, areaName: employee.areaName };
        }));
        const byKey = new Map(results.map((result) => [result.key, result]));
        setResultRows(rows.map((row) => {
          const employee = row as EmployeeCsvRow;
          const result = byKey.get(String(row.row));
          return {
            row: row.row, status: result?.status ?? row.action, externalEmployeeId: employee.externalEmployeeId,
            name: employee.name, area: employee.areaName ?? '', action: result?.status ?? row.action,
            message: row.message ?? (result?.status === 'failed' ? translateEmployeeReason(result.reason, result.areaLabel) : ''),
          };
        }));
      } else {
        const response = await bulkCreateRemoteInvitations(processable.map((row) => {
          const user = row as UserCsvRow;
          return { key: String(row.row), email: user.email, displayName: user.name, role: user.role as Exclude<RemoteMember['role'], 'OWNER'>, externalEmployeeId: user.externalEmployeeId || undefined, locale: user.locale === 'en' || user.locale === 'es' ? user.locale : locale };
        }), locale);
        const byKey = new Map(response.results.map((result) => [result.key, result]));
        setResultRows(rows.map((row) => {
          const user = row as UserCsvRow;
          const result = byKey.get(String(row.row));
          return {
            row: row.row, status: result?.status ?? row.action, email: user.email, displayName: user.name,
            role: user.role, externalEmployeeId: user.externalEmployeeId,
            invitationStatus: result?.invitationStatus ?? '', deliveryStatus: result?.deliveryStatus ?? '',
            message: row.message ?? translateUserCode(result?.code),
          };
        }));
      }
      onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setParseError(code ? t(`teamWorkspace.errors.${code}`) : t('teamWorkspace.bulkImportFailed'));
    } finally {
      setBusy(false);
    }
  };

  const resultSummary = useMemo(() => {
    if (!resultRows) return null;
    const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0, invited: 0, emailFailed: 0 };
    for (const resultRow of resultRows) {
      const status = String(resultRow.status ?? '');
      if (kind === 'employees') {
        if (status === 'created') counts.created += 1;
        else if (status === 'updated') counts.updated += 1;
        else if (status === 'existing' || status === 'existing_inactive' || status === 'UNCHANGED') counts.unchanged += 1;
        else counts.rejected += 1;
      } else {
        if (status === 'INVITED') {
          counts.invited += 1;
          if (resultRow.deliveryStatus === 'FAILED') counts.emailFailed += 1;
        } else if (status === 'UPDATE_ROLE') counts.updated += 1;
        else if (status === 'UNCHANGED' || status === 'UNCHANGED_PENDING') counts.unchanged += 1;
        else counts.rejected += 1;
      }
    }
    return counts;
  }, [resultRows, kind]);

  const downloadTemplate = () => {
    if (kind === 'employees') downloadCsv(t('teamWorkspace.bulkTemplateFileNameEmployees'), EMPLOYEE_TEMPLATE_HEADERS, EMPLOYEE_TEMPLATE_ROWS);
    else downloadCsv(t('teamWorkspace.bulkTemplateFileNameUsers'), USER_TEMPLATE_HEADERS, USER_TEMPLATE_ROWS);
  };

  const downloadResult = () => {
    if (!resultRows) return;
    // Headers are localized labels — the report is a human deliverable, not
    // a machine payload, so it must never surface raw technical field names.
    const headers = kind === 'employees'
      ? [t('teamWorkspace.bulkReportHeaderRow'), t('teamWorkspace.bulkReportHeaderStatus'), t('teamWorkspace.bulkReportHeaderExternalId'), t('teamWorkspace.bulkReportHeaderName'), t('teamWorkspace.bulkReportHeaderArea'), t('teamWorkspace.bulkReportHeaderAction'), t('teamWorkspace.bulkReportHeaderMessage')]
      : [t('teamWorkspace.bulkReportHeaderRow'), t('teamWorkspace.bulkReportHeaderStatus'), t('teamWorkspace.bulkReportHeaderEmail'), t('teamWorkspace.bulkReportHeaderDisplayName'), t('teamWorkspace.bulkReportHeaderRole'), t('teamWorkspace.bulkReportHeaderExternalId'), t('teamWorkspace.bulkReportHeaderInvitationStatus'), t('teamWorkspace.bulkReportHeaderDeliveryStatus'), t('teamWorkspace.bulkReportHeaderMessage')];
    const localizedRows = resultRows.map((resultRow) => {
      const values = kind === 'employees'
        ? [resultRow.row, actionLabel(String(resultRow.status)), resultRow.externalEmployeeId, resultRow.name, resultRow.area, actionLabel(String(resultRow.action)), resultRow.message]
        : [resultRow.row, actionLabel(String(resultRow.status)), resultRow.email, resultRow.displayName, resultRow.role, resultRow.externalEmployeeId, resultRow.invitationStatus, resultRow.deliveryStatus, resultRow.message];
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
    const fileNameBase = t(kind === 'employees' ? 'teamWorkspace.bulkResultFileNameEmployees' : 'teamWorkspace.bulkResultFileNameUsers');
    downloadCsv(`${fileNameBase}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.csv`, headers, localizedRows);
  };

  const actionLabel = (action: string) => {
    const key: Record<string, string> = {
      CREATE: 'bulkActionCreate', UPDATE: 'bulkActionUpdate', UPDATE_ROLE: 'bulkActionUpdateRole',
      UNCHANGED: 'bulkActionUnchanged', UNCHANGED_PENDING: 'bulkActionUnchangedPending',
      INVITE: 'bulkActionInvite', SKIP_DUPLICATE: 'bulkActionSkipDuplicate', ERROR: 'bulkActionError',
      created: 'bulkActionCreate', updated: 'bulkActionUpdate', existing: 'bulkActionUnchanged',
      existing_inactive: 'bulkActionUnchanged', failed: 'bulkActionError', INVITED: 'bulkActionInvite',
    };
    return t(`teamWorkspace.${key[action] ?? 'bulkActionError'}`);
  };

  return (
    <ModalShell isOpen={isOpen} onClose={busy ? () => undefined : onClose} title={kind === 'employees' ? t('teamWorkspace.bulkEmployeesTitle') : t('teamWorkspace.bulkUsersTitle')} maxWidth="900px" workspace blocking={busy}>
      <div className="bulk-csv-modal" data-testid={`bulk-csv-${kind}`}>
        <p>{t('teamWorkspace.bulkImportDescription')}</p>
        <div className="equipo-modal__toolbar">
          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <Upload size={16} /> {t('teamWorkspace.bulkSelectFile')}
          </button>
          <input ref={fileInputRef} id={`bulk-file-${kind}`} type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event)} disabled={busy} style={{ display: 'none' }} />
          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={downloadTemplate} disabled={busy}><Download size={16} /> {t('teamWorkspace.bulkTemplate')}</button>
        </div>
        {fileName && <p aria-live="polite">{fileName}</p>}
        {parseError && <div role="alert" className="card card--error">{parseError}</div>}
        {rows.length > 0 && (
          <>
            {/* The table always shows either the client-side preview or the
                server-CONFIRMED result — never lets the stale preview stand
                in for a real outcome once one exists (contract: distinguish
                predicted from confirmed). */}
            <h4 style={{ margin: '8px 0 0' }}>{resultRows ? t('teamWorkspace.bulkResultTitle') : t('teamWorkspace.bulkPreviewTitle')}</h4>
            {(() => {
              const rowLabel = t('teamWorkspace.bulkRow');
              const subjectLabel = kind === 'employees' ? t('teamWorkspace.employeeRecord') : t('teamWorkspace.accessEmail');
              const actionColumnLabel = t('teamWorkspace.bulkAction');
              const messageLabel = t('teamWorkspace.bulkMessage');
              return (
                <div className="bulk-csv-modal__table" tabIndex={0}>
                  <table className="equipo-table"><thead><tr><th>{rowLabel}</th><th>{subjectLabel}</th><th>{actionColumnLabel}</th><th>{messageLabel}</th></tr></thead><tbody>
                    {resultRows
                      ? resultRows.map((resultRow) => (
                        <tr key={String(resultRow.row)}>
                          <td data-label={rowLabel}>{String(resultRow.row)}</td>
                          <td data-label={subjectLabel}>{String(kind === 'employees' ? resultRow.name : resultRow.email)}</td>
                          <td data-label={actionColumnLabel}>{actionLabel(String(resultRow.status))}</td>
                          <td data-label={messageLabel}>{String(resultRow.message ?? '')}</td>
                        </tr>
                      ))
                      : rows.map((row) => (
                        <tr key={row.row}>
                          <td data-label={rowLabel}>{row.row}</td>
                          <td data-label={subjectLabel}>{kind === 'employees' ? (row as EmployeeCsvRow).name : (row as UserCsvRow).email}</td>
                          <td data-label={actionColumnLabel}>{actionLabel(row.action)}</td>
                          <td data-label={messageLabel}>{row.message ?? ''}</td>
                        </tr>
                      ))}
                  </tbody></table>
                </div>
              );
            })()}
          </>
        )}
        {!resultRows && rows.length > 0 && <p aria-live="polite">{t('teamWorkspace.bulkRowsSummary', { total: rows.length, processable: processable.length })}</p>}
        {resultRows && resultSummary && (
          <div role="status" aria-live="polite">
            <p>
              {t('teamWorkspace.bulkSuccess')}
              {' — '}
              {[
                kind === 'employees' && resultSummary.created > 0 && t('teamWorkspace.bulkCountCreated', { count: resultSummary.created }),
                resultSummary.updated > 0 && t('teamWorkspace.bulkCountUpdated', { count: resultSummary.updated }),
                kind === 'users' && resultSummary.invited > 0 && t('teamWorkspace.bulkCountInvited', { count: resultSummary.invited }),
                kind === 'users' && resultSummary.emailFailed > 0 && t('teamWorkspace.bulkCountEmailFailed', { count: resultSummary.emailFailed }),
                resultSummary.unchanged > 0 && t('teamWorkspace.bulkCountUnchanged', { count: resultSummary.unchanged }),
                resultSummary.rejected > 0 && t('teamWorkspace.bulkCountRejected', { count: resultSummary.rejected }),
              ].filter(Boolean).join(' · ')}
            </p>
            <button type="button" className="equipo-btn equipo-btn--secondary" onClick={downloadResult}><Download size={16} /> {t('teamWorkspace.bulkDownloadResult')}</button>
          </div>
        )}
        <div className="bulk-csv-modal__footer">
          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className="equipo-btn equipo-btn--primary" onClick={() => void handleImport()} disabled={busy || processable.length === 0} aria-busy={busy}>{busy ? t('teamWorkspace.bulkImporting') : t('teamWorkspace.bulkConfirm')}</button>
        </div>
      </div>
    </ModalShell>
  );
}

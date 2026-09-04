import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { deleteRemoteImport, listRemoteImports, RemoteImport } from '../../lib/remote';
import { isAdminRole, SessionInfo } from '../../lib/session';
import { ModalShell } from '../ui/ModalShell';

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionInfo | null;
  /** Called after a successful delete so the calendar/App state can drop the
   * shifts that carried this import_id — no server refetch mechanism exists
   * anywhere in this app (see App.tsx's persistChanges), so this modal
   * follows the same convention: report what happened, let the caller filter
   * its own local state. */
  onDeleted: (importId: string) => void;
}

/** Rows per page. The modal now uses the fixed-height `workspace` shell:
 * header, filter bar and pagination stay pinned and only the list region
 * scrolls, so the page size no longer has to guarantee a scroll-free fit —
 * it only bounds fetch size and DOM nodes. 10/5 keeps pages snappy while
 * making most histories fit on one page. */
const DESKTOP_PAGE_SIZE = 10;
const MOBILE_PAGE_SIZE = 5;
const MOBILE_BREAKPOINT_QUERY = '(max-width: 480px)';

function useResponsivePageSize(): number {
  const [pageSize, setPageSize] = useState(DESKTOP_PAGE_SIZE);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const update = () => setPageSize(mediaQuery.matches ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return pageSize;
}

type SourceFormatFilter = '' | 'csv' | 'xlsx' | 'pdf';

const formatDateTime = (iso: string | undefined, locale: string): string => {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-GB';
  return `${date.toLocaleDateString(dateLocale)} · ${date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`;
};

export const ImportHistoryModal = ({ isOpen, onClose, session, onDeleted }: ImportHistoryModalProps) => {
  const { t, locale } = useI18n();
  const canDelete = isAdminRole(session?.role);
  const pageSize = useResponsivePageSize();

  const [rows, setRows] = useState<RemoteImport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [scopeFilter, setScopeFilter] = useState<'' | 'global' | 'area'>('');
  const [typeFilter, setTypeFilter] = useState<'' | 'individual' | 'team'>('');
  const [formatFilter, setFormatFilter] = useState<SourceFormatFilter>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'completed' | 'deleted'>('');

  // Filter/page changes can fire overlapping requests (e.g. two selects
  // changed in quick succession); a slower, now-stale response must never
  // clobber a newer one that already landed. A monotonically increasing
  // request id, checked before committing, is the standard fix — no library
  // needed for a single in-flight-request race like this.
  const requestIdRef = useRef(0);

  const load = useCallback(async (targetPage: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const result = await listRemoteImports({
        page: targetPage,
        pageSize,
        scopeType: scopeFilter || null,
        importMode: typeFilter || null,
        sourceFormat: formatFilter || null,
        status: statusFilter || null,
      });
      if (requestIdRef.current !== requestId) {
        return;
      }
      setRows(result.imports);
      setTotal(result.total);
      setPage(result.page);
    } catch {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setError(t('imports.deleteError'));
      setRows([]);
      setTotal(0);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [scopeFilter, typeFilter, formatFilter, statusFilter, pageSize, t]);

  useEffect(() => {
    if (isOpen) {
      void load(1);
    } else {
      setRows([]);
      setTotal(0);
      setPage(1);
      setError('');
      setDeletingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scopeFilter, typeFilter, formatFilter, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const scopeLabel = (row: RemoteImport): string => (
    row.scopeType === 'area'
      ? t('imports.scopeArea', { name: row.areaNameSnapshot ?? '—' })
      : t('imports.scopeGlobal')
  );

  const statusLabel = (row: RemoteImport): string => {
    if (row.status === 'deleted') return t('imports.statusDeleted');
    if (row.status === 'pending') return t('imports.statusPending');
    if (row.status === 'failed') return t('imports.statusFailed');
    return t('imports.statusCompleted');
  };

  const handleDelete = (row: RemoteImport) => {
    if (!canDelete || deletingId) {
      return;
    }
    const confirmText = [
      t('imports.deleteConfirmIntro'),
      '',
      `${t('imports.columnDate')}: ${formatDateTime(row.createdAt, locale)}`,
      `${t('imports.columnUser')}: ${row.importedByUserName ?? t('imports.unknownUser')}`,
      `${t('imports.columnEmployees')}: ${row.employeeCount ?? 0}`,
      t('imports.deleteShiftsCount', { count: row.createdShiftCount ?? 0 }),
      `${t('imports.columnPeriod')}: ${row.periodLabel || '—'}`,
      `${t('imports.columnScope')}: ${scopeLabel(row)}`,
      '',
      t('imports.deleteConfirmProtected'),
      t('imports.deleteConfirmIrreversible'),
    ].join('\n');
    if (!window.confirm(confirmText)) {
      return;
    }
    setDeletingId(row.id);
    setError('');
    void deleteRemoteImport(row.id)
      .then(() => {
        onDeleted(row.id);
        // A deletion can empty out the last row of the current page — step
        // back a page rather than showing a stranded empty page.
        const nextPage = rows.length === 1 && page > 1 ? page - 1 : page;
        return load(nextPage);
      })
      .catch(() => {
        setError(t('imports.deleteError'));
      })
      .finally(() => {
        setDeletingId(null);
      });
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('imports.historyTitle')} maxWidth="820px" workspace>
      {!canDelete && (
        <p style={{ margin: '0 0 12px', color: 'var(--text-subtle)', fontSize: '0.8rem', flexShrink: 0 }}>
          {t('imports.readOnlyNotice')}
        </p>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', flexShrink: 0 }}>
        <select
          className="modal-input"
          aria-label={t('imports.columnScope')}
          value={scopeFilter}
          onChange={(event) => setScopeFilter(event.target.value as typeof scopeFilter)}
          style={{ padding: '6px 8px', fontSize: '0.78rem', flex: '1 1 140px' }}
        >
          <option value="">{t('imports.filterAllScopes')}</option>
          <option value="global">{t('imports.scopeGlobal')}</option>
          <option value="area">{t('imports.filterScopeArea')}</option>
        </select>
        <select
          className="modal-input"
          aria-label={t('imports.columnType')}
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
          style={{ padding: '6px 8px', fontSize: '0.78rem', flex: '1 1 140px' }}
        >
          <option value="">{t('imports.filterAllTypes')}</option>
          <option value="individual">{t('imports.typeIndividual')}</option>
          <option value="team">{t('imports.typeTeam')}</option>
        </select>
        <select
          className="modal-input"
          aria-label={t('imports.columnFormat')}
          value={formatFilter}
          onChange={(event) => setFormatFilter(event.target.value as SourceFormatFilter)}
          style={{ padding: '6px 8px', fontSize: '0.78rem', flex: '1 1 120px' }}
        >
          <option value="">{t('imports.filterAllFormats')}</option>
          <option value="csv">CSV</option>
          <option value="xlsx">XLSX</option>
          <option value="pdf">PDF</option>
        </select>
        <select
          className="modal-input"
          aria-label={t('imports.columnStatus')}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          style={{ padding: '6px 8px', fontSize: '0.78rem', flex: '1 1 140px' }}
        >
          <option value="">{t('imports.filterAllStatuses')}</option>
          <option value="completed">{t('imports.statusCompleted')}</option>
          <option value="deleted">{t('imports.statusDeleted')}</option>
        </select>
      </div>

      <div className="import-history-scroll" style={{ overflowY: 'auto' }}>
        {loading && (
          <p role="status" style={{ margin: '18px 0', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>
            {t('imports.loading')}
          </p>
        )}

        {!loading && rows.length === 0 && !error && (
          <p style={{ margin: '18px 0', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>
            {t('imports.empty')}
          </p>
        )}

        {error && <p role="alert" style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}

        {!loading && rows.length > 0 && (
          <div style={{ display: 'grid', gap: '6px', marginBottom: '8px', alignContent: 'start' }}>
          {rows.map((row) => {
            const isDeleting = deletingId === row.id;
            const isDeleted = row.status === 'deleted';
            return (
              <div
                key={row.id}
                aria-busy={isDeleting}
                style={{
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  background: 'var(--panel-muted-bg)',
                  fontSize: '0.82rem',
                  opacity: isDeleting ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '0.88rem' }}>{formatDateTime(row.createdAt, locale)}</strong>
                  <span className={`status-badge ${isDeleted ? 'status-badge--inactive' : 'status-badge--active'}`}>
                    {statusLabel(row)}
                  </span>
                  <span style={{ marginLeft: 'auto' }}>
                    {canDelete && !isDeleted && (
                      <button
                        type="button"
                        aria-label={t('imports.deleteAction')}
                        aria-busy={isDeleting}
                        disabled={isDeleting || Boolean(deletingId)}
                        onClick={() => handleDelete(row)}
                        style={{
                          padding: '6px 10px',
                          color: 'var(--danger)',
                          border: '1px solid var(--danger-border)',
                          borderRadius: '10px',
                          background: 'var(--danger-bg)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        <Trash2 size={14} />
                        {isDeleting ? t('imports.deleting') : t('imports.deleteAction')}
                      </button>
                    )}
                  </span>
                </div>
                <div style={{ color: 'var(--text-subtle)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span>{t('imports.columnUser')}: {row.importedByUserName ?? t('imports.unknownUser')}</span>
                  <span>· {t('imports.columnEmployees')}: {row.employeeCount ?? 0}</span>
                  <span>· {t('imports.columnShifts')}: {row.shiftCount ?? 0}</span>
                  <span>· {t('imports.columnCreated')}: {row.createdShiftCount ?? 0}</span>
                  <span>· {t('imports.columnExisting')}: {row.existingShiftCount ?? 0}</span>
                </div>
                <div style={{ color: 'var(--text-subtle)', display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span>{t('imports.columnPeriod')}: {row.periodLabel || '—'}</span>
                  <span>· {t('imports.columnType')}: {row.importMode === 'team' ? t('imports.typeTeam') : t('imports.typeIndividual')}</span>
                  <span>· {t('imports.columnFormat')}: {(row.sourceFormat || '—').toUpperCase()}</span>
                  <span>· {t('imports.columnScope')}: {scopeLabel(row)}</span>
                </div>
                {row.fileName && (
                  <div style={{ color: 'var(--text-subtle)', marginTop: '2px', wordBreak: 'break-word' }}>
                    {t('imports.columnFile')}: {row.fileName}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexShrink: 0, paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
        <button
          type="button"
          className="month-nav-button"
          aria-label={t('imports.pagePrev')}
          disabled={loading || page <= 1}
          onClick={() => void load(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', minWidth: '120px', textAlign: 'center' }}>
          {t('imports.pageIndicator', { page, total: totalPages })}
        </span>
        <button
          type="button"
          className="month-nav-button"
          aria-label={t('imports.pageNext')}
          disabled={loading || page >= totalPages}
          onClick={() => void load(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </ModalShell>
  );
};

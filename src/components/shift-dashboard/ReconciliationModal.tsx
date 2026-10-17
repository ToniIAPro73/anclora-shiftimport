import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import type { ReconciliationItem, ReconciliationShiftLabel, ReconciliationWorklist } from '../../lib/remote';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';
import { SegmentedTabs, type SegmentedTab } from '../ui/SegmentedTabs';
import { summarizeReason } from './reconciliation-display';
import { RECONCILIATION_PAGE_SIZE, pageWindow } from './reconciliation-paging';
import './CalendarModals.css';

type Filter = 'pending' | 'resolved' | 'all';

interface ReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  worklist: ReconciliationWorklist | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Opens the day detail (where the resolution is recorded). */
  onReview: (date: string) => void;
  /** Closes the list and shows the day in the calendar. */
  onViewDay: (date: string) => void;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function ReconciliationModal({
  isOpen, onClose, worklist, loading, failed, onRetry, onReview, onViewDay,
}: ReconciliationModalProps) {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<Filter>('pending');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (isOpen) { setFilter('pending'); setPage(1); }
  }, [isOpen]);

  const visible = useMemo<ReconciliationItem[]>(
    () => (worklist?.items ?? []).filter((item) => filter === 'all' || item.status.toLowerCase() === filter),
    [worklist, filter],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / RECONCILIATION_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = visible.slice((safePage - 1) * RECONCILIATION_PAGE_SIZE, safePage * RECONCILIATION_PAGE_SIZE);
  const pendingCount = worklist?.pendingCount ?? 0;

  const describe = (labels: ReconciliationShiftLabel[]) => {
    if (!labels.length) return t('reconModal.noRecord');
    return labels.map((label) => {
      const type = translateShiftTypeLabel(label.type, locale, label.type);
      return label.startTime && label.endTime ? `${type} ${label.startTime}–${label.endTime}` : type;
    }).join(' · ');
  };

  const tabs: Array<SegmentedTab<Filter>> = [
    { id: 'pending', label: t('reconModal.tabPending') },
    { id: 'resolved', label: t('reconModal.tabResolved') },
    { id: 'all', label: t('reconModal.tabAll') },
  ];

  const from = visible.length ? (safePage - 1) * RECONCILIATION_PAGE_SIZE + 1 : 0;
  const to = Math.min(visible.length, safePage * RECONCILIATION_PAGE_SIZE);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('reconModal.title')}
      hideHeader
      maxWidth="920px"
      width="100%"
      className="recon-modal"
      closeAriaLabel={t('common.close')}
    >
      <div data-testid="reconciliation-modal">
        <div className="recon-modal__header">
          <AlertTriangle size={22} aria-hidden="true" className="recon-modal__icon" />
          <h2 className="recon-modal__title">{t('reconModal.title')}</h2>
          {pendingCount > 0 && (
            <span className="recon-modal__badge" data-testid="recon-modal-badge">{t('reconModal.pendingBadge', { count: pendingCount })}</span>
          )}
          <button type="button" className="theme-toggle recon-modal__close" onClick={onClose} aria-label={t('common.close')} data-testid="recon-modal-close">×</button>
        </div>

        <SegmentedTabs
          tabs={tabs}
          value={filter}
          onChange={(id) => { setFilter(id); setPage(1); }}
          ariaLabel={t('reconModal.tabsLabel')}
          idPrefix="recon-tab"
          panelId="recon-tabpanel"
          testIdPrefix="recon-tab"
        />

        <div id="recon-tabpanel" role="tabpanel" className="recon-modal__body">
          {loading && !worklist && <p role="status" className="eff-contract__empty">{t('reconModal.loading')}</p>}
          {failed && !worklist && (
            <div role="alert" className="eff-contract__empty">
              <p>{t('reconModal.error')}</p>
              <button type="button" className="eff-button" onClick={onRetry}>{t('reconModal.retry')}</button>
            </div>
          )}
          {worklist && visible.length === 0 && <p className="eff-contract__empty" data-testid="recon-empty">{t('reconModal.empty')}</p>}
          {worklist && visible.length > 0 && (
            <>
              <div className="recon-list__head" aria-hidden="true">
                <span>{t('reconModal.colDate')}</span>
                <span>{t('reconModal.colBefore')}</span>
                <span>{t('reconModal.colNow')}</span>
                <span>{t('reconModal.colEffective')}</span>
                <span>{t('reconModal.colStatus')}</span>
                <span>{t('reconModal.colActions')}</span>
              </div>
              <ul className="recon-list" data-testid="recon-list">
                {pageItems.map((item) => {
                  const reason = item.status === 'RESOLVED' ? summarizeReason(item.resolvedReason) : null;
                  const reasonText = reason
                    ? reason.kind === 'matchesPlan' ? t('reconModal.reasonMatchesPlan')
                      : reason.kind === 'reconciled' ? t('reconModal.reasonReconciled') : reason.text
                    : null;
                  const pending = item.status === 'PENDING';
                  return (
                    <li key={item.date} className="recon-row" data-testid={`recon-row-${item.date}`} data-status={item.status}>
                      <strong className="recon-row__date">{formatDate(item.date)}</strong>
                      <span className="recon-row__cell" data-label={t('reconModal.colBefore')} data-testid={`recon-before-${item.date}`}>{describe(item.companyBefore ?? [])}</span>
                      <span className="recon-row__cell" data-label={t('reconModal.colNow')} data-testid={`recon-now-${item.date}`}>{describe(item.companyNow ?? item.company)}</span>
                      <span className="recon-row__cell recon-row__cell--current" data-label={t('reconModal.colEffective')} data-testid={`recon-effective-${item.date}`}>
                        {describe(item.effective ?? item.current)}
                        {pending && item.reasonCode && (
                          <small className="recon-row__reason" data-testid={`recon-why-${item.date}`}>{t(`reconModal.reason.${item.reasonCode}`)}</small>
                        )}
                        {reasonText && (
                          <small className="recon-row__reason" title={reason?.full || undefined} data-testid={`recon-reason-${item.date}`}>{reasonText}</small>
                        )}
                      </span>
                      <span className={`recon-row__status recon-row__status--${item.status.toLowerCase()}`}>
                        {pending ? <Clock3 size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
                        {pending ? t('reconModal.statusPending') : t('reconModal.statusResolved')}
                      </span>
                      <span className="recon-row__actions">
                        <button
                          type="button"
                          className={pending ? 'eff-button eff-button--primary' : 'eff-button'}
                          onClick={() => onReview(item.date)}
                          aria-label={t('reconModal.reviewAria', { date: formatDate(item.date) })}
                          data-testid={`recon-review-${item.date}`}
                        >
                          {t('reconModal.review')}
                        </button>
                        <button
                          type="button"
                          className="eff-button eff-button--icon"
                          onClick={() => onViewDay(item.date)}
                          aria-label={t('reconModal.viewDayAria', { date: formatDate(item.date) })}
                          title={t('reconModal.viewDay')}
                          data-testid={`recon-view-${item.date}`}
                        >
                          <CalendarDays size={16} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <nav className="recon-pager" aria-label={t('reconModal.pagination')}>
                <span className="recon-pager__range" data-testid="recon-range">
                  {t('reconModal.pageRange', { from, to, total: visible.length })}
                </span>
                {totalPages > 1 && (
                  <span className="recon-pager__pages">
                    <button type="button" className="eff-button eff-button--ghost" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label={t('reconModal.previousPage')}>
                      <ChevronLeft size={14} aria-hidden="true" />
                    </button>
                    {pageWindow(safePage, totalPages).map((entry, index) => (entry === 'gap'
                      ? <span key={`gap-${index}`} aria-hidden="true">…</span>
                      : (
                        <button
                          key={entry}
                          type="button"
                          className={entry === safePage ? 'eff-button recon-pager__page is-current' : 'eff-button eff-button--ghost recon-pager__page'}
                          aria-current={entry === safePage ? 'page' : undefined}
                          aria-label={t('reconModal.pageAria', { page: entry })}
                          onClick={() => setPage(entry)}
                        >
                          {entry}
                        </button>
                      )))}
                    <button type="button" className="eff-button eff-button--ghost" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)} aria-label={t('reconModal.nextPage')}>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </span>
                )}
              </nav>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

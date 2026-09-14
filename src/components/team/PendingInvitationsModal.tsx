import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, RotateCw, Search, Trash2 } from 'lucide-react';
import { useI18n } from '../../lib/use-i18n';
import type { RemoteAccessInvitation, RemoteEmployee } from '../../lib/remote';
import type { Persona } from '../../lib/personas';
import { ModalShell } from '../ui/ModalShell';
import './PendingInvitationsModal.css';

export interface PendingInvitationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invitations: RemoteAccessInvitation[];
  personas?: Persona[];
  employees?: RemoteEmployee[];
  onResend: (invitation: RemoteAccessInvitation) => Promise<void>;
  onRevoke: (invitation: RemoteAccessInvitation) => Promise<void>;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type SortOption = 'recent' | 'oldest' | 'expiring';

export const PendingInvitationsModal: React.FC<PendingInvitationsModalProps> = ({
  isOpen,
  onClose,
  invitations,
  personas = [],
  employees = [],
  onResend,
  onRevoke,
  triggerRef,
}) => {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [page, setPage] = useState(1);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 6;

  // Filter only PENDING invitations
  const pendingOnly = useMemo(() => {
    return invitations.filter((inv) => inv.status === 'PENDING');
  }, [invitations]);

  // Lookup person or employee for each invitation
  const linkedInfoByInvitationId = useMemo(() => {
    const map = new Map<string, { name: string; role?: string }>();
    for (const inv of pendingOnly) {
      // Find matching persona by email
      const matchingPersona = personas.find(
        (p) => p.email && p.email.toLowerCase() === inv.email.toLowerCase()
      );
      if (matchingPersona) {
        map.set(inv.id, {
          name: matchingPersona.name,
          role: matchingPersona.role ?? undefined,
        });
        continue;
      }
      // Or find employee matching email if stored
      const matchingEmp = employees.find((e) => e.userId && personas.some((p) => p.userId === e.userId && p.email?.toLowerCase() === inv.email.toLowerCase()));
      if (matchingEmp) {
        map.set(inv.id, { name: matchingEmp.name });
      }
    }
    return map;
  }, [pendingOnly, personas, employees]);

  // Filtered & sorted list
  const filteredInvitations = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = pendingOnly.filter((inv) => {
      if (!q) return true;
      const matchEmail = inv.email.toLowerCase().includes(q);
      const linked = linkedInfoByInvitationId.get(inv.id);
      const matchName = linked?.name ? linked.name.toLowerCase().includes(q) : false;
      return matchEmail || matchName;
    });

    return list.sort((a, b) => {
      if (sortBy === 'recent') {
        const timeA = new Date(a.lastSentAt || a.createdAt).getTime();
        const timeB = new Date(b.lastSentAt || b.createdAt).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'oldest') {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeA - timeB;
      }
      // expiring
      const expA = new Date(a.expiresAt).getTime();
      const expB = new Date(b.expiresAt).getTime();
      return expA - expB;
    });
  }, [pendingOnly, search, sortBy, linkedInfoByInvitationId]);

  const totalCount = filteredInvitations.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const paginatedInvitations = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInvitations.slice(start, start + PAGE_SIZE);
  }, [filteredInvitations, currentPage, PAGE_SIZE]);

  const handleClose = () => {
    onClose();
    if (triggerRef?.current) {
      setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };

  const handleAction = async (invitation: RemoteAccessInvitation, type: 'resend' | 'revoke') => {
    setError(null);
    setActionPendingId(invitation.id);
    try {
      if (type === 'resend') {
        await onResend(invitation);
      } else {
        await onRevoke(invitation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setActionPendingId(null);
    }
  };

  const formatExpiry = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'es-ES', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const getDeliveryLabel = (status: RemoteAccessInvitation['deliveryStatus']) => {
    if (status === 'SENT') return t('teamWorkspace.deliveryStatusSent');
    if (status === 'FAILED') return t('teamWorkspace.deliveryStatusFailed');
    return t('teamWorkspace.deliveryStatusNotSent');
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={`${t('teamWorkspace.pendingInvitations')} (${pendingOnly.length})`}
      closeAriaLabel={t('teamWorkspace.close')}
      closeTestId="close-pending-invitations-modal"
      maxWidth="780px"
      width="min(94vw, 780px)"
      height="min(86dvh, 720px)"
      workspace
      className="pending-invitations-shell"
    >
      <div className="pending-invitations-modal" data-testid="pending-invitations-modal">
        {error && (
          <div className="card card--error" role="alert" style={{ marginBottom: '12px', padding: '8px 12px' }}>
            <span style={{ color: 'var(--danger, #ef4444)' }}>{error}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="pending-invitations-modal__toolbar">
          <div className="pending-invitations-modal__search-wrapper">
            <Search size={16} className="pending-invitations-modal__search-icon" aria-hidden="true" />
            <input
              type="text"
              className="pending-invitations-modal__search"
              placeholder={t('teamWorkspace.searchInvitationsPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              data-testid="pending-invitations-search"
              aria-label={t('teamWorkspace.searchInvitationsPlaceholder')}
            />
          </div>

          <select
            className="pending-invitations-modal__sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label={t('teamWorkspace.sortBy')}
            data-testid="invitations-sort-select"
          >
            <option value="recent">{t('teamWorkspace.sortRecent')}</option>
            <option value="oldest">{t('teamWorkspace.sortOldest')}</option>
            <option value="expiring">{t('teamWorkspace.sortExpiring')}</option>
          </select>
        </div>

        {/* Content list */}
        <div className="pending-invitations-modal__list-container" data-testid="pending-invitations-list">
          {filteredInvitations.length === 0 ? (
            <div className="pending-invitations-modal__empty">
              <Mail size={32} strokeWidth={1.5} style={{ opacity: 0.5, marginBottom: '8px' }} />
              <p>{search.trim() ? t('teamWorkspace.noInvitationsMatch') : t('teamWorkspace.noPendingInvitations')}</p>
            </div>
          ) : (
            <div className="pending-invitations-modal__cards">
              {paginatedInvitations.map((invitation) => {
                const isBusy = actionPendingId === invitation.id;
                const linked = linkedInfoByInvitationId.get(invitation.id);
                const isDeliveryFailed = invitation.deliveryStatus === 'FAILED';

                return (
                  <div
                    key={invitation.id}
                    className="pending-invitations-modal__card"
                    data-testid={`pending-invitation-${invitation.id}`}
                  >
                    <div className="pending-invitations-modal__card-info">
                      <div className="pending-invitations-modal__card-primary">
                        <strong
                          className="pending-invitations-modal__email"
                          title={invitation.email}
                        >
                          {invitation.email}
                        </strong>

                        {linked?.role && (
                          <span className="equipo-badge equipo-badge--role">
                            {t(`teamWorkspace.role${linked.role.charAt(0) + linked.role.slice(1).toLowerCase()}`)}
                          </span>
                        )}

                        <span
                          className={`pending-invitations-modal__delivery-badge${
                            isDeliveryFailed ? ' is-failed' : ''
                          }`}
                        >
                          {getDeliveryLabel(invitation.deliveryStatus)}
                        </span>
                      </div>

                      <div className="pending-invitations-modal__card-secondary">
                        {linked?.name && (
                          <span className="pending-invitations-modal__meta-item">
                            {t('teamWorkspace.linkedTo', { name: linked.name })}
                          </span>
                        )}
                        <span className="pending-invitations-modal__meta-item">
                          {t('teamWorkspace.invitationExpires', { date: formatExpiry(invitation.expiresAt) })}
                        </span>
                      </div>
                    </div>

                    <div className="pending-invitations-modal__card-actions">
                      <button
                        type="button"
                        className="equipo-btn equipo-btn--secondary"
                        onClick={() => void handleAction(invitation, 'resend')}
                        disabled={isBusy}
                        data-testid={`resend-invitation-${invitation.id}`}
                        aria-label={`${t('teamWorkspace.resendInvitation')} ${invitation.email}`}
                      >
                        <RotateCw size={14} className={isBusy ? 'animate-spin' : ''} aria-hidden="true" />
                        {t('teamWorkspace.resendInvitation')}
                      </button>
                      <button
                        type="button"
                        className="equipo-btn equipo-btn--danger"
                        onClick={() => void handleAction(invitation, 'revoke')}
                        disabled={isBusy}
                        data-testid={`revoke-invitation-${invitation.id}`}
                        aria-label={`${t('teamWorkspace.revokeInvitation')} ${invitation.email}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        {t('teamWorkspace.revokeInvitation')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination footer (when > PAGE_SIZE) */}
        {totalPages > 1 && (
          <div className="pending-invitations-modal__pagination" data-testid="invitations-pagination">
            <button
              type="button"
              className="month-nav-button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label={t('teamWorkspace.pagePrev')}
              data-testid="invitations-page-prev"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="pending-invitations-modal__page-indicator">
              {t('teamWorkspace.paginationRange', {
                start: (currentPage - 1) * PAGE_SIZE + 1,
                end: Math.min(currentPage * PAGE_SIZE, totalCount),
                total: totalCount,
              })}
            </span>

            <button
              type="button"
              className="month-nav-button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              aria-label={t('teamWorkspace.pageNext')}
              data-testid="invitations-page-next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

import { SessionMembership } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

interface OrgSelectorModalProps {
  isOpen: boolean;
  memberships: SessionMembership[];
  onSelect: (organizationId: string) => void;
  onLogout: () => void;
}

/**
 * Mandatory explicit organization choice for multi-org users (Fase 1.1).
 * Blocking: no silent first-membership fallback exists anymore. The only way
 * out without choosing is logout.
 */
export const OrgSelectorModal = ({ isOpen, memberships, onSelect, onLogout }: OrgSelectorModalProps) => {
  const { t } = useI18n();

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onLogout}
      title={t('orgSelector.title')}
      blocking
      maxWidth="440px"
    >
      <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>
        {t('orgSelector.description')}
      </p>
      <div style={{ display: 'grid', gap: '10px' }}>
        {memberships.map((membership) => (
          <button
            key={membership.organizationId}
            type="button"
            className="btn-outline"
            onClick={() => onSelect(membership.organizationId)}
            style={{
              padding: '12px 14px',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
            }}
          >
            <span>{membership.organizationName}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{membership.role}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn-outline"
          onClick={onLogout}
          style={{ padding: '10px 14px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          {t('auth.logoutAction')}
        </button>
      </div>
    </ModalShell>
  );
};

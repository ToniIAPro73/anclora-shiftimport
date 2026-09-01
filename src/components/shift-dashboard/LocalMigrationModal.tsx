import { useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';

interface LocalMigrationModalProps {
  isOpen: boolean;
  /** Number of local shifts found on this device. */
  shiftCount: number;
  organizationName: string;
  employeeName: string;
  /** Runs the idempotent upload; resolves true on success. */
  onImport: () => Promise<boolean>;
  /** Keep data only on this device (do not ask again this session). */
  onKeepLocal: () => void;
  onCancel: () => void;
}

/**
 * Explicit local→remote migration (Fase 1.1, PASO 13). Never silent:
 * the user sees WHAT (count), WHERE (org + employee) and chooses. The local
 * copy is never deleted; the upload upserts by id (idempotent, safe to
 * repeat).
 */
export const LocalMigrationModal = ({
  isOpen,
  shiftCount,
  organizationName,
  employeeName,
  onImport,
  onKeepLocal,
  onCancel,
}: LocalMigrationModalProps) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setBusy(true);
    setError('');
    try {
      const ok = await onImport();
      if (!ok) {
        setError(t('migration.failed'));
      }
    } catch {
      setError(t('migration.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      title={t('migration.title')}
      maxWidth="460px"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onCancel} style={{ padding: '10px 14px', fontWeight: 700 }}>
            {t('migration.cancel')}
          </button>
          <button type="button" className="btn-outline" onClick={onKeepLocal} style={{ padding: '10px 14px', fontWeight: 700 }}>
            {t('migration.keepLocal')}
          </button>
          <button type="button" className="btn-gold" onClick={() => void handleImport()} disabled={busy} aria-busy={busy} style={{ padding: '10px 14px', fontWeight: 800 }}>
            {busy ? t('auth.working') : t('migration.importAction')}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {t('migration.foundLocal', { count: shiftCount })}
      </p>
      <div style={{ display: 'grid', gap: '8px', fontSize: '0.85rem', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px', background: 'var(--panel-muted-bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ color: 'var(--text-subtle)' }}>{t('migration.targetOrg')}</span>
          <span style={{ fontWeight: 700 }}>{organizationName}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ color: 'var(--text-subtle)' }}>{t('migration.targetEmployee')}</span>
          <span style={{ fontWeight: 700 }}>{employeeName}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ color: 'var(--text-subtle)' }}>{t('migration.records')}</span>
          <span style={{ fontWeight: 700 }}>{shiftCount}</span>
        </div>
      </div>
      <p style={{ margin: '12px 0 0', color: 'var(--text-subtle)', fontSize: '0.78rem', lineHeight: 1.5 }}>
        {t('migration.backupNote')}
      </p>
      {error && <p role="alert" style={{ margin: '10px 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
    </ModalShell>
  );
};

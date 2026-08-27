import { useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';
import type { UserFormatProfile } from '../../lib/format-profiles';
import { candidateInputFromLocalProfile } from '../../lib/format-profile-store';
import type { FormatProfileStore } from '../../lib/format-profile-store';

interface FormatProfileMigrationModalProps {
  isOpen: boolean;
  localProfiles: UserFormatProfile[];
  /** Remote (organization) store the profiles are migrated into. */
  remoteStore: FormatProfileStore;
  /** Runs after the migration action, whether fully or partially successful. */
  onDone: () => void;
  onKeepLocal: () => void;
  onCancel: () => void;
}

interface MigrationOutcome {
  migrated: number;
  total: number;
  failed: string[];
}

/**
 * One-time, explicit, idempotent prompt to migrate locally-learned format
 * profiles into the active organization on first authenticated session.
 * Never deletes the local copy. Repeating the migration is safe: the API's
 * create-candidate endpoint is idempotent on (organization, structureHash).
 * See sdd/features/format-memory-v1/00_PRODUCT_SPEC.md (local migration UX).
 */
export const FormatProfileMigrationModal = ({
  isOpen,
  localProfiles,
  remoteStore,
  onDone,
  onKeepLocal,
  onCancel,
}: FormatProfileMigrationModalProps) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MigrationOutcome | null>(null);

  const runMigration = async () => {
    setBusy(true);
    const failed: string[] = [];
    let migrated = 0;
    for (const profile of localProfiles) {
      try {
        await remoteStore.saveCandidate(candidateInputFromLocalProfile(profile));
        migrated += 1;
      } catch {
        failed.push(profile.id);
      }
    }
    setBusy(false);
    setResult({ migrated, total: localProfiles.length, failed });
    if (failed.length === 0) {
      onDone();
    }
  };

  const partial = result !== null && result.failed.length > 0;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      title={t('formatMigration.title')}
      maxWidth="460px"
      footer={
        result ? (
          partial ? (
            <>
              <button type="button" className="btn-outline" onClick={onCancel} style={{ padding: '10px 14px', fontWeight: 700 }}>
                {t('formatMigration.close')}
              </button>
              <button type="button" className="btn-gold" onClick={() => void runMigration()} disabled={busy} style={{ padding: '10px 14px', fontWeight: 800 }}>
                {busy ? t('formatMigration.migrating') : t('formatMigration.retryAction')}
              </button>
            </>
          ) : (
            <button type="button" className="btn-gold" onClick={onDone} style={{ padding: '10px 14px', fontWeight: 800 }}>
              {t('formatMigration.close')}
            </button>
          )
        ) : (
          <>
            <button type="button" className="btn-outline" onClick={onCancel} style={{ padding: '10px 14px', fontWeight: 700 }}>
              {t('formatMigration.postpone')}
            </button>
            <button type="button" className="btn-outline" onClick={onKeepLocal} style={{ padding: '10px 14px', fontWeight: 700 }}>
              {t('formatMigration.keepLocal')}
            </button>
            <button type="button" className="btn-gold" onClick={() => void runMigration()} disabled={busy} style={{ padding: '10px 14px', fontWeight: 800 }}>
              {busy ? t('formatMigration.migrating') : t('formatMigration.importAction')}
            </button>
          </>
        )
      }
    >
      <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {t('formatMigration.foundLocal', { count: localProfiles.length })}
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: '18px', color: 'var(--text-subtle)', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <li>{t('formatMigration.explanationStructure')}</li>
        <li>{t('formatMigration.explanationNoDocuments')}</li>
        <li>{t('formatMigration.explanationNoPersonalData')}</li>
        <li>{t('formatMigration.localCopyKept')}</li>
      </ul>
      {result && (
        <p role="status" style={{ margin: '10px 0 0', color: partial ? 'var(--danger)' : 'var(--text-muted)', fontSize: '0.85rem' }}>
          {t('formatMigration.resultSummary', { migrated: result.migrated, total: result.total })}
          {partial ? ` ${t('formatMigration.resultPartial')}` : ''}
        </p>
      )}
    </ModalShell>
  );
};

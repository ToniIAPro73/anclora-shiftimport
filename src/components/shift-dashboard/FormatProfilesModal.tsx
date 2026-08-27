import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import { ModalShell } from '../ui/ModalShell';
import type { FormatProfile, FormatProfileStatus } from '../../lib/format-profiles';
import type { FormatProfileStore } from '../../lib/format-profile-store';

interface FormatProfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: FormatProfileStore;
  /** ADMIN can confirm/deprecate/reactivate/rename; EMPLOYEE only views. */
  canManage: boolean;
}

const STATUS_I18N_KEY: Record<FormatProfileStatus, string> = {
  candidate: 'formatProfiles.statusCandidate',
  validated: 'formatProfiles.statusValidated',
  verified: 'formatProfiles.statusVerified',
  legacy: 'formatProfiles.statusLegacy',
  deprecated: 'formatProfiles.statusDeprecated',
};

const STATUS_COLOR: Record<FormatProfileStatus, string> = {
  candidate: 'var(--warning, #b8860b)',
  validated: 'var(--success, #2e7d32)',
  verified: 'var(--success, #2e7d32)',
  legacy: 'var(--text-subtle)',
  deprecated: 'var(--danger)',
};

interface FamilyGroup {
  logicalProfileId: string;
  latest: FormatProfile;
  history: FormatProfile[];
}

const groupByFamily = (profiles: FormatProfile[]): FamilyGroup[] => {
  const byFamily = new Map<string, FormatProfile[]>();
  for (const profile of profiles) {
    const list = byFamily.get(profile.logicalProfileId) ?? [];
    list.push(profile);
    byFamily.set(profile.logicalProfileId, list);
  }
  return Array.from(byFamily.entries()).map(([logicalProfileId, versions]) => {
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    return { logicalProfileId, latest: sorted[0], history: sorted.slice(1) };
  });
};

/**
 * "Formatos aprendidos" — organization-scoped format-profile management
 * (Format Memory v1). Never renders internals: no hashes, fingerprints,
 * ids, or parser JSON — only the fields a human needs to recognize and
 * govern a learned format. Read access for any authenticated role;
 * rename/confirm/deprecate/reactivate gated to `canManage` (ADMIN).
 */
export const FormatProfilesModal = ({ isOpen, onClose, store, canManage }: FormatProfilesModalProps) => {
  const { locale, t } = useI18n();
  const [profiles, setProfiles] = useState<FormatProfile[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const reload = useCallback(async () => {
    try {
      setProfiles(await store.list());
    } catch {
      setError(t('formatProfiles.loadFailed'));
    }
  }, [store, t]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      void reload();
    } else {
      setExpandedFamilies(new Set());
      setRenamingId(null);
    }
  }, [isOpen, reload]);

  const run = async (profileId: string, action: () => Promise<unknown>) => {
    setBusyId(profileId);
    setError('');
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('formatProfiles.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleFamily = (logicalProfileId: string) => {
    setExpandedFamilies((current) => {
      const next = new Set(current);
      if (next.has(logicalProfileId)) {
        next.delete(logicalProfileId);
      } else {
        next.add(logicalProfileId);
      }
      return next;
    });
  };

  const startRename = (profile: FormatProfile) => {
    setRenamingId(profile.id);
    setRenameValue(profile.displayName);
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return t('formatProfiles.lastUsedNever');
    const date = new Date(iso);
    return t('formatProfiles.lastUsed', { date: date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-GB') });
  };

  const renderRow = (profile: FormatProfile, isLatest: boolean) => (
    <div
      key={profile.id}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        border: '1px solid var(--glass-border)', borderRadius: '12px',
        padding: '10px 12px', background: 'var(--panel-muted-bg)', fontSize: '0.85rem',
        opacity: isLatest ? 1 : 0.85,
      }}
    >
      {renamingId === profile.id ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(profile.id, () => store.rename(profile.id, renameValue.trim())).then(() => setRenamingId(null));
          }}
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}
        >
          <input
            className="modal-input"
            type="text"
            required
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            aria-label={t('formatProfiles.renameLabel')}
            style={{ padding: '6px 10px', flex: 1, minWidth: '140px' }}
          />
          <button type="submit" className="btn-gold" disabled={busyId === profile.id} style={{ padding: '6px 10px', fontWeight: 800 }}>
            {t('common.save')}
          </button>
          <button type="button" className="btn-outline" disabled={busyId === profile.id} onClick={() => setRenamingId(null)} style={{ padding: '6px 10px', fontWeight: 700 }}>
            {t('common.cancel')}
          </button>
        </form>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: 700 }}>
              {profile.displayName}
              <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> · {t('formatProfiles.version', { version: profile.version })}</span>
            </div>
            <div style={{ color: 'var(--text-subtle)', fontSize: '0.78rem', marginTop: '2px' }}>
              {t(profile.sourceType === 'pdf' ? 'formatProfiles.sourcePdf' : 'formatProfiles.sourceTabular')}
              {' · '}
              {t('formatProfiles.scope')}
              {' · '}
              {formatDate(profile.lastUsedAt)}
              {' · '}
              {t('formatProfiles.successfulUses', { count: profile.successfulUseCount })}
            </div>
            {profile.supersedesProfileId && (
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem', marginTop: '2px', fontStyle: 'italic' }}>
                {t('formatProfiles.supersedesNote')}
              </div>
            )}
          </div>
          <span style={{ color: STATUS_COLOR[profile.status], fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            {t(STATUS_I18N_KEY[profile.status])}
          </span>
          {canManage && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-outline"
                disabled={busyId === profile.id}
                onClick={() => startRename(profile)}
                style={{ padding: '6px 10px', fontWeight: 700 }}
              >
                {t('formatProfiles.renameAction')}
              </button>
              {profile.status === 'candidate' && (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busyId === profile.id}
                  onClick={() => void run(profile.id, () => store.confirm(profile.id))}
                  style={{ padding: '6px 10px', fontWeight: 700 }}
                >
                  {t('formatProfiles.confirmAction')}
                </button>
              )}
              {(profile.status === 'legacy' || profile.status === 'deprecated') && (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busyId === profile.id}
                  onClick={() => void run(profile.id, () => store.reactivate(profile.id))}
                  style={{ padding: '6px 10px', fontWeight: 700 }}
                >
                  {t('formatProfiles.reactivateAction')}
                </button>
              )}
              {profile.status !== 'deprecated' && (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busyId === profile.id}
                  onClick={() => void run(profile.id, () => store.deprecate(profile.id))}
                  style={{ padding: '6px 10px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                  {t('formatProfiles.deprecateAction')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const families = profiles ? groupByFamily(profiles) : [];

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('formatProfiles.modalTitle')} maxWidth="640px">
      {profiles === null && !error && (
        <p style={{ margin: '0 0 16px', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>{t('common.loading')}</p>
      )}
      {profiles !== null && families.length === 0 && !error && (
        <p style={{ margin: '0 0 16px', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>{t('formatProfiles.empty')}</p>
      )}
      {error && <p role="alert" style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}

      <div style={{ display: 'grid', gap: '10px' }}>
        {families.map((family) => (
          <div key={family.logicalProfileId} style={{ display: 'grid', gap: '6px' }}>
            {renderRow(family.latest, true)}
            {family.history.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => toggleFamily(family.logicalProfileId)}
                  style={{ padding: '4px 10px', fontWeight: 600, fontSize: '0.78rem', justifySelf: 'start' }}
                >
                  {expandedFamilies.has(family.logicalProfileId)
                    ? t('formatProfiles.hideVersions')
                    : t('formatProfiles.showVersions', { count: family.history.length })}
                </button>
                {expandedFamilies.has(family.logicalProfileId) && (
                  <div style={{ display: 'grid', gap: '6px', paddingLeft: '14px' }}>
                    {family.history.map((profile) => renderRow(profile, false))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </ModalShell>
  );
};

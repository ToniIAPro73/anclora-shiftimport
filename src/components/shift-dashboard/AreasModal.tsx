import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import {
  addRemoteAreaResponsible,
  createRemoteArea,
  listRemoteAreaResponsibles,
  listRemoteAreas,
  listRemoteMembers,
  RemoteArea,
  RemoteAreaResponsible,
  RemoteMember,
  removeRemoteAreaResponsible,
  updateRemoteArea,
} from '../../lib/remote';
import { ModalShell } from '../ui/ModalShell';
import { SearchableSelect } from '../ui/SearchableSelect';

interface AreasModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after any mutation so the dashboard refreshes its area context. */
  onChanged: () => void;
}

/**
 * Organization areas management (ADMIN only). Areas are optional, 0..N per
 * org, and never hard-deleted: historical shifts/imports keep referencing
 * them, so removal is always a deactivation (active=false) — the same
 * lifecycle rule the employees tab applies to employees with history.
 */
export const AreasModal = ({ isOpen, onClose, onChanged }: AreasModalProps) => {
  const { t } = useI18n();
  const [areas, setAreas] = useState<RemoteArea[]>([]);
  const [admins, setAdmins] = useState<RemoteMember[]>([]);
  const [responsibles, setResponsibles] = useState<Record<string, RemoteAreaResponsible[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Create form.
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');

  // Inline edit.
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  const reload = useCallback(async () => {
    try {
      const [nextAreas, members] = await Promise.all([listRemoteAreas(), listRemoteMembers()]);
      const nextResponsibles = await Promise.all(nextAreas.map(async (area) => (
        [area.id, await listRemoteAreaResponsibles(area.id)] as const
      )));
      setAreas(nextAreas);
      setAdmins(members.filter((member) => member.role === 'ADMIN'));
      setResponsibles(Object.fromEntries(nextResponsibles));
    } catch {
      setError(t('areas.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      void reload();
    } else {
      setEditingAreaId(null);
      setNewName('');
      setNewCode('');
    }
  }, [isOpen, reload]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('areas.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await createRemoteArea({ name: newName.trim(), code: newCode.trim() || undefined });
      setNewName('');
      setNewCode('');
    });
  };

  const startEdit = (area: RemoteArea) => {
    setEditingAreaId(area.id);
    setEditName(area.name);
    setEditCode(area.code ?? '');
  };

  const handleEditSave = (area: RemoteArea, event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      // '' clears the code server-side (null code), never the literal "null".
      await updateRemoteArea({ id: area.id, name: editName.trim(), code: editCode.trim() });
      setEditingAreaId(null);
    });
  };

  const handleDeactivate = (area: RemoteArea) => {
    if (!window.confirm(t('areas.deactivateConfirm', { name: area.name }))) {
      return;
    }
    void run(() => updateRemoteArea({ id: area.id, deactivate: true }));
  };

  const handleAddResponsible = (areaId: string, userId: string) => {
    if (!userId) return;
    void run(() => addRemoteAreaResponsible(areaId, userId));
  };

  const handleRemoveResponsible = (areaId: string, responsible: RemoteAreaResponsible) => {
    if (!window.confirm(t('areas.removeResponsibleConfirm', { name: responsible.displayName || responsible.email }))) {
      return;
    }
    void run(() => removeRemoteAreaResponsible(areaId, responsible.userId));
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('areas.modalTitle')} maxWidth="560px">
      {areas.length === 0 && !error && (
        <p style={{ margin: '0 0 16px', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>{t('areas.empty')}</p>
      )}

      <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
        {areas.map((area) => (
          <div
            key={area.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
              border: '1px solid var(--glass-border)', borderRadius: '12px',
              padding: '10px 12px', background: 'var(--panel-muted-bg)', fontSize: '0.85rem',
            }}
          >
            {editingAreaId === area.id ? (
              <form onSubmit={(event) => handleEditSave(area, event)} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                <input
                  className="modal-input"
                  type="text"
                  required
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder={t('areas.namePlaceholder')}
                  aria-label={t('areas.namePlaceholder')}
                  style={{ padding: '6px 10px', flex: 1, minWidth: '140px' }}
                />
                <input
                  className="modal-input"
                  type="text"
                  value={editCode}
                  onChange={(event) => setEditCode(event.target.value)}
                  placeholder={t('areas.codePlaceholder')}
                  aria-label={t('areas.codePlaceholder')}
                  style={{ padding: '6px 10px', width: '130px' }}
                />
                <button type="submit" className="btn-gold" disabled={busy} aria-busy={busy} style={{ padding: '6px 10px', fontWeight: 800 }}>
                  {t('common.save')}
                </button>
                <button type="button" className="btn-outline" disabled={busy} onClick={() => setEditingAreaId(null)} style={{ padding: '6px 10px', fontWeight: 700 }}>
                  {t('common.cancel')}
                </button>
              </form>
            ) : (
              <>
                <span style={{ fontWeight: 700, flex: 1 }}>
                  {area.name}
                  {area.code && <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> · {area.code}</span>}
                </span>
                {!area.active && (
                  <span className="status-badge status-badge--inactive">{t('areas.statusInactive')}</span>
                )}
                <button
                  type="button"
                  className="btn-outline"
                  disabled={busy || !area.active}
                  onClick={() => startEdit(area)}
                  style={{ padding: '6px 10px', fontWeight: 700 }}
                >
                  {t('common.edit')}
                </button>
                {area.active && (
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={busy}
                    onClick={() => handleDeactivate(area)}
                    style={{ padding: '6px 10px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    {t('areas.deactivateAction')}
                  </button>
                )}
                {area.active && (
                  <div style={{ flexBasis: '100%', borderTop: '1px solid var(--glass-border)', paddingTop: '8px', marginTop: '2px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {t('areas.responsiblesLabel')}
                      </span>
                      {(responsibles[area.id] ?? []).length > 0 ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {(responsibles[area.id] ?? []).map((responsible) => (
                            <span key={responsible.userId} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', border: '1px solid var(--glass-border)', borderRadius: '999px', padding: '4px 8px', background: 'var(--panel-bg)' }}>
                              <span>{responsible.displayName || responsible.email}</span>
                              <button
                                type="button"
                                className="btn-outline"
                                disabled={busy}
                                onClick={() => handleRemoveResponsible(area.id, responsible)}
                                aria-label={`${t('areas.removeResponsible')}: ${responsible.displayName || responsible.email}`}
                                style={{ padding: '2px 6px', minHeight: 'auto', fontSize: '0.7rem' }}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>{t('areas.responsiblesEmpty')}</span>
                      )}
                      <SearchableSelect
                        label={t('areas.addResponsible')}
                        value=""
                        onChange={(userId) => handleAddResponsible(area.id, userId)}
                        options={admins
                          .filter((admin) => !(responsibles[area.id] ?? []).some((responsible) => responsible.userId === admin.userId))
                          .map((admin) => ({
                            value: admin.userId,
                            label: admin.displayName || admin.email,
                            searchText: `${admin.displayName} ${admin.email}`.toLowerCase(),
                          }))}
                        searchPlaceholder={t('members.emailPlaceholder')}
                        emptyMessage={t('members.noEligibleAreaResponsibles')}
                        ariaLabel={t('areas.addResponsible')}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {error && <p role="alert" style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid var(--glass-border)', paddingTop: '14px', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', flex: 1, minWidth: '160px' }}>
          {t('areas.addAction')}
          <input
            className="modal-input"
            type="text"
            required
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t('areas.namePlaceholder')}
            style={{ padding: '10px 12px' }}
          />
        </label>
        <input
          className="modal-input"
          type="text"
          value={newCode}
          onChange={(event) => setNewCode(event.target.value)}
          placeholder={t('areas.codePlaceholder')}
          aria-label={t('areas.codePlaceholder')}
          style={{ padding: '10px 12px', width: '150px' }}
        />
        <button type="submit" className="btn-gold" disabled={busy} aria-busy={busy} style={{ padding: '10px 14px', fontWeight: 800 }}>
          {busy ? t('auth.working') : t('common.add')}
        </button>
      </form>
    </ModalShell>
  );
};

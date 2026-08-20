import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import {
  addRemoteMember,
  listRemoteMembers,
  RemoteMember,
  removeRemoteMember,
  updateRemoteMemberRole,
  RemoteEmployee,
} from '../../lib/remote';
import { ModalShell } from '../ui/ModalShell';

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Org employees for the User ↔ Employee link select. */
  employees: RemoteEmployee[];
  currentUserId: string;
  onChanged: () => void;
}

const ROLES: RemoteMember['role'][] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];

/**
 * Minimal B2B membership management (ADMIN only, Fase 1.1 PASO 9).
 * No email invitations: for a new email the ADMIN sets an initial password
 * and hands it over out-of-band. Documented limitation.
 */
export const MembersModal = ({ isOpen, onClose, employees, currentUserId, onChanged }: MembersModalProps) => {
  const { t } = useI18n();
  const [members, setMembers] = useState<RemoteMember[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<RemoteMember['role']>('EMPLOYEE');
  const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const reload = useCallback(async () => {
    try {
      setMembers(await listRemoteMembers());
    } catch {
      setError(t('members.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      void reload();
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
      setError(err instanceof Error ? err.message : t('members.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await addRemoteMember({
        email,
        role,
        displayName: displayName || undefined,
        password: password || undefined,
        employeeId: employeeId || undefined,
      });
      setEmail('');
      setDisplayName('');
      setPassword('');
      setEmployeeId('');
      setRole('EMPLOYEE');
    });
  };

  const unlinkedEmployees = employees.filter(
    (employee) => employee.status === 'active' && !employee.userId,
  );

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('members.title')} maxWidth="560px">
      <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
        {members.map((member) => (
          <div
            key={member.userId}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
              border: '1px solid var(--glass-border)', borderRadius: '12px',
              padding: '10px 12px', background: 'var(--panel-muted-bg)', fontSize: '0.85rem',
            }}
          >
            <span style={{ fontWeight: 700, flex: 1, minWidth: '140px' }}>
              {member.displayName || member.email}
              <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> · {member.email}</span>
            </span>
            <select
              className="modal-input"
              value={member.role}
              disabled={busy || member.userId === currentUserId}
              aria-label={t('members.roleLabel')}
              onChange={(event) => void run(() => updateRemoteMemberRole(member.userId, event.target.value as RemoteMember['role']))}
              style={{ padding: '6px 10px' }}
            >
              {ROLES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {member.userId !== currentUserId && (
              <button
                type="button"
                className="btn-outline"
                disabled={busy}
                onClick={() => void run(() => removeRemoteMember(member.userId))}
                style={{ padding: '6px 10px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                {t('members.remove')}
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} style={{ display: 'grid', gap: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
        <strong style={{ fontSize: '0.9rem' }}>{t('members.addTitle')}</strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <input className="modal-input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('members.emailPlaceholder')} aria-label={t('auth.emailLabel')} style={{ padding: '10px 12px' }} />
          <input className="modal-input" type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t('members.namePlaceholder')} aria-label={t('auth.nameLabel')} style={{ padding: '10px 12px' }} />
          <select className="modal-input" value={role} onChange={(event) => setRole(event.target.value as RemoteMember['role'])} aria-label={t('members.roleLabel')} style={{ padding: '10px 12px' }}>
            {ROLES.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <input className="modal-input" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('members.passwordPlaceholder')} aria-label={t('auth.passwordLabel')} style={{ padding: '10px 12px' }} />
        </div>
        <select className="modal-input" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} aria-label={t('members.linkEmployeeLabel')} style={{ padding: '10px 12px' }}>
          <option value="">{t('members.noLink')}</option>
          {unlinkedEmployees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.name}</option>
          ))}
        </select>
        <p style={{ margin: 0, color: 'var(--text-subtle)', fontSize: '0.78rem', lineHeight: 1.5 }}>
          {t('members.passwordHint')}
        </p>
        {error && <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
        <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '10px 14px', fontWeight: 800, justifySelf: 'end' }}>
          {busy ? t('auth.working') : t('members.addAction')}
        </button>
      </form>
    </ModalShell>
  );
};

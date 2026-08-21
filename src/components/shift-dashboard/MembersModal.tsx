import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import {
  addRemoteMember,
  createRemoteEmployee,
  deleteRemoteEmployee,
  listRemoteMembers,
  RemoteMember,
  removeRemoteMember,
  updateRemoteMemberRole,
  updateRemoteEmployee,
  RemoteEmployee,
} from '../../lib/remote';
import { EmployeeCsvRow, parseEmployeesCsv, parseUsersCsv, UserCsvRow } from '../../lib/bulk-import-csv';
import { ModalShell } from '../ui/ModalShell';
import { UpgradePrompt } from './UpgradePrompt';
import { ApiError, PlanId } from '../../lib/session';

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Org employees for the User ↔ Employee link select and the Employees tab. */
  employees: RemoteEmployee[];
  currentUserId: string;
  onChanged: () => void;
  currentPlan?: PlanId | null;
  switchTarget?: { id: string; name: string } | null;
  onSwitchOrg?: (organizationId: string) => void;
}

const ROLES: RemoteMember['role'][] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
type Tab = 'users' | 'employees';

interface EmployeePreviewRow {
  row: EmployeeCsvRow;
  status: 'existing' | 'new' | 'error';
  matchedId?: string;
}

interface UserPreviewRow {
  row: UserCsvRow;
  status: 'existing' | 'new' | 'error';
}

/**
 * B2B organization management (ADMIN only, Fase 1.1 PASO 9 + bulk import).
 * Two tabs — Usuarios (accounts/roles/memberships) and Empleados (roster
 * people, may exist without a User) — kept conceptually separate per the
 * User vs Employee split; never mixed in the same write path.
 *
 * No email invitations: for a brand-new email (single add or bulk CSV) the
 * server generates a random temporary password when none is supplied and
 * returns it once — shown here for the ADMIN to hand over out-of-band.
 * Never logged, never persisted in plaintext, never re-fetchable.
 */
export const MembersModal = ({ isOpen, onClose, employees, currentUserId, onChanged, currentPlan = null, switchTarget = null, onSwitchOrg }: MembersModalProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('users');
  const [members, setMembers] = useState<RemoteMember[]>([]);
  const [error, setError] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);

  // Manual "add user" form.
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<RemoteMember['role']>('EMPLOYEE');
  const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [lastTemporaryPassword, setLastTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Manual "add employee" form.
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeExternalId, setNewEmployeeExternalId] = useState('');

  // Employee lifecycle (Bloque D): per-row contextual menu + inline edit.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editExternalId, setEditExternalId] = useState('');

  // Bulk Users CSV.
  const usersFileRef = useRef<HTMLInputElement>(null);
  const [usersPreview, setUsersPreview] = useState<UserPreviewRow[] | null>(null);
  const [usersImporting, setUsersImporting] = useState(false);
  const [usersResult, setUsersResult] = useState<{ created: { email: string; password: string }[]; failed: number } | null>(null);
  const [usersCsvError, setUsersCsvError] = useState('');

  // Bulk Employees CSV.
  const employeesFileRef = useRef<HTMLInputElement>(null);
  const [employeesPreview, setEmployeesPreview] = useState<EmployeePreviewRow[] | null>(null);
  const [employeesImporting, setEmployeesImporting] = useState(false);
  const [employeesResult, setEmployeesResult] = useState<{ created: number; updated: number; failed: number } | null>(null);
  const [employeesCsvError, setEmployeesCsvError] = useState('');

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
      setLastTemporaryPassword(null);
      void reload();
    } else {
      // Never keep a shown-once secret around after the modal closes.
      setLastTemporaryPassword(null);
      setUsersPreview(null);
      setUsersResult(null);
      setEmployeesPreview(null);
      setEmployeesResult(null);
      setOpenMenuId(null);
      setEditingEmployeeId(null);
    }
  }, [isOpen, reload]);

  // Contextual employee menu: closes on ESC or any pointer-down outside it.
  useEffect(() => {
    if (!openMenuId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement && event.target.closest('[data-employee-menu]'))) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [openMenuId]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        setShowUpgrade(true);
      } else {
        setError(err instanceof Error ? err.message : t('members.actionFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    setLastTemporaryPassword(null);
    void run(async () => {
      const created = await addRemoteMember({
        email,
        role,
        displayName: displayName || undefined,
        password: password || undefined,
        employeeId: employeeId || undefined,
      });
      if (created.temporaryPassword) {
        setLastTemporaryPassword({ email: created.email, password: created.temporaryPassword });
      }
      setEmail('');
      setDisplayName('');
      setPassword('');
      setEmployeeId('');
      setRole('EMPLOYEE');
    });
  };

  const handleAddEmployee = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await createRemoteEmployee({
        name: newEmployeeName,
        externalEmployeeId: newEmployeeExternalId || undefined,
      });
      setNewEmployeeName('');
      setNewEmployeeExternalId('');
    });
  };

  // ------------------------------------------------------ employee lifecycle

  const startEditEmployee = (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    setEditingEmployeeId(employee.id);
    setEditName(employee.name);
    setEditExternalId(employee.externalEmployeeId ?? '');
  };

  const handleEditEmployeeSave = (employee: RemoteEmployee, event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      // status carried through explicitly: the PATCH default would force an
      // inactive employee back to 'active' when status is omitted.
      await updateRemoteEmployee({
        id: employee.id,
        name: editName.trim(),
        externalEmployeeId: editExternalId.trim(),
        status: employee.status,
      });
      setEditingEmployeeId(null);
    });
  };

  const handleDeactivateEmployee = (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    if (!window.confirm(t('members.deactivateConfirm', { name: employee.name }))) {
      return;
    }
    // On 400 LAST_ADMIN (and any other rejection) run() surfaces the server
    // message in the modal's error area.
    void run(() => updateRemoteEmployee({ id: employee.id, status: 'inactive' }));
  };

  const handleReactivateEmployee = (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    void run(() => updateRemoteEmployee({ id: employee.id, status: 'active' }));
  };

  const handleDeleteEmployee = async (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    if (!window.confirm(t('members.deleteConfirm', { name: employee.name }))) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteRemoteEmployee(employee.id);
      await reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMPLOYEE_HAS_HISTORY') {
        // History is never destroyed: explain and offer deactivation instead.
        setError(err.message);
        if (window.confirm(t('members.hasHistoryDeactivateOffer'))) {
          try {
            await updateRemoteEmployee({ id: employee.id, status: 'inactive' });
            setError('');
            await reload();
            onChanged();
          } catch (fallbackErr) {
            setError(fallbackErr instanceof Error ? fallbackErr.message : t('members.actionFailed'));
          }
        }
      } else {
        setError(err instanceof Error ? err.message : t('members.actionFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const copyToClipboard = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      // Clipboard API unavailable (permissions/context) — the value is still
      // visible on screen for manual copy, nothing else to do.
    }
  };

  const unlinkedEmployees = employees.filter(
    (employee) => employee.status === 'active' && !employee.userId,
  );

  // ---------------------------------------------------------- Employees CSV

  const handleEmployeesFile = async (file: File) => {
    setEmployeesCsvError('');
    setEmployeesResult(null);
    const rows = parseEmployeesCsv(await file.text());
    if (!rows) {
      setEmployeesCsvError(t('members.csvParseError'));
      return;
    }
    const byExternalId = new Map(employees.map((employee) => [employee.externalEmployeeId ?? '', employee]));
    setEmployeesPreview(rows.map((row) => {
      if (!row.externalEmployeeId) {
        return { row, status: 'error' };
      }
      const match = byExternalId.get(row.externalEmployeeId);
      return match ? { row, status: 'existing', matchedId: match.id } : { row, status: 'new' };
    }));
  };

  const handleEmployeesConfirm = async () => {
    if (!employeesPreview) {
      return;
    }
    setEmployeesImporting(true);
    let created = 0;
    let updated = 0;
    let failed = 0;
    let hitPlanLimit = false;

    for (const entry of employeesPreview) {
      if (entry.status === 'error') {
        failed += 1;
        continue;
      }
      try {
        if (entry.status === 'new') {
          if (hitPlanLimit) {
            failed += 1;
            continue;
          }
          await createRemoteEmployee({ name: entry.row.name, externalEmployeeId: entry.row.externalEmployeeId });
          created += 1;
        } else {
          const current = employees.find((employee) => employee.id === entry.matchedId);
          if (current && current.name !== entry.row.name) {
            await updateRemoteEmployee({ id: current.id, name: entry.row.name, status: current.status });
            updated += 1;
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
          hitPlanLimit = true;
        }
        failed += 1;
      }
    }

    setEmployeesResult({ created, updated, failed });
    setEmployeesImporting(false);
    if (hitPlanLimit) {
      setShowUpgrade(true);
    }
    onChanged();
  };

  // -------------------------------------------------------------- Users CSV

  const handleUsersFile = async (file: File) => {
    setUsersCsvError('');
    setUsersResult(null);
    const rows = parseUsersCsv(await file.text());
    if (!rows) {
      setUsersCsvError(t('members.csvParseError'));
      return;
    }
    const existingEmails = new Set(members.map((member) => member.email.toLowerCase()));
    setUsersPreview(rows.map((row) => {
      if (row.rowError) {
        return { row, status: 'error' };
      }
      return { row, status: existingEmails.has(row.email) ? 'existing' : 'new' };
    }));
  };

  const handleUsersConfirm = async () => {
    if (!usersPreview) {
      return;
    }
    setUsersImporting(true);
    const created: { email: string; password: string }[] = [];
    let failed = 0;
    let hitPlanLimit = false;

    for (const entry of usersPreview) {
      if (entry.status !== 'new') {
        if (entry.status === 'error') {
          failed += 1;
        }
        continue;
      }
      if (hitPlanLimit) {
        failed += 1;
        continue;
      }
      try {
        const linkedEmployee = entry.row.externalEmployeeId
          ? employees.find((employee) => employee.externalEmployeeId === entry.row.externalEmployeeId)
          : undefined;
        const result = await addRemoteMember({
          email: entry.row.email,
          role: entry.row.role as RemoteMember['role'],
          displayName: entry.row.name || undefined,
          employeeId: linkedEmployee?.id,
        });
        created.push({ email: result.email, password: result.temporaryPassword ?? '' });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
          hitPlanLimit = true;
        }
        failed += 1;
      }
    }

    setUsersResult({ created, failed });
    setUsersImporting(false);
    if (hitPlanLimit) {
      setShowUpgrade(true);
    }
    onChanged();
    void reload();
  };

  const statusLabelKey: Record<'existing' | 'new' | 'error', string> = {
    existing: 'members.previewStatusExisting',
    new: 'members.previewStatusNew',
    error: 'members.previewStatusError',
  };

  return (
    <>
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('members.title')} maxWidth="620px">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)' }}>
        {(['users', 'employees'] as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            style={{
              padding: '8px 4px',
              marginBottom: '-1px',
              background: 'none',
              border: 'none',
              borderBottom: tab === option ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: tab === option ? 'var(--color-accent)' : 'var(--text-subtle)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t(option === 'users' ? 'members.tabUsers' : 'members.tabEmployees')}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
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

          {lastTemporaryPassword && (
            <div
              role="status"
              style={{
                display: 'grid', gap: '6px', marginBottom: '16px', padding: '10px 12px',
                borderRadius: '12px', border: '1px solid var(--color-gold)', background: 'var(--gold-tint-bg)',
                fontSize: '0.82rem',
              }}
            >
              <strong>{t('members.temporaryPasswordTitle')}</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <code>{lastTemporaryPassword.email}: {lastTemporaryPassword.password}</code>
                <button type="button" className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => void copyToClipboard('single', lastTemporaryPassword.password)}>
                  {copiedKey === 'single' ? t('members.copied') : t('members.copyAction')}
                </button>
              </div>
              <span style={{ color: 'var(--text-subtle)' }}>{t('members.temporaryPasswordNote')}</span>
            </div>
          )}

          <form onSubmit={handleAdd} style={{ display: 'grid', gap: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '14px', marginBottom: '18px' }}>
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

          {!usersPreview && !usersResult && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>{t('members.csvUploadHint')}</p>
              <input
                ref={usersFileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUsersFile(file);
                  }
                  event.target.value = '';
                }}
              />
              <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => usersFileRef.current?.click()}>
                {t('members.importUsersCsv')}
              </button>
              {usersCsvError && <p role="alert" style={{ margin: '8px 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>{usersCsvError}</p>}
            </div>
          )}

          {usersPreview && !usersResult && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px', display: 'grid', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>
                {t('members.usersPreviewSummary', {
                  total: usersPreview.length,
                  existing: usersPreview.filter((entry) => entry.status === 'existing').length,
                  new: usersPreview.filter((entry) => entry.status === 'new').length,
                  errors: usersPreview.filter((entry) => entry.status === 'error').length,
                })}
              </p>
              <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'grid', gap: '4px' }}>
                {usersPreview.map((entry, index) => (
                  <div key={`${entry.row.email}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem', padding: '4px 0' }}>
                    <span>{entry.row.email || '—'}{entry.row.role ? ` · ${entry.row.role}` : ''}</span>
                    <span>
                      {entry.status === 'error'
                        ? t(entry.row.rowError === 'missingEmail' ? 'members.rowErrorMissingEmail' : 'members.rowErrorInvalidRole')
                        : t(statusLabelKey[entry.status])}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => { setUsersPreview(null); setUsersCsvError(''); }}>
                  {t('members.csvBack')}
                </button>
                <button type="button" className="btn-gold" disabled={usersImporting} style={{ padding: '8px 14px', fontWeight: 800 }} onClick={() => void handleUsersConfirm()}>
                  {usersImporting ? t('members.csvImporting') : t('members.csvConfirm')}
                </button>
              </div>
            </div>
          )}

          {usersResult && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px', display: 'grid', gap: '10px' }}>
              <strong style={{ fontSize: '0.9rem' }}>{t('members.usersResultTitle')}</strong>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                {t('members.usersResultCreated')}: {usersResult.created.length} · {t('members.usersResultFailed')}: {usersResult.failed}
              </p>
              {usersResult.created.length > 0 && (
                <div style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>{t('members.temporaryPasswordNote')}</span>
                  {usersResult.created.map((entry) => (
                    <div key={entry.email} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                      <code>{entry.email}: {entry.password}</code>
                      <button type="button" className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => void copyToClipboard(entry.email, entry.password)}>
                        {copiedKey === entry.email ? t('members.copied') : t('members.copyAction')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700, justifySelf: 'end' }} onClick={() => { setUsersResult(null); setUsersPreview(null); }}>
                {t('members.csvClose')}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'employees' && (
        <>
          <div style={{ display: 'grid', gap: '8px', marginBottom: '18px', maxHeight: '220px', overflowY: 'auto' }}>
            {employees.map((employee) => (
              <div
                key={employee.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                  border: '1px solid var(--glass-border)', borderRadius: '12px',
                  padding: '10px 12px', background: 'var(--panel-muted-bg)', fontSize: '0.85rem',
                }}
              >
                {editingEmployeeId === employee.id ? (
                  <form onSubmit={(event) => handleEditEmployeeSave(employee, event)} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                    <input
                      className="modal-input"
                      type="text"
                      required
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      placeholder={t('members.employeeNamePlaceholder')}
                      aria-label={t('members.employeeNamePlaceholder')}
                      style={{ padding: '6px 10px', flex: 1, minWidth: '140px' }}
                    />
                    <input
                      className="modal-input"
                      type="text"
                      value={editExternalId}
                      onChange={(event) => setEditExternalId(event.target.value)}
                      placeholder={t('members.employeeIdPlaceholder')}
                      aria-label={t('members.employeeIdPlaceholder')}
                      style={{ padding: '6px 10px', width: '140px' }}
                    />
                    <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '6px 10px', fontWeight: 800 }}>
                      {t('common.save')}
                    </button>
                    <button type="button" className="btn-outline" disabled={busy} onClick={() => setEditingEmployeeId(null)} style={{ padding: '6px 10px', fontWeight: 700 }}>
                      {t('common.cancel')}
                    </button>
                  </form>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, flex: 1 }}>
                      {employee.name}
                      {employee.externalEmployeeId && <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> · ID {employee.externalEmployeeId}</span>}
                    </span>
                    <span className={`status-badge ${employee.status === 'active' ? 'status-badge--active' : 'status-badge--inactive'}`}>
                      {t(employee.status === 'active' ? 'members.statusActive' : 'members.statusInactive')}
                    </span>
                    {!employee.userId && <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{t('members.noLink')}</span>}
                    <div className="employee-menu" data-employee-menu>
                      <button
                        type="button"
                        className="btn-outline"
                        disabled={busy}
                        aria-label={t('members.rowMenuAria', { name: employee.name })}
                        aria-expanded={openMenuId === employee.id}
                        onClick={() => setOpenMenuId((current) => (current === employee.id ? null : employee.id))}
                        style={{ padding: '4px 10px', fontWeight: 700 }}
                      >
                        ⋮
                      </button>
                      {openMenuId === employee.id && (
                        <div className="employee-menu-list" role="menu">
                          <button type="button" role="menuitem" className="employee-menu-item" onClick={() => startEditEmployee(employee)}>
                            {t('common.edit')}
                          </button>
                          {employee.status === 'active' ? (
                            <button type="button" role="menuitem" className="employee-menu-item" onClick={() => handleDeactivateEmployee(employee)}>
                              {t('members.deactivateAction')}
                            </button>
                          ) : (
                            <button type="button" role="menuitem" className="employee-menu-item" onClick={() => handleReactivateEmployee(employee)}>
                              {t('members.reactivateAction')}
                            </button>
                          )}
                          <button type="button" role="menuitem" className="employee-menu-item employee-menu-item--danger" onClick={() => void handleDeleteEmployee(employee)}>
                            {t('members.deleteAction')}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {error && <p role="alert" style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}

          <form onSubmit={handleAddEmployee} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid var(--glass-border)', paddingTop: '14px', marginBottom: '18px', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', flex: 1, minWidth: '160px' }}>
              {t('members.addEmployeeTitle')}
              <input className="modal-input" type="text" required value={newEmployeeName} onChange={(event) => setNewEmployeeName(event.target.value)} placeholder={t('members.employeeNamePlaceholder')} style={{ padding: '10px 12px' }} />
            </label>
            <input className="modal-input" type="text" value={newEmployeeExternalId} onChange={(event) => setNewEmployeeExternalId(event.target.value)} placeholder={t('members.employeeIdPlaceholder')} style={{ padding: '10px 12px', width: '160px' }} />
            <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '10px 14px', fontWeight: 800 }}>
              {busy ? t('auth.working') : t('members.addEmployeeAction')}
            </button>
          </form>

          {!employeesPreview && !employeesResult && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>{t('members.csvUploadHint')}</p>
              <input
                ref={employeesFileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleEmployeesFile(file);
                  }
                  event.target.value = '';
                }}
              />
              <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => employeesFileRef.current?.click()}>
                {t('members.importEmployeesCsv')}
              </button>
              {employeesCsvError && <p role="alert" style={{ margin: '8px 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>{employeesCsvError}</p>}
            </div>
          )}

          {employeesPreview && !employeesResult && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px', display: 'grid', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>
                {t('members.employeesPreviewSummary', {
                  total: employeesPreview.length,
                  existing: employeesPreview.filter((entry) => entry.status === 'existing').length,
                  new: employeesPreview.filter((entry) => entry.status === 'new').length,
                  errors: employeesPreview.filter((entry) => entry.status === 'error').length,
                })}
              </p>
              <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'grid', gap: '4px' }}>
                {employeesPreview.map((entry, index) => (
                  <div key={`${entry.row.externalEmployeeId}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem', padding: '4px 0' }}>
                    <span>{entry.row.name || '—'}{entry.row.externalEmployeeId ? ` · ID ${entry.row.externalEmployeeId}` : ''}</span>
                    <span>{t(statusLabelKey[entry.status])}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => { setEmployeesPreview(null); setEmployeesCsvError(''); }}>
                  {t('members.csvBack')}
                </button>
                <button type="button" className="btn-gold" disabled={employeesImporting} style={{ padding: '8px 14px', fontWeight: 800 }} onClick={() => void handleEmployeesConfirm()}>
                  {employeesImporting ? t('members.csvImporting') : t('members.csvConfirm')}
                </button>
              </div>
            </div>
          )}

          {employeesResult && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px', display: 'grid', gap: '10px' }}>
              <strong style={{ fontSize: '0.9rem' }}>{t('members.employeesResultTitle')}</strong>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                {t('members.employeesResultCreated')}: {employeesResult.created} · {t('members.employeesResultUpdated')}: {employeesResult.updated} · {t('members.employeesResultFailed')}: {employeesResult.failed}
              </p>
              <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700, justifySelf: 'end' }} onClick={() => { setEmployeesResult(null); setEmployeesPreview(null); }}>
                {t('members.csvClose')}
              </button>
            </div>
          )}
        </>
      )}
    </ModalShell>
    <UpgradePrompt
      isOpen={showUpgrade}
      onClose={() => setShowUpgrade(false)}
      currentPlan={currentPlan}
      switchTarget={switchTarget}
      onSwitchOrg={onSwitchOrg}
    />
    </>
  );
};

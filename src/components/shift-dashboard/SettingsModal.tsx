import { useState, useEffect, useCallback } from 'react';
import { Settings, X, User, Users } from 'lucide-react';
import { DEFAULT_USER_PROFILE, loadUserProfile, saveUserProfile, UserProfile } from '../../lib/profile';
import {
  DEFAULT_SHIFT_TYPES,
  ShiftTypeDefinition,
  deleteCustomShiftType,
  getAllShiftTypesForManagement,
  setShiftTypeArchived,
  upsertShiftType,
} from '../../lib/shift-types';
import { translateShiftTypeLabel } from '../../lib/i18n';
import { useI18n } from '../../lib/use-i18n';
import { TIMEZONE_OPTIONS, getTimezoneLabel } from '../../lib/timezones';
import { useEscapeClose } from '../../lib/use-escape-close';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ModalShell } from '../ui/ModalShell';
import { SessionInfo } from '../../lib/session';
import { RemoteEmployee } from '../../lib/remote';
import { resetOrganization, updateUserDisplayName, updateOwnEmployeeName } from '../../lib/remote';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Replays the first-run guide (resets the onboarding record and opens it). */
  onRestartOnboarding?: () => void;
  /** Current authenticated session. */
  session: { user: { id: string; email: string; displayName: string }; role: SessionInfo['role']; employeeId: string | null; organizationId: string | null; memberships: SessionInfo['memberships'] } | null;
  /** Org employees for employee selector (ADMIN). */
  employees?: RemoteEmployee[];
  /** Selected employee in team bar (ADMIN). */
  selectedEmployeeId?: string | null;
  /** Callback when employee name changes (to refresh header). */
  onEmployeeNameChange?: () => void;
  /** Opens the members management modal (closes settings first). */
  onOpenMembers?: () => void;
  /** Callback when the account display name changes (to refresh session). */
  onAccountNameChange?: () => void;
  /** Callback after a successful organization reset (reload org data). */
  onOrganizationReset?: () => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 700,
  marginBottom: 'var(--space-xs)',
  textTransform: 'uppercase',
  color: 'var(--color-accent)',
};

const NEW_TYPE_DRAFT = { id: '', label: '', shortLabel: '', color: '#3b82f6', countsAsWork: true };

type Tab = 'profile' | 'team' | 'shiftTypes';

function getAvailableTabs(session: SettingsModalProps['session']): Tab[] {
  if (!session) return ['profile'];
  
  const { role } = session;
  
  if (role === 'EMPLOYEE') {
    return ['profile'];
  }
  
  // ADMIN - team tab available for all organizations (no personal/company distinction)
  const tabs: Tab[] = ['profile', 'team'];
  
  tabs.push('shiftTypes');
  
  return tabs;
}

function ProfileSection({
  session,
  employee,
  userProfile,
  onSaveProfile,
  onRestartOnboarding,
  onEmployeeNameChange,
  onAccountNameChange,
}: {
  session: SettingsModalProps['session'];
  employee: RemoteEmployee | null;
  userProfile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
  onRestartOnboarding?: () => void;
  onEmployeeNameChange: () => void;
  onAccountNameChange?: () => void;
}) {
  const { t, locale } = useI18n();
  // Role and employee-linkage are independent dimensions: an ADMIN
  // without a linked employee manages account data only; the employee
  // identity UI appears exclusively when the session has an employee.
  const hasEmployee = Boolean(session?.employeeId);
  const [name, setName] = useState(employee?.name ?? '');
  const [accountName, setAccountName] = useState(session?.user.displayName ?? '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [identifiersText, setIdentifiersText] = useState(() => userProfile.employeeIdentifiers.join(', '));
  const [timezone, setTimezone] = useState(userProfile.timezone);

  const handleSaveName = async () => {
    if (!name.trim() || !employee) return;
    setSaving(true);
    try {
      await updateOwnEmployeeName(name.trim());
      onEmployeeNameChange();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to update employee name', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!session) return;
    const trimmed = accountName.trim();
    if (!trimmed || trimmed === session.user.displayName) return;
    setAccountSaving(true);
    setAccountError('');
    try {
      await updateUserDisplayName(trimmed);
      onAccountNameChange?.();
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch (error) {
      console.error('Failed to update account name', error);
      setAccountError(t('settings.accountNameSaveError'));
    } finally {
      setAccountSaving(false);
    }
  };

  const handleSaveProfile = () => {
    const next: UserProfile = {
      ...userProfile,
      employeeIdentifiers: identifiersText.split(',').map((value) => value.trim()).filter(Boolean),
      timezone,
    };
    onSaveProfile(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const roleLine = session && (
    <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', fontSize: '0.85rem' }}>
      <span style={{ color: 'var(--text-subtle)', minWidth: '140px' }}>{t('settings.yourRole')}</span>
      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{t(`role.${(session.role ?? '').toLowerCase()}`)}</span>
    </div>
  );

  const restartOnboardingBlock = onRestartOnboarding && (
    <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-sm)' }}>
      <button className="btn-outline" style={{ padding: '8px 14px', minHeight: 'auto' }} onClick={onRestartOnboarding}>
        {t('onboarding.restart')}
      </button>
    </div>
  );

  const importPrefsBlock = (
    <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-sm)' }}>
      <h3 style={{ margin: '0 0 var(--space-xs)', fontSize: '0.9rem', fontWeight: 700 }}>{t('settings.importPrefsTitle')}</h3>
      <p style={{ margin: '0 0 var(--space-xs)', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
        {t('settings.importPrefsDesc')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <div>
          <label style={labelStyle}>{t('settings.identifiers')}</label>
          <input
            className="modal-input"
            value={identifiersText}
            placeholder={t('settings.identifiersPlaceholder')}
            onChange={(e) => setIdentifiersText(e.target.value)}
          />
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            {t('settings.identifiersHint')}
          </p>
        </div>
        <div>
          <SearchableSelect
            label={t('settings.timezone')}
            value={timezone}
            onChange={setTimezone}
            searchPlaceholder={t('settings.searchPlaceholder')}
            emptyMessage={t('settings.noTimezones')}
            ariaLabel={t('settings.timezone')}
            options={(() => {
              const baseOptions = TIMEZONE_OPTIONS.map((option) => ({
                value: option.id,
                label: getTimezoneLabel(option.id, locale),
                searchText: `${option.id} ${getTimezoneLabel(option.id, locale)}`.toLowerCase(),
              }));
              const currentValue = timezone;
              const hasCurrent = baseOptions.some((opt) => opt.value === currentValue);
              if (!hasCurrent && currentValue) {
                return [
                  { value: currentValue, label: currentValue, searchText: currentValue.toLowerCase() },
                  ...baseOptions,
                ];
              }
              return baseOptions;
            })()}
          />
        </div>
        <button className="btn-gold" style={{ alignSelf: 'flex-start', width: 'fit-content' }} onClick={handleSaveProfile}>
          {saved ? t('settings.saved') : t('settings.saveImportPrefs')}
        </button>
      </div>
    </div>
  );

  // Authenticated user WITHOUT a linked employee (ADMIN): account
  // data only — nothing employee-related is rendered in this case.
  if (session && !hasEmployee) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <div style={{
          padding: 'var(--space-md)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--info-bg)',
          border: '1px solid var(--info-border)',
          fontSize: '0.8rem',
          color: 'var(--color-accent)'
        }}>
          <strong>{t('settings.nameSectionTitle')}</strong>
          <p style={{ margin: 'var(--space-xs) 0 0' }}>{t('settings.nameSectionDesc')}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <div>
            <label style={labelStyle}>{t('settings.accountDisplayName')}</label>
            <input
              className="modal-input"
              value={accountName}
              placeholder={t('settings.accountDisplayNamePlaceholder')}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={accountSaving}
            />
          </div>
          {roleLine}
          <div>
            <button
              className="btn-gold"
              style={{ width: 'fit-content' }}
              onClick={handleSaveAccount}
              disabled={accountSaving || !accountName.trim() || accountName.trim() === session.user.displayName}
            >
              {accountSaving ? t('auth.working') : accountSaved ? t('settings.saved') : t('settings.saveChanges')}
            </button>
            {accountError && <p role="alert" style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--danger)' }}>{accountError}</p>}
          </div>
        </div>

        {restartOnboardingBlock}
      </div>
    );
  }

  // Authenticated user WITH a linked employee (any role): the profile is the
  // employee identity. The account displayName stays internal-only here.
  if (session && hasEmployee) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <div>
            <label style={labelStyle}>{t('settings.employeeName')}</label>
            <input
              className="modal-input"
              value={name}
              placeholder={t('settings.yourNamePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              {t('settings.nameEmployeeHint')}
            </p>
          </div>
          {employee?.externalEmployeeId && (
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-subtle)', minWidth: '140px' }}>{t('settings.employeeIds')}</span>
              <span style={{ fontWeight: 600 }}>{employee.externalEmployeeId}</span>
            </div>
          )}
          {roleLine}
          <div>
            <button
              className="btn-gold"
              style={{ width: 'fit-content' }}
              onClick={handleSaveName}
              disabled={saving || !name.trim() || name === employee?.name}
              aria-busy={saving}
            >
              {saving ? t('auth.working') : saved ? t('settings.saved') : t('settings.saveName')}
            </button>
          </div>
        </div>

        {importPrefsBlock}
        {restartOnboardingBlock}
      </div>
    );
  }

  // Guest (local-first, no session): import preferences only.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {importPrefsBlock}
      {restartOnboardingBlock}
    </div>
  );
}

function TeamSection({
  session,
  employees,
  selectedEmployeeId,
  onOpenMembers,
  onOrganizationReset,
}: {
  session: SettingsModalProps['session'];
  employees: RemoteEmployee[];
  selectedEmployeeId: string | null;
  onOpenMembers?: () => void;
  onOrganizationReset?: () => void;
}) {
  const { t } = useI18n();
  const activeMembership = session?.memberships.find(m => m.organizationId === session.organizationId);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

  const closeResetModal = () => {
    setIsResetOpen(false);
    setResetConfirmText('');
    setResetError('');
  };

  const handleResetConfirm = async () => {
    setResetBusy(true);
    setResetError('');
    try {
      await resetOrganization();
      closeResetModal();
      onOrganizationReset?.();
    } catch (error) {
      setResetError(error instanceof Error ? error.message : t('settings.resetFailed'));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{
        padding: 'var(--space-md)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--info-bg)',
        border: '1px solid var(--info-border)',
        fontSize: '0.8rem',
        color: 'var(--color-accent)'
      }}>
        <strong>{t('settings.teamSectionTitle')}</strong>
        <p style={{ margin: 'var(--space-xs) 0 0' }}>{t('settings.teamSectionDesc')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{t('settings.organizationInfo')}</h3>
        <div style={{ display: 'grid', gap: 'var(--space-sm)', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-subtle)', minWidth: '140px' }}>{t('settings.orgName')}</span>
            <span style={{ fontWeight: 600 }}>{activeMembership?.organizationName}</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-subtle)', minWidth: '140px' }}>{t('settings.yourRole')}</span>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{t(`role.${(session?.role ?? '').toLowerCase()}`)}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)' }}>
          <h3 style={{ margin: '0 0 var(--space-sm)', fontSize: '0.9rem', fontWeight: 700 }}>{t('settings.teamManagement')}</h3>
          <p style={{ margin: '0 0 var(--space-md)', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
            {t('settings.teamManagementDesc')}
          </p>
          <button className="btn-gold" style={{ width: 'fit-content' }} onClick={onOpenMembers}>
            {t('settings.openMembers')}
          </button>
        </div>

        {/* Selector de empleado activo (para ADMIN ver otros empleados) */}
        {employees.length > 1 && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)' }}>
            <h3 style={{ margin: '0 0 var(--space-sm)', fontSize: '0.9rem', fontWeight: 700 }}>{t('settings.activeEmployee')}</h3>
            <p style={{ margin: '0 0 var(--space-md)', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
              {t('settings.activeEmployeeDesc')}
            </p>
            <SearchableSelect
              label={t('team.employeeLabel')}
              value={selectedEmployeeId ?? ''}
              onChange={(employeeId) => {
                window.dispatchEvent(new CustomEvent('anclora:select-employee', { detail: employeeId }));
              }}
              searchPlaceholder={t('employeeSelect.searchPlaceholder')}
              emptyMessage={employees.length === 0 ? t('employeeSelect.noEmployees') : t('employeeSelect.noResults')}
              ariaLabel={t('team.employeeLabel')}
              options={employees
                .filter((employee) => employee.status === 'active')
                .map((employee) => ({
                  value: employee.id,
                  label: employee.externalEmployeeId
                    ? `${employee.name} · ID ${employee.externalEmployeeId}`
                    : employee.name,
                  searchText: `${employee.name} ${employee.externalEmployeeId ?? ''}`.toLowerCase(),
                }))}
              style={{ width: '100%', maxWidth: '320px' }}
            />
          </div>
        )}

        {session?.role === 'ADMIN' && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)' }}>
            <h3 style={{ margin: '0 0 var(--space-sm)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--danger)' }}>{t('settings.dangerZoneTitle')}</h3>
            <p style={{ margin: '0 0 var(--space-md)', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
              {t('settings.resetDesc')}
            </p>
            <button
              className="btn-outline"
              style={{ width: 'fit-content', padding: '8px 14px', minHeight: 'auto', borderColor: 'var(--danger-border)', color: 'var(--danger)' }}
              onClick={() => setIsResetOpen(true)}
            >
              {t('settings.resetAction')}
            </button>
          </div>
        )}
      </div>
    </div>

    <ModalShell
      isOpen={isResetOpen}
      onClose={closeResetModal}
      title={t('settings.resetModalTitle')}
      blocking
      closeAriaLabel={t('common.close')}
      footer={
        <>
          <button
            type="button"
            className="btn-outline"
            onClick={closeResetModal}
            disabled={resetBusy}
            style={{ padding: '10px 14px', fontWeight: 700 }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => void handleResetConfirm()}
            disabled={resetBusy || resetConfirmText !== t('settings.resetConfirmWord')}
            style={{ padding: '10px 14px', fontWeight: 800, borderColor: 'var(--danger-border)', color: 'var(--danger)' }}
          >
            {resetBusy ? t('auth.working') : t('settings.resetConfirmAction')}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--space-md)', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {t('settings.resetModalWarning')}
      </p>
      <label style={labelStyle}>{t('settings.resetConfirmLabel')}</label>
      <input
        className="modal-input"
        value={resetConfirmText}
        placeholder={t('settings.resetConfirmWord')}
        onChange={(event) => setResetConfirmText(event.target.value)}
        disabled={resetBusy}
      />
      {resetError && <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--danger)' }}>{resetError}</p>}
    </ModalShell>
    </>
  );
}

function ShiftTypesSection() {
  const { locale, t } = useI18n();
  const [types, setTypes] = useState<ShiftTypeDefinition[]>(() => getAllShiftTypesForManagement());
  const [draft, setDraft] = useState(NEW_TYPE_DRAFT);
  const [error, setError] = useState('');

  const refresh = () => setTypes(getAllShiftTypesForManagement());

  const handleUpdate = (type: ShiftTypeDefinition, patch: Partial<ShiftTypeDefinition>) => {
    upsertShiftType({ ...type, ...patch });
    refresh();
  };

  const handleArchiveToggle = (type: ShiftTypeDefinition) => {
    setShiftTypeArchived(type.id, !type.archived);
    refresh();
  };

  const handleDelete = (type: ShiftTypeDefinition) => {
    const displayLabel = translateShiftTypeLabel(type.id, locale, type.label);
    if (!window.confirm(t('settings.deleteConfirm', { label: displayLabel }))) {
      return;
    }
    deleteCustomShiftType(type.id);
    refresh();
  };

  const handleAdd = () => {
    const id = draft.id.trim();
    if (!id) {
      setError(t('settings.errorIdRequired'));
      return;
    }
    if (types.some((type) => type.id.toLowerCase() === id.toLowerCase())) {
      setError(t('settings.errorIdDuplicate'));
      return;
    }
    upsertShiftType({
      id,
      label: draft.label.trim() || id,
      shortLabel: draft.shortLabel.trim() || id,
      color: draft.color,
      countsAsWork: draft.countsAsWork,
    });
    setDraft(NEW_TYPE_DRAFT);
    setError('');
    refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
        {t('settings.shiftTypesHint')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {types.map((type) => {
          const isDefault = DEFAULT_SHIFT_TYPES.some((d) => d.id === type.id);
          const displayLabel = translateShiftTypeLabel(type.id, locale, type.label);
          return (
            <div
              key={type.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px',
                opacity: type.archived ? 0.55 : 1,
                flexWrap: 'wrap',
              }}
            >
              <input
                type="color"
                value={type.color}
                onChange={(e) => handleUpdate(type, { color: e.target.value })}
                style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'none' }}
                aria-label={t('settings.colorAria', { label: displayLabel })}
              />
              <input
                className="modal-input"
                style={{ flex: '1 1 100px', minWidth: 90 }}
                value={type.label}
                onChange={(e) => handleUpdate(type, { label: e.target.value })}
              />
              <input
                className="modal-input"
                style={{ flex: '1 1 80px', minWidth: 70 }}
                value={type.shortLabel}
                onChange={(e) => handleUpdate(type, { shortLabel: e.target.value })}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                <input
                  type="checkbox"
                  checked={type.countsAsWork}
                  onChange={(e) => handleUpdate(type, { countsAsWork: e.target.checked })}
                />
                {t('settings.countsAsWork')}
              </label>
              <button className="btn-outline" style={{ padding: '6px 10px', minHeight: 'auto' }} onClick={() => handleArchiveToggle(type)}>
                {type.archived ? t('settings.restore') : t('settings.archive')}
              </button>
              {!isDefault && (
                <button
                  className="btn-outline"
                  style={{ padding: '6px 10px', minHeight: 'auto', borderColor: 'var(--danger-border)', color: 'var(--danger)' }}
                  onClick={() => handleDelete(type)}
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)' }}>
        <label style={labelStyle}>{t('settings.newType')}</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'none' }}
            aria-label={t('settings.newColorAria')}
          />
          <input
            className="modal-input"
            style={{ flex: '1 1 90px', minWidth: 80 }}
            placeholder={t('settings.identifierPlaceholder')}
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
          />
          <input
            className="modal-input"
            style={{ flex: '1 1 90px', minWidth: 80 }}
            placeholder={t('settings.labelPlaceholder')}
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            className="modal-input"
            style={{ flex: '1 1 90px', minWidth: 80 }}
            placeholder={t('settings.shortLabelPlaceholder')}
            value={draft.shortLabel}
            onChange={(e) => setDraft({ ...draft, shortLabel: e.target.value })}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            <input
              type="checkbox"
              checked={draft.countsAsWork}
              onChange={(e) => setDraft({ ...draft, countsAsWork: e.target.checked })}
            />
            {t('settings.countsAsWork')}
          </label>
          <button className="btn-gold" onClick={handleAdd}>{t('common.add')}</button>
        </div>
        {error && <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</p>}
      </div>
    </div>
  );
}

export const SettingsModal = ({
  isOpen,
  onClose,
  onRestartOnboarding,
  session,
  employees = [],
  selectedEmployeeId = null,
  onEmployeeNameChange,
  onOpenMembers,
  onAccountNameChange,
  onOrganizationReset,
}: SettingsModalProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('profile');
  const [userProfile, setUserProfile] = useState<UserProfile>(() => 
    session ? loadUserProfile(session.user.id) : DEFAULT_USER_PROFILE
  );

  useEscapeClose(isOpen, onClose);

  // Recalculate available tabs when session changes
  const availableTabs = getAvailableTabs(session);
  
  const userId = session?.user.id ?? '';

  const handleSaveProfile = useCallback((profile: UserProfile) => {
    saveUserProfile(userId, profile);
    setUserProfile(profile);
  }, [userId]);

  const handleEmployeeNameChange = useCallback(() => {
    onEmployeeNameChange?.();
  }, [onEmployeeNameChange]);

  // Reload profile when session changes
  useEffect(() => {
    if (session) {
      setUserProfile(loadUserProfile(session.user.id));
    }
  }, [session]);

  // Reset to first available tab if current tab not available
  useEffect(() => {
    if (!availableTabs.some(t => t === tab)) {
      setTab(availableTabs[0]);
    }
  }, [availableTabs, tab]);

  if (!isOpen) return null;

  // Find the employee for current user
  const employee = session?.employeeId 
    ? employees.find(e => e.id === session.employeeId) ?? null
    : null;

  const renderTab = (tabName: Tab) => {
    switch (tabName) {
      case 'profile':
        return (
          <ProfileSection
            session={session}
            employee={employee}
            userProfile={userProfile}
            onSaveProfile={handleSaveProfile}
            onRestartOnboarding={onRestartOnboarding}
            onEmployeeNameChange={handleEmployeeNameChange}
            onAccountNameChange={onAccountNameChange}
          />
        );
      case 'team':
        return (
          <TeamSection
            session={session}
            employees={employees}
            selectedEmployeeId={selectedEmployeeId}
            onOpenMembers={onOpenMembers}
            onOrganizationReset={onOrganizationReset}
          />
        );
      case 'shiftTypes':
        return <ShiftTypesSection />;
      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', padding: 'var(--space-lg) var(--space-xl)' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={t('settings.closeAria')}
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <Settings className="text-gold" size={24} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{t('settings.title')}</h2>
        </div>

        {availableTabs.length > 1 && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
            {availableTabs.map((tabName) => {
              const icons: Record<Tab, React.ReactNode> = {
                profile: <User size={16} />,
                team: <Users size={16} />,
                shiftTypes: <Settings size={16} />,
              };
              const labels: Record<Tab, string> = {
                profile: t('settings.tabProfile'),
                team: t('settings.tabTeam'),
                shiftTypes: t('settings.tabShiftTypes'),
              };
              return (
                <button
                  key={tabName}
                  className={tab === tabName ? 'btn-gold' : 'btn-outline'}
                  onClick={() => setTab(tabName)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {icons[tabName]}
                  {labels[tabName]}
                </button>
              );
            })}
          </div>
        )}

        {renderTab(tab)}
      </div>
    </div>
  );
};

import { useState, useEffect, useCallback } from 'react';
import { Settings, X, User, Briefcase, Building2 } from 'lucide-react';
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
import { SessionInfo } from '../../lib/session';
import { RemoteEmployee } from '../../lib/remote';
import { updateUserDisplayName, updateOwnEmployeeName } from '../../lib/remote';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Replays the first-run guide (resets the onboarding record and opens it). */
  onRestartOnboarding?: () => void;
  /** Current authenticated session (for user-scoped profile). */
  session: { user: { id: string; email: string; displayName: string }; role: SessionInfo['role']; employeeId: string | null; organizationId: string | null; memberships: SessionInfo['memberships'] } | null;
  /** Org employees for employee selector (ADMIN/MANAGER). */
  employees?: RemoteEmployee[];
  /** Selected employee in team bar (ADMIN/MANAGER). */
  selectedEmployeeId?: string | null;
  /** Callback when employee name changes (to refresh header). */
  onEmployeeNameChange?: () => void;
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

type Tab = 'account' | 'employee' | 'shiftTypes' | 'organization';

function getAvailableTabs(session: SettingsModalProps['session']): Tab[] {
  if (!session) return ['account'];
  
  const { role, employeeId, memberships } = session;
  const activeMembership = memberships.find(m => m.organizationId === session.organizationId);
  const isPersonalOrg = activeMembership?.organizationType === 'personal';
  const isCompanyOrg = activeMembership?.organizationType === 'company';
  
  if (role === 'EMPLOYEE') {
    // Employee: account + their employee record
    return ['account', 'employee'];
  }
  
  // ADMIN/MANAGER
  const tabs: Tab[] = ['account'];
  
  if (employeeId && isPersonalOrg) {
    // Admin in personal org: also has their own employee record
    tabs.push('employee');
  }
  
  if (isCompanyOrg) {
    // Admin in company org: organization management
    tabs.push('organization');
  }
  
  // Shift types always available for ADMIN/MANAGER
  tabs.push('shiftTypes');
  
  return tabs;
}

function AccountSection({ 
  session, 
  userProfile,
  onSaveProfile,
  onRestartOnboarding 
}: { 
  session: SettingsModalProps['session'];
  userProfile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
  onRestartOnboarding?: () => void;
}) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(session?.user.displayName ?? '');
  const [saved, setSaved] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);

  const handleSaveProfile = () => {
    onSaveProfile({ ...userProfile, displayName });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveAccount = async () => {
    if (!session || !displayName.trim()) return;
    setAccountSaving(true);
    try {
      await updateUserDisplayName(displayName.trim());
      // Update session user displayName optimistically
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch (error) {
      console.error('Failed to update account name', error);
    } finally {
      setAccountSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{ 
        padding: 'var(--space-md)', 
        borderRadius: 'var(--radius-lg)', 
        background: 'var(--info-bg)', 
        border: '1px solid var(--info-border)',
        fontSize: '0.8rem',
        color: 'var(--color-accent)'
      }}>
        <strong>{t('settings.accountSectionTitle')}</strong>
        <p style={{ margin: 'var(--space-xs) 0 0' }}>{t('settings.accountSectionDesc')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div>
          <label style={labelStyle}>{t('settings.accountDisplayName')}</label>
          <input
            className="modal-input"
            value={displayName}
            placeholder={t('settings.accountDisplayNamePlaceholder')}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={accountSaving}
          />
          <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
            {t('settings.accountDisplayNameHint')}
          </p>
        </div>
        
        <button 
          className="btn-gold" 
          style={{ alignSelf: 'flex-start', width: 'fit-content' }} 
          onClick={handleSaveAccount}
          disabled={accountSaving || !displayName.trim() || displayName === session?.user.displayName}
        >
          {accountSaving ? t('auth.working') : accountSaved ? t('settings.saved') : t('settings.saveAccount')}
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-lg)' }}>
        <h3 style={{ margin: '0 0 var(--space-md)', fontSize: '0.9rem', fontWeight: 700 }}>{t('settings.localProfileTitle')}</h3>
        <p style={{ margin: '0 0 var(--space-md)', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
          {t('settings.localProfileDesc')}
        </p>
        
        <ProfileFields 
          userProfile={userProfile} 
          onSave={handleSaveProfile} 
          saved={saved} 
        />
        
        {onRestartOnboarding && (
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)' }}>
            <button className="btn-outline" style={{ padding: '8px 14px', minHeight: 'auto' }} onClick={onRestartOnboarding}>
              {t('onboarding.restart')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileFields({ userProfile, onSave, saved }: { userProfile: UserProfile; onSave: (profile: UserProfile) => void; saved: boolean }) {
  const { locale, t } = useI18n();
  const [profile, setProfile] = useState<UserProfile>(userProfile);
  const [identifiersText, setIdentifiersText] = useState(() => userProfile.employeeIdentifiers.join(', '));
  const [timezone, setTimezone] = useState(userProfile.timezone);

  const handleSave = () => {
    const next: UserProfile = {
      ...profile,
      employeeIdentifiers: identifiersText.split(',').map((value) => value.trim()).filter(Boolean),
      timezone,
    };
    onSave(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div>
        <label style={labelStyle}>{t('settings.displayName')}</label>
        <input
          className="modal-input"
          value={profile.displayName}
          placeholder={t('settings.displayNamePlaceholder')}
          onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
        />
        <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
          {t('settings.localDisplayNameHint')}
        </p>
      </div>
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
      <button className="btn-gold" style={{ alignSelf: 'flex-start' }} onClick={handleSave}>
        {saved ? t('settings.saved') : t('settings.saveProfile')}
      </button>
    </div>
  );
}

function EmployeeSection({ 
  employee,
  onNameChange,
}: { 
  employee: RemoteEmployee | null;
  onNameChange: (name: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(employee?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !employee) return;
    setSaving(true);
    try {
      await updateOwnEmployeeName(name.trim());
      onNameChange(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to update employee name', error);
    } finally {
      setSaving(false);
    }
  };

  if (!employee) {
    return (
      <div style={{ 
        padding: 'var(--space-lg)', 
        borderRadius: 'var(--radius-lg)', 
        background: 'var(--panel-muted-bg)', 
        border: '1px solid var(--glass-border)',
        textAlign: 'center',
        color: 'var(--text-muted)'
      }}>
        {t('settings.noEmployeeLinked')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div style={{ 
        padding: 'var(--space-md)', 
        borderRadius: 'var(--radius-lg)', 
        background: 'var(--info-bg)', 
        border: '1px solid var(--info-border)',
        fontSize: '0.8rem',
        color: 'var(--color-accent)'
      }}>
        <strong>{t('settings.employeeSectionTitle')}</strong>
        <p style={{ margin: 'var(--space-xs) 0 0' }}>{t('settings.employeeSectionDesc')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div>
          <label style={labelStyle}>{t('settings.employeeName')}</label>
          <input
            className="modal-input"
            value={name}
            placeholder={t('settings.employeeNamePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </div>
        
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          <span>{t('settings.employeeExternalId')}: {employee.externalEmployeeId || t('common.none')}</span>
          <span>{t('settings.employeeStatus')}: {t(`members.status${employee.status === 'active' ? 'Active' : 'Inactive'}`)}</span>
          {employee.userId && <span>{t('settings.employeeLinked')}</span>}
        </div>
        
        <button 
          className="btn-gold" 
          style={{ alignSelf: 'flex-start', width: 'fit-content' }} 
          onClick={handleSave}
          disabled={saving || !name.trim() || name === employee.name}
        >
          {saving ? t('auth.working') : saved ? t('settings.saved') : t('settings.saveEmployee')}
        </button>
      </div>
    </div>
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

function OrganizationSection({ 
  session, 
  employees,
  selectedEmployeeId,
}: { 
  session: SettingsModalProps['session'];
  employees: RemoteEmployee[];
  selectedEmployeeId: string | null;
}) {
  const { t } = useI18n();
  const activeMembership = session?.memberships.find(m => m.organizationId === session.organizationId);
  const isPersonalOrg = activeMembership?.organizationType === 'personal';

  if (isPersonalOrg) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <div style={{ 
          padding: 'var(--space-md)', 
          borderRadius: 'var(--radius-lg)', 
          background: 'var(--info-bg)', 
          border: '1px solid var(--info-border)',
          fontSize: '0.8rem',
          color: 'var(--color-accent)'
        }}>
          <strong>{t('settings.personalOrgTitle')}</strong>
          <p style={{ margin: 'var(--space-xs) 0 0' }}>{t('settings.personalOrgDesc')}</p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{t('settings.activeEmployee')}</h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
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
      </div>
    );
  }

  // Company org: show organization info + members link
  return (
    <>
      <div style={{ 
        padding: 'var(--space-md)', 
        borderRadius: 'var(--radius-lg)', 
        background: 'var(--info-bg)', 
        border: '1px solid var(--info-border)',
        fontSize: '0.8rem',
        color: 'var(--color-accent)'
      }}>
        <strong>{t('settings.companyOrgTitle')}</strong>
        <p style={{ margin: 'var(--space-xs) 0 0' }}>{t('settings.companyOrgDesc')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{t('settings.organizationInfo')}</h3>
        <div style={{ display: 'grid', gap: 'var(--space-sm)', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-subtle)', minWidth: '140px' }}>{t('settings.orgName')}</span>
            <span style={{ fontWeight: 600 }}>{activeMembership?.organizationName}</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-subtle)', minWidth: '140px' }}>{t('settings.orgType')}</span>
            <span>{t(activeMembership?.organizationType === 'personal' ? 'orgSelector.typePersonal' : 'orgSelector.typeCompany')}</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-subtle)', minWidth: '140px' }}>{t('settings.orgPlan')}</span>
            <span style={{ textTransform: 'capitalize' }}>{activeMembership?.organizationPlan}</span>
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
          <button className="btn-gold" style={{ width: 'fit-content' }}>
            {t('settings.openMembers')}
          </button>
        </div>
      </div>
    </>
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
}: SettingsModalProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('account');
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

  const renderTab = (tabName: Tab) => {
    switch (tabName) {
      case 'account':
        return (
          <AccountSection
            session={session}
            userProfile={userProfile}
            onSaveProfile={handleSaveProfile}
            onRestartOnboarding={onRestartOnboarding}
          />
        );
      case 'employee': {
        // Find the employee for current user
        const employee = session?.employeeId
          ? employees.find(e => e.id === session.employeeId) ?? null
          : null;
        return (
          <EmployeeSection
            employee={employee}
            onNameChange={handleEmployeeNameChange}
          />
        );
      }
      case 'shiftTypes':
        return <ShiftTypesSection />;
      case 'organization':
        return (
          <OrganizationSection
            session={session}
            employees={employees}
            selectedEmployeeId={selectedEmployeeId}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={t('settings.closeAria')}
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          <Settings className="text-gold" size={24} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{t('settings.title')}</h2>
        </div>

        {availableTabs.length > 1 && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
            {availableTabs.map((tabName) => {
              const icons: Record<Tab, React.ReactNode> = {
                account: <User size={16} />,
                employee: <Briefcase size={16} />,
                shiftTypes: <Settings size={16} />,
                organization: <Building2 size={16} />,
              };
              const labels: Record<Tab, string> = {
                account: t('settings.tabAccount'),
                employee: t('settings.tabEmployee'),
                shiftTypes: t('settings.tabShiftTypes'),
                organization: t('settings.tabOrganization'),
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
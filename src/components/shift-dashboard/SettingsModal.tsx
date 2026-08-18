import { useState } from 'react';
import { Settings, X } from 'lucide-react';
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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Replays the first-run guide (resets the onboarding record and opens it). */
  onRestartOnboarding?: () => void;
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

function ProfileSection({ onRestartOnboarding }: { onRestartOnboarding?: () => void }) {
  const { locale, t } = useI18n();
  const [profile, setProfile] = useState<UserProfile>(() => loadUserProfile());
  const [identifiersText, setIdentifiersText] = useState(() => loadUserProfile().employeeIdentifiers.join(', '));
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const next: UserProfile = {
      ...profile,
      employeeIdentifiers: identifiersText.split(',').map((value) => value.trim()).filter(Boolean),
    };
    saveUserProfile(next);
    setProfile(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div>
        <label style={labelStyle}>{t('settings.displayName')}</label>
        <input
          className="modal-input"
          value={profile.displayName}
          placeholder={DEFAULT_USER_PROFILE.displayName || t('settings.displayNamePlaceholder')}
          onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
        />
      </div>
      <div>
        <label style={labelStyle}>{t('settings.identifiers')}</label>
        <input
          className="modal-input"
          value={identifiersText}
          placeholder={t('settings.identifiersPlaceholder')}
          onChange={(e) => setIdentifiersText(e.target.value)}
        />
        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          {t('settings.identifiersHint')}
        </p>
      </div>
      <div>
        <label style={labelStyle}>{t('settings.employer')}</label>
        <input
          className="modal-input"
          value={profile.employerName ?? ''}
          onChange={(e) => setProfile({ ...profile, employerName: e.target.value })}
        />
      </div>
      <div>
        <label style={labelStyle}>{t('settings.timezone')}</label>
        <select
          className="modal-input"
          value={profile.timezone}
          onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
        >
          {TIMEZONE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {getTimezoneLabel(option.id, locale)}
            </option>
          ))}
        </select>
      </div>
      <button className="btn-gold" style={{ alignSelf: 'flex-start' }} onClick={handleSave}>
        {saved ? t('settings.saved') : t('settings.saveProfile')}
      </button>
      {onRestartOnboarding && (
        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)' }}>
          <button className="btn-outline" style={{ padding: '8px 14px', minHeight: 'auto' }} onClick={onRestartOnboarding}>
            {t('onboarding.restart')}
          </button>
        </div>
      )}
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

export const SettingsModal = ({ isOpen, onClose, onRestartOnboarding }: SettingsModalProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<'profile' | 'shiftTypes'>('profile');

  useEscapeClose(isOpen, onClose);

  if (!isOpen) return null;

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

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          <button className={tab === 'profile' ? 'btn-gold' : 'btn-outline'} onClick={() => setTab('profile')}>
            {t('settings.tabProfile')}
          </button>
          <button className={tab === 'shiftTypes' ? 'btn-gold' : 'btn-outline'} onClick={() => setTab('shiftTypes')}>
            {t('settings.tabShiftTypes')}
          </button>
        </div>

        {tab === 'profile' ? <ProfileSection onRestartOnboarding={onRestartOnboarding} /> : <ShiftTypesSection />}
      </div>
    </div>
  );
};

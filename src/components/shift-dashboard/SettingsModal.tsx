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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
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

function ProfileSection() {
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
        <label style={labelStyle}>Nombre para mostrar</label>
        <input
          className="modal-input"
          value={profile.displayName}
          placeholder={DEFAULT_USER_PROFILE.displayName || 'Tu nombre'}
          onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
        />
      </div>
      <div>
        <label style={labelStyle}>Identificadores de empleado</label>
        <input
          className="modal-input"
          value={identifiersText}
          placeholder="EMP-101, 101"
          onChange={(e) => setIdentifiersText(e.target.value)}
        />
        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          Separados por comas. Se usan para seleccionar tu fila al importar un documento.
        </p>
      </div>
      <div>
        <label style={labelStyle}>Empresa (opcional)</label>
        <input
          className="modal-input"
          value={profile.employerName ?? ''}
          onChange={(e) => setProfile({ ...profile, employerName: e.target.value })}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        <div>
          <label style={labelStyle}>Zona horaria</label>
          <input
            className="modal-input"
            value={profile.timezone}
            onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Idioma</label>
          <select
            className="modal-input"
            value={profile.locale}
            onChange={(e) => setProfile({ ...profile, locale: e.target.value })}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <button className="btn-gold" style={{ alignSelf: 'flex-start' }} onClick={handleSave}>
        {saved ? 'Guardado ✓' : 'Guardar perfil'}
      </button>
    </div>
  );
}

function ShiftTypesSection() {
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
    if (!window.confirm(`Eliminar el tipo de turno "${type.label}"? Los turnos ya guardados con este tipo conservarán su color/etiqueta.`)) {
      return;
    }
    deleteCustomShiftType(type.id);
    refresh();
  };

  const handleAdd = () => {
    const id = draft.id.trim();
    if (!id) {
      setError('El identificador es obligatorio.');
      return;
    }
    if (types.some((type) => type.id.toLowerCase() === id.toLowerCase())) {
      setError('Ya existe un tipo de turno con ese identificador.');
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
        JT es solo un ejemplo de preset opcional — no es un tipo especial del producto. Crea, edita o archiva
        los tipos que necesites; el selector de turnos y las estadísticas usan siempre esta configuración.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {types.map((type) => {
          const isDefault = DEFAULT_SHIFT_TYPES.some((d) => d.id === type.id);
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
                aria-label={`Color de ${type.label}`}
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
                Cuenta como trabajo
              </label>
              <button className="btn-outline" style={{ padding: '6px 10px', minHeight: 'auto' }} onClick={() => handleArchiveToggle(type)}>
                {type.archived ? 'Restaurar' : 'Archivar'}
              </button>
              {!isDefault && (
                <button
                  className="btn-outline"
                  style={{ padding: '6px 10px', minHeight: 'auto', borderColor: 'var(--danger-border)', color: 'var(--danger)' }}
                  onClick={() => handleDelete(type)}
                >
                  Eliminar
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-md)' }}>
        <label style={labelStyle}>Nuevo tipo de turno</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'none' }}
            aria-label="Color del nuevo tipo"
          />
          <input
            className="modal-input"
            style={{ flex: '1 1 90px', minWidth: 80 }}
            placeholder="Identificador"
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
          />
          <input
            className="modal-input"
            style={{ flex: '1 1 90px', minWidth: 80 }}
            placeholder="Etiqueta"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            className="modal-input"
            style={{ flex: '1 1 90px', minWidth: 80 }}
            placeholder="Etiqueta corta"
            value={draft.shortLabel}
            onChange={(e) => setDraft({ ...draft, shortLabel: e.target.value })}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            <input
              type="checkbox"
              checked={draft.countsAsWork}
              onChange={(e) => setDraft({ ...draft, countsAsWork: e.target.checked })}
            />
            Cuenta como trabajo
          </label>
          <button className="btn-gold" onClick={handleAdd}>Añadir</button>
        </div>
        {error && <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</p>}
      </div>
    </div>
  );
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [tab, setTab] = useState<'profile' | 'shiftTypes'>('profile');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Cerrar ajustes"
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          <Settings className="text-gold" size={24} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Ajustes</h2>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          <button className={tab === 'profile' ? 'btn-gold' : 'btn-outline'} onClick={() => setTab('profile')}>
            Perfil
          </button>
          <button className={tab === 'shiftTypes' ? 'btn-gold' : 'btn-outline'} onClick={() => setTab('shiftTypes')}>
            Tipos de turno
          </button>
        </div>

        {tab === 'profile' ? <ProfileSection /> : <ShiftTypesSection />}
      </div>
    </div>
  );
};

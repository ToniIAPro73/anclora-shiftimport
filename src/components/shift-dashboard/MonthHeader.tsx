import { ChevronLeft, ChevronRight, PlusCircle } from 'lucide-react';
import { formatProfileIdentity, loadUserProfile } from '../../lib/profile';
import { TurnosLogo } from '../branding/TurnosLogo';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface MonthHeaderProps {
  year: number;
  month: number;
  onNavigate: (delta: number) => void;
  onAddShift: () => void;
  onImport: () => void;
  onOpenJTCounter: () => void;
  themeMode: 'system' | 'light' | 'dark';
  onToggleTheme: () => void;
}

export const MonthHeader = ({ year, month, onNavigate, onAddShift, onImport, onOpenJTCounter, themeMode, onToggleTheme }: MonthHeaderProps) => {
  const themeEmoji = themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '🖥️';
  const identity = formatProfileIdentity(loadUserProfile());

  return (
    <div className="dashboard-header">
      <div className="dashboard-brand">
        <TurnosLogo />
        <div className="dashboard-brand-copy">
          <h1
            className="dashboard-title"
            style={{ background: 'var(--gradient-accent)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            Anclora ShiftImport
          </h1>
          <p className="dashboard-subtitle">by Anclora Group</p>
          {identity && <p className="dashboard-identity">{identity}</p>}
        </div>
      </div>

      <div className="month-toolbar">
        <div className="month-navigator">
          <button className="month-nav-button" onClick={() => onNavigate(-1)}>
            <ChevronLeft size={20} />
          </button>
          <div className="month-nav-label">
            {MONTH_NAMES[month]} {year}
          </div>
          <button className="month-nav-button" onClick={() => onNavigate(1)}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="dashboard-actions">
        <button
          onClick={onToggleTheme}
          className="theme-toggle"
          title={`Tema: ${themeMode}`}
          aria-label={`Cambiar tema. Actual: ${themeMode}`}
        >
          <span>{themeEmoji}</span>
        </button>
        <button onClick={onImport} className="btn-outline dashboard-action-button">
          Importar
        </button>
        <button onClick={onOpenJTCounter} className="btn-outline dashboard-action-button">
          JT
        </button>
        <button className="btn-gold dashboard-action-button dashboard-add-button" onClick={onAddShift}>
          <PlusCircle size={18} /> <span>Añadir</span>
        </button>
      </div>
    </div>
  );
};

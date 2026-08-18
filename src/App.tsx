import { useState, useEffect, useMemo } from 'react';
import { Shift } from './lib/types';
import { getMonthDaysISO, getDaysInMonth } from './lib/week';
import { loadShifts, normalizeShift, syncShiftChanges } from './lib/storage';
import { findShiftConflict } from './lib/shift-conflicts';

import { fingerprintShift } from './lib/import-dedup';
import { getShiftOrigin, getShiftType, hasShiftTimes } from './lib/shifts';
import { StatsBar } from './components/shift-dashboard/StatsBar';
import { MonthHeader } from './components/shift-dashboard/MonthHeader';
import { MonthGrid } from './components/shift-dashboard/MonthGrid';
import { ShiftModal } from './components/shift-dashboard/ShiftModal';
import { ImportModal } from './components/shift-dashboard/ImportModal';
import { JTCounterModal } from './components/shift-dashboard/JTCounterModal';
import { CookieConsent } from './components/CookieConsent';
import { LegalFooter } from './components/LegalFooter';
import { LegalPage } from './components/LegalPage';
import { CalendarImportContext } from './lib/import-types';

type ThemeMode = 'system' | 'light' | 'dark';

function insertShift(current: Shift[], incoming: Shift): Shift[] {
  return [...current.filter((shift) => shift.id !== incoming.id), normalizeShift(incoming)];
}

interface ImportConflictState {
  existing: Shift;
  incoming: Shift;
  resolve: (action: 'replace' | 'skip' | 'abort') => void;
}

function describeShift(shift: Shift): string {
  const type = getShiftType(shift);
  const origin = getShiftOrigin(shift) === 'PDF' ? '(E)' : '(P)';
  if (!hasShiftTimes(shift)) {
    return `${origin} ${type} en ${shift.date}`;
  }
  return `${origin} ${type} ${shift.startTime}-${shift.endTime} en ${shift.date}`;
}
function App() {
  const legalPath = typeof window !== 'undefined' ? window.location.pathname.replace(/^\/+/, '') : '';
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'system';
    }

    const savedTheme = window.localStorage.getItem('anclora_theme_mode');
    return savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
      ? savedTheme
      : 'system';
  });
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isJTCounterOpen, setIsJTCounterOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [draftShiftDate, setDraftShiftDate] = useState<string | null>(null);
  const [importConflictState, setImportConflictState] = useState<ImportConflictState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateShifts = async () => {
      const nextShifts = await loadShifts();
      if (cancelled) {
        return;
      }

      setShifts(nextShifts);
    };

    void hydrateShifts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolvedTheme = themeMode === 'system'
        ? (mediaQuery.matches ? 'dark' : 'light')
        : themeMode;
      root.dataset.theme = resolvedTheme;
    };

    applyTheme();
    window.localStorage.setItem('anclora_theme_mode', themeMode);
    mediaQuery.addEventListener('change', applyTheme);

    return () => {
      mediaQuery.removeEventListener('change', applyTheme);
    };
  }, [themeMode]);

  const monthDays = useMemo(() => getMonthDaysISO(currentYear, currentMonth), [currentYear, currentMonth]);
  const daysInMonth = useMemo(() => getDaysInMonth(currentYear, currentMonth), [currentYear, currentMonth]);

  const currentMonthShifts = useMemo(() => {
    const firstDay = monthDays[0];
    const lastDay = monthDays[monthDays.length - 1];
    return shifts.filter(s => s.date >= firstDay && s.date <= lastDay);
  }, [shifts, monthDays]);
  const currentYearShifts = useMemo(
    () => shifts.filter((shift) => shift.date.startsWith(`${currentYear}-`)),
    [shifts, currentYear],
  );
  const daysInYear = useMemo(
    () => new Date(currentYear, 12, 0).getDate() === 366 ? 366 : 365,
    [currentYear],
  );

  const editingShift = useMemo(() =>
    shifts.find(s => s.id === editingShiftId) || null
  , [shifts, editingShiftId]);

  const handleNavigate = (delta: number) => {
    const d = new Date(currentYear, currentMonth + delta, 1);
    setCurrentYear(d.getFullYear());
    setCurrentMonth(d.getMonth());
  };

  const handleSaveShift = async (shift: Shift) => {
    const conflict = findShiftConflict(shifts, shift);
    if (conflict) {
      window.alert(conflict);
      return;
    }

    const nextShifts = insertShift(shifts, shift);

    try {
      await syncShiftChanges(nextShifts, { upserts: [shift] });
      setShifts(nextShifts);
      setIsModalOpen(false);
      setEditingShiftId(null);
      setDraftShiftDate(null);
    } catch (error) {
      console.error('Failed to persist shift', error);
      window.alert('No se pudo guardar el turno en la base de datos. Inténtalo de nuevo.');
    }
  };

  const handleDeleteShift = async (id: string) => {
    const nextShifts = shifts.filter(s => s.id !== id);

    try {
      await syncShiftChanges(nextShifts, { deleteIds: [id] });
      setShifts(nextShifts);
      setIsModalOpen(false);
      setEditingShiftId(null);
      setDraftShiftDate(null);
    } catch (error) {
      console.error('Failed to delete shift', error);
      window.alert('No se pudo eliminar el turno de la base de datos. Inténtalo de nuevo.');
    }
  };

  const handleEditShift = (id: string) => {
    setDraftShiftDate(null);
    setEditingShiftId(id);
    setIsModalOpen(true);
  };

  const handleCreateShiftForDate = (date: string) => {
    setEditingShiftId(null);
    setDraftShiftDate(date);
    setIsModalOpen(true);
  };

  const handleToggleTheme = () => {
    setThemeMode((current) => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system');
  };
  const requestImportDecision = (existing: Shift, incoming: Shift) =>
    new Promise<'replace' | 'skip' | 'abort'>((resolve) => {
      setImportConflictState({ existing, incoming, resolve });
    });

  const handleConfirmImport = async (newShifts: Shift[], targetPeriod: CalendarImportContext): Promise<boolean> => {
    const snapshot = [...shifts];
    const normalizedIncoming = newShifts.map(normalizeShift);
    let working = [...snapshot];
    const pendingExistingPdfByDate = new Map<string, Shift[]>();
    const upserts: Shift[] = [];
    const deleteIds: string[] = [];

    for (const shift of normalizedIncoming) {
      const existingPdfShifts = pendingExistingPdfByDate.get(shift.date)
        ?? snapshot.filter((existing) => existing.date === shift.date && getShiftOrigin(existing) === 'PDF');

      pendingExistingPdfByDate.set(shift.date, existingPdfShifts);

      if (existingPdfShifts.length === 0) {
        working.push(shift);
        upserts.push(shift);
        continue;
      }

      const matchingExisting = existingPdfShifts.find((existing) => getShiftType(existing) === getShiftType(shift));
      // Idempotent re-import: an identical semantic shift is left untouched
      // (no id churn, no replace/skip prompt). Identity is the deterministic
      // fingerprint, never the random UUID.
      const identicalExisting = existingPdfShifts.find(
        (existing) => fingerprintShift(existing).full === fingerprintShift(shift).full,
      );
      if (identicalExisting) {
        continue;
      }
      const existingShift = matchingExisting ?? existingPdfShifts[0];
      const decision = await requestImportDecision(existingShift, shift);

      if (decision === 'abort') {
        setShifts(snapshot);
        return false;
      }

      if (decision === 'skip') {
        continue;
      }

      working = [...working.filter((existing) => existing.id !== existingShift.id), shift];
      upserts.push(shift);
      deleteIds.push(existingShift.id);
      pendingExistingPdfByDate.set(
        shift.date,
        existingPdfShifts.filter((existing) => existing.id !== existingShift.id),
      );
    }

    try {
      await syncShiftChanges(working, { upserts, deleteIds });
      setShifts(working);
      setCurrentYear(targetPeriod.year);
      setCurrentMonth(targetPeriod.month);
      setIsImportOpen(false);
      return true;
    } catch (error) {
      console.error('Failed to persist imported shifts', error);
      window.alert('No se pudieron guardar los turnos importados en la base de datos. Inténtalo de nuevo.');
      return false;
    }
  };

  if (legalPath === 'privacy' || legalPath === 'terms' || legalPath === 'legal') {
    return (
      <>
        <LegalPage kind={legalPath} />
        <CookieConsent />
      </>
    );
  }

  return (
    <div className="container">
      <MonthHeader
        year={currentYear}
        month={currentMonth}
        onNavigate={handleNavigate}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        onOpenJTCounter={() => setIsJTCounterOpen(true)}
        onAddShift={() => {
          setEditingShiftId(null);
          setDraftShiftDate(null);
          setIsModalOpen(true);
        }}
        onImport={() => setIsImportOpen(true)}
      />

      <div className="dashboard-body">
        <StatsBar
          currentMonthShifts={currentMonthShifts}
          daysInMonth={daysInMonth}
          currentYearShifts={currentYearShifts}
          daysInYear={daysInYear}
        />

        <section className="calendar-stage">
          <MonthGrid
            year={currentYear}
            month={currentMonth}
            shifts={currentMonthShifts}
            onEditShift={handleEditShift}
            onCreateShift={handleCreateShiftForDate}
          />
        </section>
      </div>

      <ShiftModal
        isOpen={isModalOpen}
        editingShift={editingShift}
        defaultDate={draftShiftDate}
        onClose={() => {
          setIsModalOpen(false);
          setDraftShiftDate(null);
        }}
        onSave={handleSaveShift}
        onDelete={handleDeleteShift}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onConfirmImport={handleConfirmImport}
        initialContext={{ month: currentMonth, year: currentYear }}
      />

      <JTCounterModal
        isOpen={isJTCounterOpen}
        onClose={() => setIsJTCounterOpen(false)}
        shifts={shifts}
      />

      {importConflictState && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '1.15rem', fontWeight: 800 }}>Conflicto en importación PDF</h3>
            <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Ya existe un turno de empresa en este día. Elige qué hacer con el turno importado.
            </p>
            <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px', background: 'var(--panel-muted-bg)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-subtle)', marginBottom: '4px' }}>Turno existente</div>
                <div style={{ fontWeight: 700 }}>{describeShift(importConflictState.existing)}</div>
              </div>
              <div style={{ border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px', background: 'var(--panel-muted-bg)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-subtle)', marginBottom: '4px' }}>Turno del PDF</div>
                <div style={{ fontWeight: 700 }}>{describeShift(importConflictState.incoming)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="btn-outline"
                onClick={() => {
                  importConflictState.resolve('skip');
                  setImportConflictState(null);
                }}
                style={{ padding: '10px 14px', fontWeight: 700 }}
              >
                Omitir turno
              </button>
              <button
                className="btn-outline"
                onClick={() => {
                  importConflictState.resolve('abort');
                  setImportConflictState(null);
                }}
                style={{ padding: '10px 14px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                Abortar proceso
              </button>
              <button
                className="btn-gold"
                onClick={() => {
                  importConflictState.resolve('replace');
                  setImportConflictState(null);
                }}
                style={{ padding: '10px 14px', fontWeight: 800 }}
              >
                Actualizar con PDF
              </button>
            </div>
          </div>
        </div>
      )}
      <LegalFooter />
      <CookieConsent />
    </div>
  );
}

export default App;







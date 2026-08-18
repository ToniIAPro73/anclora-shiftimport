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
import { SettingsModal } from './components/shift-dashboard/SettingsModal';
import { CookieConsent } from './components/CookieConsent';
import { LegalFooter } from './components/LegalFooter';
import { LegalPage } from './components/LegalPage';
import { CalendarImportContext } from './lib/import-types';
import { translateShiftTypeLabel } from './lib/i18n';
import { useI18n } from './lib/use-i18n';

type ThemeMode = 'system' | 'light' | 'dark';

function insertShift(current: Shift[], incoming: Shift): Shift[] {
  return [...current.filter((shift) => shift.id !== incoming.id), normalizeShift(incoming)];
}

interface ImportConflictState {
  existing: Shift;
  incoming: Shift;
  resolve: (action: 'replace' | 'skip' | 'abort') => void;
}

function describeShift(shift: Shift, locale: 'es' | 'en', t: (key: string) => string): string {
  const type = translateShiftTypeLabel(getShiftType(shift), locale, getShiftType(shift));
  const origin = getShiftOrigin(shift) === 'IMP' ? t('importConflict.describeImported') : t('importConflict.describeManual');
  const on = t('importConflict.on');
  if (!hasShiftTimes(shift)) {
    return `${origin} ${type} ${on} ${shift.date}`;
  }
  return `${origin} ${type} ${shift.startTime}-${shift.endTime} ${on} ${shift.date}`;
}
function App() {
  const { locale, t } = useI18n();
  const legalPath = typeof window !== 'undefined' ? window.location.pathname.replace(/^\/+/, '') : '';
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const savedTheme = window.localStorage.getItem('anclora_theme_mode');
    return savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
      ? savedTheme
      : 'dark';
  });
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    const conflict = findShiftConflict(shifts, shift, locale);
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
      window.alert(t('importConflict.saveShiftFailed'));
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
      window.alert(t('importConflict.deleteShiftFailed'));
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
    const pendingImportedByDate = new Map<string, Shift[]>();
    const upserts: Shift[] = [];
    const deleteIds: string[] = [];

    for (const shift of normalizedIncoming) {
      const existingImportedShifts = pendingImportedByDate.get(shift.date)
        ?? snapshot.filter((existing) => existing.date === shift.date && getShiftOrigin(existing) === 'IMP');

      pendingImportedByDate.set(shift.date, existingImportedShifts);

      if (existingImportedShifts.length === 0) {
        working.push(shift);
        upserts.push(shift);
        continue;
      }

      const matchingExisting = existingImportedShifts.find((existing) => getShiftType(existing) === getShiftType(shift));
      // Idempotent re-import: an identical semantic shift is left untouched
      // (no id churn, no replace/skip prompt). Identity is the deterministic
      // fingerprint, never the random UUID.
      const identicalExisting = existingImportedShifts.find(
        (existing) => fingerprintShift(existing).full === fingerprintShift(shift).full,
      );
      if (identicalExisting) {
        continue;
      }
      const existingShift = matchingExisting ?? existingImportedShifts[0];
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
      pendingImportedByDate.set(
        shift.date,
        existingImportedShifts.filter((existing) => existing.id !== existingShift.id),
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
      window.alert(t('importConflict.importSaveFailed'));
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
        onAddShift={() => {
          setEditingShiftId(null);
          setDraftShiftDate(null);
          setIsModalOpen(true);
        }}
        onImport={() => setIsImportOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
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

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onConfirmImport={handleConfirmImport}
        initialContext={{ month: currentMonth, year: currentYear }}
      />

      {importConflictState && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '1.15rem', fontWeight: 800 }}>{t('importConflict.title')}</h3>
            <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {t('importConflict.description')}
            </p>
            <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px', background: 'var(--panel-muted-bg)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-subtle)', marginBottom: '4px' }}>{t('importConflict.existing')}</div>
                <div style={{ fontWeight: 700 }}>{describeShift(importConflictState.existing, locale, t)}</div>
              </div>
              <div style={{ border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px', background: 'var(--panel-muted-bg)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-subtle)', marginBottom: '4px' }}>{t('importConflict.incoming')}</div>
                <div style={{ fontWeight: 700 }}>{describeShift(importConflictState.incoming, locale, t)}</div>
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
                {t('importConflict.skip')}
              </button>
              <button
                className="btn-outline"
                onClick={() => {
                  importConflictState.resolve('abort');
                  setImportConflictState(null);
                }}
                style={{ padding: '10px 14px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                {t('importConflict.abort')}
              </button>
              <button
                className="btn-gold"
                onClick={() => {
                  importConflictState.resolve('replace');
                  setImportConflictState(null);
                }}
                style={{ padding: '10px 14px', fontWeight: 800 }}
              >
                {t('importConflict.replace')}
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







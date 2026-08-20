import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shift } from './lib/types';
import { getMonthDaysISO, getDaysInMonth } from './lib/week';
import { loadShifts, loadLocalShiftsForMigration, normalizeShift, syncShiftChanges } from './lib/storage';
import { findShiftConflict } from './lib/shift-conflicts';

import { fingerprintShift } from './lib/import-dedup';
import { getShiftOrigin, getShiftType, hasShiftTimes } from './lib/shifts';
import { completeOnboarding, loadOnboarding, resetOnboarding, shouldShowOnboarding } from './lib/onboarding';
import { trackTtfvEvent } from './lib/ttfv';
import {
  fetchResolvedSession,
  logout,
  switchOrganization,
  completePersonalOnboarding,
  completeCompanyOnboarding,
  SessionInfo,
} from './lib/session';
import {
  createRemoteEmployee,
  createRemoteImport,
  listRemoteEmployees,
  loadRemoteShifts,
  matchRemoteEmployee,
  RemoteEmployee,
  syncRemoteShifts,
} from './lib/remote';
import { StatsBar } from './components/shift-dashboard/StatsBar';
import { MonthHeader } from './components/shift-dashboard/MonthHeader';
import { MonthGrid } from './components/shift-dashboard/MonthGrid';
import { ShiftModal } from './components/shift-dashboard/ShiftModal';
import { ImportModal } from './components/shift-dashboard/ImportModal';
import { OnboardingModal } from './components/shift-dashboard/OnboardingModal';
import { SettingsModal } from './components/shift-dashboard/SettingsModal';
import { OrgSelectorModal } from './components/shift-dashboard/OrgSelectorModal';
import { OnboardingChoiceModal } from './components/shift-dashboard/OnboardingChoiceModal';
import { CompanyOnboardingModal } from './components/shift-dashboard/CompanyOnboardingModal';
import { LocalMigrationModal } from './components/shift-dashboard/LocalMigrationModal';
import { MembersModal } from './components/shift-dashboard/MembersModal';
import { TeamImportModal } from './components/shift-dashboard/TeamImportModal';
import { AuthScreen } from './components/AuthScreen';
import { ForgotPasswordScreen } from './components/ForgotPasswordScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { CookieConsent } from './components/CookieConsent';
import { LegalFooter } from './components/LegalFooter';
import { LegalPage } from './components/LegalPage';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './pages/PricingPage';
import { navigate, useRoute } from './lib/route';
import { resolvePostLoginDestination, POST_LOGIN_TITLES } from './lib/post-login';
import { getPlanIntentFromUrl } from './lib/plans';
import { CalendarImportContext } from './lib/import-types';
import { translateShiftTypeLabel } from './lib/i18n';
import { useI18n } from './lib/use-i18n';

type ThemeMode = 'system' | 'light' | 'dark';

/** localStorage flag: local→remote one-shot migration already done (Fase 1). */
const MIGRATION_DONE_KEY = 'anclora_shiftimport_migrated_v1';

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
  const route = useRoute();
  const [shifts, setShifts] = useState<Shift[]>([]);
  // Fase 1: authenticated multi-tenant state. null = guest (local-first flow).
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [employees, setEmployees] = useState<RemoteEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  // Fase 1.1: explicit org choice (multi-org) + explicit local migration.
  const [needsOrgChoice, setNeedsOrgChoice] = useState(false);
  // Fase 1.2C.2: sub-step inside the zero-membership onboarding choice
  // (needsOrgChoice + no memberships). Only meaningful while that state holds.
  const [onboardingCompanyStep, setOnboardingCompanyStep] = useState(false);
  const [migrationPrompt, setMigrationPrompt] = useState<{ count: number } | null>(null);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isTeamImportOpen, setIsTeamImportOpen] = useState(false);
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
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingFile, setOnboardingFile] = useState<File | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [draftShiftDate, setDraftShiftDate] = useState<string | null>(null);
  const [importConflictState, setImportConflictState] = useState<ImportConflictState | null>(null);

  // Authenticated bootstrap: loads the org employees, picks the working
  // employee (self for EMPLOYEE role) and loads that employee's shifts.
  // Local→remote migration is EXPLICIT (Fase 1.1): local data triggers a
  // confirmation modal with preview, never a silent upload. The local copy
  // is never deleted.
  const hydrateAuthenticated = useCallback(async (nextSession: SessionInfo): Promise<void> => {
    const orgEmployees = await listRemoteEmployees();
    setEmployees(orgEmployees);

    const initialEmployeeId = nextSession.role === 'EMPLOYEE'
      ? nextSession.employeeId
      : (nextSession.employeeId ?? orgEmployees[0]?.id ?? null);
    setSelectedEmployeeId(initialEmployeeId);

    if (!initialEmployeeId) {
      setShifts([]);
      return;
    }

    const remoteShifts = await loadRemoteShifts(initialEmployeeId);
    setShifts(remoteShifts);

    const migrationState = window.localStorage.getItem(MIGRATION_DONE_KEY);
    const isSelfEmployee = initialEmployeeId === nextSession.employeeId;
    if (!migrationState && isSelfEmployee && remoteShifts.length === 0) {
      const localShifts = loadLocalShiftsForMigration();
      if (localShifts.length > 0) {
        setMigrationPrompt({ count: localShifts.length });
      }
    }
  }, []);

  const handleMigrationImport = useCallback(async (): Promise<boolean> => {
    if (!session?.employeeId) {
      return false;
    }
    try {
      const localShifts = loadLocalShiftsForMigration();
      // Idempotent: same ids upsert (ON CONFLICT id), repeating creates no duplicates.
      await syncRemoteShifts(session.employeeId, { upserts: localShifts });
      setShifts(await loadRemoteShifts(session.employeeId));
      window.localStorage.setItem(MIGRATION_DONE_KEY, 'done');
      setMigrationPrompt(null);
      return true;
    } catch (error) {
      console.error('Local migration failed', error);
      return false;
    }
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    const hydrateShifts = async () => {
      const resolved = await fetchResolvedSession();
      if (cancelled) {
        return;
      }

      if (resolved) {
        setSession(resolved.session);
        setNeedsOrgChoice(resolved.needsOrgChoice);
        if (resolved.needsOrgChoice) {
          return;
        }
        try {
          await hydrateAuthenticated(resolved.session);
        } catch (error) {
          console.error('Failed to load remote shifts, falling back to guest mode', error);
          setSession(null);
          setShifts(await loadShifts());
        }
        return;
      }

      const nextShifts = await loadShifts();
      if (cancelled) {
        return;
      }

      setShifts(nextShifts);
      // First-run guide: only for genuinely new users (shouldShowOnboarding
      // silently completes the record for pre-existing users with shifts).
      if (shouldShowOnboarding(nextShifts.length)) {
        setIsOnboardingOpen(true);
      }
    };

    void hydrateShifts();

    return () => {
      cancelled = true;
    };
  }, [hydrateAuthenticated]);

  const handleAuthenticated = useCallback(async (nextSession: SessionInfo) => {
    setSession(nextSession);
    // The guest first-run guide may already be scheduled from the pre-auth
    // hydration effect (it runs regardless of route); a real session
    // supersedes it — onboarding here is the org-choice flow, not the
    // local-import guide.
    setIsOnboardingOpen(false);
    if (!nextSession.organizationId) {
      // Fase 1.2G.5: a brand-new (zero-membership) session honors the plan
      // intent carried from /pricing (?plan=…) by skipping straight to the
      // matching onboarding path instead of the manual choice modal. No
      // intent (organic /signup) keeps today's OnboardingChoiceModal.
      const planIntent = getPlanIntentFromUrl();
      if (planIntent === 'team') {
        setNeedsOrgChoice(true);
        setOnboardingCompanyStep(true);
        return;
      }
      if (planIntent === 'personal' || planIntent === 'free') {
        setNeedsOrgChoice(true);
        await handlePersonalOnboarding(planIntent);
        return;
      }
      // Multi-org user: nothing loads until an explicit org choice.
      setNeedsOrgChoice(true);
      return;
    }
    setNeedsOrgChoice(false);
    try {
      await hydrateAuthenticated(nextSession);
    } catch (error) {
      console.error('Failed to load remote data after login', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateAuthenticated]);

  const handleSwitchOrganization = useCallback(async (organizationId: string) => {
    const nextSession = await switchOrganization(organizationId);
    if (!nextSession || !nextSession.organizationId) {
      return;
    }
    setSession(nextSession);
    setNeedsOrgChoice(false);
    setShifts([]);
    try {
      await hydrateAuthenticated(nextSession);
    } catch (error) {
      console.error('Failed to load organization data', error);
    }
  }, [hydrateAuthenticated]);

  // Fase 1.2C.3: "Para mí" — creates the personal org for a zero-membership
  // session and lands on Mis turnos. Fase 1.2G.5: an explicit plan carries
  // the pricing-page intent (free vs personal); omitted defaults to free.
  const handlePersonalOnboarding = useCallback(async (plan?: 'free' | 'personal') => {
    try {
      const nextSession = await completePersonalOnboarding(plan);
      setSession(nextSession);
      setNeedsOrgChoice(false);
      setOnboardingCompanyStep(false);
      await hydrateAuthenticated(nextSession);
    } catch (error) {
      console.error('Personal onboarding failed', error);
      window.alert(t('onboardingChoice.failed'));
    }
  }, [hydrateAuthenticated, t]);

  // Fase 1.2C.4: "Para mi empresa" — creates the company org and lands on
  // Equipo. Errors propagate so CompanyOnboardingModal can show them inline.
  const handleCompanyOnboarding = useCallback(async (companyName: string, adminName?: string) => {
    const nextSession = await completeCompanyOnboarding(companyName, adminName);
    setSession(nextSession);
    setNeedsOrgChoice(false);
    setOnboardingCompanyStep(false);
    await hydrateAuthenticated(nextSession);
  }, [hydrateAuthenticated]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
    setSession(null);
    setEmployees([]);
    setSelectedEmployeeId(null);
    setNeedsOrgChoice(false);
    setOnboardingCompanyStep(false);
    setMigrationPrompt(null);
    setIsMembersOpen(false);
    setShifts(await loadShifts());
  }, []);

  const handleSelectEmployee = useCallback(async (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    try {
      setShifts(await loadRemoteShifts(employeeId));
    } catch (error) {
      console.error('Failed to load employee shifts', error);
    }
  }, []);

  /** Persist changes through the right backend: remote when authenticated,
   * localStorage for guests. */
  const persistChanges = useCallback(async (
    nextShifts: Shift[],
    changes: { upserts?: Shift[]; deleteIds?: string[]; importId?: string },
  ): Promise<void> => {
    if (session && selectedEmployeeId) {
      await syncRemoteShifts(selectedEmployeeId, changes);
      return;
    }
    await syncShiftChanges(nextShifts, changes);
  }, [session, selectedEmployeeId]);

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

  // Fase 1.2A.1: an authenticated user landing on /login or /signup (e.g. via
  // back button) is sent straight to the app instead of seeing the form again.
  useEffect(() => {
    if (session && (route === '/login' || route === '/signup')) {
      navigate('/app');
    }
  }, [session, route]);

  // Fase 1.2A.2: post-login router. /app is one physical route that already
  // adapts by role; this only drives the page title from the same
  // contractual resolver (EMPLOYEE → Mis turnos, MANAGER/ADMIN → Equipo,
  // multi-org unresolved → org selector) so it stays a single source of truth.
  useEffect(() => {
    if (route !== '/app' || !session) {
      return;
    }
    document.title = POST_LOGIN_TITLES[resolvePostLoginDestination(session, needsOrgChoice)];
  }, [route, session, needsOrgChoice]);

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
      await persistChanges(nextShifts, { upserts: [shift] });
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
      await persistChanges(nextShifts, { deleteIds: [id] });
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

  /**
   * Authenticated import: resolves the parse identity against the org
   * employee directory (external id first, then normalized name).
   * - recognized → import under that employee;
   * - ambiguous → abort with explicit message (no silent matching);
   * - new → MANAGER/ADMIN may create the employee inline and continue.
   */
  const resolveImportEmployee = useCallback(async (
    selector?: { name: string; externalId: string },
  ): Promise<RemoteEmployee | null> => {
    if (!session) {
      return null;
    }

    if (session.role === 'EMPLOYEE') {
      return employees.find((employee) => employee.id === session.employeeId) ?? null;
    }

    const selected = employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
    const name = (selector?.name ?? '').trim();
    const externalId = (selector?.externalId ?? '').trim();

    // Identity untouched relative to the selected employee: no resolution needed.
    if (selected
      && (!name || name.toLowerCase() === selected.name.trim().toLowerCase())
      && (!externalId || externalId === (selected.externalEmployeeId ?? ''))) {
      return selected;
    }

    const match = await matchRemoteEmployee({ name, externalId });

    if (match.kind === 'recognized') {
      return match.employees[0];
    }

    if (match.kind === 'ambiguous') {
      window.alert(t('team.ambiguousEmployee', { name }));
      return null;
    }

    // kind === 'new': inline alta, never leaves the import flow.
    const label = externalId ? `${name || externalId} (ID ${externalId})` : name;
    if (!name) {
      return null;
    }
    if (!window.confirm(t('team.createEmployeeConfirm', { employee: label }))) {
      return null;
    }
    const created = await createRemoteEmployee({ name, externalEmployeeId: externalId || undefined });
    setEmployees((current) => [...current, created]);
    return created;
  }, [session, employees, selectedEmployeeId, t]);

  const handleConfirmImport = async (
    newShifts: Shift[],
    targetPeriod: CalendarImportContext,
    selector?: { name: string; externalId: string },
  ): Promise<boolean> => {
    // Authenticated mode: resolve the target employee first; switching the
    // working set keeps each employee's calendar isolated.
    let importId: string | undefined;
    let targetEmployeeId = selectedEmployeeId;
    if (session) {
      let targetEmployee: RemoteEmployee | null;
      try {
        targetEmployee = await resolveImportEmployee(selector);
      } catch (error) {
        console.error('Failed to resolve import employee', error);
        window.alert(t('team.resolveEmployeeFailed'));
        return false;
      }
      if (!targetEmployee) {
        return false;
      }
      targetEmployeeId = targetEmployee.id;

      try {
        const created = await createRemoteImport({
          fileName: '',
          sourceFormat: newShifts[0]?.sourceFormat ?? '',
          periodYear: targetPeriod.year,
          periodMonth: targetPeriod.month,
        });
        importId = created.id;
      } catch (error) {
        console.error('Failed to register import', error);
      }
    }

    const snapshot = targetEmployeeId === selectedEmployeeId
      ? [...shifts]
      : await loadRemoteShifts(targetEmployeeId ?? '').catch(() => [] as Shift[]);
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
      if (session && targetEmployeeId) {
        await syncRemoteShifts(targetEmployeeId, { upserts, deleteIds, importId });
        if (targetEmployeeId !== selectedEmployeeId) {
          setSelectedEmployeeId(targetEmployeeId);
        }
      } else {
        await syncShiftChanges(working, { upserts, deleteIds });
      }
      setShifts(working);
      setCurrentYear(targetPeriod.year);
      setCurrentMonth(targetPeriod.month);
      setIsImportOpen(false);
      setOnboardingFile(null);
      // TTFV funnel endpoint + onboarding completion on the first real import.
      trackTtfvEvent('import_confirmed');
      if (!loadOnboarding().completed) {
        completeOnboarding();
      }
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

  // Auth screen is a full-screen route-like surface (contract: no dashboard
  // chrome behind it).
  if (isAuthOpen && !session) {
    return (
      <>
        <AuthScreen
          onAuthenticated={handleAuthenticated}
          onContinueAsGuest={() => setIsAuthOpen(false)}
          onClose={() => setIsAuthOpen(false)}
        />
        <CookieConsent />
      </>
    );
  }

  // Fase 1.2A.1: public routing surfaces. /app (dashboard) still allows the
  // guest local-first flow when there's no session — the hard anonymous gate
  // is a Fase 1.2H decision, not implemented here.
  if (route === '/') {
    return (
      <>
        <LandingPage isAuthenticated={Boolean(session)} />
        <CookieConsent />
      </>
    );
  }

  if (route === '/pricing') {
    return (
      <>
        <PricingPage isAuthenticated={Boolean(session)} />
        <CookieConsent />
      </>
    );
  }

  if ((route === '/login' || route === '/signup') && !session) {
    return (
      <>
        <AuthScreen
          initialMode={route === '/signup' ? 'register' : 'login'}
          onAuthenticated={(nextSession) => {
            void handleAuthenticated(nextSession);
            navigate('/app');
          }}
          onContinueAsGuest={() => navigate('/app')}
          onClose={() => navigate('/')}
        />
        <CookieConsent />
      </>
    );
  }

  // Fase 1.2D: password recovery. Reachable regardless of session state
  // (a logged-in-elsewhere user may still follow a reset link).
  if (route === '/forgot-password') {
    return (
      <>
        <ForgotPasswordScreen />
        <CookieConsent />
      </>
    );
  }

  if (route === '/reset-password') {
    return (
      <>
        <ResetPasswordScreen />
        <CookieConsent />
      </>
    );
  }

  // EMPLOYEE without linked employee record: safe blocked state, no data.
  const unlinkedEmployee = session?.role === 'EMPLOYEE' && !session.employeeId;
  // Fase 1.2C.5 "estados incompletos": a personal organization should always
  // have its self-employee. Zero employees there means onboarding didn't
  // finish (e.g. request interrupted between org+membership and employee
  // creation) — never show an ambiguous empty calendar for that.
  const activeMembership = session?.memberships.find((m) => m.organizationId === session.organizationId);
  const brokenPersonalOrg = Boolean(
    session && !needsOrgChoice && activeMembership?.organizationType === 'personal'
      && !session.employeeId && employees.length === 0,
  );
  const accountIncomplete = unlinkedEmployee || brokenPersonalOrg;

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
        {!session && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setIsAuthOpen(true)}
              style={{ padding: '8px 14px', fontWeight: 700 }}
            >
              {t('auth.signIn')}
            </button>
          </div>
        )}

        {accountIncomplete ? (
          <div
            role="status"
            style={{
              padding: '20px',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px',
              background: 'var(--panel-muted-bg)',
              textAlign: 'center',
              marginBottom: '12px',
            }}
          >
            <strong>{t(brokenPersonalOrg ? 'brokenPersonalOrg.title' : 'unlinkedEmployee.title')}</strong>
            <p style={{ margin: '8px 0 12px', color: 'var(--text-muted)' }}>
              {t(brokenPersonalOrg ? 'brokenPersonalOrg.description' : 'unlinkedEmployee.description')}
            </p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => void handleLogout()}
              style={{ padding: '8px 14px', fontWeight: 700 }}
            >
              {t('auth.logoutAction')}
            </button>
          </div>
        ) : session && !needsOrgChoice && (
          <div
            className="team-bar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '12px',
              padding: '10px 14px',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px',
              background: 'var(--panel-muted-bg)',
              fontSize: '0.85rem',
            }}
          >
            {session.memberships.length > 1 ? (
              <select
                className="modal-input"
                value={session.organizationId ?? ''}
                onChange={(event) => void handleSwitchOrganization(event.target.value)}
                aria-label={t('orgSelector.title')}
                style={{ padding: '6px 10px', fontWeight: 700, width: 'auto' }}
              >
                {session.memberships.map((membership) => (
                  <option key={membership.organizationId} value={membership.organizationId}>
                    {membership.organizationName}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontWeight: 700 }}>
                {session.memberships.find((m) => m.organizationId === session.organizationId)?.organizationName ?? ''}
              </span>
            )}
            <span style={{ color: 'var(--text-subtle)' }}>{session.role}</span>
            {session.role === 'EMPLOYEE' ? (
              <span style={{ color: 'var(--text-muted)' }}>{t('team.myShifts')}</span>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                {t('team.teamLabel')}
                <select
                  className="modal-input"
                  value={selectedEmployeeId ?? ''}
                  onChange={(event) => void handleSelectEmployee(event.target.value)}
                  style={{ padding: '6px 10px' }}
                >
                  {employees.filter((employee) => employee.status === 'active').map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}{employee.externalEmployeeId ? ` (ID ${employee.externalEmployeeId})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(session.role === 'ADMIN' || session.role === 'MANAGER') && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => setIsTeamImportOpen(true)}
                style={{ padding: '6px 12px', fontWeight: 700 }}
              >
                {t('teamImport.openAction')}
              </button>
            )}
            {session.role === 'ADMIN' && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => setIsMembersOpen(true)}
                style={{ padding: '6px 12px', fontWeight: 700 }}
              >
                {t('members.title')}
              </button>
            )}
            <button
              type="button"
              className="btn-outline"
              onClick={() => void handleLogout()}
              style={{ padding: '6px 12px', fontWeight: 700, marginLeft: 'auto' }}
            >
              {t('auth.logoutAction')}
            </button>
          </div>
        )}

        {!accountIncomplete && !needsOrgChoice && (
          <>
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
          </>
        )}
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onRestartOnboarding={() => {
          resetOnboarding();
          setIsSettingsOpen(false);
          setIsOnboardingOpen(true);
        }}
      />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onFileChosen={(chosen) => {
          setIsOnboardingOpen(false);
          setOnboardingFile(chosen);
          setIsImportOpen(true);
        }}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setOnboardingFile(null);
        }}
        onConfirmImport={handleConfirmImport}
        initialContext={{ month: currentMonth, year: currentYear }}
        existingShifts={shifts}
        initialFile={onboardingFile}
        employeePreset={(() => {
          const selected = employees.find((employee) => employee.id === selectedEmployeeId);
          return selected
            ? { name: selected.name, externalId: selected.externalEmployeeId ?? '' }
            : null;
        })()}
      />

      <OrgSelectorModal
        isOpen={Boolean(session) && needsOrgChoice && (session?.memberships.length ?? 0) > 0}
        memberships={session?.memberships ?? []}
        onSelect={(organizationId) => void handleSwitchOrganization(organizationId)}
        onLogout={() => void handleLogout()}
      />

      <OnboardingChoiceModal
        isOpen={Boolean(session) && needsOrgChoice && (session?.memberships.length ?? 0) === 0 && !onboardingCompanyStep}
        onSelectPersonal={() => void handlePersonalOnboarding()}
        onSelectCompany={() => setOnboardingCompanyStep(true)}
        onLogout={() => void handleLogout()}
      />

      <CompanyOnboardingModal
        isOpen={Boolean(session) && needsOrgChoice && (session?.memberships.length ?? 0) === 0 && onboardingCompanyStep}
        requireAdminName={!session?.user.displayName}
        onConfirm={handleCompanyOnboarding}
        onBack={() => setOnboardingCompanyStep(false)}
      />

      <LocalMigrationModal
        isOpen={migrationPrompt !== null}
        shiftCount={migrationPrompt?.count ?? 0}
        organizationName={session?.memberships.find((m) => m.organizationId === session.organizationId)?.organizationName ?? ''}
        employeeName={employees.find((employee) => employee.id === session?.employeeId)?.name ?? session?.user.displayName ?? ''}
        onImport={handleMigrationImport}
        onKeepLocal={() => {
          window.localStorage.setItem(MIGRATION_DONE_KEY, 'local-only');
          setMigrationPrompt(null);
        }}
        onCancel={() => setMigrationPrompt(null)}
      />

      <MembersModal
        isOpen={isMembersOpen}
        onClose={() => setIsMembersOpen(false)}
        employees={employees}
        currentUserId={session?.user.id ?? ''}
        onChanged={() => {
          if (session) {
            void hydrateAuthenticated(session);
          }
        }}
      />

      <TeamImportModal
        isOpen={isTeamImportOpen}
        onClose={() => setIsTeamImportOpen(false)}
        onImported={() => {
          if (session) {
            void hydrateAuthenticated(session);
          }
        }}
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







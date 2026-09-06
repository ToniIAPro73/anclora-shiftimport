import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Shift } from './lib/types';
import { getMonthDaysISO, getDaysInMonth } from './lib/week';
import { clearAnonymousShiftDraft, loadShifts, normalizeShift, syncShiftChanges } from './lib/storage';
import { findShiftConflict } from './lib/shift-conflicts';

import { fingerprintShift } from './lib/import-dedup';
import { reconcileImport, ReconciliationReport } from './lib/import-reconciliation';
import { getShiftOrigin, getShiftType, hasShiftTimes } from './lib/shifts';
import { loadOnboarding, resetOnboarding, shouldShowOnboarding, completeOnboarding as completeOnboardingGuide } from './lib/onboarding';
import { trackTtfvEvent } from './lib/ttfv';
import {
  fetchResolvedSession,
  fetchSession,
  logout,
  setRequestOrganizationId,
  setUnauthorizedHandler,
  switchOrganization,
  completeOnboarding,
  isAdminRole,
  ApiError,
  OrganizationOnboardingInput,
  SessionInfo,
} from './lib/session';
import {
  createRemoteEmployee,
  confirmRemoteFutureImport,
  createRemoteImport,
  updateRemoteImportOutcome,
  listRemoteAreas,
  listRemoteEmployees,
  listRemoteScheduleVersions,
  loadRemoteShifts,
  matchRemoteEmployee,
  RemoteArea,
  RemoteEmployee,
  syncRemoteShifts,
} from './lib/remote';
import { findAreaMismatch } from './lib/areas';
import { resolveInactiveEmployeeMatch } from './lib/inactive-employee';
import { setVlmFallbackSessionActive } from './ingestion/vlm-client';
import { StatsBar } from './components/shift-dashboard/StatsBar';
import { MonthGrid } from './components/shift-dashboard/MonthGrid';
import { ShiftModal } from './components/shift-dashboard/ShiftModal';
import { ImportModal, SelfImportSummary } from './components/shift-dashboard/ImportModal';
import { OnboardingModal } from './components/shift-dashboard/OnboardingModal';
import { SettingsModal } from './components/shift-dashboard/SettingsModal';
import { OrgSelectorModal } from './components/shift-dashboard/OrgSelectorModal';
import { OnboardingChoiceModal } from './components/shift-dashboard/OnboardingChoiceModal';
import { FormatProfileMigrationModal } from './components/shift-dashboard/FormatProfileMigrationModal';
import { MembersModal } from './components/shift-dashboard/MembersModal';
import { AreasModal } from './components/shift-dashboard/AreasModal';
import { ImportHistoryModal } from './components/shift-dashboard/ImportHistoryModal';
import { FormatProfilesModal } from './components/shift-dashboard/FormatProfilesModal';
import { TeamImportModal } from './components/shift-dashboard/TeamImportModal';
import { ImportResultModal, ImportOutcomeReport } from './components/shift-dashboard/ImportResultModal';
import { ModalShell } from './components/ui/ModalShell';
import { ApprovalInboxModal } from './components/shift-dashboard/ApprovalInboxModal';
import { PortalShell } from './components/employee-portal/PortalShell';
import { WeeklyPlanner } from './components/scheduling/WeeklyPlanner';
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
import { SearchableSelect } from './components/ui/SearchableSelect';
import { AppShell, CalendarToolbar } from './components/app-shell/AppShell';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { LanguageToggle } from './components/ui/LanguageToggle';
import { ImportPeriod } from './lib/import-types';
import type { DetectedTeamEmployee } from './ingestion/team-roster';
import { normalizeText } from './ingestion/core/normalize';
import { loadFormatProfiles } from './lib/format-profiles';
import { getFormatProfileStore } from './lib/format-profile-store';
import { translateShiftTypeLabel } from './lib/i18n';
import { useI18n } from './lib/use-i18n';
import { getOperationalDate, getPreviousOperationalDate, isHistoricalDate, shiftOperationalDate } from './lib/operational-date';

/** localStorage flag: local→org format-profile migration already resolved
 * (Format Memory v1). Separate from MIGRATION_DONE_KEY — shift data and
 * format profiles migrate independently. */
const FORMAT_PROFILE_MIGRATION_DONE_KEY = 'anclora_shiftimport_format_profiles_migrated_v1';

function insertShift(current: Shift[], incoming: Shift): Shift[] {
  return [...current.filter((shift) => shift.id !== incoming.id), normalizeShift(incoming)];
}

/** Human-readable snapshot of the imported period, rendered once at confirm
 * time in the active locale (see imports.period_label — the history never
 * retranslates it after the fact). */
function formatImportPeriodLabel(period: ImportPeriod, monthNames: string[]): string {
  if (period.kind === 'single') {
    return `${monthNames[period.month] ?? period.month} ${period.year}`;
  }
  if (period.periods.length === 0) {
    return '';
  }
  const sorted = [...period.periods].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstLabel = monthNames[first.month] ?? first.month;
  const lastLabel = monthNames[last.month] ?? last.month;
  return first.year === last.year
    ? `${firstLabel}–${lastLabel} ${first.year}`
    : `${firstLabel} ${first.year}–${lastLabel} ${last.year}`;
}

interface ImportConflictState {
  existing: Shift;
  incoming: Shift;
  resolve: (action: 'replace' | 'skip' | 'abort') => void;
}

interface ImportFailure {
  status: 'blocked' | 'failed' | 'partial';
  reason: string;
  blockingEmployeeId?: string | null;
  blockingEmployeeName?: string | null;
}

interface PendingImportRetry {
  newShifts: Shift[];
  targetPeriod: ImportPeriod;
  selector?: { name: string; externalId: string };
  areaId?: string | null;
  fileName?: string;
  fileFingerprint?: string;
  selfImportSummary?: SelfImportSummary;
}

interface ImportResolutionState {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (confirmed: boolean) => void;
}

interface AppFeedback {
  kind: 'status' | 'alert';
  message: string;
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
  const { locale, t, tl } = useI18n();
  const legalPath = typeof window !== 'undefined' ? window.location.pathname.replace(/^\/+/, '') : '';
  const route = useRoute();
  const [shifts, setShifts] = useState<Shift[]>([]);
  // Fase 1: authenticated multi-tenant state. null = guest (local-first flow).
  const [session, setSession] = useState<SessionInfo | null>(null);
  // The app shell must not render while the first session resolution is still
  // in flight: null conflates "guest" with "not resolved yet", and rendering
  // on an indeterminate state is what produces partial-auth flashes.
  const [authResolved, setAuthResolved] = useState(false);
  // Bumped on every transition to unauthenticated: async auth work started
  // before the transition (bootstrap, post-login hydration) must never write
  // state afterwards, or it would resurrect org data into the guest view.
  const authEpochRef = useRef(0);
  const sessionRef = useRef<SessionInfo | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  // VLM fallback availability follows the session: the endpoint is org-scoped,
  // so it is only offered with an active organization context (never guests,
  // never the pending org-choice state).
  useEffect(() => {
    setVlmFallbackSessionActive(Boolean(session?.organizationId));
  }, [session]);
  const [employees, setEmployees] = useState<RemoteEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const selectedEmployeeIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedEmployeeIdRef.current = selectedEmployeeId;
  }, [selectedEmployeeId]);
  // Areas opcionales (0..N por org): loaded with the authenticated bootstrap,
  // always empty in guest mode. selectedAreaId only matters with 2+ active
  // areas (null = whole company); 0/1-area orgs derive their context instead.
  const [areas, setAreas] = useState<RemoteArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [editableScheduleDates, setEditableScheduleDates] = useState<Set<string>>(() => new Set());
  const selectedAreaIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedAreaIdRef.current = selectedAreaId;
  }, [selectedAreaId]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  // Fase 1.1: explicit organization choice for multi-org accounts.
  const [needsOrgChoice, setNeedsOrgChoice] = useState(false);
  const [formatProfileMigrationOpen, setFormatProfileMigrationOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [membersInitialEmployeeId, setMembersInitialEmployeeId] = useState<string | null>(null);
  const [membersRecoveryResult, setMembersRecoveryResult] = useState<ImportOutcomeReport | null>(null);
  const [isAreasOpen, setIsAreasOpen] = useState(false);
  const [isImportHistoryOpen, setIsImportHistoryOpen] = useState(false);
  const [isFormatProfilesOpen, setIsFormatProfilesOpen] = useState(false);
  const [isApprovalsOpen, setIsApprovalsOpen] = useState(false);
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [appOperation, setAppOperation] = useState<'idle' | 'importing' | 'saving-shift'>('idle');
  const [importResult, setImportResult] = useState<(ReconciliationReport | ImportOutcomeReport) | null>(null);
  const [importResolutionState, setImportResolutionState] = useState<ImportResolutionState | null>(null);
  const [appFeedback, setAppFeedback] = useState<AppFeedback | null>(null);
  const [pendingImportRetry, setPendingImportRetry] = useState<PendingImportRetry | null>(null);
  const importFailureRef = useRef<ImportFailure | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingFile, setOnboardingFile] = useState<File | null>(null);
  const [adminIndividualImport, setAdminIndividualImport] = useState<{ file: File; employee: DetectedTeamEmployee; employeeId: string | null } | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [draftShiftDate, setDraftShiftDate] = useState<string | null>(null);
  const [importConflictState, setImportConflictState] = useState<ImportConflictState | null>(null);
  const isImporting = appOperation === 'importing';
  const isSavingShift = appOperation === 'saving-shift';
  const hasImportConflict = importConflictState !== null;

  useEffect(() => {
    if (!isImporting) {
      return;
    }
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [isImporting]);

  useEffect(() => {
    if (!isImporting) {
      return;
    }
    const keepFocusInImport = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && !(event.target as HTMLElement).closest('[data-import-modal], [data-import-conflict]')) {
        event.preventDefault();
        document.querySelector<HTMLElement>('[data-import-conflict] button, [data-import-modal] [data-import-progress]')?.focus();
      }
    };
    document.querySelector<HTMLElement>('[data-import-conflict] button, [data-import-modal] [data-import-progress]')?.focus();
    document.addEventListener('keydown', keepFocusInImport, true);
    return () => document.removeEventListener('keydown', keepFocusInImport, true);
  }, [isImporting, hasImportConflict]);

  // Authenticated bootstrap: loads the org employees, picks the working
  // employee (self for EMPLOYEE role) and loads that employee's shifts.
  // Authenticated hydration is remote-only. Anonymous drafts are discarded
  // when crossing into an authenticated context.
  const hydrateAuthenticated = useCallback(async (nextSession: SessionInfo): Promise<void> => {
    const epoch = authEpochRef.current;
    // D-05 is a server-derived scope rule. Load areas first so an unassigned
    // PLANNER in an organization with active areas can render the explicit
    // blocked state instead of treating the expected employee-list 403 as a
    // dead session.
    const orgAreas = await listRemoteAreas();
    const plannerNeedsArea = nextSession.role === 'PLANNER'
      && !nextSession.memberships.find((membership) => membership.organizationId === nextSession.organizationId)?.scopedAreaId
      && orgAreas.some((area) => area.active);
    const employeeUnlinked = nextSession.role === 'EMPLOYEE' && !nextSession.employeeId;
    const orgEmployees = plannerNeedsArea || employeeUnlinked ? [] : await listRemoteEmployees();
    if (epoch !== authEpochRef.current) {
      return; // logged out (or session invalidated) while this was in flight
    }
    setEmployees(orgEmployees);
    setAreas(orgAreas);

    // Prefer keeping whatever employee was already selected (e.g. a
    // TeamImportModal import refresh, or a plain reload) as long as it's
    // still a valid active employee of THIS org's fresh roster — never a
    // stale id from a previous organization, since activeIds is always
    // scoped to orgEmployees just fetched for the current org.
    // Area context narrows the candidate pool the same way the team-bar
    // selector does: 1 active area ⇒ that area; 2+ ⇒ the chosen one.
    const activeAreas = orgAreas.filter((area) => area.active);
    const effectiveAreaId = activeAreas.length === 1
      ? activeAreas[0].id
      : (selectedAreaIdRef.current && activeAreas.some((area) => area.id === selectedAreaIdRef.current)
        ? selectedAreaIdRef.current
        : null);
    const areaEmployees = nextSession.role === 'EMPLOYEE' || effectiveAreaId === null
      ? orgEmployees
      : orgEmployees.filter((employee) => employee.areaId === effectiveAreaId);
    const activeIds = new Set(areaEmployees.filter((employee) => employee.status === 'active').map((employee) => employee.id));
    const previousSelection = selectedEmployeeIdRef.current;
    const initialEmployeeId = nextSession.role === 'EMPLOYEE'
      ? nextSession.employeeId
      : (previousSelection && activeIds.has(previousSelection)
        ? previousSelection
        : (nextSession.employeeId ?? areaEmployees[0]?.id ?? null));
    setSelectedEmployeeId(initialEmployeeId);

    if (!initialEmployeeId) {
      setShifts([]);
      return;
    }

    const remoteShifts = await loadRemoteShifts(initialEmployeeId);
    if (epoch !== authEpochRef.current) {
      return;
    }
    setShifts(remoteShifts);

    const formatProfileMigrationState = window.localStorage.getItem(FORMAT_PROFILE_MIGRATION_DONE_KEY);
    if (!formatProfileMigrationState && loadFormatProfiles().length > 0) {
      setFormatProfileMigrationOpen(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateShifts = async () => {
      try {
        const resolved = await fetchResolvedSession();
        if (cancelled) {
          return;
        }

        if (resolved) {
          clearAnonymousShiftDraft();
          setSession(resolved.session);
          setNeedsOrgChoice(resolved.needsOrgChoice);
          if (resolved.needsOrgChoice) {
            return;
          }
          try {
            await hydrateAuthenticated(resolved.session);
          } catch (error) {
            console.error('Failed to load remote shifts; refusing anonymous fallback', error);
            clearAnonymousShiftDraft();
            setSession(null);
            setShifts([]);
            navigate('/login');
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
      } catch (error) {
        if (cancelled) {
          return;
        }
        // Authentication is unknown (network/5xx/invalid response). Do not
        // interpret that state as guest mode: anonymous local drafts must not
        // become visible while the session is unresolved.
        console.error('Session resolution failed; blocking workspace', error);
        authEpochRef.current += 1;
        setRequestOrganizationId(null);
        clearAnonymousShiftDraft();
        setSession(null);
        setNeedsOrgChoice(false);
        setEmployees([]);
        setAreas([]);
        setShifts([]);
        navigate('/login');
      } finally {
        // The /app shell stays behind a loading gate until the first session
        // resolution (and its hydration) settles — success, fallback or guest.
        if (!cancelled) {
          setAuthResolved(true);
        }
      }
    };

    void hydrateShifts();

    return () => {
      cancelled = true;
    };
  }, [hydrateAuthenticated]);

  const handleAuthenticated = useCallback(async (nextSession: SessionInfo) => {
    clearAnonymousShiftDraft();
    setSession(nextSession);
    // The guest first-run guide may already be scheduled from the pre-auth
    // hydration effect (it runs regardless of route); a real session
    // supersedes it — onboarding here is the org-choice flow, not the
    // local-import guide.
    setIsOnboardingOpen(false);
    if (!nextSession.organizationId) {
      // New user (zero memberships): show onboarding choice modal.
      setNeedsOrgChoice(true);
      return;
    }
    setNeedsOrgChoice(false);
    try {
      await hydrateAuthenticated(nextSession);
    } catch (error) {
      console.error('Failed to load remote data after login', error);
    }
  }, [hydrateAuthenticated]);

  const handleSwitchOrganization = useCallback(async (organizationId: string) => {
    const nextSession = await switchOrganization(organizationId);
    if (!nextSession || !nextSession.organizationId) {
      return;
    }
    clearAnonymousShiftDraft();
    setSession(nextSession);
    setNeedsOrgChoice(false);
    setShifts([]);
    // Org switch: the area context belongs to the previous organization.
    setAreas([]);
    setSelectedAreaId(null);
    try {
      await hydrateAuthenticated(nextSession);
    } catch (error) {
      console.error('Failed to load organization data', error);
    }
  }, [hydrateAuthenticated]);

  // Unified onboarding: creates the selected organization and OWNER
  // membership. Owner-to-Employee linking remains explicit and optional.
  const handleOnboarding = useCallback(async (input: OrganizationOnboardingInput) => {
    try {
      const result = await completeOnboarding(input);
      clearAnonymousShiftDraft();
      setSession(result.session);
      setNeedsOrgChoice(false);
      await hydrateAuthenticated(result.session);
      if (result.adminCredentials) {
        setAppFeedback({
          kind: 'status',
          message: `${t('onboardingChoice.adminCredentialsNotice')} ${result.adminCredentials.email} · ${result.adminCredentials.temporaryPassword}`,
        });
      }
    } catch (error) {
      console.error('Onboarding failed', error);
      throw error;
    }
  }, [hydrateAuthenticated, t]);

  /**
   * Single transition point into the unauthenticated state. Used by explicit
   * logout, by the global 401 handler (session invalidated elsewhere) and by
   * bfcache restores of a stale authenticated page. Deterministic: clear ALL
   * auth-scoped state, then land on the login screen — never an intermediate
   * "app shell with null user" state. Guest data in localStorage is
   * preserved: guest mode remains reachable via "continuar como invitado".
   */
  const resetToUnauthenticated = useCallback(async () => {
    authEpochRef.current += 1;
    // Atomic transition: the auth-scoped state must COMMIT before the route
    // changes. Without flushSync, navigate()'s synchronous popstate dispatch
    // flushes the route update first (discrete-event priority), producing an
    // intermediate commit with (route=/login, session still set) — which the
    // authenticated-redirect effect above reads as "logged-in user on /login"
    // and bounces straight back to /app.
    flushSync(() => {
      setSession(null);
      setEmployees([]);
      setSelectedEmployeeId(null);
      setAreas([]);
      setSelectedAreaId(null);
      setNeedsOrgChoice(false);
      setIsMembersOpen(false);
      setIsAreasOpen(false);
      setIsAuthOpen(false);
    });
    clearAnonymousShiftDraft();
    setShifts([]);
    navigate('/login');
  }, []);

  const handleLogout = useCallback(async () => {
    if (isImporting) {
      return;
    }
    try {
      await logout();
    } catch (error) {
      // Server-side invalidation failed (offline, 5xx): the user intent is
      // still "leave", so the local transition happens regardless. A later
      // refresh legitimately restores the session in that case — it was
      // never invalidated server-side.
      console.error('Logout failed', error);
    }
    await resetToUnauthenticated();
  }, [isImporting, resetToUnauthenticated]);

  // A 401 on any authenticated API call means the session died server-side
  // (expired, or invalidated from another tab/device): transition instead of
  // rendering a broken authenticated shell.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (sessionRef.current) {
        void resetToUnauthenticated();
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [resetToUnauthenticated]);

  // Back/forward cache: restoring a page from bfcache brings back the
  // in-memory authenticated React state even though the cookie may already
  // be invalidated (e.g. logout happened after the page was cached).
  // Re-validate against the backend before trusting that restored state.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !sessionRef.current) {
        return;
      }
      void fetchSession().then((restored) => {
        if (!restored) {
          void resetToUnauthenticated();
        }
      });
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [resetToUnauthenticated]);

  const handleSelectEmployee = useCallback(async (employeeId: string) => {
    if (isImporting) {
      return;
    }
    setSelectedEmployeeId(employeeId);
    try {
      setShifts(await loadRemoteShifts(employeeId));
    } catch (error) {
      console.error('Failed to load employee shifts', error);
    }
  }, [isImporting]);

  // ------------------------------------------------------- area context
  // 0 active areas → no area UI at all; 1 → implicit context (text only);
  // 2+ → selectedAreaId (null = whole company). EMPLOYEE never gets a
  // selector: their context is their own employee's area.
  const activeAreas = useMemo(() => areas.filter((area) => area.active), [areas]);
  const selfEmployee = session?.role === 'EMPLOYEE'
    ? employees.find((employee) => employee.id === session.employeeId) ?? null
    : null;
  const effectiveAreaId = session?.role === 'EMPLOYEE'
    ? (selfEmployee?.areaId ?? null)
    : (activeAreas.length === 1
      ? activeAreas[0].id
      : (selectedAreaId && activeAreas.some((area) => area.id === selectedAreaId) ? selectedAreaId : null));
  // Roster offered in the team-bar selector (ADMIN): narrowed to the area
  // when one is in context; the full org roster otherwise.
  const visibleEmployees = useMemo(
    () => (session && session.role !== 'EMPLOYEE' && effectiveAreaId !== null
      ? employees.filter((employee) => employee.areaId === effectiveAreaId)
      : employees),
    [session, effectiveAreaId, employees],
  );

  useEffect(() => {
    if (!session || session.role === 'EMPLOYEE' || needsOrgChoice) {
      setEditableScheduleDates(new Set());
      return undefined;
    }
    let cancelled = false;
    void listRemoteScheduleVersions(effectiveAreaId).then((versions) => {
      if (cancelled) return;
      const dates = new Set<string>();
      for (const version of versions) {
        if (version.status !== 'DRAFT') continue;
        for (let cursor = version.periodStart; cursor <= version.periodEnd; cursor = shiftOperationalDate(cursor, 1)) {
          if (cursor >= getOperationalDate()) dates.add(cursor);
        }
      }
      setEditableScheduleDates(dates);
    }).catch(() => {
      if (!cancelled) setEditableScheduleDates(new Set());
    });
    return () => { cancelled = true; };
  }, [effectiveAreaId, needsOrgChoice, session]);

  // Keep the working employee consistent with the area context: when the
  // area changes (or an area is deactivated), a selected employee outside
  // the area is replaced by the first active one inside it — never kept
  // silently, or the calendar would show cross-area data.
  useEffect(() => {
    if (!session || session.role === 'EMPLOYEE') {
      return;
    }
    const candidates = visibleEmployees.filter((employee) => employee.status === 'active');
    if (selectedEmployeeId && candidates.some((employee) => employee.id === selectedEmployeeId)) {
      return;
    }
    const next = candidates[0]?.id ?? null;
    if (next === selectedEmployeeId) {
      return;
    }
    setSelectedEmployeeId(next);
    if (next) {
      loadRemoteShifts(next)
        .then(setShifts)
        .catch((error) => console.error('Failed to load employee shifts', error));
    } else {
      setShifts([]);
    }
  }, [session, visibleEmployees, selectedEmployeeId]);

  const refreshAreas = useCallback(async () => {
    try {
      setAreas(await listRemoteAreas());
    } catch (error) {
      console.error('Failed to refresh areas', error);
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

  // Fase 1.2A.1: an authenticated user landing on /login or /signup (e.g. via
  // back button) is sent straight to the app instead of seeing the form again.
  useEffect(() => {
    if (session && (route === '/login' || route === '/signup')) {
      navigate('/app');
    }
  }, [session, route]);

  // Fase 1.2A.2: post-login router. /app is one physical route that already
  // adapts by role; this only drives the page title from the same
  // contractual resolver (EMPLOYEE → Mis turnos, ADMIN → Equipo,
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
    if (isImporting) {
      return;
    }
    const d = new Date(currentYear, currentMonth + delta, 1);
    setCurrentYear(d.getFullYear());
    setCurrentMonth(d.getMonth());
  };

  const handleSaveShift = async (shift: Shift) => {
    if (isImporting || isSavingShift) {
      return;
    }
    if (!isHistoricalDate(shift.date)) {
      setAppFeedback({ kind: 'alert', message: t('shiftModal.historicalOnly') });
      return;
    }
    const conflict = findShiftConflict(shifts, shift, locale);
    if (conflict) {
      setAppFeedback({ kind: 'alert', message: conflict });
      return;
    }

    const nextShifts = insertShift(shifts, shift);

    setAppOperation('saving-shift');
    try {
      await persistChanges(nextShifts, { upserts: [shift] });
      setShifts(nextShifts);
      setIsModalOpen(false);
      setEditingShiftId(null);
      setDraftShiftDate(null);
      setAppFeedback({ kind: 'status', message: t('shiftModal.saveSuccess') });
    } catch (error) {
      console.error('Failed to persist shift', error);
      setAppFeedback({ kind: 'alert', message: t('importConflict.saveShiftFailed') });
    } finally {
      setAppOperation('idle');
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (isImporting || isSavingShift) {
      return;
    }
    const nextShifts = shifts.filter(s => s.id !== id);

    try {
      await persistChanges(nextShifts, { deleteIds: [id] });
      setShifts(nextShifts);
      setIsModalOpen(false);
      setEditingShiftId(null);
      setDraftShiftDate(null);
    } catch (error) {
      console.error('Failed to delete shift', error);
      setAppFeedback({ kind: 'alert', message: t('importConflict.deleteShiftFailed') });
    }
  };

  const handleEditShift = (id: string) => {
    if (isImporting) {
      return;
    }
    setDraftShiftDate(null);
    setEditingShiftId(id);
    setIsModalOpen(true);
  };

  const handleCreateShiftForDate = (date: string) => {
    if (isImporting) {
      return;
    }
    if (isHistoricalDate(date)) {
      setEditingShiftId(null);
      setDraftShiftDate(date);
      setIsModalOpen(true);
      return;
    }
    navigate('/app/schedule', `date=${encodeURIComponent(date)}`);
  };

  const requestImportDecision = (existing: Shift, incoming: Shift) =>
    new Promise<'replace' | 'skip' | 'abort'>((resolve) => {
      setImportConflictState({ existing, incoming, resolve });
    });

  const requestImportResolution = (input: Omit<ImportResolutionState, 'resolve'>) =>
    new Promise<boolean>((resolve) => {
      setImportResolutionState({ ...input, resolve });
    });

  const markImportFailure = (failure: ImportFailure) => {
    importFailureRef.current = failure;
  };

  const persistImportFailure = async (failure: ImportFailure, retry: PendingImportRetry) => {
    setPendingImportRetry(retry);
    const attemptedCount = retry.newShifts.length;
    const outcome: ImportOutcomeReport = {
      ...failure,
      attemptedCount,
      createdShiftCount: 0,
      existingShiftCount: 0,
    };
    setImportResult(outcome);
    try {
      await createRemoteImport({
        fileName: retry.fileName ?? '',
        sourceFormat: retry.newShifts[0]?.sourceFormat ?? '',
        fileFingerprint: retry.fileFingerprint,
        employeeId: failure.blockingEmployeeId ?? null,
        periodYear: retry.targetPeriod.kind === 'single' ? retry.targetPeriod.year : null,
        periodMonth: retry.targetPeriod.kind === 'single' ? retry.targetPeriod.month : null,
        areaId: retry.areaId ?? null,
        importMode: 'individual',
        periodKind: retry.targetPeriod.kind,
        periodLabel: formatImportPeriodLabel(retry.targetPeriod, tl('calendar.months')),
        employeeCount: 1,
        shiftCount: attemptedCount,
        createdShiftCount: 0,
        existingShiftCount: 0,
        outcome: {
          status: failure.status,
          reason: failure.reason,
          blockingEmployeeId: failure.blockingEmployeeId ?? null,
          detail: { attemptedCount },
        },
      });
    } catch (error) {
      // The local result remains visible even if the history write itself is
      // unavailable; the failure is logged for later recovery rather than
      // replacing the useful, specific outcome with a generic alert.
      console.error('Failed to persist import outcome', error);
    }
  };

  /**
   * Authenticated import: resolves the parse identity against the org
   * employee directory (external id first, then normalized name).
   * - recognized → import under that employee;
   * - ambiguous → abort with explicit message (no silent matching);
   * - new → ADMIN may create the employee inline and continue.
   */
  const resolveImportEmployee = useCallback(async (
    selector?: { name: string; externalId: string },
    areaId?: string | null,
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

    // An ADMIN's individual dispatch is anchored to the identity resolved
    // at detection time (adminIndividualImport.employeeId), never to
    // whatever the toolbar's employee selector currently shows — that can
    // be stale (e.g. still pointing at the previously viewed employee) when
    // the uploaded file's identity didn't match anyone. Trusting `selected`
    // here silently attributed shifts to the wrong employee (real
    // incident: an unregistered "Sebastián Pozo Mendoza" import landed on
    // whoever was selected in the toolbar). No match at detection time
    // means no employee to return — fall through to the explicit
    // resolution below, which for this path always ends in 'new' and is
    // blocked/offered for inline registration there, never silently reused.
    if (adminIndividualImport) {
      if (adminIndividualImport.employeeId) {
        // Recovery may return from MembersModal immediately after its link
        // request while the parent hydration is still in flight. Re-read the
        // authoritative employee row so a just-linked employee is not
        // mistaken for the previous pending_access snapshot.
        const currentEmployees = await listRemoteEmployees().catch(() => employees);
        const matched = currentEmployees.find((employee) => employee.id === adminIndividualImport.employeeId) ?? null;
        if (matched) {
          if (matched.status === 'pending_access') {
            markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_PENDING_ACCESS', blockingEmployeeId: matched.id, blockingEmployeeName: matched.name });
            return null;
          }
          if (matched.status === 'inactive') {
            markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_INACTIVE', blockingEmployeeId: matched.id, blockingEmployeeName: matched.name });
            return null;
          }
          return matched;
        }
      }
    } else if (selected
      && (!name || name.toLowerCase() === selected.name.trim().toLowerCase())
      && (!externalId || externalId === (selected.externalEmployeeId ?? ''))) {
      // Identity untouched relative to the selected employee: no resolution needed.
      return selected;
    }

    const match = await matchRemoteEmployee({ name, externalId });

    if (match.kind === 'recognized') {
      return match.employees[0];
    }

    // Bloque E: an inactive existing employee is never silently reactivated
    // nor duplicated — ADMIN chooses explicitly; other roles are blocked.
    if (match.kind === 'recognized_inactive') {
      const matched = match.employees[0];
      const resolution = await resolveInactiveEmployeeMatch({
        employee: matched,
        role: session.role,
        confirmReactivate: () => requestImportResolution({
          title: t('team.reactivateEmployeeTitle'),
          description: t('team.reactivateEmployeeConfirm', { name: matched.name }),
          confirmLabel: t('team.reactivateEmployeeAction'),
          cancelLabel: t('importResult.close'),
        }),
      });
      if (resolution.kind === 'not_admin') {
        markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_INACTIVE', blockingEmployeeId: matched.id, blockingEmployeeName: matched.name });
        return null;
      }
      if (resolution.kind === 'kept_inactive') {
        markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_INACTIVE', blockingEmployeeId: matched.id, blockingEmployeeName: matched.name });
        return null;
      }
      setEmployees((current) => current.map((employee) => (employee.id === resolution.employee.id ? resolution.employee : employee)));
      return resolution.employee;
    }

    // pending_access: the employee exists (already or freshly registered)
    // but never got a user linked to them. Unlike recognized_inactive there
    // is no one-click reactivation — completing registration means adding
    // real access details in "Usuarios de la organización" — so this always
    // blocks the import rather than offering an inline resolution.
    if (match.kind === 'recognized_pending') {
      const matched = match.employees[0];
      markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_PENDING_ACCESS', blockingEmployeeId: matched?.id, blockingEmployeeName: matched?.name ?? name });
      return null;
    }

    if (match.kind === 'ambiguous') {
      markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_AMBIGUOUS', blockingEmployeeName: name });
      return null;
    }

    // kind === 'new': inline alta, never leaves the import flow. The new
    // employee inherits the import's area context (never a cross-area row).
    const label = externalId ? `${name || externalId} (ID ${externalId})` : name;
    if (!name) {
      return null;
    }
    // A single-person auto-dispatch never imports straight onto a brand-new
    // identity — only ACTIVE employees may receive imported shifts (backend
    // enforces this too, see EMPLOYEE_NOT_ACTIVE). Offer a partial alta
    // (pending_access: name + external id only, no email) so the admin
    // doesn't have to leave this flow to start registering them, but this
    // import attempt still stops here — it resumes only after the admin
    // completes the registration in "Usuarios de la organización" and
    // re-runs the import.
    if (adminIndividualImport) {
      const shouldCreate = await requestImportResolution({
        title: t('team.createEmployeePartialTitle'),
        description: t('team.createEmployeePartialConfirm', { employee: label }),
        confirmLabel: t('team.createEmployeePartialAction'),
        cancelLabel: t('importResult.close'),
      });
      markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_UNKNOWN', blockingEmployeeName: label });
      if (shouldCreate) {
        try {
          const created = await createRemoteEmployee({ name, externalEmployeeId: externalId || undefined, areaId: areaId ?? undefined });
          setEmployees((current) => [...current, created]);
          markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_PENDING_ACCESS', blockingEmployeeId: created.id, blockingEmployeeName: label });
        } catch (error) {
          console.error('Failed to create partial employee from single-import flow', error);
          markImportFailure({ status: 'failed', reason: 'SYSTEM_ERROR', blockingEmployeeName: label });
        }
      }
      return null;
    }
    const shouldCreate = await requestImportResolution({
      title: t('team.createEmployeeTitle'),
      description: t('team.createEmployeeConfirm', { employee: label }),
      confirmLabel: t('team.createEmployeeAction'),
      cancelLabel: t('importResult.close'),
    });
    if (!shouldCreate) {
      markImportFailure({ status: 'blocked', reason: 'EMPLOYEE_UNKNOWN', blockingEmployeeName: label });
      return null;
    }
    const created = await createRemoteEmployee({ name, externalEmployeeId: externalId || undefined, areaId: areaId ?? undefined });
    setEmployees((current) => [...current, created]);
    return created;
  }, [session, employees, selectedEmployeeId, adminIndividualImport, t]);

  const handleConfirmImport = async (
    newShifts: Shift[],
    targetPeriod: ImportPeriod,
    selector?: { name: string; externalId: string },
    areaId?: string | null,
    fileName?: string,
    fileFingerprint?: string,
    selfImportSummary?: SelfImportSummary,
  ): Promise<boolean> => {
    // Defense in depth: the modal disables guest confirmation, and the
    // controller also fails closed so a stale event cannot write locally.
    if (!session) {
      clearAnonymousShiftDraft();
      return false;
    }
    const selfImportDetail = selfImportSummary ? {
      totalRows: selfImportSummary.totalRows,
      ownRows: selfImportSummary.ownRows,
      ignoredRows: selfImportSummary.ignoredRows,
      unidentifiedRows: selfImportSummary.unidentifiedRows,
      futureOwnRows: selfImportSummary.futureOwnRows,
    } : null;
    if (session.role === 'EMPLOYEE' && selfImportSummary && selfImportSummary.ownRows === 0) {
      const outcome: ImportOutcomeReport = {
        status: 'blocked',
        reason: selfImportSummary.identityAmbiguous ? 'EMPLOYEE_AMBIGUOUS' : 'SELF_IDENTITY_NOT_FOUND',
        attemptedCount: selfImportSummary.totalRows,
        createdShiftCount: 0,
        existingShiftCount: 0,
        outcomeDetail: selfImportDetail,
      };
      setImportResult(outcome);
      try {
        await createRemoteImport({
          fileName: fileName ?? '',
          sourceFormat: newShifts[0]?.sourceFormat ?? 'csv',
          fileFingerprint,
          employeeId: session.employeeId,
          periodYear: targetPeriod.kind === 'single' ? targetPeriod.year : null,
          periodMonth: targetPeriod.kind === 'single' ? targetPeriod.month : null,
          employeeCount: 0,
          shiftCount: selfImportSummary.totalRows,
          outcome: {
            status: 'blocked',
            reason: selfImportSummary.identityAmbiguous ? 'EMPLOYEE_AMBIGUOUS' : 'SELF_IDENTITY_NOT_FOUND',
            detail: selfImportDetail ?? undefined,
          },
        });
      } catch (error) {
        console.error('Failed to persist self-import identity outcome', error);
      }
      return false;
    }
    // Authenticated mode: resolve the target employee first; switching the
    // working set keeps each employee's calendar isolated.
    let importId: string | undefined;
    let targetEmployeeId = selectedEmployeeId;
    if (session) {
      importFailureRef.current = null;
      let targetEmployee: RemoteEmployee | null;
      try {
        targetEmployee = await resolveImportEmployee(selector, areaId);
      } catch (error) {
        console.error('Failed to resolve import employee', error);
        markImportFailure({ status: 'failed', reason: 'SYSTEM_ERROR' });
        const failure = importFailureRef.current;
        if (failure) await persistImportFailure(failure, {
          newShifts,
          targetPeriod,
          selector,
          areaId,
          fileName,
          fileFingerprint,
        });
        return false;
      }
      if (!targetEmployee) {
        if (importFailureRef.current) {
          await persistImportFailure(importFailureRef.current, {
            newShifts,
            targetPeriod,
            selector,
            areaId,
            fileName,
            fileFingerprint,
          });
        }
        return false;
      }

      // Area-scoped import: a matched employee belonging to a DIFFERENT area
      // is never imported silently — explicit "import anyway" or cancel.
      // Org-scoped imports (no area selected) never mismatch.
      const mismatch = findAreaMismatch(targetEmployee, areaId, areas);
      if (mismatch) {
        const importAnyway = await requestImportResolution({
          title: t('team.areaMismatchTitle'),
          description: t('team.areaMismatchConfirm', {
            name: mismatch.employeeName,
            employeeArea: mismatch.employeeAreaName,
            targetArea: mismatch.targetAreaName,
          }),
          confirmLabel: t('team.areaMismatchAction'),
          cancelLabel: t('importResult.close'),
        });
        if (!importAnyway) {
          const failure = {
            status: 'blocked' as const,
            reason: 'AREA_MISMATCH_DECLINED',
            blockingEmployeeId: targetEmployee.id,
            blockingEmployeeName: targetEmployee.name,
          };
          await persistImportFailure(failure, {
            newShifts,
            targetPeriod,
            selector,
            areaId,
            fileName,
            fileFingerprint,
          });
          return false;
        }
      }

      targetEmployeeId = targetEmployee.id;

    }

    const snapshot = targetEmployeeId === selectedEmployeeId
      ? [...shifts]
      : await loadRemoteShifts(targetEmployeeId ?? '').catch(() => [] as Shift[]);
    const normalizedIncoming = newShifts.map(normalizeShift);
    const selfImportCutoff = getOperationalDate();
    const selfFutureCount = session.role === 'EMPLOYEE'
      ? normalizedIncoming.filter((shift) => shift.date > selfImportCutoff).length
      : 0;
    const eligibleIncoming = session.role === 'EMPLOYEE'
      ? normalizedIncoming.filter((shift) => shift.date <= selfImportCutoff)
      : normalizedIncoming;
    let working = [...snapshot];
    const pendingImportedByDate = new Map<string, Shift[]>();
    const upserts: Shift[] = [];
    const deleteIds: string[] = [];
    let identicalCount = 0;

    for (const shift of eligibleIncoming) {
      const existingImportedShifts = pendingImportedByDate.get(shift.date)
        ?? snapshot.filter((existing) => existing.date === shift.date && getShiftOrigin(existing) === 'IMP');

      pendingImportedByDate.set(shift.date, existingImportedShifts);

      if (existingImportedShifts.length === 0) {
        working.push(shift);
        upserts.push(shift);
        pendingImportedByDate.set(shift.date, [...existingImportedShifts, shift]);
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
        identicalCount += 1;
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
        [...existingImportedShifts.filter((existing) => existing.id !== existingShift.id), shift],
      );
    }

    // A repeated document with no changes is a no-op. Tell the user clearly
    // and do not create another Import record or send an empty write request.
    // This also protects the flow when a second import is started after the
    // first one has already finished.
    if (upserts.length === 0 && identicalCount > 0) {
      if (session.role === 'EMPLOYEE' && selfFutureCount > 0) {
        const outcome: ImportOutcomeReport = {
          status: 'partial',
          reason: 'SELF_FUTURE_ROWS_EXCLUDED',
          attemptedCount: normalizedIncoming.length,
          createdShiftCount: 0,
          existingShiftCount: identicalCount,
          outcomeDetail: { ...(selfImportDetail ?? {}), futureOwnRows: selfFutureCount },
        };
        setImportResult(outcome);
        await createRemoteImport({
          fileName: fileName ?? '',
          sourceFormat: newShifts[0]?.sourceFormat ?? 'csv',
          fileFingerprint,
          employeeId: targetEmployeeId,
          periodYear: targetPeriod.kind === 'single' ? targetPeriod.year : null,
          periodMonth: targetPeriod.kind === 'single' ? targetPeriod.month : null,
          shiftCount: normalizedIncoming.length,
          createdShiftCount: 0,
          existingShiftCount: identicalCount,
          outcome: { status: 'partial', reason: 'SELF_FUTURE_ROWS_EXCLUDED', detail: outcome.outcomeDetail ?? undefined },
        }).catch((error) => console.error('Failed to persist self-import future outcome', error));
        return false;
      }
      setAppFeedback({ kind: 'status', message: t('importModal.alreadyImported', { count: identicalCount }) });
      return false;
    }

    const todayIso = getOperationalDate();
    const futureUpserts = session.role === 'EMPLOYEE'
      ? normalizedIncoming.filter((shift) => shift.date > todayIso)
      : upserts.filter((shift) => shift.date > todayIso);
    const historicalUpserts = upserts.filter((shift) => shift.date <= todayIso);
    const requiresPlanningImport = session.role !== 'EMPLOYEE' && futureUpserts.length > 0;

    if (session.role === 'EMPLOYEE' && futureUpserts.length > 0 && upserts.length === 0) {
      const outcome: ImportOutcomeReport = {
        status: 'partial',
        reason: 'SELF_FUTURE_ROWS_EXCLUDED',
        attemptedCount: normalizedIncoming.length,
        createdShiftCount: 0,
        existingShiftCount: 0,
        outcomeDetail: { ...(selfImportDetail ?? {}), futureOwnRows: futureUpserts.length },
      };
      setImportResult(outcome);
      await createRemoteImport({
        fileName: fileName ?? '',
        sourceFormat: newShifts[0]?.sourceFormat ?? 'csv',
        fileFingerprint,
        employeeId: targetEmployeeId,
        periodYear: targetPeriod.kind === 'single' ? targetPeriod.year : null,
        periodMonth: targetPeriod.kind === 'single' ? targetPeriod.month : null,
        shiftCount: normalizedIncoming.length,
        createdShiftCount: 0,
        existingShiftCount: 0,
        outcome: { status: 'partial', reason: 'SELF_FUTURE_ROWS_EXCLUDED', detail: outcome.outcomeDetail ?? undefined },
      }).catch((error) => console.error('Failed to persist self-import future outcome', error));
      return false;
    }

    // The import record represents a write, so register it only after the
    // duplicate/conflict reconciliation has produced actual upserts.
    // FUTURE/MIXED is registered by the single transactional endpoint below;
    // creating its history row here would break all-or-nothing semantics.
    if (session && upserts.length > 0 && !importId && !requiresPlanningImport) {
      try {
        const created = await createRemoteImport({
          fileName: fileName ?? '',
          sourceFormat: newShifts[0]?.sourceFormat ?? '',
          fileFingerprint,
          employeeId: targetEmployeeId,
          periodYear: targetPeriod.kind === 'single' ? targetPeriod.year : null,
          periodMonth: targetPeriod.kind === 'single' ? targetPeriod.month : null,
          areaId: areaId ?? null,
          importMode: 'individual',
          periodKind: targetPeriod.kind,
          periodLabel: formatImportPeriodLabel(targetPeriod, tl('calendar.months')),
          employeeCount: 1,
          shiftCount: normalizedIncoming.length,
          createdShiftCount: upserts.length,
          existingShiftCount: identicalCount,
          outcome: session.role === 'EMPLOYEE' && selfFutureCount > 0
            ? {
              status: 'partial',
              reason: 'SELF_FUTURE_ROWS_EXCLUDED',
              detail: { ...(selfImportDetail ?? {}), futureOwnRows: selfFutureCount },
            }
            : undefined,
        });
        importId = created.id;
      } catch (error) {
        console.error('Failed to register import', error);
      }
    }

    // Shared "the import actually landed" tail — must run whenever a
    // reconciliation comes back PASS, whether that's discovered on the
    // happy path or re-derived in the catch block below after a request
    // that rejected but still committed server-side.
    const applySuccessTail = (nextShifts = working) => {
      setShifts(nextShifts);
      const visiblePeriod = targetPeriod.kind === 'single'
        ? targetPeriod
        : targetPeriod.periods[0] ?? { month: currentMonth, year: currentYear };
      setCurrentYear(visiblePeriod.year);
      setCurrentMonth(visiblePeriod.month);
      setIsImportOpen(false);
      setOnboardingFile(null);
      // TTFV funnel endpoint + onboarding completion on the first real import.
          trackTtfvEvent('import_confirmed');
          if (!loadOnboarding().completed) {
            completeOnboardingGuide();
          }
    };

    try {
      if (session && targetEmployeeId) {
        if (requiresPlanningImport) {
          const futureResult = await confirmRemoteFutureImport({
            fileName: fileName ?? '',
            sourceFormat: newShifts[0]?.sourceFormat ?? '',
            fileFingerprint: fileFingerprint ?? '',
            employeeId: targetEmployeeId,
            shifts: upserts.map((shift) => ({ ...shift, employeeId: targetEmployeeId, areaId: areaId ?? null })),
            deleteIds,
            periodYear: targetPeriod.kind === 'single' ? targetPeriod.year : null,
            periodMonth: targetPeriod.kind === 'single' ? targetPeriod.month : null,
            areaId: areaId ?? null,
            importMode: 'individual',
            periodKind: targetPeriod.kind,
            periodLabel: formatImportPeriodLabel(targetPeriod, tl('calendar.months')),
          });
          const persisted = historicalUpserts.length > 0
            ? await loadRemoteShifts(targetEmployeeId)
            : [];
          const reconciliation = historicalUpserts.length > 0
            ? reconcileImport(historicalUpserts, persisted)
            : null;
          if (reconciliation?.status === 'FAIL') {
            console.error('Mixed import reconciliation FAILED', { ...futureResult, employeeId: targetEmployeeId, reconciliation });
            setImportResult(reconciliation);
            return false;
          }
          if (reconciliation) setImportResult(reconciliation);
          if (targetEmployeeId !== selectedEmployeeId) {
            setSelectedEmployeeId(targetEmployeeId);
          }
          const localHistoricalWorking = working.filter(
            (shift) => !futureUpserts.some((incoming) => incoming.id === shift.id),
          );
          setAppFeedback({ kind: 'status', message: t('importModal.futureImportConfirmed', {
            assignments: futureResult.future.submittedCount,
            drafts: futureResult.future.draftCount,
          }) });
          applySuccessTail(localHistoricalWorking);
          return true;
        }

        const { saved } = await syncRemoteShifts(targetEmployeeId, { upserts, deleteIds, importId });
        const reconciliation = reconcileImport(upserts, saved);
        if (reconciliation.status === 'FAIL') {
          console.error('Import reconciliation FAILED: expected != persisted', { importId, employeeId: targetEmployeeId, ...reconciliation });
          if (importId) {
            await updateRemoteImportOutcome({
              id: importId,
              status: reconciliation.matchedCount > 0 ? 'partial' : 'failed',
              reason: 'SYSTEM_ERROR',
              detail: {
                attemptedCount: reconciliation.expectedCount,
                persistedCount: reconciliation.persistedCount,
                matchedCount: reconciliation.matchedCount,
              },
              createdShiftCount: reconciliation.matchedCount,
              existingShiftCount: identicalCount,
            }).catch((outcomeError) => console.error('Failed to update import outcome', outcomeError));
          }
          setImportResult(reconciliation);
          return false;
        }
        if (upserts.length > 0) {
          if (session.role === 'EMPLOYEE' && selfFutureCount > 0) {
            setImportResult({
              status: 'partial',
              reason: 'SELF_FUTURE_ROWS_EXCLUDED',
              attemptedCount: normalizedIncoming.length,
              createdShiftCount: reconciliation.matchedCount,
              existingShiftCount: identicalCount,
              outcomeDetail: { ...(selfImportDetail ?? {}), futureOwnRows: selfFutureCount },
            });
          } else {
            setImportResult(reconciliation);
          }
        }
        if (targetEmployeeId !== selectedEmployeeId) {
          setSelectedEmployeeId(targetEmployeeId);
        }
      } else {
        // Unreachable because anonymous confirmation is rejected above.
        throw new Error('Authenticated session required for import persistence');
      }
      applySuccessTail();
      return true;
    } catch (error) {
      console.error('Failed to persist imported shifts', error);
      if (requiresPlanningImport) {
        if (error instanceof ApiError && error.code === 'FUTURE_IMPORT_REQUIRES_PLANNING') {
          setAppFeedback({ kind: 'alert', message: t('importConflict.futurePlanningRequired') });
        } else {
          setAppFeedback({ kind: 'alert', message: t('importConflict.importSaveFailed') });
        }
        // The server endpoint is one transaction: an error means the
        // history, draft and assignments were all rolled back. Do not run
        // the historical recovery path, which could misrepresent a partial
        // mixed import as successful.
        return false;
      }
      // A mid-batch failure (e.g. a plan-limit check tripping on shift N of
      // M) can leave 1..N-1 already committed server-side even though this
      // call rejected — telling the user "nothing was saved" here would
      // itself be a silent-loss lie. Re-read what's actually on the server
      // and reconcile against that, instead of assuming zero effect.
      if (session && targetEmployeeId) {
        try {
          const persistedNow = await loadRemoteShifts(targetEmployeeId);
          const reconciliation = reconcileImport(upserts, persistedNow);
          if (importId && reconciliation.status === 'FAIL') {
            await updateRemoteImportOutcome({
              id: importId,
              status: reconciliation.matchedCount > 0 ? 'partial' : 'failed',
              reason: 'SYSTEM_ERROR',
              detail: {
                attemptedCount: reconciliation.expectedCount,
                persistedCount: reconciliation.persistedCount,
                matchedCount: reconciliation.matchedCount,
              },
              createdShiftCount: reconciliation.matchedCount,
              existingShiftCount: identicalCount,
            }).catch((outcomeError) => console.error('Failed to update import outcome', outcomeError));
          }
          setImportResult(reconciliation);
          if (reconciliation.status === 'PASS') {
            // The request that "failed" actually landed everything server-side
            // (e.g. a lost response after a committed write) — the calendar,
            // TTFV tracking and onboarding must reflect that real success,
            // not the client-side exception.
            if (targetEmployeeId !== selectedEmployeeId) {
              setSelectedEmployeeId(targetEmployeeId);
            }
            applySuccessTail();
            return true;
          }
        } catch (verifyError) {
          console.error('Failed to verify partial import state after a save error', verifyError);
          setAppFeedback({ kind: 'alert', message: t('importConflict.importSaveFailed') });
        }
      } else {
        setAppFeedback({ kind: 'alert', message: t('importConflict.importSaveFailed') });
      }
      return false;
    }
  };

  useEffect(() => {
    if (!authResolved || route !== '/app/schedule') {
      return;
    }
    if (!session) {
      navigate('/login');
    } else if (session.role === 'EMPLOYEE' || needsOrgChoice) {
      navigate('/app');
    }
  }, [authResolved, needsOrgChoice, route, session]);

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
        <LandingPage isAuthenticated={authResolved ? Boolean(session) : null} />
        <CookieConsent />
      </>
    );
  }

  if (route === '/pricing') {
    return (
      <>
        <PricingPage isAuthenticated={authResolved ? Boolean(session) : null} />
        <CookieConsent />
      </>
    );
  }

  if ((route === '/login' || route === '/signup') && !session) {
    // Session restore is still in flight: `session === null` here does NOT
    // mean "anonymous". Rendering AuthScreen now would flash the login form
    // for already-authenticated users (landing CTA → /login → restore lands
    // → redirect to /app). Show the same resolving surface as /app instead.
    if (!authResolved) {
      return (
        <>
          <div className="container" role="status" style={{ padding: '48px 16px', color: 'var(--text-muted)' }}>
            {t('common.loading')}
          </div>
          <CookieConsent />
        </>
      );
    }
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

  // The main shell renders only once auth is unequivocally resolved. While
  // the first session resolution is in flight, `session === null` would
  // otherwise be misread as "guest" and flash the operational UI (and its
  // guest chrome) before the authenticated state lands.
  if (!authResolved && (route === '/app' || route === '/app/schedule')) {
    return (
      <>
        <div className="container" role="status" style={{ padding: '48px 16px', color: 'var(--text-muted)' }}>
          {t('common.loading')}
        </div>
        <CookieConsent />
      </>
    );
  }

  // EMPLOYEE without linked employee record: safe blocked state, no data.
  const unlinkedEmployee = session?.role === 'EMPLOYEE' && !session.employeeId;
  const activeMembership = session?.memberships.find((m) => m.organizationId === session.organizationId);
  // A valid organization does not require a linked Employee, an ADMIN, an
  // Area, an import, or a schedule. Employee linkage is an explicit optional
  // capability, so OWNER-only organizations must reach the dashboard.
  const accountIncomplete = unlinkedEmployee;
  const plannerAreaId = session?.role === 'PLANNER'
    ? (activeMembership?.scopedAreaId ?? null)
    : effectiveAreaId;
  const plannerNeedsArea = session?.role === 'PLANNER'
    && !activeMembership?.scopedAreaId
    && activeAreas.length > 0;
  const activeOrganizationName = session?.memberships.find((membership) => membership.organizationId === session.organizationId)?.organizationName ?? '';
  const viewedEmployee = session?.role === 'EMPLOYEE'
    ? selfEmployee
    : employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const contextSummary = session && !needsOrgChoice && !accountIncomplete ? (
    <>
      <span className="app-shell__context-summary-item" title={activeOrganizationName}>
        <small>{t('shell.organization')}</small><strong>{activeOrganizationName}</strong>
      </span>
      <span className="app-shell__context-summary-item app-shell__context-summary-item--role">
        <small>{t('shell.role')}</small><strong>{session.role ? t(`role.${session.role.toLowerCase()}`) : ''}</strong>
      </span>
      <span className="app-shell__context-summary-item app-shell__context-summary-item--employee" title={viewedEmployee?.name ?? t('shell.noEmployee')}>
        <small>{t('shell.employee')}</small><strong>{viewedEmployee?.name ?? t('shell.noEmployee')}</strong>
      </span>
    </>
  ) : null;
  const plannerInitialDate = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('date') ?? undefined
    : undefined;

  const contextContent = session && !needsOrgChoice && !accountIncomplete ? (
    <div className="team-bar" data-testid="app-shell-context">
      <label>
        {t('orgSelector.activeLabel')}
        {session.memberships.length > 1 ? (
          <SearchableSelect
            label=""
            value={session.organizationId ?? ''}
            onChange={(organizationId) => void handleSwitchOrganization(organizationId)}
            searchPlaceholder={t('orgSelector.searchPlaceholder')}
            emptyMessage={t('orgSelector.noResults')}
            ariaLabel={t('orgSelector.title')}
            options={session.memberships.map((membership) => ({
              value: membership.organizationId,
              label: membership.organizationName,
              searchText: membership.organizationName.toLowerCase(),
            }))}
            style={{ width: '100%', fontWeight: 700 }}
          />
        ) : (
          <strong>{session.memberships.find((membership) => membership.organizationId === session.organizationId)?.organizationName ?? ''}</strong>
        )}
      </label>
      <label>
        {t('team.roleLabel')}
        <strong>{session.role ? t(`role.${session.role.toLowerCase()}`) : ''}</strong>
      </label>
      {session.role !== 'EMPLOYEE' && activeAreas.length === 1 && (
        <label>
          {t('areas.contextLabel')}
          <strong>{activeAreas[0].name}</strong>
        </label>
      )}
      {session.role !== 'EMPLOYEE' && activeAreas.length >= 2 && (
        <label>
          {t('areas.contextLabel')}
          <SearchableSelect
            label=""
            value={selectedAreaId ?? ''}
            onChange={(value) => setSelectedAreaId(value || null)}
            searchPlaceholder={t('orgSelector.searchPlaceholder')}
            emptyMessage={t('orgSelector.noResults')}
            ariaLabel={t('areas.contextLabel')}
            options={[
              { value: '', label: t('areas.allCompany'), searchText: t('areas.allCompany').toLowerCase() },
              ...activeAreas.map((area) => ({
                value: area.id,
                label: area.name,
                searchText: `${area.name} ${area.code ?? ''}`.toLowerCase(),
              })),
            ]}
            style={{ width: '100%' }}
          />
        </label>
      )}
      {session.role !== 'EMPLOYEE' && (
        <label>
          {t('team.employeeLabel')}
          <SearchableSelect
            label=""
            value={selectedEmployeeId ?? ''}
            onChange={(employeeId) => void handleSelectEmployee(employeeId)}
            searchPlaceholder={t('employeeSelect.searchPlaceholder')}
            emptyMessage={visibleEmployees.length === 0 ? t('employeeSelect.noEmployees') : t('employeeSelect.noResults')}
            ariaLabel={t('team.employeeLabel')}
            options={visibleEmployees
              .filter((employee) => employee.status === 'active')
              .map((employee) => ({
                value: employee.id,
                label: employee.externalEmployeeId ? `${employee.name} · ID ${employee.externalEmployeeId}` : employee.name,
                searchText: `${employee.name} ${employee.externalEmployeeId ?? ''}`.toLowerCase(),
              }))}
            style={{ width: '100%' }}
          />
        </label>
      )}
    </div>
  ) : null;

  if (route === '/app/schedule' && authResolved && session && session.role !== 'EMPLOYEE' && !needsOrgChoice && !accountIncomplete && plannerNeedsArea) {
    return (
      <>
        <AppShell
          role={session.role}
          userName={session.user.displayName}
          userRole={session.role ? t(`role.${session.role.toLowerCase()}`) : ''}
          activeSection="planner"
          themeControl={<ThemeToggle />}
          languageControl={<LanguageToggle />}
          contextContent={contextContent}
          contextSummary={contextSummary}
          onImport={() => { if (!isImporting) setIsImportOpen(true); }}
          onAddShift={() => { if (!isImporting) { setEditingShiftId(null); setDraftShiftDate(null); setIsModalOpen(true); } }}
          onHistory={() => { if (!isImporting) setIsImportHistoryOpen(true); }}
          onPlanner={() => navigate('/app/schedule')}
          onApprovals={isAdminRole(session.role) ? () => setIsApprovalsOpen(true) : undefined}
          onMembers={isAdminRole(session.role) ? () => setIsMembersOpen(true) : undefined}
          onAreas={isAdminRole(session.role) ? () => setIsAreasOpen(true) : undefined}
          onFormatProfiles={() => setIsFormatProfilesOpen(true)}
          onSettings={isAdminRole(session.role) ? () => setIsSettingsOpen(true) : undefined}
          onLogout={() => void handleLogout()}
        >
          <div className="planner-scope-unavailable" data-testid="planner-scope-unavailable" role="alert">
            <section className="card">
            <h1>{t('planner.scopeUnavailableTitle')}</h1>
            <p style={{ color: 'var(--text-muted)' }}>{t('planner.scopeUnavailableDescription')}</p>
            </section>
          </div>
        </AppShell>
        <CookieConsent />
      </>
    );
  }

  if (route === '/app/schedule' && authResolved && session && session.role !== 'EMPLOYEE' && !needsOrgChoice && !accountIncomplete) {
    return (
      <>
        <AppShell
          role={session.role}
          userName={session.user.displayName}
          userRole={session.role ? t(`role.${session.role.toLowerCase()}`) : ''}
          activeSection="planner"
          themeControl={<ThemeToggle />}
          languageControl={<LanguageToggle />}
          contextContent={contextContent}
          contextSummary={contextSummary}
          onImport={() => { if (!isImporting) setIsImportOpen(true); }}
          onAddShift={() => { if (!isImporting) { setEditingShiftId(null); setDraftShiftDate(null); setIsModalOpen(true); } }}
          onHistory={() => { if (!isImporting) setIsImportHistoryOpen(true); }}
          onPlanner={() => navigate('/app/schedule')}
          onApprovals={isAdminRole(session.role) ? () => setIsApprovalsOpen(true) : undefined}
          onMembers={isAdminRole(session.role) ? () => setIsMembersOpen(true) : undefined}
          onAreas={isAdminRole(session.role) ? () => setIsAreasOpen(true) : undefined}
          onFormatProfiles={() => setIsFormatProfilesOpen(true)}
          onSettings={isAdminRole(session.role) ? () => setIsSettingsOpen(true) : undefined}
          onLogout={() => void handleLogout()}
        >
          <ModalShell
            isOpen
            onClose={() => navigate('/app')}
            title={t('planner.title')}
            closeAriaLabel={t('planner.close')}
            workspace
            fullscreen
            hideHeader
            maxWidth="1440px"
          >
            <WeeklyPlanner
              areaId={plannerAreaId}
              canEdit={session.role === 'OWNER' || session.role === 'ADMIN' || session.role === 'PLANNER'}
              embedded
              initialDate={plannerInitialDate}
              modalHeader
              onClose={() => navigate('/app')}
            />
          </ModalShell>
        </AppShell>
        <CookieConsent />
      </>
    );
  }

  // R4-M00: EMPLOYEE has a dedicated portal entry point. The role split lives
  // here, once, so the existing ADMIN dashboard remains untouched while all
  // future employee screens can grow inside PortalShell.
  if (route === '/app' && authResolved && session?.role === 'EMPLOYEE' && !needsOrgChoice && !accountIncomplete) {
    return (
      <PortalShell
        session={session}
        employeeName={selfEmployee?.name}
        onLogout={() => void handleLogout()}
      />
    );
  }

  return (
    <>
    <AppShell
      role={session?.role ?? null}
      userName={session?.user.displayName ?? ''}
      userRole={session?.role ? t(`role.${session.role.toLowerCase()}`) : undefined}
      activeSection="calendar"
      themeControl={<ThemeToggle />}
      languageControl={<LanguageToggle />}
      contextContent={contextContent}
      contextSummary={contextSummary}
      onSignIn={!session ? () => { if (!isImporting) setIsAuthOpen(true); } : undefined}
      onImport={() => { if (!isImporting && authResolved) setIsImportOpen(true); }}
      onAddShift={() => {
        if (isImporting) return;
        setEditingShiftId(null);
        setDraftShiftDate(null);
        setIsModalOpen(true);
      }}
      onHistory={session ? () => { if (!isImporting) setIsImportHistoryOpen(true); } : undefined}
      onPlanner={session && session.role !== 'EMPLOYEE' ? () => navigate('/app/schedule') : undefined}
      onApprovals={session && isAdminRole(session.role) ? () => setIsApprovalsOpen(true) : undefined}
      onMembers={session && isAdminRole(session.role) ? () => { if (!isImporting) setIsMembersOpen(true); } : undefined}
      onAreas={session && isAdminRole(session.role) ? () => { if (!isImporting) setIsAreasOpen(true); } : undefined}
      onFormatProfiles={session ? () => { if (!isImporting) setIsFormatProfilesOpen(true); } : undefined}
      onSettings={session && isAdminRole(session.role) ? () => { if (!isImporting) setIsSettingsOpen(true); } : undefined}
      onLogout={session ? () => { if (!isImporting) void handleLogout(); } : undefined}
    >
      <div className={`dashboard-body${isImporting || isSavingShift ? ' app--busy' : ''}`} aria-busy={isImporting || isSavingShift}>
        <CalendarToolbar
          year={currentYear}
          month={currentMonth}
          shiftCount={currentMonthShifts.length}
          onNavigate={(delta) => { if (!isImporting) handleNavigate(delta); }}
        />
        {appFeedback && (
          <div
            role={appFeedback.kind}
            aria-live={appFeedback.kind === 'alert' ? 'assertive' : 'polite'}
            style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${appFeedback.kind === 'alert' ? 'var(--danger-border)' : 'var(--glass-border)'}`, background: appFeedback.kind === 'alert' ? 'var(--danger-bg)' : 'var(--panel-muted-bg)' }}
          >
            <span>{appFeedback.message}</span>
            <button type="button" className="btn-outline" onClick={() => setAppFeedback(null)} aria-label={t('common.close')} style={{ padding: '3px 8px', minHeight: 'auto', flexShrink: 0 }}>
              {t('common.close')}
            </button>
          </div>
        )}
        {!session && <div className="dashboard-sign-in-hint"><button type="button" className="btn-outline" onClick={() => { if (!isImporting) setIsAuthOpen(true); }}>{t('auth.signIn')}</button></div>}

        {accountIncomplete && (
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
            <strong>{t('unlinkedEmployee.title')}</strong>
            <p style={{ margin: '8px 0 12px', color: 'var(--text-muted)' }}>
              {t('unlinkedEmployee.description')}
            </p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => { if (!isImporting) void handleLogout(); }}
              style={{ padding: '8px 14px', fontWeight: 700 }}
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
            role={session?.role ?? null}
            editableScheduleDates={editableScheduleDates}
          />
        </section>
          </>
        )}
      </div>
    </AppShell>

      {(isImporting || isSavingShift) && (
        <div className="app-operation-lock" role="presentation" aria-busy="true">
          <div className="app-operation-lock__status" role="status" aria-live="polite" tabIndex={-1} data-import-progress>
            <span className="app-operation-lock__spinner" aria-hidden="true" />
            {isImporting ? t('importModal.importing') : t('shiftModal.working')}
          </div>
        </div>
      )}

      <ShiftModal
        isOpen={isModalOpen && !isImporting}
        editingShift={editingShift}
        defaultDate={draftShiftDate}
        maxDate={getPreviousOperationalDate()}
        isSaving={isSavingShift}
        onClose={() => {
          if (isImporting || isSavingShift) {
            return;
          }
          setIsModalOpen(false);
          setDraftShiftDate(null);
        }}
        onSave={handleSaveShift}
        onDelete={handleDeleteShift}
      />

      <ApprovalInboxModal
        isOpen={isApprovalsOpen && !isImporting}
        onClose={() => setIsApprovalsOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen && !isImporting}
        onClose={() => setIsSettingsOpen(false)}
        onRestartOnboarding={() => {
          resetOnboarding();
          setIsSettingsOpen(false);
          setIsOnboardingOpen(true);
        }}
        session={session ? { 
          user: { id: session.user.id, email: session.user.email, displayName: session.user.displayName }, 
          role: session.role, 
          employeeId: session.employeeId, 
          organizationId: session.organizationId, 
          memberships: session.memberships 
        } : null}
        employees={employees}
        selectedEmployeeId={selectedEmployeeId}
        onEmployeeNameChange={() => {
          if (session) {
            void hydrateAuthenticated(session);
          }
        }}
        onOpenMembers={() => {
          setIsSettingsOpen(false);
          setIsMembersOpen(true);
        }}
        onAccountNameChange={() => {
          // The session object is held in App state and hydrateAuthenticated
          // does not refresh it — re-fetch so the MonthHeader displayName
          // fallback (and any other session-driven UI) updates immediately.
          void (async () => {
            const fresh = await fetchSession();
            if (fresh) {
              setSession(fresh);
            }
          })();
        }}
        onOrganizationReset={() => {
          setIsSettingsOpen(false);
          setSelectedEmployeeId(null);
          if (session) {
            void hydrateAuthenticated(session);
          }
        }}
        onOrganizationNameChange={() => {
          // Same reasoning as onAccountNameChange: the renamed org's name
          // lives in session.memberships, which hydrateAuthenticated does
          // not refresh — re-fetch the session so it's reflected immediately.
          void (async () => {
            const fresh = await fetchSession();
            if (fresh) {
              setSession(fresh);
            }
          })();
        }}
      />

      <OnboardingModal
        isOpen={isOnboardingOpen && !isImporting}
        onClose={() => setIsOnboardingOpen(false)}
        onFileChosen={(chosen) => {
          setIsOnboardingOpen(false);
          setOnboardingFile(chosen);
          setIsImportOpen(true);
        }}
        userId={session?.user.id ?? null}
      />

      {(!session || session.role === 'EMPLOYEE' || Boolean(adminIndividualImport)) && (
        <ImportModal
          isOpen={isImportOpen}
          onClose={() => {
            if (isImporting) {
              return;
            }
            setIsImportOpen(false);
            setOnboardingFile(null);
            setAdminIndividualImport(null);
          }}
          onConfirmImport={handleConfirmImport}
          isImporting={isImporting}
          onImportStateChange={(importing) => setAppOperation(importing ? 'importing' : 'idle')}
          initialContext={{ month: currentMonth, year: currentYear }}
          existingShifts={shifts}
          initialFile={adminIndividualImport?.file ?? onboardingFile}
          employeePreset={(() => {
            if (adminIndividualImport) {
              return {
                name: adminIndividualImport.employee.name,
                externalId: adminIndividualImport.employee.externalEmployeeId,
              };
            }
            // EMPLOYEE identity is never the team-bar selector (admin-only
            // concept) — always the user's own linked employee record.
            if (!session) {
              return null;
            }
            const self = employees.find((employee) => employee.id === session.employeeId);
            return self ? { name: self.name, externalId: self.externalEmployeeId ?? '' } : null;
          })()}
          identityLocked={Boolean(session)}
          userId={session?.user.id ?? null}
          organizationId={session?.organizationId ?? null}
          isAuthenticated={Boolean(session)}
          areas={activeAreas}
          currentAreaId={effectiveAreaId}
          allowAreaChoice={isAdminRole(session?.role)}
        />
      )}

      {session && isAdminRole(session.role) && !adminIndividualImport && (
        <TeamImportModal
          isOpen={isImportOpen}
          onClose={() => { if (!isImporting) setIsImportOpen(false); }}
          isImporting={isImporting}
          onImportStateChange={(importing) => setAppOperation(importing ? 'importing' : 'idle')}
          onImported={() => {
            void hydrateAuthenticated(session);
          }}
          sessionRole={session.role}
          currentPlan={session.plan ?? null}
          onSwitchOrg={(organizationId) => void handleSwitchOrganization(organizationId)}
          areas={activeAreas}
          currentAreaId={effectiveAreaId}
          allowAreaChoice={isAdminRole(session.role)}
          onSingleEmployeeDetected={(file, employee) => {
            const matching = employees.filter((candidate) => (
              employee.externalEmployeeId
                ? candidate.externalEmployeeId === employee.externalEmployeeId
                : normalizeText(candidate.name) === normalizeText(employee.name)
            ));
            const resolved = matching.length === 1 ? matching[0] : null;
            if (resolved) {
              setSelectedEmployeeId(resolved.id);
            }
            setAdminIndividualImport({
              file,
              employee: {
                ...employee,
                // The application directory is authoritative. Never copy an
                // identifier from an informational worksheet into this path.
                externalEmployeeId: resolved?.externalEmployeeId ?? employee.externalEmployeeId,
              },
              employeeId: resolved?.id ?? null,
            });
          }}
        />
      )}

      {importResult ? (
        <ImportResultModal
          isOpen
          onClose={() => {
            setImportResult(null);
            setPendingImportRetry(null);
            setMembersRecoveryResult(null);
          }}
          report={importResult}
          onCompleteEmployee={(employeeId) => {
            if (importResult && 'status' in importResult && importResult.status !== 'PASS' && importResult.status !== 'FAIL') {
              setMembersRecoveryResult(importResult as ImportOutcomeReport);
            }
            setImportResult(null);
            setMembersInitialEmployeeId(employeeId);
            setIsMembersOpen(true);
          }}
          onRetry={pendingImportRetry ? () => {
            const retry = pendingImportRetry;
            setImportResult(null);
            setPendingImportRetry(null);
            void handleConfirmImport(
              retry.newShifts,
              retry.targetPeriod,
              retry.selector,
              retry.areaId,
              retry.fileName,
              retry.fileFingerprint,
            );
          } : undefined}
        />
      ) : null}

      {importResolutionState ? (
        <ModalShell
          isOpen
          onClose={() => {
            importResolutionState.resolve(false);
            setImportResolutionState(null);
          }}
          title={importResolutionState.title}
          closeAriaLabel={t('importResult.close')}
          footer={(
            <>
              <button
                className="btn-outline"
                type="button"
                onClick={() => {
                  importResolutionState.resolve(false);
                  setImportResolutionState(null);
                }}
              >
                {importResolutionState.cancelLabel}
              </button>
              <button
                className="btn-gold"
                type="button"
                onClick={() => {
                  importResolutionState.resolve(true);
                  setImportResolutionState(null);
                }}
              >
                {importResolutionState.confirmLabel}
              </button>
            </>
          )}
        >
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 0 }}>
            {importResolutionState.description}
          </p>
        </ModalShell>
      ) : null}

      <OrgSelectorModal
        isOpen={Boolean(session) && needsOrgChoice && (session?.memberships.length ?? 0) > 0}
        memberships={session?.memberships ?? []}
        onSelect={(organizationId) => void handleSwitchOrganization(organizationId)}
        onLogout={() => void handleLogout()}
      />

      <OnboardingChoiceModal
        isOpen={Boolean(session) && needsOrgChoice && (session?.memberships.length ?? 0) === 0}
        onConfirm={handleOnboarding}
        ownerDisplayName={session?.user.displayName ?? ''}
        ownerEmail={session?.user.email ?? ''}
        onLogout={() => void handleLogout()}
      />

      <FormatProfileMigrationModal
        isOpen={formatProfileMigrationOpen}
        localProfiles={loadFormatProfiles()}
        remoteStore={getFormatProfileStore(session?.organizationId ?? null)}
        onDone={() => {
          window.localStorage.setItem(FORMAT_PROFILE_MIGRATION_DONE_KEY, 'done');
          setFormatProfileMigrationOpen(false);
        }}
        onKeepLocal={() => {
          window.localStorage.setItem(FORMAT_PROFILE_MIGRATION_DONE_KEY, 'local-only');
          setFormatProfileMigrationOpen(false);
        }}
        onCancel={() => setFormatProfileMigrationOpen(false)}
      />

      <MembersModal
        isOpen={isMembersOpen && !isImporting}
        onClose={() => {
          setIsMembersOpen(false);
          setMembersInitialEmployeeId(null);
          if (membersRecoveryResult) {
            setImportResult(membersRecoveryResult);
            setMembersRecoveryResult(null);
          }
        }}
        employees={employees}
        areas={activeAreas}
        currentUserId={session?.user.id ?? ''}
        currentPlan={session?.plan ?? null}
        initialEmployeeId={membersInitialEmployeeId}
        organizationName={session?.memberships.find((m) => m.organizationId === session.organizationId)?.organizationName ?? ''}
        onSwitchOrg={(organizationId) => void handleSwitchOrganization(organizationId)}
        onChanged={() => {
          if (session) {
            void hydrateAuthenticated(session);
          }
        }}
      />

      <AreasModal
        isOpen={isAreasOpen && !isImporting}
        onClose={() => setIsAreasOpen(false)}
        onChanged={() => void refreshAreas()}
      />

      <ImportHistoryModal
        isOpen={isImportHistoryOpen && !isImporting}
        onClose={() => setIsImportHistoryOpen(false)}
        session={session}
        onDeleted={() => {
          // The client Shift model never carries import_id (it's a server-
          // side/history concern, see lib/types.ts), and a deleted import
          // may belong to an employee other than the one currently in view
          // — so unlike the other mutations in this app (which compute the
          // next array locally), the correct refresh here is to re-read the
          // currently viewed employee's shifts from the server, the single
          // source of truth for what the deletion actually removed.
          if (session && selectedEmployeeId) {
            void loadRemoteShifts(selectedEmployeeId).then(setShifts).catch(() => {});
          }
        }}
      />

      <FormatProfilesModal
        isOpen={isFormatProfilesOpen && !isImporting}
        onClose={() => setIsFormatProfilesOpen(false)}
        store={getFormatProfileStore(session?.organizationId ?? null)}
        canManage={isAdminRole(session?.role)}
      />

      {importConflictState && (
        <div className="modal-overlay" data-import-conflict>
          <div className="modal-content" role="dialog" aria-modal="true" aria-label={t('importConflict.title')} style={{ maxWidth: '520px' }}>
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
    </>
  );
}

export default App;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Mail,
  Search,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { buildPersonas, filterPersonas, formatEmployeeProfileLabel, Persona } from '../../lib/personas';
import {
  createRemoteAccessInvitation,
  listRemoteAccessDirectory,
  resendRemoteAccessInvitation,
  revokeRemoteAccessInvitation,
  RemoteAccessInvitation,
  RemoteDirectoryPerson,
  bulkMoveRemoteEmployeesArea,
  createRemoteArea,
  createRemoteEmployee,
  listRemoteAreas,
  listRemoteMembers,
  RemoteArea,
  RemoteEmployee,
  RemoteMember,
  removeRemoteMember,
  transferRemoteOwnership,
  updateRemoteArea,
  updateRemoteEmployee,
  updateRemoteMemberRole,
} from '../../lib/remote';
import type { Role } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { useMediaQuery } from '../../lib/use-media-query';
import { useScrollAffordance } from './useScrollAffordance';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ModalShell } from '../ui/ModalShell';
import { BulkCsvImportModal } from './BulkCsvImportModal';
import { GrantAccessModal } from './GrantAccessModal';
import { PendingInvitationsModal } from './PendingInvitationsModal';

import './EquipoModal.css';

export interface EquipoModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: RemoteEmployee[];
  areas?: RemoteArea[];
  currentUserId: string;
  currentUserRole?: Role | null;
  onChanged: () => void;
  initialTab?: 'personas' | 'roles' | 'areas' | 'assignments';
  initialEmployeeId?: string | null;
}

/** Phones and portrait tablets (≤900px wide) and landscape phones (short screens up to 932px wide, e.g. 844×390). Same query as the compact blocks of EquipoModal.css. */
const COMPACT_QUERY = '(max-width: 900px), (max-width: 932px) and (max-height: 480px)';

export function EquipoModal({
  isOpen,
  onClose,
  employees,
  areas = [],
  currentUserId,
  currentUserRole = 'ADMIN',
  onChanged,
  initialTab = 'personas',
  initialEmployeeId = null,
}: EquipoModalProps) {
  const { t, locale } = useI18n();
  /** ≤640px: the tables become card lists and the actions move to thumb reach (desktop and tablet keep the tables). */
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const [activeTab, setActiveTab] = useState<'personas' | 'roles' | 'areas' | 'assignments'>(initialTab);
  const [members, setMembers] = useState<RemoteMember[]>([]);
  const [invitations, setInvitations] = useState<RemoteAccessInvitation[]>([]);
  const [directoryPeople, setDirectoryPeople] = useState<RemoteDirectoryPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Grant-access flow (existing person, no active access): a dedicated modal
  // that only ever creates an invitation for the person's existing
  // employeeId — never the "Añadir nueva persona" wizard.
  const [grantAccessPersona, setGrantAccessPersona] = useState<Persona | null>(null);

  // Filters for Personas tab
  const [search, setSearch] = useState('');
  const [filterAccess, setFilterAccess] = useState<'all' | 'with_access' | 'pending_access' | 'without_access'>('all');
  const [filterRole, setFilterRole] = useState<'all' | 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE'>('all');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Pagination for Personas tab
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Independent Pending Invitations modal state
  const [isPendingInvitationsOpen, setIsPendingInvitationsOpen] = useState(false);
  const pendingInvitationsButtonRef = useRef<HTMLButtonElement>(null);

  // Wizard state (Añadir persona)
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardHasAccess, setWizardHasAccess] = useState(true);
  const [wizardEmail, setWizardEmail] = useState('');
  const [wizardCreateEmployee, setWizardCreateEmployee] = useState(true);
  const [wizardExistingEmployeeId, setWizardExistingEmployeeId] = useState<string | null>(null);
  const [wizardExternalId, setWizardExternalId] = useState('');
  const [wizardAreaId, setWizardAreaId] = useState('');
  const [wizardRole, setWizardRole] = useState<'ADMIN' | 'PLANNER' | 'EMPLOYEE'>('EMPLOYEE');
  const [wizardScopeType, setWizardScopeType] = useState<'ORGANIZATION' | 'AREAS' | 'EMPLOYEES'>('ORGANIZATION');
  const [wizardScopedAreaIds, setWizardScopedAreaIds] = useState<string[]>([]);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  // Ownership transfer state
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [previousOwnerRole, setPreviousOwnerRole] = useState<'ADMIN' | 'PLANNER'>('ADMIN');
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);

  // Role change state
  const [editingRolePersona, setEditingRolePersona] = useState<Persona | null>(null);
  const [newRoleSelection, setNewRoleSelection] = useState<'ADMIN' | 'PLANNER' | 'EMPLOYEE'>('EMPLOYEE');
  const [newRoleScopeType, setNewRoleScopeType] = useState<'ORGANIZATION' | 'AREAS' | 'EMPLOYEES'>('ORGANIZATION');
  const [newRoleScopedAreas, setNewRoleScopedAreas] = useState<string[]>([]);
  const [newRoleScopedEmployees, setNewRoleScopedEmployees] = useState<string[]>([]);
  const [roleEmployeeSearch, setRoleEmployeeSearch] = useState('');
  const [roleChangeSubmitting, setRoleChangeSubmitting] = useState(false);

  // Local areas state (initialized from props, refreshed on mutations)
  const [localAreas, setLocalAreas] = useState<RemoteArea[]>(areas || []);
  useEffect(() => {
    setLocalAreas(areas || []);
  }, [areas]);
  const effectiveAreas = useMemo(() => {
    return Array.isArray(localAreas) && localAreas.length > 0 ? localAreas : (areas || []);
  }, [localAreas, areas]);

  // Area creation / editing modal state
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<RemoteArea | null>(null);
  const [areaName, setAreaName] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [areaActive, setAreaActive] = useState(true);
  const [areaSubmitting, setAreaSubmitting] = useState(false);

  // Employee editing modal state
  const [editingEmployee, setEditingEmployee] = useState<RemoteEmployee | null>(null);
  const [editEmployeeName, setEditEmployeeName] = useState('');
  const [editEmployeeExternalId, setEditEmployeeExternalId] = useState('');
  const [editEmployeeAreaId, setEditEmployeeAreaId] = useState('');
  const [editEmployeeStatus, setEditEmployeeStatus] = useState<'active' | 'inactive'>('active');
  const [editEmployeeSubmitting, setEditEmployeeSubmitting] = useState(false);
  const [editEmployeeError, setEditEmployeeError] = useState<string | null>(null);

  const handleOpenEditEmployee = useCallback((emp: RemoteEmployee) => {
    setEditingEmployee(emp);
    setEditEmployeeName(emp.name);
    setEditEmployeeExternalId(emp.externalEmployeeId || '');
    setEditEmployeeAreaId(emp.areaId || '');
    setEditEmployeeStatus(emp.status === 'inactive' ? 'inactive' : 'active');
    setEditEmployeeError(null);
  }, []);

  const handleSaveEmployee = async () => {
    if (!editingEmployee) return;
    const trimmed = editEmployeeName.trim();
    if (!trimmed) {
      setEditEmployeeError('El nombre del empleado no puede estar vacío.');
      return;
    }
    setEditEmployeeSubmitting(true);
    setEditEmployeeError(null);
    try {
      await updateRemoteEmployee({
        id: editingEmployee.id,
        name: trimmed,
        externalEmployeeId: editEmployeeExternalId.trim() || undefined,
        areaId: editEmployeeAreaId || null,
        status: editEmployeeStatus,
      });
      onChanged();
      setEditingEmployee(null);
    } catch (err) {
      setEditEmployeeError(err instanceof Error ? err.message : 'Error al actualizar empleado');
    } finally {
      setEditEmployeeSubmitting(false);
    }
  };

  // Focus and handle initialEmployeeId from recovery flow
  useEffect(() => {
    if (!isOpen || !initialEmployeeId) {
      return;
    }
    setActiveTab('personas');
    setFilterAccess('all');
    setFilterRole('all');
    setFilterArea('all');
    setFilterStatus('all');
    const target = employees.find((e) => e.id === initialEmployeeId);
    if (target) {
      setSearch(target.name);
      handleOpenEditEmployee(target);
    }
  }, [isOpen, initialEmployeeId, employees, handleOpenEditEmployee]);

  // Tab 4: Asignaciones state
  const [assignmentSubTab, setAssignmentSubTab] = useState<'employees_to_area' | 'planner_scopes'>('employees_to_area');
  const [rolesSearch, setRolesSearch] = useState('');
  const mainTabsRef = useScrollAffordance<HTMLDivElement>(activeTab);
  const subTabsRef = useScrollAffordance<HTMLDivElement>(assignmentSubTab);
  const [selectedBulkEmployeeIds, setSelectedBulkEmployeeIds] = useState<string[]>([]);
  const [bulkTargetAreaId, setBulkTargetAreaId] = useState<string>('');
  const [bulkEffectiveDate, setBulkEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkFilterCurrentArea, setBulkFilterCurrentArea] = useState<string>('all');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);
  const [bulkImportKind, setBulkImportKind] = useState<'employees' | 'users' | null>(null);

  // Tab 4: Planner scope assignment state
  const [selectedPlannerUserId, setSelectedPlannerUserId] = useState<string>('');
  const [tab4ScopeType, setTab4ScopeType] = useState<'ORGANIZATION' | 'AREAS' | 'EMPLOYEES'>('ORGANIZATION');
  const [tab4ScopedAreas, setTab4ScopedAreas] = useState<string[]>([]);
  const [tab4ScopedEmployees, setTab4ScopedEmployees] = useState<string[]>([]);
  const [tab4EmployeeSearch, setTab4EmployeeSearch] = useState('');
  const [plannerScopeSubmitting, setPlannerScopeSubmitting] = useState(false);
  const [plannerScopeSuccessMessage, setPlannerScopeSuccessMessage] = useState<string | null>(null);

  // Load members
  const fetchMembers = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listRemoteMembers();
      setMembers(data);
      try {
        const directory = await listRemoteAccessDirectory();
        setInvitations(directory.invitations);
        setDirectoryPeople(directory.people);
      } catch {
        // Older fixtures/backends can still serve the legacy member list.
        setInvitations([]);
        setDirectoryPeople([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('members.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isOpen, t]);

  const refreshAreas = useCallback(async () => {
    try {
      const data = await listRemoteAreas();
      if (Array.isArray(data)) {
        setLocalAreas(data);
      }
    } catch {
      // Keep existing areas on network error
    }
  }, []);

  useEffect(() => {
    void fetchMembers();
    // The `areas` prop is only as fresh as the last App-level hydration,
    // which resolves asynchronously *after* the dashboard (and this modal's
    // own trigger) becomes clickable — opening Team Management shortly after
    // login could otherwise carry a stale/empty area list into the CSV
    // importers, rejecting every valid area reference as "unknown". Refresh
    // on every open so the importers always resolve areas against this
    // modal's own current data, not a possibly-in-flight parent fetch.
    if (isOpen) void refreshAreas();
  }, [fetchMembers, isOpen, refreshAreas]);

  // Transient success confirmation (revoke, grant access): auto-dismisses so
  // it never lingers as stale state after the user moves on.
  useEffect(() => {
    if (!successMessage) return;
    const timeout = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [successMessage]);

  // Area handlers
  const handleOpenCreateArea = () => {
    setEditingArea(null);
    setAreaName('');
    setAreaCode('');
    setAreaActive(true);
    setError(null);
    setIsAreaModalOpen(true);
  };

  const handleOpenEditArea = (area: RemoteArea) => {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaCode(area.code || '');
    setAreaActive(area.active);
    setError(null);
    setIsAreaModalOpen(true);
  };

  const handleSaveArea = async () => {
    if (!areaName.trim()) return;
    setAreaSubmitting(true);
    setError(null);
    try {
      if (editingArea) {
        await updateRemoteArea({
          id: editingArea.id,
          name: areaName.trim(),
          code: areaCode.trim() ? areaCode.trim().toUpperCase() : null,
          active: areaActive,
        });
      } else {
        await createRemoteArea({
          name: areaName.trim(),
          code: areaCode.trim() ? areaCode.trim().toUpperCase() : undefined,
        });
      }
      setIsAreaModalOpen(false);
      onChanged();
      await refreshAreas();
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setAreaSubmitting(false);
    }
  };

  // Last-known email per employeeId for a person with no current access —
  // recovered from the access directory (organization_people -> users),
  // which keeps that link even after access is revoked. Used to prefill the
  // "Conceder acceso" modal and to show the row's previous email.
  const knownEmailByEmployeeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of directoryPeople) {
      if (person.employeeId && person.email) {
        map.set(person.employeeId, person.email);
      }
    }
    return map;
  }, [directoryPeople]);

  // Derived personas
  const personas = useMemo(() => {
    return buildPersonas(members, employees, currentUserId, effectiveAreas, knownEmailByEmployeeId);
  }, [members, employees, currentUserId, effectiveAreas, knownEmailByEmployeeId]);

  const filteredPersonas = useMemo(() => {
    return filterPersonas(personas, {
      search,
      access: filterAccess,
      role: filterRole,
      areaId: filterArea,
      status: filterStatus,
    });
  }, [personas, search, filterAccess, filterRole, filterArea, filterStatus]);

  // Reset pagination to page 1 on search or filter change
  useEffect(() => {
    setPage(1);
  }, [search, filterAccess, filterRole, filterArea, filterStatus]);

  // Dynamic pagination based on container height
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const calculateSize = () => {
      const h = el.clientHeight;
      const isMobile = window.innerWidth <= 768;
      const rowH = isMobile ? 110 : 48;
      const headerH = isMobile ? 0 : 44;
      const usableH = Math.max(100, h - headerH - 50);
      const calculated = Math.max(5, Math.floor(usableH / rowH));
      setPageSize(calculated);
    };
    calculateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(calculateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalPersonas = filteredPersonas.length;
  const totalPages = Math.max(1, Math.ceil(totalPersonas / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedPersonas = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPersonas.slice(start, start + pageSize);
  }, [filteredPersonas, currentPage, pageSize]);

  const pendingInvitationsCount = useMemo(() => {
    return invitations.filter((inv) => inv.status === 'PENDING').length;
  }, [invitations]);

  // Candidate members for ownership transfer (active members excluding current user and existing owners)
  const transferCandidates = useMemo(() => {
    return members.filter((m) => m.userId !== currentUserId && m.role !== 'OWNER');
  }, [members, currentUserId]);

  // Tab 4: Planner selection sync
  useEffect(() => {
    if (selectedPlannerUserId) {
      const m = members.find((mem) => mem.userId === selectedPlannerUserId);
      if (m) {
        setTab4ScopeType(m.plannerScopeType || (m.scopedAreaId ? 'AREAS' : 'ORGANIZATION'));
        setTab4ScopedAreas(m.scopedAreaIds || (m.scopedAreaId ? [m.scopedAreaId] : []));
        setTab4ScopedEmployees(m.scopedEmployeeIds || []);
        setTab4EmployeeSearch('');
      }
    } else {
      const firstPlanner = members.find((m) => m.role === 'PLANNER' || m.role === 'ADMIN');
      if (firstPlanner) {
        setSelectedPlannerUserId(firstPlanner.userId);
      }
    }
  }, [selectedPlannerUserId, members]);

  // Tab 4: Filtered employees for bulk assignment
  const filteredBulkEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (bulkFilterCurrentArea !== 'all') {
        if (bulkFilterCurrentArea === 'none' && emp.areaId) return false;
        if (bulkFilterCurrentArea !== 'none' && emp.areaId !== bulkFilterCurrentArea) return false;
      }
      if (bulkSearch.trim()) {
        const q = bulkSearch.trim().toLowerCase();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchId = emp.externalEmployeeId ? emp.externalEmployeeId.toLowerCase().includes(q) : false;
        if (!matchName && !matchId) return false;
      }
      return true;
    });
  }, [employees, bulkFilterCurrentArea, bulkSearch]);

  const handleToggleSelectAllBulk = () => {
    if (selectedBulkEmployeeIds.length === filteredBulkEmployees.length && filteredBulkEmployees.length > 0) {
      setSelectedBulkEmployeeIds([]);
    } else {
      setSelectedBulkEmployeeIds(filteredBulkEmployees.map((e) => e.id));
    }
  };

  const handleApplyBulkMove = async () => {
    if (selectedBulkEmployeeIds.length === 0 || !bulkTargetAreaId) return;
    setBulkSubmitting(true);
    setError(null);
    setBulkSuccessMessage(null);
    try {
      const targetAreaId = bulkTargetAreaId === '__NONE__' ? null : bulkTargetAreaId;
      const res = await bulkMoveRemoteEmployeesArea({
        employeeIds: selectedBulkEmployeeIds,
        targetAreaId,
        effectiveDate: bulkEffectiveDate || undefined,
      });
      const areaName = targetAreaId
        ? effectiveAreas.find((a) => a.id === targetAreaId)?.name || t('teamWorkspace.areaFallback')
        : t('teamWorkspace.bulkNoArea');
      setBulkSuccessMessage(t('teamWorkspace.areaMoveSuccess', { count: res.count, area: areaName, date: res.effectiveDate }));
      setSelectedBulkEmployeeIds([]);
      onChanged();
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleSaveTab4PlannerScope = async () => {
    if (!selectedPlannerUserId) return;
    setPlannerScopeSubmitting(true);
    setError(null);
    setPlannerScopeSuccessMessage(null);
    try {
      await updateRemoteMemberRole(
        selectedPlannerUserId,
        'PLANNER',
        tab4ScopeType === 'AREAS' && tab4ScopedAreas.length > 0 ? tab4ScopedAreas[0] : null,
        {
          plannerScopeType: tab4ScopeType,
          scopedAreaIds: tab4ScopeType === 'AREAS' ? tab4ScopedAreas : [],
          scopedEmployeeIds: tab4ScopeType === 'EMPLOYEES' ? tab4ScopedEmployees : [],
        },
      );
      setPlannerScopeSuccessMessage(t('teamWorkspace.plannerScopeSaved'));
      onChanged();
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setPlannerScopeSubmitting(false);
    }
  };

  const currentMember = useMemo(() => {
    return members.find((m) => m.userId === currentUserId);
  }, [members, currentUserId]);

  const effectiveRole = currentMember ? currentMember.role : currentUserRole;
  const isOwner = effectiveRole === 'OWNER';

  // Shared by the roles table (desktop/tablet) and the roles cards (≤640px): one rule set, never two.
  const roleLabelOf = (role: RemoteMember['role']) => (
    role === 'OWNER' ? t('teamWorkspace.roleOwner') : role === 'ADMIN' ? t('teamWorkspace.roleAdmin') : role === 'PLANNER' ? t('teamWorkspace.rolePlanner') : t('teamWorkspace.roleEmployee')
  );
  const scopeLabelOf = (m: RemoteMember) => {
    if (m.role === 'EMPLOYEE') return t('teamWorkspace.scopeSelf');
    if (m.role === 'PLANNER') {
      if (m.plannerScopeType === 'AREAS' && (m.scopedAreaIds?.length || m.scopedAreaId)) return t('teamWorkspace.scopeAreasShort', { count: m.scopedAreaIds?.length || 1 });
      if (m.plannerScopeType === 'EMPLOYEES' && m.scopedEmployeeIds?.length) return t('teamWorkspace.scopeEmployeesShort', { count: m.scopedEmployeeIds.length });
    }
    return t('teamWorkspace.scopeOrgLabel');
  };
  // Shared by the areas table (desktop/tablet) and the area cards (≤640px).
  const areaStats = (a: { id: string }) => ({
    empCount: employees.filter((e) => e.areaId === a.id).length,
    assignedPlanners: members.filter(
      (m) =>
        m.role === 'PLANNER' &&
        (m.scopedAreaId === a.id ||
          (m.plannerScopeType === 'AREAS' && m.scopedAreaIds?.includes(a.id)) ||
          m.plannerScopeType === 'ORGANIZATION'),
    ),
  });
  const openAreaAssignments = (a: { id: string }) => {
    setActiveTab('assignments');
    setAssignmentSubTab('employees_to_area');
    setBulkTargetAreaId(a.id);
    setBulkFilterCurrentArea('all');
  };
  const visibleRoleMembers = useMemo(() => {
    const q = rolesSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => `${m.displayName ?? ''} ${m.email}`.toLowerCase().includes(q));
  }, [members, rolesSearch]);
  const openChangeRole = (m: RemoteMember) => {
    const persona = personas.find((p) => p.userId === m.userId);
    if (!persona) return;
    setEditingRolePersona(persona);
    setNewRoleSelection(m.role as 'ADMIN' | 'PLANNER' | 'EMPLOYEE');
    setNewRoleScopeType(m.plannerScopeType || 'ORGANIZATION');
    setNewRoleScopedAreas(m.scopedAreaIds || (m.scopedAreaId ? [m.scopedAreaId] : []));
    setNewRoleScopedEmployees(m.scopedEmployeeIds || []);
    setRoleEmployeeSearch('');
  };
  const wizardStepNames = [
    t('teamWorkspace.stepIdentity'), t('teamWorkspace.stepAccess'), t('teamWorkspace.stepEmployment'), t('teamWorkspace.stepScope'), t('teamWorkspace.stepConfirm'),
  ];
  // One primary action: inline in the bar on desktop/tablet, in the pinned footer below the list on phones (never both).
  const applyBulkButton = (
    <button
      type="button"
      className="equipo-btn equipo-btn--primary"
      disabled={selectedBulkEmployeeIds.length === 0 || !bulkTargetAreaId || bulkSubmitting}
      onClick={() => void handleApplyBulkMove()}
      data-testid="apply-bulk-move-button"
    >
      {bulkSubmitting
        ? t('teamWorkspace.reassigning')
        : t(selectedBulkEmployeeIds.length === 1 ? 'teamWorkspace.applyToOne' : 'teamWorkspace.applyToMany', { count: selectedBulkEmployeeIds.length })}
    </button>
  );
  const selectedBulkLabel = selectedBulkEmployeeIds.length === 1
    ? t('teamWorkspace.bulkSelectedOne')
    : t('teamWorkspace.bulkSelectedMany', { count: selectedBulkEmployeeIds.length });
  const openManageScope = (m: RemoteMember) => {
    const persona = personas.find((p) => p.userId === m.userId);
    if (!persona) return;
    setEditingRolePersona(persona);
    setNewRoleSelection('PLANNER');
    setNewRoleScopeType(m.plannerScopeType || (m.scopedAreaId ? 'AREAS' : 'ORGANIZATION'));
    setNewRoleScopedAreas(m.scopedAreaIds || (m.scopedAreaId ? [m.scopedAreaId] : []));
    setNewRoleScopedEmployees(m.scopedEmployeeIds || []);
    setRoleEmployeeSearch('');
  };

  const currentOwner = useMemo(() => {
    return members.find((m) => m.role === 'OWNER');
  }, [members]);

  // Handle Wizard Submit
  const handleCreatePersona = async () => {
    setWizardSubmitting(true);
    setError(null);
    try {
      // Create the person, optional employee profile, role and invitation in
      // one server transaction. The current application locale is part of
      // the request so the email is generated in the language visible to the
      // actor right now.
      if (wizardHasAccess) {
        const res = await createRemoteAccessInvitation({
          email: wizardEmail.trim(),
          displayName: wizardName.trim(),
          role: wizardRole,
          employeeId: wizardCreateEmployee ? undefined : wizardExistingEmployeeId,
          employeeName: wizardCreateEmployee ? wizardName.trim() : undefined,
          externalEmployeeId: wizardCreateEmployee ? wizardExternalId.trim() || undefined : undefined,
          areaId: wizardCreateEmployee ? wizardAreaId || undefined : undefined,
          locale,
        });
        if (res.delivery.status !== 'SENT') {
          setError(t('teamWorkspace.invitationCreatedEmailFailed'));
        }
      }

      if (!wizardHasAccess && wizardCreateEmployee) {
        await createRemoteEmployee({
          name: wizardName.trim(),
          externalEmployeeId: wizardExternalId.trim() || undefined,
          areaId: wizardAreaId || undefined,
        });
      }

      onChanged();
      await fetchMembers();
      setIsWizardOpen(false);
      resetWizard();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setWizardSubmitting(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setWizardName('');
    setWizardHasAccess(true);
    setWizardEmail('');
    setWizardCreateEmployee(true);
    setWizardExistingEmployeeId(null);
    setWizardExternalId('');
    setWizardAreaId('');
    setWizardRole('EMPLOYEE');
    setWizardScopeType('ORGANIZATION');
    setWizardScopedAreaIds([]);
  };

  // Revoke access confirmation dialog state
  const [confirmRevokePersona, setConfirmRevokePersona] = useState<Persona | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Handle Role Change
  const handleRoleChangeSubmit = async () => {
    if (!editingRolePersona || !editingRolePersona.userId) return;
    setRoleChangeSubmitting(true);
    setError(null);
    try {
      await updateRemoteMemberRole(
        editingRolePersona.userId,
        newRoleSelection,
        newRoleSelection === 'PLANNER' && newRoleScopeType === 'AREAS' && newRoleScopedAreas.length > 0 ? newRoleScopedAreas[0] : null,
        {
          plannerScopeType: newRoleSelection === 'PLANNER' ? newRoleScopeType : null,
          scopedAreaIds: newRoleSelection === 'PLANNER' && newRoleScopeType === 'AREAS' ? newRoleScopedAreas : [],
          scopedEmployeeIds: newRoleSelection === 'PLANNER' && newRoleScopeType === 'EMPLOYEES' ? newRoleScopedEmployees : [],
        },
      );
      setEditingRolePersona(null);
      onChanged();
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setRoleChangeSubmitting(false);
    }
  };

  // Handle Revoke Access
  const handleRevokeAccess = (persona: Persona) => {
    setRevokeError(null);
    setConfirmRevokePersona(persona);
  };

  const handleInvitationAction = async (invitation: RemoteAccessInvitation, action: 'resend' | 'revoke') => {
    setError(null);
    try {
      if (action === 'resend') {
        const result = await resendRemoteAccessInvitation(invitation.id, locale);
        if (result.status !== 'SENT') setError(t('teamWorkspace.invitationCreatedEmailFailed'));
      } else {
        await revokeRemoteAccessInvitation(invitation.id);
      }
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    }
  };

  const executeRevokeAccess = async () => {
    if (!confirmRevokePersona?.userId) return;
    setRevokeError(null);
    try {
      await removeRemoteMember(confirmRevokePersona.userId);
      setConfirmRevokePersona(null);
      setSuccessMessage(t('teamWorkspace.revokeAccessSuccess'));
      onChanged();
      await fetchMembers();
    } catch (err) {
      // Stays open on failure — the dialog itself shows this, since it
      // covers the rest of the modal (see ConfirmDialog's `error` prop).
      setRevokeError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    }
  };

  // Handle Ownership Transfer Submit
  const handleTransferOwnership = async () => {
    if (!transferTargetUserId || !transferConfirmed) return;
    setTransferSubmitting(true);
    setError(null);
    try {
      const res = await transferRemoteOwnership(transferTargetUserId, previousOwnerRole);
      if (res.transferred) {
        setTransferSuccessMsg(t('teamWorkspace.transferSuccess'));
        onChanged();
        await fetchMembers();
        setTimeout(() => {
          setIsTransferOpen(false);
          setTransferSuccessMsg(null);
          setTransferConfirmed(false);
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setTransferSubmitting(false);
    }
  };

  const canBulkImport = effectiveRole === 'OWNER' || effectiveRole === 'ADMIN';

  return (
    <>
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('teamWorkspace.title')}
      closeAriaLabel={t('teamWorkspace.close')}
      workspace
      width="min(95vw, 1560px)"
      maxWidth="1560px"
      height="min(92dvh, 980px)"
      className="equipo-modal-shell"
    >
      <div className="equipo-modal" data-testid="equipo-modal">
        {/* Workspace Tabs */}
        <div className="equipo-modal__tabs" role="tablist" ref={mainTabsRef}>
          <button
            type="button"
            className={`equipo-modal__tab${activeTab === 'personas' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('personas')}
            role="tab"
            aria-selected={activeTab === 'personas'}
            data-testid="tab-personas"
          >
            {t('teamWorkspace.tabPersonas')} ({personas.length})
          </button>
          <button
            type="button"
            className={`equipo-modal__tab${activeTab === 'roles' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('roles')}
            role="tab"
            aria-selected={activeTab === 'roles'}
            data-testid="tab-roles"
          >
            {t('teamWorkspace.tabRoles')} ({members.length})
          </button>
          <button
            type="button"
            className={`equipo-modal__tab${activeTab === 'areas' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('areas')}
            role="tab"
            aria-selected={activeTab === 'areas'}
            data-testid="tab-areas"
          >
            {t('teamWorkspace.tabAreas')} ({areas.length})
          </button>
          <button
            type="button"
            className={`equipo-modal__tab${activeTab === 'assignments' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('assignments')}
            role="tab"
            aria-selected={activeTab === 'assignments'}
            data-testid="tab-assignments"
          >
            {t('teamWorkspace.tabAssignments')}
          </button>
        </div>

        {error && (
          <div className="card card--error" role="alert" style={{ marginBottom: '12px', padding: '8px 12px' }}>
            <span style={{ color: 'var(--danger, #ef4444)' }}>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="card" role="status" style={{ marginBottom: '12px', padding: '8px 12px', borderColor: 'var(--success, #22c55e)' }}>
            <span style={{ color: 'var(--success, #22c55e)' }}>{successMessage}</span>
          </div>
        )}

        {/* TAB 1: PERSONAS */}
        {activeTab === 'personas' && (
          <div className="equipo-pane" data-testid="personas-pane">
            <div className="equipo-modal__toolbar">
              <div className="equipo-modal__filters">
                <input
                  type="text"
                  className="equipo-modal__search"
                  placeholder={t('teamWorkspace.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="personas-search"
                />

                <select
                  className="equipo-modal__select"
                  value={filterAccess}
                  onChange={(e) => setFilterAccess(e.target.value as typeof filterAccess)}
                  aria-label={t('teamWorkspace.filterAccess')}
                  data-testid="filter-access"
                >
                  <option value="all">{t('teamWorkspace.filterAccessAll')}</option>
                  <option value="with_access">{t('teamWorkspace.filterAccessActive')}</option>
                  <option value="pending_access">{t('teamWorkspace.filterAccessPending')}</option>
                  <option value="without_access">{t('teamWorkspace.filterAccessNone')}</option>
                </select>

                <select
                  className="equipo-modal__select"
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as typeof filterRole)}
                  aria-label={t('teamWorkspace.filterRole')}
                  data-testid="filter-role"
                >
                  <option value="all">{t('teamWorkspace.filterRole')}: {t('teamWorkspace.all')}</option>
                  <option value="OWNER">{t('teamWorkspace.roleOwner')}</option>
                  <option value="ADMIN">{t('teamWorkspace.roleAdmin')}</option>
                  <option value="PLANNER">{t('teamWorkspace.rolePlanner')}</option>
                  <option value="EMPLOYEE">{t('teamWorkspace.roleEmployee')}</option>
                </select>

                <select
                  className="equipo-modal__select"
                  value={filterArea}
                  onChange={(e) => setFilterArea(e.target.value)}
                  aria-label={t('teamWorkspace.filterArea')}
                  data-testid="filter-area"
                >
                  <option value="all">{t('teamWorkspace.filterArea')}: {t('teamWorkspace.allAreas')}</option>
                  <option value="none">{t('teamWorkspace.noArea')}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>

                <select
                  className="equipo-modal__select"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                  aria-label={t('teamWorkspace.filterStatusPerson')}
                  data-testid="filter-status"
                >
                  <option value="all">{t('teamWorkspace.filterStatusAll')}</option>
                  <option value="active">{t('teamWorkspace.statusActive')}</option>
                  <option value="inactive">{t('teamWorkspace.statusInactive')}</option>
                </select>
              </div>

              <div className="equipo-modal__actions">
                <button
                  type="button"
                  ref={pendingInvitationsButtonRef}
                  className="equipo-btn equipo-btn--secondary equipo-btn--pending-invitations"
                  onClick={() => setIsPendingInvitationsOpen(true)}
                  disabled={loading || pendingInvitationsCount === 0}
                  data-testid="pending-invitations-button"
                  aria-label={`${t('teamWorkspace.pendingInvitations')} (${pendingInvitationsCount})`}
                  aria-disabled={pendingInvitationsCount === 0}
                  title={pendingInvitationsCount === 0 ? t('teamWorkspace.noPendingInvitations') : undefined}
                >
                  <Mail size={16} aria-hidden="true" />
                  <span>{t('teamWorkspace.pendingInvitationsButton')}</span>
                  <span
                    className={`equipo-badge equipo-badge--counter${pendingInvitationsCount > 0 ? ' is-active' : ''}`}
                    aria-live="polite"
                    data-testid="pending-invitations-badge"
                  >
                    {loading && pendingInvitationsCount === 0 ? '…' : pendingInvitationsCount}
                  </span>
                </button>

                {canBulkImport && (
                  <>
                    <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => setBulkImportKind('employees')} data-testid="bulk-import-employees-button">
                      {t('teamWorkspace.importEmployeesCsv')}
                    </button>
                    <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => setBulkImportKind('users')} data-testid="bulk-import-users-button">
                      {t('teamWorkspace.importUsersCsv')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="equipo-btn equipo-btn--primary"
                  onClick={() => { resetWizard(); setIsWizardOpen(true); }}
                  data-testid="add-persona-button"
                >
                  <UserPlus size={16} />
                  {t('teamWorkspace.addPerson')}
                </button>
              </div>
            </div>

            <div className="equipo-modal__table-container" ref={tableContainerRef}>
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t('teamWorkspace.loadingPeople')}
                </div>
              ) : filteredPersonas.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t('teamWorkspace.emptyPersonas')}
                </div>
              ) : (
                <div className="equipo-modal__table-scroll">
                  <table className="equipo-table" data-testid="personas-table">
                    <thead>
                      <tr>
                        <th>{t('teamWorkspace.person')}</th>
                        <th>{t('teamWorkspace.accessEmail')}</th>
                        <th>{t('teamWorkspace.filterAccess')}</th>
                        <th>{t('teamWorkspace.filterRole')}</th>
                        <th>{t('teamWorkspace.employeeRecord')}</th>
                        <th>{t('teamWorkspace.currentArea')}</th>
                        <th>{t('teamWorkspace.filterStatus')}</th>
                        <th>{t('teamWorkspace.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPersonas.map((p) => {
                      const initials = (p.name || 'U').slice(0, 2).toUpperCase();
                      const matchingEmp = p.employeeId ? employees.find((e) => e.id === p.employeeId) : null;
                      const isTargetEmployee = Boolean(initialEmployeeId && p.employeeId === initialEmployeeId);
                      return (
                        <tr
                          key={p.id}
                          data-testid={`persona-row-${p.id}`}
                          data-focused={isTargetEmployee ? 'true' : undefined}
                          style={isTargetEmployee ? { background: 'rgba(234, 179, 8, 0.12)', outline: '2px solid var(--accent, #eab308)' } : undefined}
                        >
                          <td data-label={t('teamWorkspace.person')}>
                            <div className="equipo-persona-cell">
                              <span className="equipo-avatar">{initials}</span>
                              <div>
                                <strong>{p.name}</strong>
                                {p.isCurrentUser && (
                                  <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--accent)' }}>
                                    ({t('teamWorkspace.you')})
                                  </span>
                                )}
                                {isTargetEmployee && (
                                  <span
                                    className="equipo-badge equipo-badge--warning"
                                    style={{ marginLeft: '6px', fontSize: '0.72rem' }}
                                    data-testid="target-recovery-badge"
                                  >
                                    {t('teamWorkspace.completeRecord')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td data-label={t('teamWorkspace.accessEmail')}>
                            {p.email ? (
                              <span>{p.email}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.noAccess')}</span>
                            )}
                          </td>
                          <td data-label={t('teamWorkspace.filterAccess')}>
                            {p.hasAccess ? (
                              <span className="equipo-badge equipo-badge--success">
                                {t('teamWorkspace.activeAccess')}
                              </span>
                            ) : (
                              <span className="equipo-badge equipo-badge--neutral">
                                {t('teamWorkspace.noAccess')}
                              </span>
                            )}
                          </td>
                          <td data-label={t('teamWorkspace.filterRole')}>
                            {p.role ? (
                              <span className={`equipo-badge equipo-badge--${p.role.toLowerCase()}`}>
                                {p.role === 'OWNER' && t('teamWorkspace.roleOwner')}
                                {p.role === 'ADMIN' && t('teamWorkspace.roleAdmin')}
                                {p.role === 'PLANNER' && t('teamWorkspace.rolePlanner')}
                                {p.role === 'EMPLOYEE' && t('teamWorkspace.roleEmployee')}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td data-label={t('teamWorkspace.employeeRecord')}>
                            {p.employeeId ? (
                              <span>{p.employeeExternalId?.trim() ? `ID: ${p.employeeExternalId.trim()}` : t('teamWorkspace.linked')}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.noEmployeeRecord')}</span>
                            )}
                          </td>
                          <td data-label={t('teamWorkspace.currentArea')}>
                            {p.areaName || <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.noArea')}</span>}
                          </td>
                          <td data-label={t('teamWorkspace.filterStatus')}>
                            <span className={`equipo-badge equipo-badge--${p.status === 'active' ? 'success' : 'warning'}`}>
                              {p.status === 'active' && t('teamWorkspace.active')}
                              {p.status === 'inactive' && t('teamWorkspace.inactive')}
                              {p.status === 'pending_access' && t('teamWorkspace.pendingAccess')}
                            </span>
                          </td>
                          <td data-label={t('teamWorkspace.actions')}>
                            <div className="equipo-actions-cell">
                              {matchingEmp && (
                                <button
                                  type="button"
                                  className="equipo-btn equipo-btn--secondary"
                                  onClick={() => handleOpenEditEmployee(matchingEmp)}
                                  data-testid={isTargetEmployee ? 'target-edit-employee-btn' : `edit-employee-${p.id}`}
                                    title={t('teamWorkspace.editEmployee')}
                                  >
                                  {t('teamWorkspace.editEmployee')}
                                </button>
                              )}
                              {!p.hasAccess && p.employeeId && (
                                <button
                                  type="button"
                                  className="equipo-btn equipo-btn--secondary"
                                  onClick={() => { setError(null); setGrantAccessPersona(p); }}
                                  data-testid={`grant-access-${p.id}`}
                                >
                                  {t('teamWorkspace.grantAccess')}
                                </button>
                              )}
                              {p.hasAccess && p.role !== 'OWNER' && !p.isCurrentUser && (
                                <button
                                  type="button"
                                  className="equipo-btn equipo-btn--danger"
                                  onClick={() => void handleRevokeAccess(p)}
                                  data-testid={`revoke-access-${p.id}`}
                                >
                                  {t('teamWorkspace.revokeAccess')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}

              {totalPersonas > 0 && (
                <div className="equipo-modal__pagination" data-testid="personas-pagination">
                  <button
                    type="button"
                    className="month-nav-button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label={t('teamWorkspace.pagePrev')}
                    data-testid="personas-page-prev"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="equipo-modal__pagination-range">
                    {t('teamWorkspace.paginationRange', {
                      start: totalPersonas === 0 ? 0 : (currentPage - 1) * pageSize + 1,
                      end: Math.min(currentPage * pageSize, totalPersonas),
                      total: totalPersonas,
                    })}
                  </span>
                  <span className="equipo-modal__pagination-page">
                    · {t('teamWorkspace.paginationPage', { current: currentPage, total: totalPages })}
                  </span>
                  <button
                    type="button"
                    className="month-nav-button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label={t('teamWorkspace.pageNext')}
                    data-testid="personas-page-next"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ROLES Y ACCESO */}
        {activeTab === 'roles' && (
          <div className="equipo-pane" data-testid="roles-pane">
            <div className="equipo-modal__toolbar equipo-roles-head">
              {isCompact && <span className="equipo-roles-head__icon" aria-hidden="true"><Shield size={22} /></span>}
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('teamWorkspace.rolesHeading')}</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t('teamWorkspace.rolesSubtitle')}
                </p>
              </div>

              {isOwner && (
                <button
                  type="button"
                  className="equipo-btn equipo-btn--danger"
                  onClick={() => { setIsTransferOpen(true); setTransferConfirmed(false); }}
                  data-testid="transfer-ownership-button"
                >
                  <Shield size={16} />
                  {t('teamWorkspace.transferOwnership')}
                  {isCompact && <ChevronRight size={18} aria-hidden="true" className="equipo-transfer-chevron" />}
                </button>
              )}
            </div>

            {isCompact && (
              <div className="equipo-roles-tools">
                <label className="equipo-roles-search">
                  <Search size={18} aria-hidden="true" />
                  <input
                    type="search"
                    className="equipo-modal__search"
                    placeholder={t('teamWorkspace.rolesSearchPlaceholder')}
                    aria-label={t('teamWorkspace.rolesSearchPlaceholder')}
                    value={rolesSearch}
                    onChange={(e) => setRolesSearch(e.target.value)}
                    data-testid="roles-search"
                  />
                </label>
                <p className="equipo-roles-count" role="status" aria-live="polite" data-testid="roles-count">
                  {t('teamWorkspace.rolesCount', { count: visibleRoleMembers.length })}
                </p>
              </div>
            )}

            {isCompact ? (
              <ul className="equipo-role-cards" data-testid="roles-cards" aria-label={t('teamWorkspace.tabRoles')}>
                {visibleRoleMembers.map((m) => {
                  const initials = (m.displayName || m.email).slice(0, 2).toUpperCase();
                  const areaNames = (m.scopedAreaIds?.length ? m.scopedAreaIds : m.scopedAreaId ? [m.scopedAreaId] : [])
                    .map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean) as string[];
                  const showAreas = m.role === 'PLANNER' && m.plannerScopeType === 'AREAS' && areaNames.length > 0;
                  const employeeCount = m.role === 'PLANNER' && m.plannerScopeType === 'EMPLOYEES' ? (m.scopedEmployeeIds?.length ?? 0) : 0;
                  return (
                    <li key={m.userId} className="equipo-role-card" data-testid={`role-row-${m.userId}`}>
                      <div className="equipo-role-card__head">
                        <span className="equipo-avatar" aria-hidden="true">{initials}</span>
                        <div className="equipo-role-card__who">
                          <strong>{m.displayName || m.email}{m.userId === currentUserId && <span className="equipo-role-card__you"> (Tú)</span>}</strong>
                          <span className="equipo-role-card__email">{m.email}</span>
                          <span className={`equipo-badge equipo-badge--${m.role.toLowerCase()}`}>{roleLabelOf(m.role)}</span>
                        </div>
                      </div>
                      <dl className="equipo-role-card__facts">
                        <div className="equipo-role-card__scope"><Layers size={16} aria-hidden="true" /><dt>{t('teamWorkspace.scopeFieldLabel')}:</dt><dd>{scopeLabelOf(m)}</dd></div>
                        {showAreas && <div><dd className="equipo-role-card__detail">{t('teamWorkspace.scopeAreasNames', { names: areaNames.join(', ') })}</dd></div>}
                        {employeeCount > 0 && <div><dd className="equipo-role-card__detail">{t('teamWorkspace.scopeEmployeesCount', { count: employeeCount })}</dd></div>}
                        <div>
                          <dt>{t('teamWorkspace.linked')}</dt>
                          <dd>{m.employeeId
                            ? formatEmployeeProfileLabel(m.employeeName, m.employeeExternalId, t('teamWorkspace.linked'))
                            : <span className="equipo-role-card__muted">{t('teamWorkspace.noEmployeeRecord')}</span>}</dd>
                        </div>
                      </dl>
                      {m.role !== 'OWNER' && (
                        <div className="equipo-role-card__actions">
                          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => openChangeRole(m)} data-testid={`change-role-${m.userId}`}>
                            {t('teamWorkspace.changeRole')}
                          </button>
                          {m.role === 'PLANNER' && (
                            <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => openManageScope(m)} data-testid={`manage-scope-${m.userId}`}>
                              {t('teamWorkspace.manageScope')}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
            <div className="equipo-modal__table-container">
              <div className="equipo-modal__table-scroll">
              <table className="equipo-table" data-testid="roles-table">
                <thead>
                  <tr>
                    <th>{t('teamWorkspace.thPerson')}</th>
                    <th>{t('teamWorkspace.thRole')}</th>
                    <th>{t('teamWorkspace.thScope')}</th>
                    <th>{t('teamWorkspace.thAccessEmail')}</th>
                    <th>{t('teamWorkspace.thEmployeeRecord')}</th>
                    <th>{t('teamWorkspace.thActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const initials = (m.displayName || m.email).slice(0, 2).toUpperCase();
                    const isItemCurrentUser = m.userId === currentUserId;

                    const scopeLabel = scopeLabelOf(m);

                    return (
                      <tr key={m.userId} data-testid={`role-row-${m.userId}`}>
                        <td>
                          <div className="equipo-persona-cell">
                            <span className="equipo-avatar">{initials}</span>
                            <div>
                              <strong>{m.displayName || m.email}</strong>
                              {isItemCurrentUser && (
                                <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--accent)' }}>
                                  (Tú)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`equipo-badge equipo-badge--${m.role.toLowerCase()}`}>
                            {roleLabelOf(m.role)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {scopeLabel}
                          </span>
                        </td>
                        <td>{m.email}</td>
                        <td>
                          {m.employeeId ? (
                            <span>{formatEmployeeProfileLabel(m.employeeName, m.employeeExternalId, t('teamWorkspace.linked'))}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.noEmployeeRecord')}</span>
                          )}
                        </td>
                        <td>
                          <div className="equipo-actions-cell">
                            {m.role !== 'OWNER' && (
                              <button
                                type="button"
                                className="equipo-btn equipo-btn--secondary"
                                onClick={() => openChangeRole(m)}
                                data-testid={`change-role-${m.userId}`}
                              >
                                {t('teamWorkspace.changeRole')}
                              </button>
                            )}
                            {m.role === 'PLANNER' && (
                              <button
                                type="button"
                                className="equipo-btn equipo-btn--secondary"
                                onClick={() => openManageScope(m)}
                                data-testid={`manage-scope-${m.userId}`}
                              >
                                {t('teamWorkspace.manageScope')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
            )}
          </div>
        )}

        {/* TAB 3: ÁREAS */}
        {activeTab === 'areas' && (
          <div className="equipo-pane" data-testid="areas-pane">
            <div className="equipo-modal__toolbar">
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('teamWorkspace.areasHeading')}</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t('teamWorkspace.areasSubtitle')}
                </p>
              </div>

              <button
                type="button"
                className="equipo-btn equipo-btn--primary"
                onClick={handleOpenCreateArea}
                data-testid="create-area-button"
              >
                <UserPlus size={16} />
                {t('teamWorkspace.newArea')}
              </button>
            </div>

            <div className="equipo-modal__table-container">
              {effectiveAreas.length === 0 ? (
                <div className="equipo-modal__empty-state" data-testid="empty-areas-state">
                  <Users size={48} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <h3 style={{ margin: '0 0 8px 0' }}>{t('teamWorkspace.emptyAreas')}</h3>
                  <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto' }}>
                    {t('teamWorkspace.emptyAreasSubtitle')}
                  </p>
                  <button
                    type="button"
                    className="equipo-btn equipo-btn--primary"
                    onClick={handleOpenCreateArea}
                    data-testid="create-first-area-button"
                  >
                    <UserPlus size={16} />
                    {t('teamWorkspace.createFirstArea')}
                  </button>
                </div>
              ) : isCompact ? (
                <ul className="equipo-area-cards" data-testid="areas-cards" aria-label={t('teamWorkspace.tabAreas')}>
                  {effectiveAreas.map((a) => {
                    const { empCount, assignedPlanners } = areaStats(a);
                    return (
                      <li key={a.id} className="equipo-area-card" data-testid={`area-row-${a.id}`}>
                        <div className="equipo-area-card__head">
                          <strong>{a.name}</strong>
                          <span className={`equipo-badge equipo-badge--${a.active ? 'active' : 'inactive'}`}>
                            {a.active ? t('teamWorkspace.areaStatusActive') : t('teamWorkspace.areaStatusInactive')}
                          </span>
                        </div>
                        {a.code && <span className="equipo-badge equipo-badge--neutral equipo-area-card__code">{a.code}</span>}
                        <dl className="equipo-area-card__facts">
                          <div><dt>{t('teamWorkspace.thAssignedEmployees')}</dt><dd>{empCount}</dd></div>
                          <div><dt>{t('teamWorkspace.thAssignedPlanners')}</dt><dd>{assignedPlanners.length > 0 ? assignedPlanners.length : t('teamWorkspace.noPlanners')}</dd></div>
                        </dl>
                        <div className="equipo-area-card__actions">
                          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => handleOpenEditArea(a)} data-testid={`edit-area-${a.id}`}>
                            {t('teamWorkspace.edit')}
                          </button>
                          <button type="button" className="equipo-btn equipo-btn--secondary" onClick={() => openAreaAssignments(a)} data-testid={`manage-area-assignments-${a.id}`}>
                            {t('teamWorkspace.manageAssignments')}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="equipo-modal__table-scroll">
                <table className="equipo-table" data-testid="areas-table">
                  <thead>
                    <tr>
                      <th>{t('teamWorkspace.thArea')}</th>
                      <th>{t('teamWorkspace.thCode')}</th>
                      <th>{t('teamWorkspace.thStatus')}</th>
                      <th>{t('teamWorkspace.thAssignedEmployees')}</th>
                      <th>{t('teamWorkspace.thAssignedPlanners')}</th>
                      <th>{t('teamWorkspace.thActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveAreas.map((a) => {
                      const { empCount, assignedPlanners } = areaStats(a);

                      return (
                        <tr key={a.id} data-testid={`area-row-${a.id}`}>
                          <td>
                            <strong>{a.name}</strong>
                          </td>
                          <td>
                            {a.code ? (
                              <span className="equipo-badge equipo-badge--neutral">{a.code}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <span className={`equipo-badge equipo-badge--${a.active ? 'active' : 'inactive'}`}>
                              {a.active ? t('teamWorkspace.areaStatusActive') : t('teamWorkspace.areaStatusInactive')}
                            </span>
                          </td>
                          <td>{t(empCount === 1 ? 'teamWorkspace.employeesCountOne' : 'teamWorkspace.employeesCountMany', { count: empCount })}</td>
                          <td>
                            {assignedPlanners.length > 0 ? (
                              <span style={{ fontSize: '0.85rem' }}>
                                {t(assignedPlanners.length === 1 ? 'teamWorkspace.plannersCountOne' : 'teamWorkspace.plannersCountMany', { count: assignedPlanners.length })}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('teamWorkspace.noPlanners')}</span>
                            )}
                          </td>
                          <td>
                            <div className="equipo-actions-cell">
                              <button
                                type="button"
                                className="equipo-btn equipo-btn--secondary"
                                onClick={() => handleOpenEditArea(a)}
                                data-testid={`edit-area-${a.id}`}
                              >
                                {t('teamWorkspace.edit')}
                              </button>
                              <button
                                type="button"
                                className="equipo-btn equipo-btn--secondary"
                                onClick={() => openAreaAssignments(a)}
                                data-testid={`manage-area-assignments-${a.id}`}
                              >
                                {t('teamWorkspace.manageAssignments')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ASIGNACIONES */}
        {activeTab === 'assignments' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, gap: '12px' }} data-testid="assignments-tab">
            {/* Sub-tab navigation */}
            <div className="equipo-modal__subtabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }} role="tablist" ref={subTabsRef}>
              <button
                type="button"
                className={`equipo-modal__tab ${assignmentSubTab === 'employees_to_area' ? 'is-active' : ''}`}
                onClick={() => setAssignmentSubTab('employees_to_area')}
                role="tab"
                aria-selected={assignmentSubTab === 'employees_to_area'}
                data-testid="subtab-employees-to-area"
              >
                {t('teamWorkspace.subtabEmployeesToArea')}
              </button>
              <button
                type="button"
                className={`equipo-modal__tab ${assignmentSubTab === 'planner_scopes' ? 'is-active' : ''}`}
                onClick={() => setAssignmentSubTab('planner_scopes')}
                role="tab"
                aria-selected={assignmentSubTab === 'planner_scopes'}
                data-testid="subtab-planner-scopes"
              >
                {t('teamWorkspace.subtabPlannerScopes')}
              </button>
            </div>

            {assignmentSubTab === 'employees_to_area' && (
              <>
                {/* Bulk Operation Action Bar */}
                <div className="equipo-panel equipo-bulk-bar" style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '12px',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                }}>
                  <div className="equipo-bulk-bar__fields" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                    <div className="equipo-bulk-field">
                    <span className="equipo-bulk-field__icon" aria-hidden="true"><Layers size={18} /></span>
                    <div className="equipo-bulk-field__stack">
                    <label htmlFor="bulk-target-area" style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('teamWorkspace.targetAreaLabel')}</label>
                    <select
                      id="bulk-target-area"
                      className="equipo-modal__select"
                      value={bulkTargetAreaId}
                      onChange={(e) => setBulkTargetAreaId(e.target.value)}
                      data-testid="bulk-target-area-select"
                    >
                      <option value="">{t('teamWorkspace.targetAreaPlaceholder')}</option>
                      {effectiveAreas.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} {a.code ? `(${a.code})` : ''}</option>
                      ))}
                      <option value="__NONE__">{t('teamWorkspace.noAreaUnassign')}</option>
                    </select>

                    </div>
                    </div>
                    <div className="equipo-bulk-field">
                    <span className="equipo-bulk-field__icon" aria-hidden="true"><CalendarDays size={18} /></span>
                    <div className="equipo-bulk-field__stack">
                    <label htmlFor="bulk-effective-date" style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('teamWorkspace.effectiveDateLabel')}</label>
                    <input
                      id="bulk-effective-date"
                      type="date"
                      className="equipo-modal__input"
                      value={bulkEffectiveDate}
                      onChange={(e) => setBulkEffectiveDate(e.target.value)}
                      data-testid="bulk-effective-date-input"
                    />
                    </div>
                    </div>
                  </div>

                  {!isCompact && applyBulkButton}
                </div>

                {bulkSuccessMessage && (
                  <div className="equipo-modal__alert equipo-modal__alert--success" data-testid="bulk-success-message">
                    {bulkSuccessMessage}
                  </div>
                )}

                {/* Filter and selection tools */}
                <div className="equipo-bulk-tools" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div className="equipo-bulk-tools__filters" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      aria-label={t('teamWorkspace.bulkSearchAria')}
                      className="equipo-modal__search"
                      placeholder={t('teamWorkspace.bulkSearchPlaceholder')}
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      data-testid="bulk-employee-search"
                    />
                    <select
                      className="equipo-modal__select"
                      value={bulkFilterCurrentArea}
                      onChange={(e) => setBulkFilterCurrentArea(e.target.value)}
                      data-testid="bulk-filter-current-area"
                      aria-label={t('teamWorkspace.currentAreaAria')}
                    >
                      <option value="all">{t('teamWorkspace.currentAreaAll')}</option>
                      <option value="none">{t('teamWorkspace.currentAreaNone')}</option>
                      {effectiveAreas.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="equipo-bulk-tools__select" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="equipo-bulk-count" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} data-testid="bulk-selection-count">
                      {t('teamWorkspace.bulkSelectionCount', { selected: selectedBulkEmployeeIds.length, total: filteredBulkEmployees.length })}
                    </span>
                    <button
                      type="button"
                      className="equipo-btn equipo-btn--secondary equipo-bulk-selectall"
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      onClick={handleToggleSelectAllBulk}
                      data-testid="bulk-select-all-button"
                    >
                      {selectedBulkEmployeeIds.length === filteredBulkEmployees.length && filteredBulkEmployees.length > 0
                        ? t('teamWorkspace.deselectAll')
                        : t('teamWorkspace.selectAll')}
                    </button>
                  </div>
                </div>

                {/* Employee list with selection checkboxes: cards on phones (no truncated columns), table on larger screens */}
                {isCompact ? (
                  <ul className="equipo-bulk-cards" data-testid="bulk-employees-cards" aria-label={t('teamWorkspace.employeesListAria')}>
                    {filteredBulkEmployees.length === 0 ? (
                      <li className="equipo-bulk-cards__empty">{t('teamWorkspace.bulkNoResults')}</li>
                    ) : filteredBulkEmployees.map((emp) => {
                      const isSelected = selectedBulkEmployeeIds.includes(emp.id);
                      const area = emp.areaId ? effectiveAreas.find((a) => a.id === emp.areaId) : null;
                      return (
                        <li key={emp.id} className={`equipo-bulk-card${isSelected ? ' is-selected' : ''}`} data-testid={`bulk-employee-row-${emp.id}`}>
                          <label className="equipo-bulk-card__label">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedBulkEmployeeIds([...selectedBulkEmployeeIds, emp.id]);
                                else setSelectedBulkEmployeeIds(selectedBulkEmployeeIds.filter((id) => id !== emp.id));
                              }}
                              data-testid={`select-emp-${emp.id}`}
                              aria-label={emp.name}
                            />
                            <span className="equipo-avatar equipo-bulk-card__avatar" aria-hidden="true">{emp.name.slice(0, 2).toUpperCase()}</span>
                            <span className="equipo-bulk-card__main">
                              <strong>{emp.name}</strong>
                              <span className="equipo-bulk-card__meta">
                                <span>{t('teamWorkspace.bulkEmployeeId')}: {emp.externalEmployeeId || '—'}</span>
                                {area
                                  ? <span className="equipo-badge equipo-badge--neutral equipo-bulk-card__area"><Layers size={13} aria-hidden="true" />{area.name}</span>
                                  : <span className="equipo-badge equipo-badge--neutral equipo-bulk-card__area is-empty"><Layers size={13} aria-hidden="true" />{t('teamWorkspace.bulkNoArea')}</span>}
                              </span>
                            </span>
                            <span className={`equipo-badge equipo-badge--${emp.status}`}>{emp.status === 'active' ? t('teamWorkspace.employeeStatusActive') : t('teamWorkspace.employeeStatusPending')}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                <div className="equipo-modal__table-container">
                  <div className="equipo-modal__table-scroll">
                  <table className="equipo-table" data-testid="bulk-employees-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={filteredBulkEmployees.length > 0 && selectedBulkEmployeeIds.length === filteredBulkEmployees.length}
                            onChange={handleToggleSelectAllBulk}
                          />
                        </th>
                        <th>{t('teamWorkspace.thEmployee')}</th>
                        <th>{t('teamWorkspace.thExternalId')}</th>
                        <th>{t('teamWorkspace.thCurrentArea')}</th>
                        <th>{t('teamWorkspace.thStatus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBulkEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                            {t('teamWorkspace.bulkNoResults')}
                          </td>
                        </tr>
                      ) : (
                        filteredBulkEmployees.map((emp) => {
                          const isSelected = selectedBulkEmployeeIds.includes(emp.id);
                          const area = emp.areaId ? effectiveAreas.find((a) => a.id === emp.areaId) : null;
                          return (
                            <tr
                              key={emp.id}
                              style={{ background: isSelected ? 'var(--gold-tint-bg)' : undefined }}
                              data-testid={`bulk-employee-row-${emp.id}`}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedBulkEmployeeIds([...selectedBulkEmployeeIds, emp.id]);
                                    } else {
                                      setSelectedBulkEmployeeIds(selectedBulkEmployeeIds.filter((id) => id !== emp.id));
                                    }
                                  }}
                                  data-testid={`select-emp-${emp.id}`}
                                />
                              </td>
                              <td><strong>{emp.name}</strong></td>
                              <td>{emp.externalEmployeeId || '—'}</td>
                              <td>
                                {area ? (
                                  <span className="equipo-badge equipo-badge--neutral">{area.name}</span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.bulkNoArea')}</span>
                                )}
                              </td>
                              <td>
                                <span className={`equipo-badge equipo-badge--${emp.status}`}>
                                  {emp.status === 'active' ? t('teamWorkspace.employeeStatusActive') : t('teamWorkspace.employeeStatusPending')}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
                )}

                {isCompact && (
                  <div className="equipo-bulk-footer" data-testid="bulk-footer">
                    <span className="equipo-bulk-footer__summary" role="status" aria-live="polite">{selectedBulkLabel}</span>
                    {applyBulkButton}
                  </div>
                )}
              </>
            )}

            {assignmentSubTab === 'planner_scopes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
                <div className="equipo-panel" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div className="equipo-planner-pick" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label htmlFor="tab4-planner-select" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {t('teamWorkspace.pickPlannerLabel')}
                    </label>
                    <select
                      id="tab4-planner-select"
                      className="equipo-modal__select"
                      value={selectedPlannerUserId}
                      onChange={(e) => setSelectedPlannerUserId(e.target.value)}
                      data-testid="tab4-planner-select"
                    >
                      <option value="">{t('teamWorkspace.pickPlannerPlaceholder')}</option>
                      {members.filter((m) => m.role === 'PLANNER' || m.role === 'ADMIN').map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.displayName || m.email} ({m.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  {plannerScopeSuccessMessage && (
                    <div className="equipo-modal__alert equipo-modal__alert--success" data-testid="tab4-planner-success">
                      {plannerScopeSuccessMessage}
                    </div>
                  )}

                  {selectedPlannerUserId && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>{t('teamWorkspace.scopeOfManagement')}</p>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="tab4-scope-type"
                          checked={tab4ScopeType === 'ORGANIZATION'}
                          onChange={() => setTab4ScopeType('ORGANIZATION')}
                          data-testid="tab4-scope-org"
                        />
                        {t('teamWorkspace.scopeWholeOrg')}
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="tab4-scope-type"
                          checked={tab4ScopeType === 'AREAS'}
                          onChange={() => setTab4ScopeType('AREAS')}
                          disabled={effectiveAreas.length === 0}
                          data-testid="tab4-scope-areas"
                        />
                        <span>
                          {t('teamWorkspace.scopeAreas')}
                          {effectiveAreas.length === 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                              {t('teamWorkspace.noAreasNote')}
                            </span>
                          )}
                        </span>
                      </label>
                      {tab4ScopeType === 'AREAS' && effectiveAreas.length > 0 && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                          {effectiveAreas.map((a) => (
                            <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={tab4ScopedAreas.includes(a.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setTab4ScopedAreas([...tab4ScopedAreas, a.id]);
                                  } else {
                                    setTab4ScopedAreas(tab4ScopedAreas.filter((id) => id !== a.id));
                                  }
                                }}
                                data-testid={`tab4-scope-area-${a.id}`}
                              />
                              <span><strong>{a.name}</strong> {a.code ? `(${a.code})` : ''}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="tab4-scope-type"
                          checked={tab4ScopeType === 'EMPLOYEES'}
                          onChange={() => setTab4ScopeType('EMPLOYEES')}
                          data-testid="tab4-scope-employees"
                        />
                        {t('teamWorkspace.scopeEmployees')}
                      </label>
                      {tab4ScopeType === 'EMPLOYEES' && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="text"
                              placeholder={t('teamWorkspace.searchEmployees')}
                              value={tab4EmployeeSearch}
                              onChange={(e) => setTab4EmployeeSearch(e.target.value)}
                              className="equipo-modal__input"
                              style={{ fontSize: '0.8rem', padding: '4px 8px', maxWidth: '280px' }}
                              data-testid="tab4-scope-employee-search"
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} data-testid="tab4-scope-employees-count">
                              {t('teamWorkspace.selectedCountLabel', { count: tab4ScopedEmployees.length })}
                            </span>
                          </div>
                          <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {employees
                              .filter((emp) => emp.name.toLowerCase().includes(tab4EmployeeSearch.toLowerCase()))
                              .map((emp) => (
                                <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={tab4ScopedEmployees.includes(emp.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setTab4ScopedEmployees([...tab4ScopedEmployees, emp.id]);
                                      } else {
                                        setTab4ScopedEmployees(tab4ScopedEmployees.filter((id) => id !== emp.id));
                                      }
                                    }}
                                    data-testid={`tab4-scope-employee-${emp.id}`}
                                  />
                                  <span>{formatEmployeeProfileLabel(emp.name, emp.externalEmployeeId, emp.name)}</span>
                                </label>
                              ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button
                          type="button"
                          className="equipo-btn equipo-btn--primary"
                          disabled={plannerScopeSubmitting}
                          onClick={() => void handleSaveTab4PlannerScope()}
                          data-testid="save-tab4-planner-scope-button"
                        >
                          {plannerScopeSubmitting ? t('teamWorkspace.savingDots') : t('teamWorkspace.savePlannerScope')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* WIZARD MODAL: AÑADIR PERSONA */}
        {isWizardOpen && (
          <ModalShell
            isOpen={isWizardOpen}
            onClose={() => { setIsWizardOpen(false); resetWizard(); }}
            title={t('teamWorkspace.wizardTitle')}
            closeAriaLabel={t('teamWorkspace.close')}
            maxWidth="560px"
          >
            <div className="equipo-wizard" data-testid="add-persona-wizard">
                  {isCompact ? (
                    <div className="equipo-wizard__progress" role="group" aria-label={t('teamWorkspace.wizardStepsLabel')} data-testid="wizard-progress">
                      <p className="equipo-wizard__progress-title" aria-live="polite">
                        {t('teamWorkspace.wizardStepPrefix', { current: wizardStep, total: wizardStepNames.length })} · <span className="equipo-wizard__progress-name">{wizardStepNames[wizardStep - 1]}</span>
                      </p>
                      <ol className="equipo-wizard__progress-bar">
                        {wizardStepNames.map((name, index) => {
                          const n = index + 1;
                          const state = n < wizardStep ? 'done' : n === wizardStep ? 'current' : 'pending';
                          return (
                            <li key={name} className={`equipo-wizard__progress-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                              <span className="equipo-wizard__progress-dot" aria-hidden="true">{state === 'done' ? <Check size={12} strokeWidth={3} /> : null}</span>
                              <span className="sr-only">{`${n}. ${name} — ${t(state === 'done' ? 'teamWorkspace.stepStateDone' : state === 'current' ? 'teamWorkspace.stepStateCurrent' : 'teamWorkspace.stepStatePending')}`}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : (
                  <div className="equipo-wizard__steps">
                    <span className={`equipo-wizard__step-indicator${wizardStep === 1 ? ' is-active' : ''}`}>1. {t('teamWorkspace.stepIdentity')}</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 2 ? ' is-active' : ''}`}>2. {t('teamWorkspace.stepAccess')}</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 3 ? ' is-active' : ''}`}>3. {t('teamWorkspace.stepEmployment')}</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 4 ? ' is-active' : ''}`}>4. {t('teamWorkspace.stepScope')}</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 5 ? ' is-active' : ''}`}>5. {t('teamWorkspace.stepConfirm')}</span>
                  </div>
                  )}

                  {/* Step 1: Identidad */}
                  {wizardStep === 1 && (
                    <div className="equipo-wizard__form-group">
                      <label htmlFor="wizard-name" style={{ fontWeight: 600 }}>{t('teamWorkspace.fullNameLabel')} *</label>
                      <input
                        id="wizard-name"
                        type="text"
                        className="equipo-modal__search"
                        placeholder={t('teamWorkspace.wizardNamePlaceholder')}
                        value={wizardName}
                        onChange={(e) => setWizardName(e.target.value)}
                        data-testid="wizard-name-input"
                      />
                    </div>
                  )}

                  {/* Step 2: Acceso */}
                  {wizardStep === 2 && (
                    <div className="equipo-wizard__form-group">
                      <p style={{ fontWeight: 600, margin: '0 0 8px 0' }}>{t('teamWorkspace.hasAccessQuestion')}</p>
                      <div className="equipo-wizard__radio-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            name="wizard-access"
                            checked={wizardHasAccess}
                            onChange={() => setWizardHasAccess(true)}
                          />
                          {t('teamWorkspace.yes')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            name="wizard-access"
                            checked={!wizardHasAccess}
                            onChange={() => setWizardHasAccess(false)}
                          />
                          {t('teamWorkspace.no')}
                        </label>
                      </div>

                      {wizardHasAccess && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                          <div>
                            <label htmlFor="wizard-email" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>{t('teamWorkspace.accessEmail')} *</label>
                            <input
                              id="wizard-email"
                              type="email"
                              className="equipo-modal__search"
                              placeholder={t('teamWorkspace.wizardEmailPlaceholder')}
                              value={wizardEmail}
                              onChange={(e) => setWizardEmail(e.target.value)}
                              data-testid="wizard-email-input"
                            />
                          </div>
                          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('teamWorkspace.invitationPasswordNote')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 3: Empleo */}
                  {wizardStep === 3 && (
                    <div className="equipo-wizard__form-group">
                      <p style={{ fontWeight: 600, margin: '0 0 8px 0' }}>{t('teamWorkspace.createEmployeeQuestion')}</p>
                      <div className="equipo-wizard__radio-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            name="wizard-employee"
                            checked={wizardCreateEmployee}
                            onChange={() => setWizardCreateEmployee(true)}
                          />
                          {t('teamWorkspace.yes')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            name="wizard-employee"
                            checked={!wizardCreateEmployee}
                            onChange={() => setWizardCreateEmployee(false)}
                          />
                          {t('teamWorkspace.no')}
                        </label>
                      </div>

                      {wizardCreateEmployee && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                          <div>
                            <label htmlFor="wizard-ext-id" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
                              {t('teamWorkspace.externalIdLabel')}
                            </label>
                            <input
                              id="wizard-ext-id"
                              type="text"
                              className="equipo-modal__search"
                              placeholder={t('teamWorkspace.wizardExternalIdPlaceholder')}
                              value={wizardExternalId}
                              onChange={(e) => setWizardExternalId(e.target.value)}
                            />
                          </div>
                          {areas.length > 0 && (
                            <div>
                              <label htmlFor="wizard-area" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
                                {t('teamWorkspace.initialAreaLabel')}
                              </label>
                              <select
                                id="wizard-area"
                                className="equipo-modal__select"
                                style={{ width: '100%' }}
                                value={wizardAreaId}
                                onChange={(e) => setWizardAreaId(e.target.value)}
                              >
                                <option value="">{t('teamWorkspace.noArea')}</option>
                                {areas.map((a) => (
                                  <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 4: Rol y Scope */}
                  {wizardStep === 4 && (
                    <div className="equipo-wizard__form-group">
                      {wizardHasAccess ? (
                        <>
                          <label htmlFor="wizard-role" style={{ fontWeight: 600 }}>{t('teamWorkspace.roleInOrganization')} *</label>
                          <select
                            id="wizard-role"
                            className="equipo-modal__select"
                            value={wizardRole}
                            onChange={(e) => setWizardRole(e.target.value as typeof wizardRole)}
                            data-testid="wizard-role-select"
                          >
                            <option value="EMPLOYEE">{t('teamWorkspace.roleEmployee')}</option>
                            <option value="PLANNER">{t('teamWorkspace.rolePlanner')}</option>
                            <option value="ADMIN">{t('teamWorkspace.roleAdmin')}</option>
                          </select>

                          {wizardRole === 'PLANNER' && (
                            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>{t('teamWorkspace.planningScope')}</p>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="radio"
                                  name="wizard-scope-type"
                                  checked={wizardScopeType === 'ORGANIZATION'}
                                  onChange={() => setWizardScopeType('ORGANIZATION')}
                                />
                                {t('teamWorkspace.scopeWholeOrg')}
                              </label>
                              {areas.length > 0 && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <input
                                    type="radio"
                                    name="wizard-scope-type"
                                    checked={wizardScopeType === 'AREAS'}
                                    onChange={() => setWizardScopeType('AREAS')}
                                  />
                                  {t('teamWorkspace.scopeAreas')}
                                </label>
                              )}
                              {wizardScopeType === 'AREAS' && (
                                <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {areas.map((a) => (
                                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                      <input
                                        type="checkbox"
                                        checked={wizardScopedAreaIds.includes(a.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setWizardScopedAreaIds([...wizardScopedAreaIds, a.id]);
                                          } else {
                                            setWizardScopedAreaIds(wizardScopedAreaIds.filter((id) => id !== a.id));
                                          }
                                        }}
                                      />
                                      {a.name}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p style={{ color: 'var(--text-muted)' }}>
                          {t('teamWorkspace.noUserAccess')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Step 5: Confirmación */}
                  {wizardStep === 5 && (
                    <div className="equipo-wizard__form-group">
                      <h4 style={{ margin: '0 0 12px 0' }}>{t('teamWorkspace.newPersonSummary')}</h4>
                      <div className="equipo-panel" style={{
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '0.85rem',
                      }}>
                        <div><strong>{t('teamWorkspace.name')}:</strong> {wizardName}</div>
                        <div><strong>{t('teamWorkspace.filterAccess')}:</strong> {wizardHasAccess ? `${t('teamWorkspace.yesSummary')} (${wizardEmail})` : t('teamWorkspace.noSummary')}</div>
                        {wizardHasAccess && <div><strong>{t('teamWorkspace.filterRole')}:</strong> {wizardRole === 'ADMIN' ? t('teamWorkspace.roleAdmin') : wizardRole === 'PLANNER' ? t('teamWorkspace.rolePlanner') : t('teamWorkspace.roleEmployee')}</div>}
                        <div><strong>{t('teamWorkspace.employeeRecord')}:</strong> {wizardCreateEmployee ? (wizardExternalId ? `${t('teamWorkspace.yesSummary')} (ID: ${wizardExternalId})` : t('teamWorkspace.yesSummary')) : t('teamWorkspace.noSummary')}</div>
                        {wizardCreateEmployee && wizardAreaId && (
                          <div><strong>{t('teamWorkspace.filterArea')}:</strong> {areas.find((a) => a.id === wizardAreaId)?.name}</div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="equipo-wizard__footer">
                    {wizardStep > 1 ? (
                      <button
                        type="button"
                        className="equipo-btn equipo-btn--secondary"
                        onClick={() => setWizardStep((s) => s - 1)}
                      >
                        {t('teamWorkspace.back')}
                      </button>
                    ) : isCompact ? (
                      <button
                        type="button"
                        className="equipo-btn equipo-btn--secondary"
                        onClick={() => { setIsWizardOpen(false); resetWizard(); }}
                        data-testid="wizard-cancel-button"
                      >
                        {t('teamWorkspace.cancel')}
                      </button>
                    ) : <div />}

                    {wizardStep < 5 ? (
                      <button
                        type="button"
                        className="equipo-btn equipo-btn--primary"
                        disabled={wizardStep === 1 && !wizardName.trim() || wizardStep === 2 && wizardHasAccess && !wizardEmail.trim()}
                        onClick={() => setWizardStep((s) => s + 1)}
                        data-testid="wizard-next-button"
                      >
                        {t('teamWorkspace.next')}
                        {isCompact && <ArrowRight size={18} aria-hidden="true" />}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="equipo-btn equipo-btn--primary"
                        disabled={wizardSubmitting}
                        onClick={() => void handleCreatePersona()}
                        data-testid="wizard-confirm-button"
                      >
                        {wizardSubmitting ? t('teamWorkspace.creating') : t('teamWorkspace.confirmAndCreate')}
                      </button>
                    )}
                  </div>
            </div>
          </ModalShell>
        )}

        {/* ROLE CHANGE MODAL */}
        {editingRolePersona && (
          <ModalShell
            isOpen={Boolean(editingRolePersona)}
            onClose={() => setEditingRolePersona(null)}
            title={t('teamWorkspace.roleChangeTitle', { name: editingRolePersona.name })}
            closeAriaLabel={t('teamWorkspace.close')}
            maxWidth="480px"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }} data-testid="change-role-modal">
              <div>
                <label htmlFor="select-new-role" style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  {t('teamWorkspace.selectNewRole')}
                </label>
                <select
                  id="select-new-role"
                  className="equipo-modal__select"
                  style={{ width: '100%' }}
                  value={newRoleSelection}
                  onChange={(e) => setNewRoleSelection(e.target.value as typeof newRoleSelection)}
                  data-testid="select-new-role"
                >
                  <option value="EMPLOYEE">{t('teamWorkspace.roleEmployee')}</option>
                  <option value="PLANNER">{t('teamWorkspace.rolePlanner')}</option>
                  <option value="ADMIN">{t('teamWorkspace.roleAdmin')}</option>
                </select>
              </div>

              {newRoleSelection === 'PLANNER' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>{t('teamWorkspace.planningScopeHeading')}</p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="role-scope-type"
                      checked={newRoleScopeType === 'ORGANIZATION'}
                      onChange={() => setNewRoleScopeType('ORGANIZATION')}
                      data-testid="scope-radio-org"
                    />
                    {t('teamWorkspace.scopeWholeOrg')}
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="role-scope-type"
                      checked={newRoleScopeType === 'AREAS'}
                      onChange={() => setNewRoleScopeType('AREAS')}
                      disabled={effectiveAreas.length === 0}
                      data-testid="scope-radio-areas"
                    />
                    <span>
                      {t('teamWorkspace.scopeAreas')}
                      {effectiveAreas.length === 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                          {t('teamWorkspace.noAreasNote')}
                        </span>
                      )}
                    </span>
                  </label>
                  {newRoleScopeType === 'AREAS' && effectiveAreas.length > 0 && (
                    <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                      {effectiveAreas.map((a) => (
                        <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={newRoleScopedAreas.includes(a.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewRoleScopedAreas([...newRoleScopedAreas, a.id]);
                              } else {
                                setNewRoleScopedAreas(newRoleScopedAreas.filter((id) => id !== a.id));
                              }
                            }}
                            data-testid={`scope-area-${a.id}`}
                          />
                          <span><strong>{a.name}</strong> {a.code ? `(${a.code})` : ''}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="role-scope-type"
                      checked={newRoleScopeType === 'EMPLOYEES'}
                      onChange={() => setNewRoleScopeType('EMPLOYEES')}
                      data-testid="scope-radio-employees"
                    />
                    {t('teamWorkspace.scopeEmployees')}
                  </label>
                  {newRoleScopeType === 'EMPLOYEES' && (
                    <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder={t('teamWorkspace.searchEmployees')}
                          value={roleEmployeeSearch}
                          onChange={(e) => setRoleEmployeeSearch(e.target.value)}
                          className="equipo-modal__input"
                          style={{ fontSize: '0.8rem', padding: '4px 8px', flex: 1 }}
                          data-testid="scope-employee-search"
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }} data-testid="scope-selected-employees-count">
                          {newRoleScopedEmployees.length} seleccionados
                        </span>
                      </div>
                      <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {employees
                          .filter((emp) => emp.name.toLowerCase().includes(roleEmployeeSearch.toLowerCase()))
                          .map((emp) => (
                            <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={newRoleScopedEmployees.includes(emp.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewRoleScopedEmployees([...newRoleScopedEmployees, emp.id]);
                                  } else {
                                    setNewRoleScopedEmployees(newRoleScopedEmployees.filter((id) => id !== emp.id));
                                  }
                                }}
                                data-testid={`scope-employee-${emp.id}`}
                              />
                              <span>{formatEmployeeProfileLabel(emp.name, emp.externalEmployeeId, emp.name)}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--secondary"
                  onClick={() => setEditingRolePersona(null)}
                >
                  {t('teamWorkspace.cancel')}
                </button>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--primary"
                  disabled={roleChangeSubmitting}
                  onClick={() => void handleRoleChangeSubmit()}
                  data-testid="save-role-change-button"
                >
                  {roleChangeSubmitting ? t('teamWorkspace.savingDots') : t('teamWorkspace.saveRole')}
                </button>
              </div>
            </div>
          </ModalShell>
        )}

        {/* OWNERSHIP TRANSFER MODAL (Restricted strictly to the active OWNER) */}
        {isTransferOpen && isOwner && (
          <ModalShell
            isOpen={isTransferOpen}
            onClose={() => setIsTransferOpen(false)}
            title={t('teamWorkspace.transferOwnershipTitle')}
            closeAriaLabel={t('teamWorkspace.close')}
            maxWidth="520px"
            className="equipo-transfer-modal"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }} data-testid="transfer-ownership-dialog">
              <div className="ownership-transfer-card">
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>{t('teamWorkspace.transferOwnershipTitle')}</strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                      {t('teamWorkspace.transferOwnershipWarning')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="equipo-panel" style={{
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '0.85rem',
              }}>
                <div><strong>{t('teamWorkspace.currentOwnerLabel')}:</strong> {currentOwner?.displayName || currentOwner?.email || 'Tú'} ({currentOwner?.email})</div>
                <div style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.transferCommitment')}</div>
              </div>

              {transferSuccessMsg && (
                <div className="card card--success" style={{ padding: '8px 12px', color: 'var(--success, #16a34a)' }}>
                  {transferSuccessMsg}
                </div>
              )}

              <div>
                <label htmlFor="new-owner-select" style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  {t('teamWorkspace.newOwnerLabel')} *
                </label>
                <select
                  id="new-owner-select"
                  className="equipo-modal__select"
                  style={{ width: '100%' }}
                  value={transferTargetUserId}
                  onChange={(e) => setTransferTargetUserId(e.target.value)}
                  data-testid="new-owner-select"
                >
                  <option value="">{t('teamWorkspace.selectNewOwner')}</option>
                  {transferCandidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName || m.email} ({m.role}) — {m.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="previous-owner-role" style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  {t('teamWorkspace.previousOwnerRoleLabel')}
                </label>
                <select
                  id="previous-owner-role"
                  className="equipo-modal__select"
                  style={{ width: '100%' }}
                  value={previousOwnerRole}
                  onChange={(e) => setPreviousOwnerRole(e.target.value as 'ADMIN' | 'PLANNER')}
                  data-testid="previous-owner-role-select"
                >
                  <option value="ADMIN">{t('teamWorkspace.adminRecommended')}</option>
                  <option value="PLANNER">{t('teamWorkspace.rolePlanner')}</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={transferConfirmed}
                  onChange={(e) => setTransferConfirmed(e.target.checked)}
                  data-testid="transfer-confirm-checkbox"
                />
                <span>{t('teamWorkspace.transferAck')}</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--secondary"
                  onClick={() => setIsTransferOpen(false)}
                >
                  {t('teamWorkspace.cancel')}
                </button>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--danger"
                  disabled={!transferTargetUserId || !transferConfirmed || transferSubmitting}
                  onClick={() => void handleTransferOwnership()}
                  data-testid="confirm-transfer-ownership-button"
                >
                  {transferSubmitting ? t('teamWorkspace.transferring') : t('teamWorkspace.confirmTransfer')}
                </button>
              </div>
            </div>
          </ModalShell>
        )}

        {/* AREA MODAL (NUEVA / EDITAR) */}
        {isAreaModalOpen && (
          <ModalShell
            isOpen={true}
            title={editingArea ? t('teamWorkspace.editArea') : t('teamWorkspace.newArea')}
            onClose={() => setIsAreaModalOpen(false)}
            closeAriaLabel={t('teamWorkspace.close')}
            maxWidth="480px"
          >
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '16px' }} data-testid="area-modal">
              {error && (
                <div className="equipo-modal__alert equipo-modal__alert--danger">
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="area-name" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {t('teamWorkspace.areaNameLabel')} *
                </label>
                <input
                  id="area-name"
                  type="text"
                  className="equipo-modal__input"
                  placeholder={t('teamWorkspace.areaNamePlaceholder')}
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  data-testid="area-name-input"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="area-code" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {t('teamWorkspace.areaCodeLabel')}
                </label>
                <input
                  id="area-code"
                  type="text"
                  maxLength={10}
                  className="equipo-modal__input"
                  placeholder={t('teamWorkspace.areaCodePlaceholder')}
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.toUpperCase())}
                  data-testid="area-code-input"
                />
              </div>

              {editingArea && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={areaActive}
                    onChange={(e) => setAreaActive(e.target.checked)}
                    data-testid="area-active-checkbox"
                  />
                  <span>{t('teamWorkspace.areaActiveLabel')}</span>
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--secondary"
                  onClick={() => setIsAreaModalOpen(false)}
                >
                  {t('teamWorkspace.cancel')}
                </button>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--primary"
                  disabled={!areaName.trim() || areaSubmitting}
                  onClick={() => void handleSaveArea()}
                  data-testid="save-area-button"
                >
                  {areaSubmitting ? t('teamWorkspace.saving') : t('teamWorkspace.saveArea')}
                </button>
              </div>
            </div>
          </ModalShell>
        )}

        {/* EDIT EMPLOYEE MODAL */}
        {editingEmployee && (
          <ModalShell
            isOpen={Boolean(editingEmployee)}
            onClose={() => setEditingEmployee(null)}
            title={t('teamWorkspace.editFileTitle', { name: editingEmployee.name })}
            closeAriaLabel={t('teamWorkspace.close')}
            maxWidth="480px"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }} data-testid="edit-employee-modal">
              {editEmployeeError && (
                <div className="card card--error" role="alert" style={{ padding: '8px 12px' }}>
                  <span style={{ color: 'var(--danger, #ef4444)', fontSize: '0.85rem' }}>{editEmployeeError}</span>
                </div>
              )}
              <div>
                <label htmlFor="edit-emp-name" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  {t('teamWorkspace.editFullName')}
                </label>
                <input
                  id="edit-emp-name"
                  type="text"
                  className="equipo-modal__search"
                  style={{ width: '100%' }}
                  value={editEmployeeName}
                  onChange={(e) => setEditEmployeeName(e.target.value)}
                  data-testid="edit-employee-name-input"
                />
              </div>

              <div>
                <label htmlFor="edit-emp-external-id" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  {t('teamWorkspace.editExternalId')}
                </label>
                <input
                  id="edit-emp-external-id"
                  type="text"
                  className="equipo-modal__search"
                  style={{ width: '100%' }}
                  value={editEmployeeExternalId}
                  onChange={(e) => setEditEmployeeExternalId(e.target.value)}
                  placeholder={t('teamWorkspace.editExternalIdPlaceholder')}
                  data-testid="edit-employee-external-id-input"
                />
              </div>

              <div>
                <label htmlFor="edit-emp-area" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  {t('teamWorkspace.assignedAreaLabel')}
                </label>
                <select
                  id="edit-emp-area"
                  className="equipo-modal__select"
                  style={{ width: '100%' }}
                  value={editEmployeeAreaId}
                  onChange={(e) => setEditEmployeeAreaId(e.target.value)}
                  data-testid="edit-employee-area-select"
                >
                  <option value="">{t('teamWorkspace.bulkNoArea')}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-emp-status" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  {t('teamWorkspace.operationalStatusLabel')}
                </label>
                <select
                  id="edit-emp-status"
                  className="equipo-modal__select"
                  style={{ width: '100%' }}
                  value={editEmployeeStatus}
                  onChange={(e) => setEditEmployeeStatus(e.target.value as 'active' | 'inactive')}
                  data-testid="edit-employee-status-select"
                >
                  <option value="active">{t('teamWorkspace.employeeStatusActive')}</option>
                  <option value="inactive">{t('teamWorkspace.employeeStatusInactive')}</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--secondary"
                  onClick={() => setEditingEmployee(null)}
                  disabled={editEmployeeSubmitting}
                >
                  {t('teamWorkspace.cancel')}
                </button>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--primary"
                  onClick={() => void handleSaveEmployee()}
                  disabled={editEmployeeSubmitting}
                  data-testid="save-employee-button"
                >
                  {editEmployeeSubmitting ? t('teamWorkspace.savingDots') : t('teamWorkspace.saveFile')}
                </button>
              </div>
            </div>
          </ModalShell>
        )}

        <ConfirmDialog
          isOpen={Boolean(confirmRevokePersona)}
          title={t('teamWorkspace.revokeAccessTitle')}
          description={confirmRevokePersona ? t('teamWorkspace.revokeAccessText', { name: confirmRevokePersona.name }) : ''}
          confirmLabel={t('teamWorkspace.revokeAccess')}
          cancelLabel={t('teamWorkspace.cancel')}
          onConfirm={() => void executeRevokeAccess()}
          onCancel={() => { setConfirmRevokePersona(null); setRevokeError(null); }}
          error={revokeError}
        />
      </div>
    </ModalShell>
    {grantAccessPersona && (
      <GrantAccessModal
        persona={grantAccessPersona}
        locale={locale}
        onClose={() => setGrantAccessPersona(null)}
        onGranted={() => {
          setGrantAccessPersona(null);
          setSuccessMessage(t('teamWorkspace.invitationSentSuccess'));
          onChanged();
          void fetchMembers();
        }}
      />
    )}
    <BulkCsvImportModal
      isOpen={Boolean(bulkImportKind)}
      kind={bulkImportKind ?? 'employees'}
      onClose={() => setBulkImportKind(null)}
      employees={employees}
      members={members}
      invitations={invitations}
      areas={effectiveAreas}
      locale={locale}
      onChanged={() => { onChanged(); void fetchMembers(); }}
    />
    <PendingInvitationsModal
      isOpen={isPendingInvitationsOpen}
      onClose={() => setIsPendingInvitationsOpen(false)}
      invitations={invitations}
      personas={personas}
      employees={employees}
      onResend={async (inv) => {
        await handleInvitationAction(inv, 'resend');
      }}
      onRevoke={async (inv) => {
        await handleInvitationAction(inv, 'revoke');
      }}
      triggerRef={pendingInvitationsButtonRef}
    />
    </>
  );
}

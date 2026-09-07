import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { buildPersonas, filterPersonas, Persona } from '../../lib/personas';
import {
  addRemoteMember,
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
  updateRemoteMemberRole,
} from '../../lib/remote';
import type { Role } from '../../lib/session';
import { useI18n } from '../../lib/use-i18n';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ModalShell } from '../ui/ModalShell';

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
}

export function EquipoModal({
  isOpen,
  onClose,
  employees,
  areas = [],
  currentUserId,
  currentUserRole = 'ADMIN',
  onChanged,
  initialTab = 'personas',
}: EquipoModalProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'personas' | 'roles' | 'areas' | 'assignments'>(initialTab);
  const [members, setMembers] = useState<RemoteMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters for Personas tab
  const [search, setSearch] = useState('');
  const [filterAccess, setFilterAccess] = useState<'all' | 'with_access' | 'without_access'>('all');
  const [filterRole, setFilterRole] = useState<'all' | 'OWNER' | 'ADMIN' | 'PLANNER' | 'EMPLOYEE'>('all');
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'pending_access'>('all');

  // Wizard state (Añadir persona)
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardHasAccess, setWizardHasAccess] = useState(true);
  const [wizardEmail, setWizardEmail] = useState('');
  const [wizardPassword, setWizardPassword] = useState('');
  const [wizardCreateEmployee, setWizardCreateEmployee] = useState(true);
  const [wizardExternalId, setWizardExternalId] = useState('');
  const [wizardAreaId, setWizardAreaId] = useState('');
  const [wizardRole, setWizardRole] = useState<'ADMIN' | 'PLANNER' | 'EMPLOYEE'>('EMPLOYEE');
  const [wizardScopeType, setWizardScopeType] = useState<'ORGANIZATION' | 'AREAS' | 'EMPLOYEES'>('ORGANIZATION');
  const [wizardScopedAreaIds, setWizardScopedAreaIds] = useState<string[]>([]);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardGeneratedPassword, setWizardGeneratedPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

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

  // Tab 4: Asignaciones state
  const [assignmentSubTab, setAssignmentSubTab] = useState<'employees_to_area' | 'planner_scopes'>('employees_to_area');
  const [selectedBulkEmployeeIds, setSelectedBulkEmployeeIds] = useState<string[]>([]);
  const [bulkTargetAreaId, setBulkTargetAreaId] = useState<string>('');
  const [bulkEffectiveDate, setBulkEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkFilterCurrentArea, setBulkFilterCurrentArea] = useState<string>('all');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);

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
  }, [fetchMembers]);

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

  // Derived personas
  const personas = useMemo(() => {
    return buildPersonas(members, employees, currentUserId, effectiveAreas);
  }, [members, employees, currentUserId, effectiveAreas]);

  const filteredPersonas = useMemo(() => {
    return filterPersonas(personas, {
      search,
      access: filterAccess,
      role: filterRole,
      areaId: filterArea,
      status: filterStatus,
    });
  }, [personas, search, filterAccess, filterRole, filterArea, filterStatus]);

  // Candidate members for ownership transfer (active members excluding current user)
  const transferCandidates = useMemo(() => {
    return members.filter((m) => m.userId !== currentUserId);
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
        ? effectiveAreas.find((a) => a.id === targetAreaId)?.name || 'Área'
        : 'Sin área';
      setBulkSuccessMessage(`${res.count} empleados asignados a "${areaName}" con fecha de efecto ${res.effectiveDate}.`);
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
      setPlannerScopeSuccessMessage('Ámbito de planificación guardado correctamente.');
      onChanged();
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
    } finally {
      setPlannerScopeSubmitting(false);
    }
  };

  const isOwner = currentUserRole === 'OWNER';

  // Handle Wizard Submit
  const handleCreatePersona = async () => {
    setWizardSubmitting(true);
    setError(null);
    try {
      let createdEmployeeId: string | undefined;

      // 1. If operational employee is requested, create employee first
      if (wizardCreateEmployee) {
        const emp = await createRemoteEmployee({
          name: wizardName.trim(),
          externalEmployeeId: wizardExternalId.trim() || undefined,
          areaId: wizardAreaId || undefined,
        });
        createdEmployeeId = emp.id;
      }

      let generatedPassword: string | null = null;
      // 2. If access is requested, add member and link
      if (wizardHasAccess) {
        const res = await addRemoteMember({
          email: wizardEmail.trim(),
          displayName: wizardName.trim(),
          role: wizardRole,
          password: wizardPassword.trim() || undefined,
          employeeId: createdEmployeeId,
          scopedAreaId: wizardRole === 'PLANNER' && wizardScopeType === 'AREAS' && wizardScopedAreaIds.length > 0 ? wizardScopedAreaIds[0] : undefined,
          plannerScopeType: wizardRole === 'PLANNER' ? wizardScopeType : undefined,
          scopedAreaIds: wizardRole === 'PLANNER' && wizardScopeType === 'AREAS' ? wizardScopedAreaIds : undefined,
        });

        if (res.temporaryPassword) {
          generatedPassword = res.temporaryPassword;
          setWizardGeneratedPassword(res.temporaryPassword);
        }
      }

      onChanged();
      await fetchMembers();
      if (!generatedPassword) {
        setIsWizardOpen(false);
        resetWizard();
      }
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
    setWizardPassword('');
    setWizardCreateEmployee(true);
    setWizardExternalId('');
    setWizardAreaId('');
    setWizardRole('EMPLOYEE');
    setWizardScopeType('ORGANIZATION');
    setWizardScopedAreaIds([]);
    setWizardGeneratedPassword(null);
    setCopiedPassword(false);
  };

  // Revoke access confirmation dialog state
  const [confirmRevokePersona, setConfirmRevokePersona] = useState<Persona | null>(null);

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
    setConfirmRevokePersona(persona);
  };

  const executeRevokeAccess = async () => {
    if (!confirmRevokePersona?.userId) return;
    try {
      await removeRemoteMember(confirmRevokePersona.userId);
      setConfirmRevokePersona(null);
      onChanged();
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('teamWorkspace.actionFailed'));
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

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={t('teamWorkspace.title')}
      closeAriaLabel="Cerrar"
      workspace
      maxWidth="1140px"
    >
      <div className="equipo-modal" data-testid="equipo-modal">
        {/* Workspace Tabs */}
        <div className="equipo-modal__tabs" role="tablist">
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

        {/* TAB 1: PERSONAS */}
        {activeTab === 'personas' && (
          <>
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
                  <option value="all">{t('teamWorkspace.filterAccess')}: {t('teamWorkspace.all')}</option>
                  <option value="with_access">{t('teamWorkspace.activeAccess')}</option>
                  <option value="without_access">{t('teamWorkspace.noAccess')}</option>
                </select>

                <select
                  className="equipo-modal__select"
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as typeof filterRole)}
                  aria-label={t('teamWorkspace.filterRole')}
                  data-testid="filter-role"
                >
                  <option value="all">{t('teamWorkspace.filterRole')}: {t('teamWorkspace.all')}</option>
                  <option value="OWNER">Propietario</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="PLANNER">Planificador</option>
                  <option value="EMPLOYEE">Empleado</option>
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
                  aria-label={t('teamWorkspace.filterStatus')}
                  data-testid="filter-status"
                >
                  <option value="all">{t('teamWorkspace.filterStatus')}: {t('teamWorkspace.all')}</option>
                  <option value="active">{t('teamWorkspace.active')}</option>
                  <option value="inactive">{t('teamWorkspace.inactive')}</option>
                  <option value="pending_access">{t('teamWorkspace.pendingAccess')}</option>
                </select>
              </div>

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

            <div className="equipo-modal__table-container">
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Cargando personas…
                </div>
              ) : filteredPersonas.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t('teamWorkspace.emptyPersonas')}
                </div>
              ) : (
                <table className="equipo-table" data-testid="personas-table">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Email de acceso</th>
                      <th>Acceso</th>
                      <th>Rol</th>
                      <th>Ficha Empleado</th>
                      <th>Área actual</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPersonas.map((p) => {
                      const initials = (p.name || 'U').slice(0, 2).toUpperCase();
                      return (
                        <tr key={p.id} data-testid={`persona-row-${p.id}`}>
                          <td>
                            <div className="equipo-persona-cell">
                              <span className="equipo-avatar">{initials}</span>
                              <div>
                                <strong>{p.name}</strong>
                                {p.isCurrentUser && (
                                  <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--accent)' }}>
                                    (Tú)
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            {p.email ? (
                              <span>{p.email}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.noAccess')}</span>
                            )}
                          </td>
                          <td>
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
                          <td>
                            {p.role ? (
                              <span className={`equipo-badge equipo-badge--${p.role.toLowerCase()}`}>
                                {p.role === 'OWNER' && 'Propietario'}
                                {p.role === 'ADMIN' && 'Admin'}
                                {p.role === 'PLANNER' && 'Planificador'}
                                {p.role === 'EMPLOYEE' && 'Empleado'}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td>
                            {p.employeeId ? (
                              <span>{p.employeeExternalId ? `ID: ${p.employeeExternalId}` : t('teamWorkspace.linked')}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.noEmployeeRecord')}</span>
                            )}
                          </td>
                          <td>
                            {p.areaName || <span style={{ color: 'var(--text-muted)' }}>{t('teamWorkspace.noArea')}</span>}
                          </td>
                          <td>
                            <span className={`equipo-badge equipo-badge--${p.status === 'active' ? 'success' : 'warning'}`}>
                              {p.status === 'active' && t('teamWorkspace.active')}
                              {p.status === 'inactive' && t('teamWorkspace.inactive')}
                              {p.status === 'pending_access' && t('teamWorkspace.pendingAccess')}
                            </span>
                          </td>
                          <td>
                            <div className="equipo-actions-cell">
                              {!p.hasAccess && p.employeeId && (
                                <button
                                  type="button"
                                  className="equipo-btn equipo-btn--secondary"
                                  onClick={() => {
                                    resetWizard();
                                    setWizardName(p.name);
                                    setWizardCreateEmployee(false);
                                    setWizardExternalId(p.employeeExternalId || '');
                                    setWizardStep(2);
                                    setIsWizardOpen(true);
                                  }}
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
              )}
            </div>
          </>
        )}

        {/* TAB 2: ROLES Y ACCESO */}
        {activeTab === 'roles' && (
          <>
            <div className="equipo-modal__toolbar">
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Autoridad, permisos y ámbitos de planificación</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Asigna roles organizativos y define el alcance de acción de los planificadores.
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
                </button>
              )}
            </div>

            <div className="equipo-modal__table-container">
              <table className="equipo-table" data-testid="roles-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Rol</th>
                    <th>Ámbito / Scope</th>
                    <th>Email de acceso</th>
                    <th>Ficha Empleado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const initials = (m.displayName || m.email).slice(0, 2).toUpperCase();
                    const isItemCurrentUser = m.userId === currentUserId;

                    let scopeLabel = 'Toda la organización';
                    if (m.role === 'EMPLOYEE') {
                      scopeLabel = 'Personal (Self)';
                    } else if (m.role === 'PLANNER') {
                      if (m.plannerScopeType === 'AREAS' && (m.scopedAreaIds?.length || m.scopedAreaId)) {
                        scopeLabel = `Áreas (${m.scopedAreaIds?.length || 1})`;
                      } else if (m.plannerScopeType === 'EMPLOYEES' && m.scopedEmployeeIds?.length) {
                        scopeLabel = `Empleados (${m.scopedEmployeeIds.length})`;
                      } else {
                        scopeLabel = 'Toda la organización';
                      }
                    }

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
                            {m.role === 'OWNER' && 'Propietario'}
                            {m.role === 'ADMIN' && 'Administrador'}
                            {m.role === 'PLANNER' && 'Planificador'}
                            {m.role === 'EMPLOYEE' && 'Empleado'}
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
                            <span>{m.employeeName || m.employeeExternalId ? `${m.employeeName ?? ''} (${m.employeeExternalId ?? ''})` : t('teamWorkspace.linked')}</span>
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
                                onClick={() => {
                                  const persona = personas.find((p) => p.userId === m.userId);
                                   if (persona) {
                                    setEditingRolePersona(persona);
                                    setNewRoleSelection(m.role as 'ADMIN' | 'PLANNER' | 'EMPLOYEE');
                                    setNewRoleScopeType(m.plannerScopeType || 'ORGANIZATION');
                                    setNewRoleScopedAreas(m.scopedAreaIds || (m.scopedAreaId ? [m.scopedAreaId] : []));
                                    setNewRoleScopedEmployees(m.scopedEmployeeIds || []);
                                    setRoleEmployeeSearch('');
                                  }
                                }}
                                data-testid={`change-role-${m.userId}`}
                              >
                                {t('teamWorkspace.changeRole')}
                              </button>
                            )}
                            {m.role === 'PLANNER' && (
                              <button
                                type="button"
                                className="equipo-btn equipo-btn--secondary"
                                onClick={() => {
                                  const persona = personas.find((p) => p.userId === m.userId);
                                  if (persona) {
                                    setEditingRolePersona(persona);
                                    setNewRoleSelection('PLANNER');
                                    setNewRoleScopeType(m.plannerScopeType || (m.scopedAreaId ? 'AREAS' : 'ORGANIZATION'));
                                    setNewRoleScopedAreas(m.scopedAreaIds || (m.scopedAreaId ? [m.scopedAreaId] : []));
                                    setNewRoleScopedEmployees(m.scopedEmployeeIds || []);
                                    setRoleEmployeeSearch('');
                                  }
                                }}
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
          </>
        )}

        {/* TAB 3: ÁREAS */}
        {activeTab === 'areas' && (
          <>
            <div className="equipo-modal__toolbar">
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Áreas organizativas</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Estructura departamental y centros de trabajo (opcional).
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
              ) : (
                <table className="equipo-table" data-testid="areas-table">
                  <thead>
                    <tr>
                      <th>Área</th>
                      <th>Código</th>
                      <th>Estado</th>
                      <th>Empleados asignados</th>
                      <th>Planificadores asignados</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveAreas.map((a) => {
                      const empCount = employees.filter((e) => e.areaId === a.id).length;
                      const assignedPlanners = members.filter(
                        (m) =>
                          m.role === 'PLANNER' &&
                          (m.scopedAreaId === a.id ||
                            (m.plannerScopeType === 'AREAS' && m.scopedAreaIds?.includes(a.id)) ||
                            m.plannerScopeType === 'ORGANIZATION')
                      );

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
                              {a.active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td>{empCount} {empCount === 1 ? 'empleado' : 'empleados'}</td>
                          <td>
                            {assignedPlanners.length > 0 ? (
                              <span style={{ fontSize: '0.85rem' }}>
                                {assignedPlanners.length} {assignedPlanners.length === 1 ? 'planificador' : 'planificadores'}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin planificadores</span>
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
                                onClick={() => {
                                  setActiveTab('assignments');
                                  setAssignmentSubTab('employees_to_area');
                                  setBulkTargetAreaId(a.id);
                                  setBulkFilterCurrentArea('all');
                                }}
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
              )}
            </div>
          </>
        )}

        {/* TAB 4: ASIGNACIONES */}
        {activeTab === 'assignments' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }} data-testid="assignments-tab">
            {/* Sub-tab navigation */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }} role="tablist">
              <button
                type="button"
                className={`equipo-modal__tab ${assignmentSubTab === 'employees_to_area' ? 'is-active' : ''}`}
                onClick={() => setAssignmentSubTab('employees_to_area')}
                role="tab"
                aria-selected={assignmentSubTab === 'employees_to_area'}
                data-testid="subtab-employees-to-area"
              >
                Empleados → Área (Cambio masivo)
              </button>
              <button
                type="button"
                className={`equipo-modal__tab ${assignmentSubTab === 'planner_scopes' ? 'is-active' : ''}`}
                onClick={() => setAssignmentSubTab('planner_scopes')}
                role="tab"
                aria-selected={assignmentSubTab === 'planner_scopes'}
                data-testid="subtab-planner-scopes"
              >
                Planificadores → Ámbitos
              </button>
            </div>

            {assignmentSubTab === 'employees_to_area' && (
              <>
                {/* Bulk Operation Action Bar */}
                <div style={{
                  padding: '12px 16px',
                  background: 'var(--bg-surface-header, #f8fafc)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '12px',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Área de destino:</label>
                    <select
                      className="equipo-modal__select"
                      value={bulkTargetAreaId}
                      onChange={(e) => setBulkTargetAreaId(e.target.value)}
                      data-testid="bulk-target-area-select"
                    >
                      <option value="">Selecciona área de destino…</option>
                      {effectiveAreas.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} {a.code ? `(${a.code})` : ''}</option>
                      ))}
                      <option value="__NONE__">Sin área / Desasignar</option>
                    </select>

                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Fecha de efecto:</label>
                    <input
                      type="date"
                      className="equipo-modal__input"
                      value={bulkEffectiveDate}
                      onChange={(e) => setBulkEffectiveDate(e.target.value)}
                      data-testid="bulk-effective-date-input"
                    />
                  </div>

                  <button
                    type="button"
                    className="equipo-btn equipo-btn--primary"
                    disabled={selectedBulkEmployeeIds.length === 0 || !bulkTargetAreaId || bulkSubmitting}
                    onClick={() => void handleApplyBulkMove()}
                    data-testid="apply-bulk-move-button"
                  >
                    {bulkSubmitting
                      ? 'Reasignando…'
                      : `Aplicar a ${selectedBulkEmployeeIds.length} ${selectedBulkEmployeeIds.length === 1 ? 'empleado' : 'empleados'}`}
                  </button>
                </div>

                {bulkSuccessMessage && (
                  <div className="equipo-modal__alert equipo-modal__alert--success" data-testid="bulk-success-message">
                    {bulkSuccessMessage}
                  </div>
                )}

                {/* Filter and selection tools */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="text"
                      className="equipo-modal__search"
                      placeholder="Buscar por nombre o ID de empleado…"
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      data-testid="bulk-employee-search"
                    />
                    <select
                      className="equipo-modal__select"
                      value={bulkFilterCurrentArea}
                      onChange={(e) => setBulkFilterCurrentArea(e.target.value)}
                      data-testid="bulk-filter-current-area"
                    >
                      <option value="all">Área actual: Todas</option>
                      <option value="none">Sin área asignada</option>
                      {effectiveAreas.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} data-testid="bulk-selection-count">
                      {selectedBulkEmployeeIds.length} de {filteredBulkEmployees.length} seleccionados
                    </span>
                    <button
                      type="button"
                      className="equipo-btn equipo-btn--secondary"
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      onClick={handleToggleSelectAllBulk}
                      data-testid="bulk-select-all-button"
                    >
                      {selectedBulkEmployeeIds.length === filteredBulkEmployees.length && filteredBulkEmployees.length > 0
                        ? 'Deseleccionar todos'
                        : 'Seleccionar todos'}
                    </button>
                  </div>
                </div>

                {/* Employee table with selection checkboxes */}
                <div className="equipo-modal__table-container">
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
                        <th>Empleado</th>
                        <th>ID Externo</th>
                        <th>Área actual</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBulkEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                            No se encontraron empleados con los filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        filteredBulkEmployees.map((emp) => {
                          const isSelected = selectedBulkEmployeeIds.includes(emp.id);
                          const area = emp.areaId ? effectiveAreas.find((a) => a.id === emp.areaId) : null;
                          return (
                            <tr
                              key={emp.id}
                              style={{ background: isSelected ? 'var(--accent-subtle, rgba(14, 165, 233, 0.08))' : undefined }}
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
                                  <span style={{ color: 'var(--text-muted)' }}>Sin área</span>
                                )}
                              </td>
                              <td>
                                <span className={`equipo-badge equipo-badge--${emp.status}`}>
                                  {emp.status === 'active' ? 'Activo' : 'Pendiente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {assignmentSubTab === 'planner_scopes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
                <div style={{
                  padding: '16px',
                  background: 'var(--bg-surface-header, #f8fafc)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label htmlFor="tab4-planner-select" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      Seleccionar planificador:
                    </label>
                    <select
                      id="tab4-planner-select"
                      className="equipo-modal__select"
                      value={selectedPlannerUserId}
                      onChange={(e) => setSelectedPlannerUserId(e.target.value)}
                      data-testid="tab4-planner-select"
                    >
                      <option value="">Selecciona un usuario…</option>
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
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>Ámbito de gestión:</p>

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
                              (No hay áreas)
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
                              {tab4ScopedEmployees.length} seleccionados
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
                                  <span>{emp.name} {emp.externalEmployeeId ? `(${emp.externalEmployeeId})` : ''}</span>
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
                          {plannerScopeSubmitting ? 'Guardando…' : 'Guardar ámbito de planificador'}
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
            closeAriaLabel="Cerrar"
            maxWidth="560px"
          >
            <div className="equipo-wizard" data-testid="add-persona-wizard">
              {wizardGeneratedPassword ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <CheckCircle2 size={48} style={{ color: 'var(--success, #16a34a)', marginBottom: '12px' }} />
                  <h3 style={{ margin: '0 0 8px 0' }}>{t('teamWorkspace.createdSuccess')}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {t('teamWorkspace.temporaryPasswordNote')}
                  </p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    margin: '16px 0',
                    padding: '12px',
                    background: 'var(--bg-surface-header, #f8fafc)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '1rem',
                  }}>
                    <strong>{wizardGeneratedPassword}</strong>
                    <button
                      type="button"
                      className="equipo-btn equipo-btn--secondary"
                      onClick={() => {
                        void navigator.clipboard.writeText(wizardGeneratedPassword);
                        setCopiedPassword(true);
                        setTimeout(() => setCopiedPassword(false), 2000);
                      }}
                    >
                      <Copy size={14} />
                      {copiedPassword ? 'Copiada' : 'Copiar'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="equipo-btn equipo-btn--primary"
                    style={{ width: '100%', marginTop: '16px' }}
                    onClick={() => { setIsWizardOpen(false); resetWizard(); }}
                  >
                    Finalizar
                  </button>
                </div>
              ) : (
                <>
                  <div className="equipo-wizard__steps">
                    <span className={`equipo-wizard__step-indicator${wizardStep === 1 ? ' is-active' : ''}`}>1. Identidad</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 2 ? ' is-active' : ''}`}>2. Acceso</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 3 ? ' is-active' : ''}`}>3. Empleo</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 4 ? ' is-active' : ''}`}>4. Scope</span>
                    <span className={`equipo-wizard__step-indicator${wizardStep === 5 ? ' is-active' : ''}`}>5. Confirmación</span>
                  </div>

                  {/* Step 1: Identidad */}
                  {wizardStep === 1 && (
                    <div className="equipo-wizard__form-group">
                      <label htmlFor="wizard-name" style={{ fontWeight: 600 }}>{t('teamWorkspace.fullNameLabel')} *</label>
                      <input
                        id="wizard-name"
                        type="text"
                        className="equipo-modal__search"
                        placeholder="Ej. Carmen Santos"
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
                            <label htmlFor="wizard-email" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>Email de acceso *</label>
                            <input
                              id="wizard-email"
                              type="email"
                              className="equipo-modal__search"
                              placeholder="carmen@empresa.com"
                              value={wizardEmail}
                              onChange={(e) => setWizardEmail(e.target.value)}
                              data-testid="wizard-email-input"
                            />
                          </div>
                          <div>
                            <label htmlFor="wizard-password" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
                              {t('teamWorkspace.initialPasswordOptional')}
                            </label>
                            <input
                              id="wizard-password"
                              type="password"
                              className="equipo-modal__search"
                              placeholder={t('teamWorkspace.passwordPlaceholder')}
                              value={wizardPassword}
                              onChange={(e) => setWizardPassword(e.target.value)}
                              data-testid="wizard-password-input"
                            />
                          </div>
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
                              placeholder="Ej. EMP-1042"
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
                          <label htmlFor="wizard-role" style={{ fontWeight: 600 }}>Rol en la organización *</label>
                          <select
                            id="wizard-role"
                            className="equipo-modal__select"
                            value={wizardRole}
                            onChange={(e) => setWizardRole(e.target.value as typeof wizardRole)}
                            data-testid="wizard-role-select"
                          >
                            <option value="EMPLOYEE">Empleado</option>
                            <option value="PLANNER">Planificador</option>
                            <option value="ADMIN">Administrador</option>
                          </select>

                          {wizardRole === 'PLANNER' && (
                            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>Ámbito de planificación</p>
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
                          Esta persona no tendrá acceso de usuario, por lo que no requiere rol ni ámbito.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Step 5: Confirmación */}
                  {wizardStep === 5 && (
                    <div className="equipo-wizard__form-group">
                      <h4 style={{ margin: '0 0 12px 0' }}>Resumen de la nueva persona</h4>
                      <div style={{
                        padding: '12px 16px',
                        background: 'var(--bg-surface-header, #f8fafc)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '0.85rem',
                      }}>
                        <div><strong>Nombre:</strong> {wizardName}</div>
                        <div><strong>Acceso:</strong> {wizardHasAccess ? `Sí (${wizardEmail})` : 'No'}</div>
                        {wizardHasAccess && <div><strong>Rol:</strong> {wizardRole}</div>}
                        <div><strong>Ficha Empleado:</strong> {wizardCreateEmployee ? (wizardExternalId ? `Sí (ID: ${wizardExternalId})` : 'Sí') : 'No'}</div>
                        {wizardCreateEmployee && wizardAreaId && (
                          <div><strong>Área:</strong> {areas.find((a) => a.id === wizardAreaId)?.name}</div>
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
                </>
              )}
            </div>
          </ModalShell>
        )}

        {/* ROLE CHANGE MODAL */}
        {editingRolePersona && (
          <ModalShell
            isOpen={Boolean(editingRolePersona)}
            onClose={() => setEditingRolePersona(null)}
            title={`Cambiar rol de ${editingRolePersona.name}`}
            closeAriaLabel="Cerrar"
            maxWidth="480px"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }} data-testid="change-role-modal">
              <div>
                <label htmlFor="select-new-role" style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  Selecciona el nuevo rol:
                </label>
                <select
                  id="select-new-role"
                  className="equipo-modal__select"
                  style={{ width: '100%' }}
                  value={newRoleSelection}
                  onChange={(e) => setNewRoleSelection(e.target.value as typeof newRoleSelection)}
                  data-testid="select-new-role"
                >
                  <option value="EMPLOYEE">Empleado</option>
                  <option value="PLANNER">Planificador</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              {newRoleSelection === 'PLANNER' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>Ámbito de planificación</p>
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
                          (No hay áreas)
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
                              <span>{emp.name} {emp.externalEmployeeId ? `(${emp.externalEmployeeId})` : ''}</span>
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
                  Cancelar
                </button>
                <button
                  type="button"
                  className="equipo-btn equipo-btn--primary"
                  disabled={roleChangeSubmitting}
                  onClick={() => void handleRoleChangeSubmit()}
                  data-testid="save-role-change-button"
                >
                  {roleChangeSubmitting ? 'Guardando…' : 'Guardar rol'}
                </button>
              </div>
            </div>
          </ModalShell>
        )}

        {/* OWNERSHIP TRANSFER MODAL */}
        {isTransferOpen && (
          <ModalShell
            isOpen={isTransferOpen}
            onClose={() => setIsTransferOpen(false)}
            title={t('teamWorkspace.transferOwnershipTitle')}
            closeAriaLabel="Cerrar"
            maxWidth="520px"
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
                  <option value="">Selecciona al nuevo propietario…</option>
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
                  <option value="ADMIN">Administrador (recomendado)</option>
                  <option value="PLANNER">Planificador</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={transferConfirmed}
                  onChange={(e) => setTransferConfirmed(e.target.checked)}
                  data-testid="transfer-confirm-checkbox"
                />
                <span>Entiendo que cederé el rol de Propietario y esta acción no puede deshacerse de forma unilateral.</span>
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
            closeAriaLabel="Cerrar"
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
                  placeholder="Ej. Operaciones, Rampa, Administración"
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
                  placeholder="Ej. OPS, MAD, ADM"
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

        <ConfirmDialog
          isOpen={Boolean(confirmRevokePersona)}
          title={t('teamWorkspace.revokeAccessTitle') || 'Revocar acceso'}
          description={
            confirmRevokePersona
              ? `¿Estás seguro de que deseas revocar el acceso de usuario de ${confirmRevokePersona.name}? El empleo se conservará.`
              : ''
          }
          confirmLabel={t('teamWorkspace.revokeAccess') || 'Revocar acceso'}
          cancelLabel={t('teamWorkspace.cancel') || 'Cancelar'}
          onConfirm={() => void executeRevokeAccess()}
          onCancel={() => setConfirmRevokePersona(null)}
        />
      </div>
    </ModalShell>
  );
}

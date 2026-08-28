import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/use-i18n';
import {
  addRemoteMember,
  bulkAddRemoteMembers,
  BulkMemberResult,
  BulkMemberStatus,
  createRemoteEmployee,
  deleteRemoteEmployee,
  linkEmployeeUser,
  listRemoteMembers,
  RemoteArea,
  RemoteMember,
  removeRemoteMember,
  updateRemoteMemberRole,
  updateRemoteEmployee,
  RemoteEmployee,
} from '../../lib/remote';
import { EmployeeCsvRow, parseEmployeesCsv, parseUsersCsv, UserCsvRow } from '../../lib/bulk-import-csv';
import { findActiveArea } from '../../lib/areas';
import { ModalShell } from '../ui/ModalShell';
import { UpgradePrompt } from './UpgradePrompt';
import { ApiError } from '../../lib/session';
import type { PlanId } from '../../lib/plans';
import { SearchableSelect } from '../ui/SearchableSelect';
import { PasswordInput } from '../ui/PasswordInput';

const fieldLabelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: 0 };

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Org employees for the User ↔ Employee link select and the Employees tab. */
  employees: RemoteEmployee[];
  /** Org's ACTIVE areas — used to pre-validate the CSV `area` column before
   * confirming (the server stays authoritative). */
  areas?: RemoteArea[];
  currentUserId: string;
  onChanged: () => void;
  currentPlan?: PlanId | null;
  switchTarget?: { id: string; name: string } | null;
  onSwitchOrg?: (organizationId: string) => void;
}

const ROLES: RemoteMember['role'][] = ['ADMIN', 'EMPLOYEE'];
type Tab = 'users' | 'employees';

interface EmployeePreviewRow {
  row: EmployeeCsvRow;
  status: 'existing' | 'new' | 'error';
  matchedId?: string;
  /** Row-level validation message (missing id, unknown area) shown instead
   * of the generic "Error" badge — never silently dropped. */
  errorMessage?: string;
}

type UserPreviewStatus =
  | 'new_and_link' | 'existing_and_link' | 'no_employee' | 'already_linked'
  | 'employee_not_found' | 'employee_already_linked' | 'user_already_linked'
  | 'invalid_role' | 'invalid_email' | 'duplicate_in_file';

interface UserPreviewRow {
  row: UserCsvRow;
  status: UserPreviewStatus;
  /** Locally-resolved target employee (by external_employee_id), when any. */
  employee?: RemoteEmployee;
}

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One row of the bulk "Conceder acceso" panel (Fase 4) — always keyed by
 * employeeId, never by row index, since rows can be removed independently. */
interface BulkGrantRow {
  employeeId: string;
  email: string;
  role: RemoteMember['role'];
}

const bulkStatusLabelKey: Record<Exclude<BulkMemberStatus, 'error'>, string> = {
  created_and_linked: 'members.bulkStatusCreatedLinked',
  created: 'members.bulkStatusCreated',
  linked: 'members.bulkStatusLinked',
  existing: 'members.bulkStatusExisting',
  already_linked: 'members.bulkStatusAlreadyLinked',
};

const userPreviewStatusKey: Record<UserPreviewStatus, string> = {
  new_and_link: 'members.previewStatusNewAndLink',
  existing_and_link: 'members.previewStatusExistingAndLink',
  no_employee: 'members.previewStatusNoEmployee',
  already_linked: 'members.previewStatusAlreadyLinked',
  employee_not_found: 'members.previewStatusEmployeeNotFound',
  employee_already_linked: 'members.previewStatusEmployeeAlreadyLinked',
  user_already_linked: 'members.previewStatusUserAlreadyLinked',
  invalid_role: 'members.previewStatusInvalidRole',
  invalid_email: 'members.previewStatusInvalidEmail',
  duplicate_in_file: 'members.previewStatusDuplicateInFile',
};

const bulkResultCodeKey: Record<string, string> = {
  INVALID_EMAIL: 'members.resultCodeInvalidEmail',
  INVALID_ROLE: 'members.resultCodeInvalidRole',
  DUPLICATE_IN_FILE: 'members.resultCodeDuplicateInFile',
  EMPLOYEE_NOT_FOUND: 'members.resultCodeEmployeeNotFound',
  EMPLOYEE_ALREADY_LINKED: 'members.resultCodeEmployeeAlreadyLinked',
  USER_ALREADY_LINKED: 'members.resultCodeUserAlreadyLinked',
};

/**
 * Preview-only classification (Fase 4): informational, mirrors the backend's
 * own validation/guards (bulkAddMembers in api/_lib/data.js) so the ADMIN
 * sees an accurate picture before confirming — the server independently
 * re-validates every row, this is never trusted as authorization.
 */
function classifyUserRow(
  row: UserCsvRow,
  seenEmails: Set<string>,
  members: RemoteMember[],
  employees: RemoteEmployee[],
): UserPreviewRow {
  if (row.rowError === 'missingEmail' || !row.email || !EMAIL_FORMAT_RE.test(row.email)) {
    return { row, status: 'invalid_email' };
  }
  if (row.rowError === 'invalidRole' || !row.role) {
    return { row, status: 'invalid_role' };
  }
  if (seenEmails.has(row.email)) {
    return { row, status: 'duplicate_in_file' };
  }
  seenEmails.add(row.email);

  let employee: RemoteEmployee | undefined;
  if (row.externalEmployeeId) {
    employee = employees.find((candidate) => candidate.externalEmployeeId === row.externalEmployeeId);
    if (!employee) {
      return { row, status: 'employee_not_found' };
    }
  }

  const existingMember = members.find((member) => member.email.toLowerCase() === row.email);
  const linkedEmployee = existingMember
    ? employees.find((candidate) => candidate.userId === existingMember.userId)
    : undefined;

  if (employee?.userId && employee.userId !== existingMember?.userId) {
    return { row, status: 'employee_already_linked', employee };
  }
  if (employee && linkedEmployee && linkedEmployee.id !== employee.id) {
    return { row, status: 'user_already_linked', employee };
  }

  if (existingMember) {
    if (employee && linkedEmployee?.id === employee.id) {
      return { row, status: 'already_linked', employee };
    }
    if (employee) {
      return { row, status: 'existing_and_link', employee };
    }
    return { row, status: linkedEmployee ? 'already_linked' : 'no_employee', employee: linkedEmployee };
  }

  return employee ? { row, status: 'new_and_link', employee } : { row, status: 'no_employee' };
}

/**
 * B2B organization management (ADMIN only, Fase 1.1 PASO 9 + bulk import).
 * Two tabs — Usuarios (accounts/roles/memberships) and Empleados (roster
 * people, may exist without a User) — kept conceptually separate per the
 * User vs Employee split; never mixed in the same write path.
 *
 * No email invitations: for a brand-new email (single add or bulk CSV) the
 * server generates a random temporary password when none is supplied and
 * returns it once — shown here for the ADMIN to hand over out-of-band.
 * Never logged, never persisted in plaintext, never re-fetchable.
 */
export const MembersModal = ({ isOpen, onClose, employees, areas = [], currentUserId, onChanged, currentPlan = null, switchTarget = null, onSwitchOrg }: MembersModalProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('users');
  const [members, setMembers] = useState<RemoteMember[]>([]);
  const [error, setError] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);

  // Manual "add user" form.
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<RemoteMember['role']>('EMPLOYEE');
  const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [lastTemporaryPassword, setLastTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Manual "add employee" form.
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeExternalId, setNewEmployeeExternalId] = useState('');
  const [newEmployeeAreaId, setNewEmployeeAreaId] = useState('');

  // Employee lifecycle (Bloque D): per-row contextual menu + inline edit.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editExternalId, setEditExternalId] = useState('');
  const [editAreaId, setEditAreaId] = useState('');

  // Inline "link existing user" row (Bloque: user↔employee link management).
  const [linkingEmployeeId, setLinkingEmployeeId] = useState<string | null>(null);
  const [linkingUserId, setLinkingUserId] = useState('');

  // Bulk Users CSV.
  const usersFileRef = useRef<HTMLInputElement>(null);
  const [usersPreview, setUsersPreview] = useState<UserPreviewRow[] | null>(null);
  const [usersImporting, setUsersImporting] = useState(false);
  const [usersResult, setUsersResult] = useState<{
    created: { email: string; password: string }[];
    linked: number;
    failed: number;
    rows: BulkMemberResult[];
  } | null>(null);
  const [usersCsvError, setUsersCsvError] = useState('');

  // Bulk Employees CSV.
  const employeesFileRef = useRef<HTMLInputElement>(null);
  const [employeesPreview, setEmployeesPreview] = useState<EmployeePreviewRow[] | null>(null);
  const [employeesImporting, setEmployeesImporting] = useState(false);
  const [employeesResult, setEmployeesResult] = useState<{ created: number; updated: number; failed: number } | null>(null);
  const [employeesCsvError, setEmployeesCsvError] = useState('');

  // Employees-tab filter + multi-select "grant access in bulk" (Fase 3/4).
  const [employeeFilter, setEmployeeFilter] = useState<'all' | 'with' | 'without'>('all');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [bulkGrantOpen, setBulkGrantOpen] = useState(false);
  const [bulkGrantRows, setBulkGrantRows] = useState<BulkGrantRow[]>([]);
  const [bulkGrantSubmitting, setBulkGrantSubmitting] = useState(false);
  const [bulkGrantResults, setBulkGrantResults] = useState<Record<string, BulkMemberResult> | null>(null);
  const bulkGrantPanelRef = useRef<HTMLDivElement>(null);

  // Workspace layout: user-list search + collapsible "add employee" panel.
  const [memberSearch, setMemberSearch] = useState('');
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);

  // Scroll preservation (Fase 7/8): the employees/users lists are their own
  // scroll containers (not the whole modal). Any action re-fetches members
  // and/or employees, which re-renders these lists in place (same DOM nodes,
  // keyed by id — never remounted) but a fresh array reference still nudges
  // layout enough to lose scrollTop, so we snapshot it right before the
  // action and restore it synchronously (useLayoutEffect, before paint) once
  // the resulting re-render commits. No setTimeout, no scrollIntoView guess.
  const pendingScrollRestoreRef = useRef<{ el: HTMLDivElement; top: number } | null>(null);
  const captureScroll = (el: HTMLDivElement | null) => {
    if (el) {
      pendingScrollRestoreRef.current = { el, top: el.scrollTop };
    }
  };
  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (pending) {
      pending.el.scrollTop = pending.top;
      pendingScrollRestoreRef.current = null;
    }
  });
  const employeesListRef = useRef<HTMLDivElement>(null);
  const membersListRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      setMembers(await listRemoteMembers());
    } catch {
      setError(t('members.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setLastTemporaryPassword(null);
      void reload();
    } else {
      // Never keep a shown-once secret around after the modal closes.
      setLastTemporaryPassword(null);
      setUsersPreview(null);
      setUsersResult(null);
      setEmployeesPreview(null);
      setEmployeesResult(null);
      setOpenMenuId(null);
      setEditingEmployeeId(null);
      setLinkingEmployeeId(null);
      setSelectedEmployeeIds(new Set());
      setBulkGrantOpen(false);
      setBulkGrantRows([]);
      setBulkGrantResults(null);
      setMemberSearch('');
      setAddEmployeeOpen(false);
    }
  }, [isOpen, reload]);

  // Contextual employee menu: closes on ESC or any pointer-down outside it.
  useEffect(() => {
    if (!openMenuId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement && event.target.closest('[data-employee-menu]'))) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [openMenuId]);

  const run = async (action: () => Promise<unknown>, scrollEl: HTMLDivElement | null = null) => {
    captureScroll(scrollEl);
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        setShowUpgrade(true);
      } else {
        setError(err instanceof Error ? err.message : t('members.actionFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    setLastTemporaryPassword(null);
    void run(async () => {
      const created = await addRemoteMember({
        email,
        role,
        displayName: displayName || undefined,
        password: password || undefined,
        employeeId: employeeId || undefined,
      });
      if (created.temporaryPassword) {
        setLastTemporaryPassword({ email: created.email, password: created.temporaryPassword });
      }
      setEmail('');
      setDisplayName('');
      setPassword('');
      setEmployeeId('');
      setRole('EMPLOYEE');
    });
  };

  const handleAddEmployee = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await createRemoteEmployee({
        name: newEmployeeName,
        externalEmployeeId: newEmployeeExternalId || undefined,
        ...(areas.length > 0 ? { areaId: newEmployeeAreaId || null } : {}),
      });
      setNewEmployeeName('');
      setNewEmployeeExternalId('');
      setNewEmployeeAreaId('');
    });
  };

  // ------------------------------------------------------ employee lifecycle

  const startEditEmployee = (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    setEditingEmployeeId(employee.id);
    setEditName(employee.name);
    setEditExternalId(employee.externalEmployeeId ?? '');
    setEditAreaId(employee.areaId ?? '');
  };

  const handleEditEmployeeSave = (employee: RemoteEmployee, event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      // status carried through explicitly: the PATCH default would force an
      // inactive employee back to 'active' when status is omitted.
      await updateRemoteEmployee({
        id: employee.id,
        name: editName.trim(),
        externalEmployeeId: editExternalId.trim(),
        ...(areas.length > 0 ? { areaId: editAreaId || null } : {}),
        status: employee.status,
      });
      setEditingEmployeeId(null);
    }, employeesListRef.current);
  };

  const handleDeactivateEmployee = (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    if (!window.confirm(t('members.deactivateConfirm', { name: employee.name }))) {
      return;
    }
    // On 400 LAST_ADMIN (and any other rejection) run() surfaces the server
    // message in the modal's error area.
    void run(() => updateRemoteEmployee({ id: employee.id, status: 'inactive' }), employeesListRef.current);
  };

  const handleReactivateEmployee = (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    void run(() => updateRemoteEmployee({ id: employee.id, status: 'active' }), employeesListRef.current);
  };

  const startLinkEmployee = (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    setLinkingEmployeeId(employee.id);
    setLinkingUserId('');
  };

  const handleLinkEmployeeSave = (employee: RemoteEmployee) => {
    if (!linkingUserId) {
      return;
    }
    // On 409 EMPLOYEE_ALREADY_LINKED / USER_ALREADY_LINKED run() surfaces the
    // server message in the modal's error area.
    void run(async () => {
      await linkEmployeeUser(employee.id, linkingUserId);
      setLinkingEmployeeId(null);
    }, employeesListRef.current);
  };

  const handleDeleteEmployee = async (employee: RemoteEmployee) => {
    setOpenMenuId(null);
    if (!window.confirm(t('members.deleteConfirm', { name: employee.name }))) {
      return;
    }
    captureScroll(employeesListRef.current);
    setBusy(true);
    setError('');
    try {
      await deleteRemoteEmployee(employee.id);
      await reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMPLOYEE_HAS_HISTORY') {
        // History is never destroyed: explain and offer deactivation instead.
        setError(err.message);
        if (window.confirm(t('members.hasHistoryDeactivateOffer'))) {
          try {
            captureScroll(employeesListRef.current);
            await updateRemoteEmployee({ id: employee.id, status: 'inactive' });
            setError('');
            await reload();
            onChanged();
          } catch (fallbackErr) {
            setError(fallbackErr instanceof Error ? fallbackErr.message : t('members.actionFailed'));
          }
        }
      } else {
        setError(err instanceof Error ? err.message : t('members.actionFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const copyToClipboard = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      // Clipboard API unavailable (permissions/context) — the value is still
      // visible on screen for manual copy, nothing else to do.
    }
  };

  const unlinkedEmployees = employees.filter(
    (employee) => (employee.status === 'active' || employee.status === 'pending_access') && !employee.userId,
  );

  // Every non-inactive employee with no linked User — eligible for the
  // "grant access" bulk flow (Fase 3). Already-linked and inactive employees
  // are never selectable for it.
  const isGrantEligible = (employee: RemoteEmployee) => unlinkedEmployees.some((candidate) => candidate.id === employee.id);

  const visibleEmployees = employees.filter((employee) => {
    if (employeeFilter === 'with') {
      return !!employee.userId;
    }
    if (employeeFilter === 'without') {
      return isGrantEligible(employee);
    }
    return true;
  });

  // Users-tab list search: matches name or email, case-insensitive.
  const visibleMembers = members.filter((member) => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return `${member.displayName ?? ''} ${member.email}`.toLowerCase().includes(query);
  });

  // Selection never outlives its own eligibility (Fase 3): an employee that
  // gets linked or deactivated out from under a pending selection drops out
  // automatically instead of silently staying selected.
  useEffect(() => {
    setSelectedEmployeeIds((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Set<string>();
      let changed = false;
      current.forEach((id) => {
        const employee = employees.find((candidate) => candidate.id === id);
        if (employee && isGrantEligible(employee)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
    // isGrantEligible is derived fresh from `employees` every render — depending on it
    // directly would just re-describe the same `employees` dependency already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  const toggleEmployeeSelected = (employeeId: string) => {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  const selectAllWithoutAccess = () => {
    setSelectedEmployeeIds(new Set(visibleEmployees.filter(isGrantEligible).map((employee) => employee.id)));
  };

  const clearEmployeeSelection = () => setSelectedEmployeeIds(new Set());

  const openBulkGrant = () => {
    const rows: BulkGrantRow[] = employees
      .filter((employee) => selectedEmployeeIds.has(employee.id))
      .map((employee) => ({ employeeId: employee.id, email: '', role: 'EMPLOYEE' as RemoteMember['role'] }));
    setBulkGrantRows(rows);
    setBulkGrantResults(null);
    setBulkGrantOpen(true);
  };

  const closeBulkGrant = () => {
    setBulkGrantOpen(false);
    setBulkGrantRows([]);
    setBulkGrantResults(null);
  };

  const updateBulkGrantRow = (employeeId: string, patch: Partial<BulkGrantRow>) => {
    setBulkGrantRows((current) => current.map((row) => (row.employeeId === employeeId ? { ...row, ...patch } : row)));
  };

  const removeBulkGrantRow = (employeeId: string) => {
    setBulkGrantRows((current) => current.filter((row) => row.employeeId !== employeeId));
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      next.delete(employeeId);
      return next;
    });
  };

  // ESC inside the bulk panel closes only the panel (ModalShell's own ESC is
  // suppressed via `suppressEscape` while this is open — see MembersModal's
  // ModalShell usage below).
  useEffect(() => {
    if (!bulkGrantOpen) {
      return;
    }
    const firstInput = bulkGrantPanelRef.current?.querySelector<HTMLElement>('input, select, button');
    firstInput?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBulkGrant();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [bulkGrantOpen]);

  const bulkGrantEmailSeen = (() => {
    const counts = new Map<string, number>();
    bulkGrantRows.forEach((row) => {
      const key = row.email.trim().toLowerCase();
      if (key) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    });
    return counts;
  })();

  const bulkGrantRowIssue = (row: BulkGrantRow): string | null => {
    const email = row.email.trim();
    if (!email) {
      return t('members.bulkGrantEmptyEmail');
    }
    if (!EMAIL_FORMAT_RE.test(email)) {
      return t('members.bulkGrantInvalidEmail');
    }
    if ((bulkGrantEmailSeen.get(email.toLowerCase()) ?? 0) > 1) {
      return t('members.bulkGrantDuplicateEmail');
    }
    return null;
  };

  /** Confirms the bulk grant panel by reusing the existing bulk provisioning
   * backend (POST /api/memberships/bulk via bulkAddRemoteMembers) — same
   * contract as the Users CSV import, no parallel endpoint. The server stays
   * the authority on every row; rows that fail stay in the panel (never
   * auto-closed) so the ADMIN can fix and resubmit just those. */
  const handleBulkGrantConfirm = async () => {
    if (bulkGrantRows.length === 0) {
      return;
    }
    captureScroll(employeesListRef.current);
    setBulkGrantSubmitting(true);
    try {
      const items = bulkGrantRows.map((row) => {
        const employee = employees.find((candidate) => candidate.id === row.employeeId);
        return {
          key: row.employeeId,
          email: row.email.trim(),
          name: employee?.name,
          role: row.role,
          externalEmployeeId: employee?.externalEmployeeId ?? undefined,
        };
      });
      const { results } = await bulkAddRemoteMembers(items);
      const resultsByEmployeeId: Record<string, BulkMemberResult> = {};
      results.forEach((result) => {
        resultsByEmployeeId[result.key] = result;
      });
      setBulkGrantResults((current) => ({ ...current, ...resultsByEmployeeId }));

      const succeededIds = new Set(results.filter((result) => result.status !== 'error').map((result) => result.key));
      setBulkGrantRows((current) => current.filter((row) => !succeededIds.has(row.employeeId)));
      setSelectedEmployeeIds((current) => {
        const next = new Set(current);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });

      await reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        setShowUpgrade(true);
      } else {
        setError(err instanceof Error ? err.message : t('members.actionFailed'));
      }
    } finally {
      setBulkGrantSubmitting(false);
    }
  };

  // Members eligible for linking: not linked to any active employee (the
  // server's USER_ALREADY_LINKED guard stays authoritative either way).
  const unlinkedMembers = members.filter(
    (member) => !employees.some((employee) => employee.status === 'active' && employee.userId === member.userId),
  );

  const employeeAreaOptions = [
    { value: '', label: t('areas.allCompany'), searchText: t('areas.allCompany').toLowerCase() },
    ...areas.map((area) => ({
      value: area.id,
      label: area.name,
      searchText: `${area.name} ${area.code ?? ''}`.toLowerCase(),
    })),
  ];
  const areaLabel = (areaId: string | null | undefined) =>
    areaId ? areas.find((area) => area.id === areaId)?.name ?? areaId : t('areas.allCompany');

  // ---------------------------------------------------------- Employees CSV

  const handleEmployeesFile = async (file: File) => {
    setEmployeesCsvError('');
    setEmployeesResult(null);
    const rows = parseEmployeesCsv(await file.text());
    if (!rows) {
      setEmployeesCsvError(t('members.csvParseError'));
      return;
    }
    const byExternalId = new Map(employees.map((employee) => [employee.externalEmployeeId ?? '', employee]));
    setEmployeesPreview(rows.map((row) => {
      if (!row.externalEmployeeId) {
        return { row, status: 'error', errorMessage: t('members.rowErrorMissingId') };
      }
      // Early area validation: an unknown area is a row error BEFORE
      // confirming — the server's unknown_area rejection stays authoritative.
      if (row.areaName && !findActiveArea(areas, row.areaName)) {
        return { row, status: 'error', errorMessage: t('members.rowErrorUnknownArea', { area: row.areaName }) };
      }
      const match = byExternalId.get(row.externalEmployeeId);
      return match ? { row, status: 'existing', matchedId: match.id } : { row, status: 'new' };
    }));
  };

  const handleEmployeesConfirm = async () => {
    if (!employeesPreview) {
      return;
    }
    setEmployeesImporting(true);
    let created = 0;
    let updated = 0;
    let failed = 0;
    let hitPlanLimit = false;

    for (const entry of employeesPreview) {
      if (entry.status === 'error') {
        failed += 1;
        continue;
      }
      try {
        if (entry.status === 'new') {
          if (hitPlanLimit) {
            failed += 1;
            continue;
          }
          await createRemoteEmployee({
            name: entry.row.name,
            externalEmployeeId: entry.row.externalEmployeeId,
            ...(entry.row.areaName ? { areaName: entry.row.areaName } : {}),
          });
          created += 1;
        } else {
          const current = employees.find((employee) => employee.id === entry.matchedId);
          if (current && current.name !== entry.row.name) {
            await updateRemoteEmployee({ id: current.id, name: entry.row.name, status: current.status });
            updated += 1;
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
          hitPlanLimit = true;
        }
        failed += 1;
      }
    }

    setEmployeesResult({ created, updated, failed });
    setEmployeesImporting(false);
    if (hitPlanLimit) {
      setShowUpgrade(true);
    }
    onChanged();
  };

  // -------------------------------------------------------------- Users CSV

  const handleUsersFile = async (file: File) => {
    setUsersCsvError('');
    setUsersResult(null);
    const rows = parseUsersCsv(await file.text());
    if (!rows) {
      setUsersCsvError(t('members.csvParseError'));
      return;
    }
    const seenEmails = new Set<string>();
    setUsersPreview(rows.map((row) => classifyUserRow(row, seenEmails, members, employees)));
  };

  /** Sends every parsed row in one bulk call — the backend is the single
   * source of truth for creation/linking; the local preview above is purely
   * informational. Never creates an Employee; row-level errors never abort
   * the rest of the file (see bulkAddMembers in api/_lib/data.js). */
  const handleUsersConfirm = async () => {
    if (!usersPreview) {
      return;
    }
    setUsersImporting(true);
    try {
      const items = usersPreview.map((entry, index) => ({
        key: String(index),
        email: entry.row.email,
        name: entry.row.name,
        role: (entry.row.role || 'EMPLOYEE') as RemoteMember['role'],
        externalEmployeeId: entry.row.externalEmployeeId,
      }));
      const { results, summary } = await bulkAddRemoteMembers(items);
      const created = results
        .filter((r) => r.temporaryPassword)
        .map((r) => ({ email: r.email ?? '', password: r.temporaryPassword ?? '' }));
      setUsersResult({ created, linked: summary.linked, failed: summary.failed, rows: results });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        setShowUpgrade(true);
      } else {
        setUsersCsvError(err instanceof Error ? err.message : t('members.actionFailed'));
      }
    } finally {
      setUsersImporting(false);
      onChanged();
      void reload();
    }
  };

  const statusLabelKey: Record<'existing' | 'new' | 'error', string> = {
    existing: 'members.previewStatusExisting',
    new: 'members.previewStatusNew',
    error: 'members.previewStatusError',
  };

  return (
    <>
    <ModalShell isOpen={isOpen} onClose={onClose} title={t('members.title')} maxWidth="min(1120px, 92vw)" workspace suppressEscape={bulkGrantOpen}>
      <div className="members-workspace">
      <div className="members-tabs">
        {(['users', 'employees'] as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={tab === option ? 'members-tab members-tab--active' : 'members-tab'}
          >
            {t(option === 'users' ? 'members.tabUsers' : 'members.tabEmployees')}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        (usersPreview || usersResult) ? (
          <div className="members-submode">
            {usersPreview && !usersResult && (
              <>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
                  {t('members.usersPreviewSummary', {
                    total: usersPreview.length,
                    existing: usersPreview.filter((entry) => entry.status === 'existing_and_link' || entry.status === 'already_linked' || entry.status === 'no_employee').length,
                    new: usersPreview.filter((entry) => entry.status === 'new_and_link').length,
                    errors: usersPreview.filter((entry) => !['new_and_link', 'existing_and_link', 'already_linked', 'no_employee'].includes(entry.status)).length,
                  })}
                </p>
                <div className="members-submode-scroll">
                  <div className="members-preview-cols members-preview-cols--head">
                    <span>{t('members.previewColumnEmail')}</span>
                    <span>{t('members.previewColumnName')}</span>
                    <span>{t('members.previewColumnRole')}</span>
                    <span>{t('members.previewColumnEmployee')}</span>
                    <span>{t('members.previewColumnArea')}</span>
                    <span>{t('members.previewColumnStatus')}</span>
                  </div>
                  {usersPreview.map((entry, index) => (
                    <div key={`${entry.row.email}-${index}`} className="members-preview-cols">
                      <span>{entry.row.email || '—'}</span>
                      <span>{entry.row.name || '—'}</span>
                      <span>{entry.row.role || '—'}</span>
                      <span>{entry.employee?.name ?? '—'}</span>
                      <span>{areaLabel(entry.employee?.areaId)}</span>
                      <span>{t(userPreviewStatusKey[entry.status])}</span>
                    </div>
                  ))}
                </div>
                <div className="members-submode-footer">
                  <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => { setUsersPreview(null); setUsersCsvError(''); }}>
                    {t('members.csvBack')}
                  </button>
                  <button type="button" className="btn-gold" disabled={usersImporting} style={{ padding: '8px 14px', fontWeight: 800 }} onClick={() => void handleUsersConfirm()}>
                    {usersImporting ? t('members.csvImporting') : t('members.csvConfirm')}
                  </button>
                </div>
              </>
            )}

            {usersResult && (
              <>
                <strong style={{ fontSize: '0.9rem', flexShrink: 0 }}>{t('members.usersResultTitle')}</strong>
                <p style={{ margin: 0, fontSize: '0.85rem', flexShrink: 0 }}>
                  {t('members.usersResultCreated')}: {usersResult.created.length} · {t('members.usersResultLinked')}: {usersResult.linked} · {t('members.usersResultFailed')}: {usersResult.failed}
                </p>
                <div className="members-submode-scroll">
                  {usersResult.failed > 0 && (
                    <div style={{ display: 'grid', gap: '4px', marginBottom: '10px' }}>
                      {usersResult.rows.filter((r) => r.status === 'error').map((r) => (
                        <div key={r.row} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.78rem', color: 'var(--danger)' }}>
                          <span>{r.email ?? `#${r.row}`}</span>
                          <span>{r.code ? t(bulkResultCodeKey[r.code] ?? 'members.actionFailed') : r.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {usersResult.created.length > 0 && (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>{t('members.temporaryPasswordNote')}</span>
                      {usersResult.created.map((entry) => (
                        <div key={entry.email} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                          <code>{entry.email}: {entry.password}</code>
                          <button type="button" className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => void copyToClipboard(entry.email, entry.password)}>
                            {copiedKey === entry.email ? t('members.copied') : t('members.copyAction')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="members-submode-footer">
                  <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => { setUsersResult(null); setUsersPreview(null); }}>
                    {t('members.csvClose')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="members-users-grid">
            <section className="members-users-list">
              <input
                className="modal-input"
                type="search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder={t('members.searchPlaceholder')}
                aria-label={t('members.searchPlaceholder')}
                style={{ flexShrink: 0 }}
              />
              <div ref={membersListRef} className="members-list-scroll" style={{ overflowY: 'auto' }}>
                {visibleMembers.map((member) => (
                  <div key={member.userId} className="members-member-row">
                    <span style={{ fontWeight: 700, flex: 1, minWidth: '140px' }}>
                      {member.displayName || member.email}
                      <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> · {member.email}</span>
                    </span>
                    <SearchableSelect
                      label=""
                      value={member.role}
                      onChange={(role) => void run(() => updateRemoteMemberRole(member.userId, role as RemoteMember['role']), membersListRef.current)}
                      searchPlaceholder={t('members.searchPlaceholder')}
                      emptyMessage={t('members.noRoles')}
                      ariaLabel={t('members.roleLabel')}
                      options={ROLES.map((role) => ({ value: role, label: t(`role.${role.toLowerCase()}`), searchText: role.toLowerCase() }))}
                      disabled={busy || member.userId === currentUserId}
                      style={{ width: 'auto', flex: '0 0 auto' }}
                    />
                    {member.userId !== currentUserId && (
                      <button
                        type="button"
                        className="btn-outline"
                        disabled={busy}
                        onClick={() => void run(() => removeRemoteMember(member.userId), membersListRef.current)}
                        style={{ padding: '6px 10px', fontWeight: 700, borderColor: 'var(--danger)', color: 'var(--danger)' }}
                      >
                        {t('members.remove')}
                      </button>
                    )}
                  </div>
                ))}
                {visibleMembers.length === 0 && (
                  <p style={{ margin: '8px 0', color: 'var(--text-subtle)', fontSize: '0.82rem' }}>{t('orgSelector.noResults')}</p>
                )}
              </div>
            </section>

            <aside className="members-users-panel">
              <div className="members-panel-head">
                <strong style={{ fontSize: '0.9rem' }}>{t('members.addTitle')}</strong>
                <button type="button" className="btn-outline" style={{ padding: '6px 12px', fontWeight: 700 }} onClick={() => usersFileRef.current?.click()}>
                  {t('members.importUsersCsv')}
                </button>
              </div>
              <input
                ref={usersFileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUsersFile(file);
                  }
                  event.target.value = '';
                }}
              />
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-subtle)', lineHeight: 1.4 }}>
                {t('members.csvUploadHint')} {t('members.csvUsersLinkHint')}
              </p>
              {usersCsvError && <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem' }}>{usersCsvError}</p>}

              {lastTemporaryPassword && (
                <div
                  role="status"
                  style={{
                    display: 'grid', gap: '6px', padding: '10px 12px',
                    borderRadius: '12px', border: '1px solid var(--color-gold)', background: 'var(--gold-tint-bg)',
                    fontSize: '0.82rem',
                  }}
                >
                  <strong>{t('members.temporaryPasswordTitle')}</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <code>{lastTemporaryPassword.email}: {lastTemporaryPassword.password}</code>
                    <button type="button" className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => void copyToClipboard('single', lastTemporaryPassword.password)}>
                      {copiedKey === 'single' ? t('members.copied') : t('members.copyAction')}
                    </button>
                  </div>
                  <span style={{ color: 'var(--text-subtle)' }}>{t('members.temporaryPasswordNote')}</span>
                </div>
              )}

              <form onSubmit={handleAdd} style={{ display: 'grid', gap: '8px' }}>
                {/* Every cell is its own label+control block (same shape as SearchableSelect's
                    internal label+trigger) so CSS Grid's default row stretch never inflates
                    the plain inputs to match the taller role/password neighbors. */}
                <div className="members-add-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'start' }}>
                  <label style={fieldLabelStyle}>
                    <span>{t('members.emailPlaceholder')}</span>
                    <input className="modal-input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('members.emailPlaceholder')} aria-label={t('auth.emailLabel')} />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>{t('members.namePlaceholder')}</span>
                    <input className="modal-input" type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t('members.namePlaceholder')} aria-label={t('auth.nameLabel')} />
                  </label>
                  <SearchableSelect
                    label={t('members.roleLabel')}
                    value={role}
                    onChange={(value: string) => setRole(value as RemoteMember['role'])}
                    searchPlaceholder={t('members.searchPlaceholder')}
                    emptyMessage={t('members.noRoles')}
                    ariaLabel={t('members.roleLabel')}
                    options={ROLES.map((role) => ({ value: role, label: t(`role.${role.toLowerCase()}`), searchText: role.toLowerCase() }))}
                  />
                  <label style={fieldLabelStyle}>
                    <span>{t('members.passwordShortLabel')}</span>
                    <PasswordInput
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t('members.passwordPlaceholder')}
                      aria-label={t('auth.passwordLabel')}
                      showLabel={t('auth.showPassword')}
                      hideLabel={t('auth.hidePassword')}
                    />
                  </label>
                </div>
                <SearchableSelect
                  label={t('members.linkEmployeeLabel')}
                  value={employeeId}
                  onChange={setEmployeeId}
                  searchPlaceholder={t('members.searchPlaceholder')}
                  emptyMessage={t('members.noUnlinkedEmployees')}
                  ariaLabel={t('members.linkEmployeeLabel')}
                  options={[
                    { value: '', label: t('members.noLink'), searchText: '' },
                    ...unlinkedEmployees.map((employee) => ({
                      value: employee.id,
                      label: employee.name,
                      searchText: employee.name.toLowerCase(),
                    })),
                  ]}
                />
                <p style={{ margin: 0, color: 'var(--text-subtle)', fontSize: '0.75rem', lineHeight: 1.4 }}>
                  {t('members.passwordHint')}
                </p>
                {error && <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
                <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '10px 14px', fontWeight: 800, justifySelf: 'end' }}>
                  {busy ? t('auth.working') : t('members.addAction')}
                </button>
              </form>
            </aside>
          </div>
        )
      )}

      {tab === 'employees' && (
        <div className="members-employees">
          {(employeesPreview || employeesResult) ? (
            <div className="members-submode">
              {employeesPreview && !employeesResult && (
                <>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
                    {t('members.employeesPreviewSummary', {
                      total: employeesPreview.length,
                      existing: employeesPreview.filter((entry) => entry.status === 'existing').length,
                      new: employeesPreview.filter((entry) => entry.status === 'new').length,
                      errors: employeesPreview.filter((entry) => entry.status === 'error').length,
                    })}
                  </p>
                  <div className="members-submode-scroll">
                    {employeesPreview.map((entry, index) => (
                      <div key={`${entry.row.externalEmployeeId}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border-soft)' }}>
                        <span>
                          {entry.row.name || '—'}
                          {entry.row.externalEmployeeId ? ` · ID ${entry.row.externalEmployeeId}` : ''}
                          {entry.row.areaName ? ` · ${entry.row.areaName}` : ''}
                        </span>
                        <span>{entry.errorMessage ?? t(statusLabelKey[entry.status])}</span>
                      </div>
                    ))}
                  </div>
                  <div className="members-submode-footer">
                    <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => { setEmployeesPreview(null); setEmployeesCsvError(''); }}>
                      {t('members.csvBack')}
                    </button>
                    <button type="button" className="btn-gold" disabled={employeesImporting} style={{ padding: '8px 14px', fontWeight: 800 }} onClick={() => void handleEmployeesConfirm()}>
                      {employeesImporting ? t('members.csvImporting') : t('members.csvConfirm')}
                    </button>
                  </div>
                </>
              )}

              {employeesResult && (
                <>
                  <strong style={{ fontSize: '0.9rem', flexShrink: 0 }}>{t('members.employeesResultTitle')}</strong>
                  <p style={{ margin: 0, fontSize: '0.85rem', flexShrink: 0 }}>
                    {t('members.employeesResultCreated')}: {employeesResult.created} · {t('members.employeesResultUpdated')}: {employeesResult.updated} · {t('members.employeesResultFailed')}: {employeesResult.failed}
                  </p>
                  <div className="members-submode-footer">
                    <button type="button" className="btn-outline" style={{ padding: '8px 14px', fontWeight: 700 }} onClick={() => { setEmployeesResult(null); setEmployeesPreview(null); }}>
                      {t('members.csvClose')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="members-toolbar">
                {(['all', 'without', 'with'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={employeeFilter === option ? 'btn-gold' : 'btn-outline'}
                    onClick={() => setEmployeeFilter(option)}
                    style={{ padding: '5px 9px', fontSize: '0.77rem', fontWeight: 700 }}
                    aria-pressed={employeeFilter === option}
                  >
                    {t(option === 'all' ? 'members.filterAll' : option === 'without' ? 'members.filterWithoutAccess' : 'members.filterWithAccess')}
                  </button>
                ))}
                <span className="members-toolbar__divider" />
                <button
                  type="button"
                  className="btn-outline"
                  disabled={visibleEmployees.filter(isGrantEligible).length === 0}
                  onClick={selectAllWithoutAccess}
                  style={{ padding: '5px 9px', fontSize: '0.77rem', fontWeight: 700 }}
                >
                  {t('members.selectAllWithoutAccess')}
                </button>
                {selectedEmployeeIds.size > 0 && (
                  <button type="button" className="btn-outline" onClick={clearEmployeeSelection} style={{ padding: '5px 9px', fontSize: '0.77rem', fontWeight: 700 }}>
                    {t('members.clearSelection')}
                  </button>
                )}
                <span role="status" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>
                  {t('members.selectedCount', { count: selectedEmployeeIds.size })}
                </span>
                <div className="members-toolbar__actions">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setAddEmployeeOpen((current) => !current)}
                    aria-expanded={addEmployeeOpen}
                    style={{ padding: '5px 9px', fontSize: '0.77rem', fontWeight: 700 }}
                  >
                    {t('members.addEmployeeTitle')}
                  </button>
                  <button type="button" className="btn-outline" style={{ padding: '5px 9px', fontSize: '0.77rem', fontWeight: 700 }} title={`${t('members.csvUploadHint')} ${t('members.csvEmployeesNoAccessHint')}`} onClick={() => employeesFileRef.current?.click()}>
                    {t('members.importEmployeesCsv')}
                  </button>
                  <button
                    type="button"
                    className="btn-gold"
                    disabled={selectedEmployeeIds.size === 0 || busy}
                    onClick={openBulkGrant}
                    style={{ padding: '8px 14px', fontWeight: 800 }}
                  >
                    {t('members.grantAccessAction')}
                  </button>
                </div>
              </div>
              <input
                ref={employeesFileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleEmployeesFile(file);
                  }
                  event.target.value = '';
                }}
              />
              {employeesCsvError && <p role="alert" style={{ margin: '0 0 8px', color: 'var(--danger)', fontSize: '0.85rem', flexShrink: 0 }}>{employeesCsvError}</p>}

              {addEmployeeOpen && (
                <form onSubmit={handleAddEmployee} className="members-add-employee">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', flex: 1, minWidth: '160px' }}>
                    {t('members.addEmployeeTitle')}
                    <input className="modal-input" type="text" required value={newEmployeeName} onChange={(event) => setNewEmployeeName(event.target.value)} placeholder={t('members.employeeNamePlaceholder')} style={{ padding: '10px 12px' }} />
                  </label>
                  <input className="modal-input" type="text" value={newEmployeeExternalId} onChange={(event) => setNewEmployeeExternalId(event.target.value)} placeholder={t('members.employeeIdPlaceholder')} aria-label={t('members.employeeIdPlaceholder')} style={{ padding: '10px 12px', width: '160px' }} />
                  {areas.length > 0 && (
                    <SearchableSelect
                      label={t('areas.contextLabel')}
                      value={newEmployeeAreaId}
                      onChange={setNewEmployeeAreaId}
                      searchPlaceholder={t('members.searchPlaceholder')}
                      emptyMessage={t('orgSelector.noResults')}
                      ariaLabel={t('members.employeeAreaLabel')}
                      options={employeeAreaOptions}
                      style={{ minWidth: '180px' }}
                    />
                  )}
                  <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '10px 14px', fontWeight: 800 }}>
                    {busy ? t('auth.working') : t('members.addEmployeeAction')}
                  </button>
                </form>
              )}

              {error && <p role="alert" style={{ margin: '0 0 8px', color: 'var(--danger)', fontSize: '0.85rem', flexShrink: 0 }}>{error}</p>}

              <div ref={employeesListRef} className="members-list-scroll" style={{ overflowY: 'auto' }}>
                <div className={areas.length > 0 ? 'members-emp-row members-emp-row--head' : 'members-emp-row members-emp-row--head members-emp-row--no-areas'}>
                  <span />
                  <span>{t('members.previewColumnEmployee')}</span>
                  <span>{t('members.bulkGrantColumnExternalId')}</span>
                  {areas.length > 0 && <span>{t('members.previewColumnArea')}</span>}
                  <span>{t('members.previewColumnStatus')}</span>
                  <span />
                </div>
                {visibleEmployees.map((employee) => {
                  const linkedEmail = employee.userId ? members.find((member) => member.userId === employee.userId)?.email : undefined;
                  return (
                  <div
                    key={employee.id}
                    className={`members-emp-row${selectedEmployeeIds.has(employee.id) ? ' members-emp-row--selected' : ''}${areas.length === 0 ? ' members-emp-row--no-areas' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.has(employee.id)}
                      disabled={!isGrantEligible(employee)}
                      onChange={() => toggleEmployeeSelected(employee.id)}
                      aria-label={t('members.selectEmployeeAria', { name: employee.name })}
                      style={{ width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    {linkingEmployeeId === employee.id ? (
                      <div className="members-emp-row__full">
                        <SearchableSelect
                          label={t('members.linkUserLabel')}
                          value={linkingUserId}
                          onChange={setLinkingUserId}
                          searchPlaceholder={t('members.searchPlaceholder')}
                          emptyMessage={t('members.noUnlinkedUsers')}
                          ariaLabel={t('members.linkUserLabel')}
                          options={unlinkedMembers.map((member) => ({
                            value: member.userId,
                            label: member.displayName || member.email,
                            searchText: `${member.displayName} ${member.email}`.toLowerCase(),
                          }))}
                          style={{ flex: 1, minWidth: '200px' }}
                        />
                        <button
                          type="button"
                          className="btn-gold"
                          disabled={busy || !linkingUserId}
                          onClick={() => handleLinkEmployeeSave(employee)}
                          style={{ padding: '6px 10px', fontWeight: 800 }}
                        >
                          {t('members.linkUserConfirm')}
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          disabled={busy}
                          onClick={() => setLinkingEmployeeId(null)}
                          style={{ padding: '6px 10px', fontWeight: 700 }}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : editingEmployeeId === employee.id ? (
                      <form onSubmit={(event) => handleEditEmployeeSave(employee, event)} className="members-emp-row__full">
                        <input
                          className="modal-input"
                          type="text"
                          required
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          placeholder={t('members.employeeNamePlaceholder')}
                          aria-label={t('members.employeeNamePlaceholder')}
                          style={{ padding: '6px 10px', flex: 1, minWidth: '140px' }}
                        />
                        <input
                          className="modal-input"
                          type="text"
                          value={editExternalId}
                          onChange={(event) => setEditExternalId(event.target.value)}
                          placeholder={t('members.employeeIdPlaceholder')}
                          aria-label={t('members.employeeIdPlaceholder')}
                          style={{ padding: '6px 10px', width: '140px' }}
                        />
                        {areas.length > 0 && (
                          <SearchableSelect
                            label={t('areas.contextLabel')}
                            value={editAreaId}
                            onChange={setEditAreaId}
                            searchPlaceholder={t('members.searchPlaceholder')}
                            emptyMessage={t('orgSelector.noResults')}
                            ariaLabel={t('members.employeeAreaLabel')}
                            options={employeeAreaOptions}
                            style={{ width: '180px' }}
                          />
                        )}
                        <button type="submit" className="btn-gold" disabled={busy} style={{ padding: '6px 10px', fontWeight: 800 }}>
                          {t('common.save')}
                        </button>
                        <button type="button" className="btn-outline" disabled={busy} onClick={() => setEditingEmployeeId(null)} style={{ padding: '6px 10px', fontWeight: 700 }}>
                          {t('common.cancel')}
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="members-emp-name" title={linkedEmail}>
                          {employee.name}
                          {linkedEmail && <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> · {linkedEmail}</span>}
                        </span>
                        <span className="members-emp-cell">{employee.externalEmployeeId ?? '—'}</span>
                        {areas.length > 0 && (
                          <span className="members-emp-cell">{areaLabel(employee.areaId)}</span>
                        )}
                        {/* Three states only (Fase 10): Activo con acceso / Sin acceso a la app / Inactivo.
                            "Sin acceso" never implies the Employee itself is missing anything — the
                            title makes explicit that the record exists, only the User link doesn't. */}
                        <span className="members-emp-cell members-emp-cell--status" style={{ color: 'inherit', fontSize: 'inherit' }}>
                          <span
                            className={`status-badge ${employee.status === 'inactive' ? 'status-badge--inactive' : employee.userId ? 'status-badge--active' : 'status-badge--pending'}`}
                            title={employee.status !== 'inactive' && !employee.userId ? t('members.pendingAccess') : undefined}
                          >
                            {t(employee.status === 'inactive' ? 'members.statusInactive' : employee.userId ? 'members.statusActive' : 'members.statusPendingAccess')}
                          </span>
                        </span>
                        <div className="employee-menu" data-employee-menu>
                          <button
                            type="button"
                            className="btn-outline"
                            disabled={busy}
                            aria-label={t('members.rowMenuAria', { name: employee.name })}
                            aria-expanded={openMenuId === employee.id}
                            onClick={() => setOpenMenuId((current) => (current === employee.id ? null : employee.id))}
                            style={{ padding: '4px 10px', fontWeight: 700 }}
                          >
                            ⋮
                          </button>
                          {openMenuId === employee.id && (
                            <div className="employee-menu-list" role="menu">
                              <button type="button" role="menuitem" className="employee-menu-item" onClick={() => startEditEmployee(employee)}>
                                {t('common.edit')}
                              </button>
                              {!employee.userId && (
                                <button type="button" role="menuitem" className="employee-menu-item" onClick={() => startLinkEmployee(employee)}>
                                  {t('members.linkExistingUser')}
                                </button>
                              )}
                              {employee.status === 'active' ? (
                                <button type="button" role="menuitem" className="employee-menu-item" onClick={() => handleDeactivateEmployee(employee)}>
                                  {t('members.deactivateAction')}
                                </button>
                              ) : (
                                <button type="button" role="menuitem" className="employee-menu-item" onClick={() => handleReactivateEmployee(employee)}>
                                  {t('members.reactivateAction')}
                                </button>
                              )}
                              <button type="button" role="menuitem" className="employee-menu-item employee-menu-item--danger" onClick={() => void handleDeleteEmployee(employee)}>
                                {t('members.deleteAction')}
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            </>
          )}

          {bulkGrantOpen && (
            <div
              ref={bulkGrantPanelRef}
              role="region"
              aria-label={t('members.bulkGrantPanelAria')}
              className="members-bulk-submode"
            >
              <div className="members-bulk-head">
                <button type="button" className="btn-outline" onClick={closeBulkGrant} style={{ padding: '6px 12px', fontWeight: 700 }}>
                  ← {t('members.backToEmployees')}
                </button>
                <strong style={{ fontSize: '0.95rem' }}>{t('members.bulkGrantTitle')}</strong>
                <span role="status" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)', marginLeft: 'auto' }}>
                  {t('members.selectedCount', { count: bulkGrantRows.length })}
                </span>
              </div>
              <div className="members-list-scroll" style={{ overflowY: 'auto' }}>
                <div className="members-bulk-cols members-bulk-cols--head">
                  <span>{t('members.previewColumnEmployee')}</span>
                  <span>{t('members.bulkGrantColumnExternalId')}</span>
                  <span>{t('members.previewColumnArea')}</span>
                  <span>{t('members.previewColumnEmail')}</span>
                  <span>{t('members.previewColumnRole')}</span>
                  <span>{t('members.previewColumnStatus')}</span>
                  <span />
                </div>
                {bulkGrantRows.map((row) => {
                  const employee = employees.find((candidate) => candidate.id === row.employeeId);
                  const result = bulkGrantResults?.[row.employeeId];
                  const issue = bulkGrantRowIssue(row);
                  return (
                    <div key={row.employeeId} className="members-bulk-cols">
                      <span className="members-bulk-name">{employee?.name ?? '—'}</span>
                      <span style={{ color: 'var(--text-subtle)' }}>{employee?.externalEmployeeId ?? '—'}</span>
                      <span style={{ color: 'var(--text-subtle)' }}>{areaLabel(employee?.areaId)}</span>
                      <input
                        className="modal-input"
                        type="email"
                        value={row.email}
                        onChange={(event) => updateBulkGrantRow(row.employeeId, { email: event.target.value })}
                        placeholder={t('members.emailPlaceholder')}
                        aria-label={t('members.bulkGrantEmailAria', { name: employee?.name ?? '' })}
                        style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                      />
                      <select
                        className="modal-input"
                        value={row.role}
                        onChange={(event) => updateBulkGrantRow(row.employeeId, { role: event.target.value as RemoteMember['role'] })}
                        aria-label={t('members.bulkGrantRoleAria', { name: employee?.name ?? '' })}
                        style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                      >
                        {ROLES.map((roleOption) => (
                          <option key={roleOption} value={roleOption}>{t(`role.${roleOption.toLowerCase()}`)}</option>
                        ))}
                      </select>
                      <span style={{ color: result ? (result.status === 'error' ? 'var(--danger)' : 'var(--color-gold)') : issue ? 'var(--danger)' : 'var(--text-subtle)' }}>
                        {result
                          ? (result.status === 'error' ? t(bulkResultCodeKey[result.code ?? ''] ?? 'members.actionFailed') : t(bulkStatusLabelKey[result.status]))
                          : (issue ?? '—')}
                      </span>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => removeBulkGrantRow(row.employeeId)}
                        aria-label={t('members.bulkGrantRemoveRowAria', { name: employee?.name ?? '' })}
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      >
                        {t('members.remove')}
                      </button>
                    </div>
                  );
                })}
              </div>
              {bulkGrantRows.length === 0 && (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-subtle)', flexShrink: 0 }}>{t('members.bulkGrantAllDone')}</p>
              )}
              <div className="members-bulk-footer">
                <button type="button" className="btn-outline" disabled={bulkGrantSubmitting} onClick={closeBulkGrant} style={{ padding: '8px 14px', fontWeight: 700 }}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn-gold"
                  disabled={bulkGrantSubmitting || bulkGrantRows.length === 0}
                  onClick={() => void handleBulkGrantConfirm()}
                  style={{ padding: '8px 14px', fontWeight: 800 }}
                >
                  {bulkGrantSubmitting ? t('members.bulkGrantSubmitting') : t('members.bulkGrantConfirmAction')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </ModalShell>
    <UpgradePrompt
      isOpen={showUpgrade}
      onClose={() => setShowUpgrade(false)}
      currentPlan={currentPlan}
      switchTarget={switchTarget}
      onSwitchOrg={onSwitchOrg}
    />
    </>
  );
};

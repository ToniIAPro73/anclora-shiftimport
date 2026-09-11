# RBAC & Scope Authorization Matrix — P5.7

**Canonical Authority**: `docs/product/RBAC_SCOPE_MATRIX.md`  
**Underlying Architecture**: `docs/product/TEMPORAL_ORGANIZATIONAL_MODEL.md` (Phase 1 Temporal Model Foundation)  
**Status**: APPROVED / CONTRACTUAL  
**Date**: 2026-09-07 (Updated 2026-09-12)  
**Scope**: Anclora ShiftImport P5.7 — Team, Roles, Scopes & Organizational Management

---

## 1. Core Principles & Definitions

1. **Authorization Tuple**: Authorization decisions MUST evaluate `can(actor, action, target)` where:
   - `actor`: `{ userId, role, scopedAreaIds, scopedEmployeeIds, employeeId, organizationId }`
   - `action`: Canonical domain action verb
   - `target`: Target entity `{ type, organizationId, areaId?, employeeId?, userId?, ... }`
2. **User vs Employee**:
   - `USER`: Authentication identity (can log in).
   - `EMPLOYEE`: Operational identity (receives shifts, appears on rotas).
   - Associated employee does NOT degrade `OWNER`, `ADMIN`, or `PLANNER` role authority.
3. **No Self-Approval**:
   - An actor acting as an `EMPLOYEE` who submits an operational request (e.g. shift change request) CANNOT approve or reject their own request, regardless of whether their user role is `OWNER`, `ADMIN`, or `PLANNER`.
4. **Scope Hierarchy**:
   - `ORGANIZATION`: Unrestricted across the entire organization.
   - `AREAS`: Restricted to one or more explicitly assigned active areas (`scopedAreaIds`).
   - `EMPLOYEES`: Restricted to an explicit list of assigned employees (`scopedEmployeeIds`).
   - `SELF`: Restricted strictly to the actor's linked `employeeId`.

---

## 2. Canonical Authorization Matrix

| ROLE | ACTION | SCOPE | TARGET | ALLOW / DENY | NOTES |
|---|---|---|---|:---:|---|
| **OWNER** | `VIEW_TEAM` | `ORGANIZATION` | Organization | **ALLOW** | Full visibility over all people, users, employees, areas, and assignments. |
| **OWNER** | `MANAGE_USERS` | `ORGANIZATION` | User in Org | **ALLOW** | Create, invite, revoke, or edit users. |
| **OWNER** | `CREATE_ADMIN` | `ORGANIZATION` | User in Org | **ALLOW** | Promote or assign ADMIN role. |
| **OWNER** | `CREATE_PLANNER` | `ORGANIZATION` | User in Org | **ALLOW** | Promote or assign PLANNER role with defined scope. |
| **OWNER** | `CREATE_EMPLOYEE` | `ORGANIZATION` | Org Employee | **ALLOW** | Direct employee provisioning or linking. |
| **OWNER** | `MANAGE_AREA` | `ORGANIZATION` | Area in Org | **ALLOW** | Create, edit, activate/deactivate operational areas. |
| **OWNER** | `ASSIGN_EMPLOYEE` | `ORGANIZATION` | Employee & Area | **ALLOW** | Assign or reassign employee to area with effective dating. |
| **OWNER** | `ASSIGN_PLANNER` | `ORGANIZATION` | Planner & Scope | **ALLOW** | Assign planner to Org, Area(s), or explicit Employee set. |
| **OWNER** | `PLAN` | `ORGANIZATION` | Org Schedules | **ALLOW** | Draft and modify schedules organization-wide. |
| **OWNER** | `PUBLISH` | `ORGANIZATION` | Org Schedules | **ALLOW** | Publish official schedules organization-wide. |
| **OWNER** | `IMPORT_SELF` | `ORGANIZATION` | Own Shifts | **ALLOW** | When Owner is also linked to an Employee. |
| **OWNER** | `IMPORT_TEAM` | `ORGANIZATION` | Org Shifts/Rotas | **ALLOW** | Full roster import across organization or any area. |
| **OWNER** | `VIEW_SELF_SHIFT` | `ORGANIZATION` | Own Shifts | **ALLOW** | When Owner is linked to an Employee. |
| **OWNER** | `EDIT_SHIFT` | `ORGANIZATION` | Any Org Shift | **ALLOW** | Direct operational shift editing across org. |
| **OWNER** | `CREATE_REQUEST` | `SELF` | Own Shift | **ALLOW** | If Owner has linked Employee and submits as employee. |
| **OWNER** | `VIEW_REQUEST` | `ORGANIZATION` | Any Org Request | **ALLOW** | View all pending, approved, and rejected requests. |
| **OWNER** | `APPROVE_REQUEST` | `ORGANIZATION` | Org Request | **ALLOW** | Cannot self-approve own request (Actor.userId != Target.requesterUserId). |
| **OWNER** | `REJECT_REQUEST` | `ORGANIZATION` | Org Request | **ALLOW** | Cannot self-reject own request. |
| **OWNER** | `TRANSFER_OWNERSHIP` | `ORGANIZATION` | Admin User | **ALLOW** | Sole Owner can initiate atomic transfer to an active member. |
|---|---|---|---|:---:|---|
| **ADMIN** | `VIEW_TEAM` | `ORGANIZATION` | Organization | **ALLOW** | Full visibility over people, users, employees, areas. |
| **ADMIN** | `MANAGE_USERS` | `ORGANIZATION` | User in Org | **ALLOW** | Can manage users except Owner. Cannot remove/demote Owner. |
| **ADMIN** | `CREATE_ADMIN` | `ORGANIZATION` | User in Org | **ALLOW** | Allowed by current organization policy. |
| **ADMIN** | `CREATE_PLANNER` | `ORGANIZATION` | User in Org | **ALLOW** | Can provision planners and configure scopes. |
| **ADMIN** | `CREATE_EMPLOYEE` | `ORGANIZATION` | Org Employee | **ALLOW** | Full operational employee management. |
| **ADMIN** | `MANAGE_AREA` | `ORGANIZATION` | Area in Org | **ALLOW** | Create, edit, activate/deactivate operational areas. |
| **ADMIN** | `ASSIGN_EMPLOYEE` | `ORGANIZATION` | Employee & Area | **ALLOW** | Assign or reassign employee to area with effective dating. |
| **ADMIN** | `ASSIGN_PLANNER` | `ORGANIZATION` | Planner & Scope | **ALLOW** | Assign planner to Org, Area(s), or explicit Employee set. |
| **ADMIN** | `PLAN` | `ORGANIZATION` | Org Schedules | **ALLOW** | Draft and modify schedules organization-wide. |
| **ADMIN** | `PUBLISH` | `ORGANIZATION` | Org Schedules | **ALLOW** | Publish official schedules organization-wide. |
| **ADMIN** | `IMPORT_SELF` | `ORGANIZATION` | Own Shifts | **ALLOW** | When Admin is linked to an Employee. |
| **ADMIN** | `IMPORT_TEAM` | `ORGANIZATION` | Org Shifts/Rotas | **ALLOW** | Full roster import across organization or any area. |
| **ADMIN** | `VIEW_SELF_SHIFT` | `ORGANIZATION` | Own Shifts | **ALLOW** | When Admin is linked to an Employee. |
| **ADMIN** | `EDIT_SHIFT` | `ORGANIZATION` | Any Org Shift | **ALLOW** | Direct operational shift editing across org. |
| **ADMIN** | `CREATE_REQUEST` | `SELF` | Own Shift | **ALLOW** | If Admin has linked Employee and submits as employee. |
| **ADMIN** | `VIEW_REQUEST` | `ORGANIZATION` | Any Org Request | **ALLOW** | View all requests in the organization. |
| **ADMIN** | `APPROVE_REQUEST` | `ORGANIZATION` | Org Request | **ALLOW** | Cannot self-approve own request (Actor.userId != Target.requesterUserId). |
| **ADMIN** | `REJECT_REQUEST` | `ORGANIZATION` | Org Request | **ALLOW** | Cannot self-reject own request. |
| **ADMIN** | `TRANSFER_OWNERSHIP` | `ORGANIZATION` | Any Target | **DENY** | 403 Forbidden. Only the active OWNER can transfer ownership. |
|---|---|---|---|:---:|---|
| **PLANNER** | `VIEW_TEAM` | `SCOPE` | Team in Scope | **ALLOW** | Read-only access to employees/areas within assigned scope. |
| **PLANNER** | `MANAGE_USERS` | `ORGANIZATION` | User in Org | **DENY** | 403 Forbidden. Planners cannot manage users or logins. |
| **PLANNER** | `CREATE_ADMIN` | `ORGANIZATION` | User in Org | **DENY** | 403 Forbidden. |
| **PLANNER** | `CREATE_PLANNER` | `ORGANIZATION` | User in Org | **DENY** | 403 Forbidden. |
| **PLANNER** | `CREATE_EMPLOYEE` | `ORGANIZATION` | Employee | **DENY** | 403 Forbidden by default. |
| **PLANNER** | `MANAGE_AREA` | `ORGANIZATION` | Area in Org | **DENY** | 403 Forbidden. Planners cannot create or deactivate areas. |
| **PLANNER** | `ASSIGN_EMPLOYEE` | `ORGANIZATION` | Employee & Area | **DENY** | 403 Forbidden. Org-level area structure is managed by Admin/Owner. |
| **PLANNER** | `ASSIGN_PLANNER` | `ORGANIZATION` | Planner & Scope | **DENY** | 403 Forbidden. |
| **PLANNER** | `PLAN` | `SCOPE` | Scoped Schedules | **ALLOW** | Plan and schedule shifts for employees in their scope. |
| **PLANNER** | `PUBLISH` | `SCOPE` | Scoped Schedules | **ALLOW** | Allowed if current schedule contract permits planner publish. |
| **PLANNER** | `IMPORT_SELF` | `SELF` | Own Shifts | **ALLOW** | If Planner is linked to an Employee. |
| **PLANNER** | `IMPORT_TEAM` | `SCOPE` | Scoped Shifts | **ALLOW** | Allowed for files/rosters within their assigned scope. |
| **PLANNER** | `VIEW_SELF_SHIFT` | `SELF` | Own Shifts | **ALLOW** | If Planner is linked to an Employee. |
| **PLANNER** | `EDIT_SHIFT` | `SCOPE` | Scoped Shift | **ALLOW** | Operational shift edit strictly for employees in scope. |
| **PLANNER** | `CREATE_REQUEST` | `SELF` | Own Shift | **ALLOW** | If Planner has linked Employee and submits as employee. |
| **PLANNER** | `VIEW_REQUEST` | `SCOPE` | Scoped Request | **ALLOW** | Requests where target employee is in planner's scope. |
| **PLANNER** | `APPROVE_REQUEST` | `SCOPE` | Scoped Request | **ALLOW** | If policy permits planner approval and target in scope. No self-approval. |
| **PLANNER** | `REJECT_REQUEST` | `SCOPE` | Scoped Request | **ALLOW** | If policy permits planner approval and target in scope. No self-rejection. |
| **PLANNER** | `TRANSFER_OWNERSHIP` | `ORGANIZATION` | Any Target | **DENY** | 403 Forbidden. |
|---|---|---|---|:---:|---|
| **EMPLOYEE**| `VIEW_TEAM` | `ORGANIZATION` | Organization | **DENY** | 403 Forbidden. Employee portal does not expose Team management. |
| **EMPLOYEE**| `MANAGE_USERS` | `ORGANIZATION` | Any User | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `CREATE_ADMIN` | `ORGANIZATION` | Any User | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `CREATE_PLANNER` | `ORGANIZATION` | Any User | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `CREATE_EMPLOYEE` | `ORGANIZATION` | Any Employee | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `MANAGE_AREA` | `ORGANIZATION` | Any Area | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `ASSIGN_EMPLOYEE` | `ORGANIZATION` | Any Assignment | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `ASSIGN_PLANNER` | `ORGANIZATION` | Any Assignment | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `PLAN` | `ORGANIZATION` | Any Schedule | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `PUBLISH` | `ORGANIZATION` | Any Schedule | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `IMPORT_SELF` | `SELF` | Own Shifts | **ALLOW** | Historical/personal quadrant import to own calendar per contract. |
| **EMPLOYEE**| `IMPORT_TEAM` | `ORGANIZATION` | Org Shifts | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `VIEW_SELF_SHIFT` | `SELF` | Own Shifts | **ALLOW** | Full view of own scheduled, confirmed, and historical shifts. |
| **EMPLOYEE**| `EDIT_SHIFT` | `SELF` | Official Shift | **DENY** | 403 Forbidden. Cannot directly edit existing official shifts. Must submit Request. |
| **EMPLOYEE**| `CREATE_REQUEST` | `SELF` | Own Shift | **ALLOW** | Submit change request, comment, or acknowledgement on own shift. |
| **EMPLOYEE**| `VIEW_REQUEST` | `SELF` | Own Requests | **ALLOW** | View status and details of requests submitted by self. |
| **EMPLOYEE**| `APPROVE_REQUEST` | `ORGANIZATION` | Any Request | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `REJECT_REQUEST` | `ORGANIZATION` | Any Request | **DENY** | 403 Forbidden. |
| **EMPLOYEE**| `TRANSFER_OWNERSHIP` | `ORGANIZATION` | Any Target | **DENY** | 403 Forbidden. |

---

## 3. Scope Resolution Rules

1. **`OWNER`**:
   - Resolved Scope: `{ type: 'ORGANIZATION' }`.
   - Target matching: Matches all entities within `organizationId`.
2. **`ADMIN`**:
   - Resolved Scope: `{ type: 'ORGANIZATION' }`.
   - Target matching: Matches all entities within `organizationId`.
3. **`PLANNER`**:
   - Planner can be assigned one of three scope modes:
     1. **`ORGANIZATION`**: Unrestricted planning across the organization.
     2. **`AREAS`**: Set of assigned area IDs (`scopedAreaIds`). Target matches if target's active `areaId` is in `scopedAreaIds`.
     3. **`EMPLOYEES`**: Explicit set of employee IDs (`scopedEmployeeIds`). Target matches if target's `employeeId` is in `scopedEmployeeIds`.
   - Fallback invariant: If an organization has NO active areas, a Planner without explicit area or employee scope defaults to `ORGANIZATION`. If an organization HAS active areas and Planner has neither areas nor employees assigned, scope is `SCOPE_UNAVAILABLE` (fail-closed).
4. **`EMPLOYEE`**:
   - Resolved Scope: `{ type: 'SELF', employeeId: membership.employeeId }`.
   - Target matching: Matches ONLY where `target.employeeId === membership.employeeId`.

---

## 5. Anti-Self-Approval Contract

```text
canApproveRequest(actor, request):
  if actor.role not in ['OWNER', 'ADMIN', 'PLANNER']:
    return false
  if request.requesterUserId === actor.userId:
    return false // BLOCKED: Manager cannot self-approve own request
  if actor.role in ['OWNER', 'ADMIN']:
    return true
  if actor.role === 'PLANNER':
    return isEmployeeInPlannerScope(actor, request.targetEmployeeId)
  return false
```

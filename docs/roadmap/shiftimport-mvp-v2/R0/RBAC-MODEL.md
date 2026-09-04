# RBAC Model — Design for R2-M06/M07/M08

Status: **ROLES + SCOPES IMPLEMENTED (R2-M06/R2-M07)**. API enforcement remains centralized in `api/_lib/auth.js` and `api/_lib/data.js`; broader endpoint authorization hardening remains R2-M08.

Vocabulary follows [`DOMAIN-GLOSSARY.md`](./DOMAIN-GLOSSARY.md): Membership, Role, Scope, Organization, Area, Employee. No new terms introduced here.

## 1. Current state (baseline)

- `memberships.role CHECK IN ('OWNER','ADMIN','PLANNER','EMPLOYEE')` — migration 0013 (which extends the 0007 constraint).
- `api/_lib/data.js`: `VALID_ROLES` includes the four MVP roles.
- `api/_lib/auth.js`: `requireRole(ctx, minimum)` uses rank `{ EMPLOYEE: 1, PLANNER: 2, ADMIN: 3, OWNER: 4 }`; `resolveAccessScope` returns `ORGANIZATION`, `AREA`, or `SELF`.
- Migration 0015 adds nullable `memberships.scoped_area_id`; `PLANNER + NULL` resolves to `ORGANIZATION`, `PLANNER + area` to `AREA`, and `EMPLOYEE` resolves to `SELF` through its linked employee.
- Employee/import/shift reads and writes consume the centralized scope contract; broader authorization/event auditing remains in R2-M08/R2-M09.

## 2. Target model: 4 roles × 3 scopes

### Roles

| Role | Semantics |
|---|---|
| `OWNER` | Full control of the organization, including destructive/irreversible actions (e.g. deleting the organization, transferring ownership). Exactly the actions `ADMIN` cannot do. |
| `ADMIN` | Full operational management (members, employees, areas, imports, format profiles) except the OWNER-reserved actions above. |
| `PLANNER` | Manages shifts/imports/scheduling within their assigned scope. Cannot manage users, organization settings, or roles. |
| `EMPLOYEE` | `SELF` scope only — their own employee record, their own shifts, their own change requests. |

### Scopes

| Scope | Meaning |
|---|---|
| `ORGANIZATION` | Access to all data across the organization, unrestricted by area. |
| `AREA` | Access restricted to one specific assigned area (`memberships.scoped_area_id`). |
| `SELF` | Access restricted to the membership's own linked Employee record. |

### Role × Scope matrix (actions)

| Role | Default scope | Can do |
|---|---|---|
| `OWNER` | `ORGANIZATION` (fixed, cannot be narrowed) | Everything `ADMIN` can, plus: delete/transfer organization, manage other OWNER/ADMIN memberships including the last-admin-style protections that today apply to `ADMIN` (see `countOrgAdmins` below) |
| `ADMIN` | `ORGANIZATION` (fixed, cannot be narrowed) | Manage members/roles (except demoting/removing the sole OWNER), manage employees, areas, imports, format profiles, view all organization data |
| `PLANNER` | `ORGANIZATION` or `AREA` (configurable per membership) | Create/review/compare/confirm imports, manage shifts and (R3) schedule drafts/publication within their scope; cannot manage users, roles, or organization settings |
| `EMPLOYEE` | `SELF` (fixed, cannot be widened) | View/acknowledge (R4) their own shifts, submit change requests (R4/R5) against their own shifts; no access to other employees' data |

Explicitly out of scope for MVP (per master prompt §13): `TEAM` scope, `WORK_CENTER` scope, custom capability editor, additional arbitrary roles, delegation chains.

## 3. OWNER backfill rule

**Rule**: for each organization, the `ADMIN` membership with the earliest `created_at` becomes `OWNER`. All other existing `ADMIN` memberships remain `ADMIN`. `EMPLOYEE` memberships are untouched.

**Rationale**: approximates "who created/founded the organization" without needing a `founder` field that doesn't exist today. Deterministic, auditable (before/after snapshot possible via `created_at` ordering), and reversible if wrong (it's a single `UPDATE`, not a structural change).

**Edge case — organization with no `ADMIN` membership**: does not happen today per the current invariant (every organization must have at least one ADMIN — enforced by `countOrgAdmins` guards at `api/_lib/data.js:461`, `:1008`, and the demotion guard at `:978`), but if found during R2-M06 execution, that organization is flagged for manual review rather than silently skipped or auto-assigned.

**✅ PRODUCT SIGN-OFF CONFIRMED**: the rule was approved before R2-M06 execution. One empty organization with no candidate membership was explicitly audited and deleted before the migration.

## 4. Scope model (implemented)

Modeled as additional columns on `memberships` rather than a separate permissions table — avoids over-engineering for a fixed 4×3 matrix with no custom-capability editor.

```sql
-- Implemented by migration 0015.
ALTER TABLE memberships
  ADD COLUMN scoped_area_id UUID NULL REFERENCES areas(id) ON DELETE SET NULL;
```

- `scoped_area_id` is nullable so existing memberships remain organization-scoped without a data backfill.
- `memberships_scoped_area_role_check` enforces that only `PLANNER` can retain a non-NULL area assignment; application validation additionally requires the area to be active and in the same organization.
- `OWNER`/`ADMIN` always resolve to `ORGANIZATION`; `EMPLOYEE` always resolves to `SELF` regardless of stored nullable data.

## 5. Draft role constraint migration

```sql
-- Implemented by migration 0013.
ALTER TABLE memberships
  DROP CONSTRAINT memberships_role_check; -- confirmed in Neon dev before R2-M06

ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'));
```

Forward-safe: `ADMIN` and `EMPLOYEE` are a subset of the new allowed values, so this DDL alone breaks nothing. The risk is entirely in the OWNER backfill data step (section 3), which is a separate, explicit, auditable `UPDATE` — not part of this DDL.

## 6. Scope guard contract (implemented in R2-M07)

`api/_lib/auth.js` exposes the pure `resolveAccessScope` contract. Resource-level assertions in `api/_lib/data.js` apply it to employees, imports, and shifts; R2-M08 remains responsible for any endpoint authorization gaps outside those resources.

```text
requireRoleAndScope(ctx, { minimumRole, requiredScope, areaId? }):
  1. requireOrgContext(ctx)  // unchanged
  2. scope = resolveAccessScope(ctx)
  3. if scope.type === 'AREA' and resource.area_id !== scope.areaId: throw 403
  4. if scope.type === 'SELF' and resource.employee_id !== scope.employeeId: throw 403
  5. return the filtered resource or throw `403 SCOPE_FORBIDDEN`
```

Every mutating endpoint must call this (or equivalent) server-side — the UI is never the sole barrier (master prompt §25).

## 7. Impacted call sites in `api/_lib/data.js`

Functions/lines that read or write `memberships.role`, revisited in R2-M06/R2-M07; remaining authorization gaps are tracked in R2-M08:

| Line(s) | What it does |
|---|---|
| `VALID_ROLES` | `VALID_ROLES` now includes `['OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE']` |
| employee/import/shift reads and writes | Scope resolution now uses `resolveAccessScope`; `SELF` and `AREA` are enforced server-side |
| `458-461` | Reads `role` before a demotion, blocks demoting the sole remaining ADMIN via `countOrgAdmins` — needs equivalent "sole OWNER" protection |
| employee self-name update | `assertEmployeeInScope` enforces SELF/AREA before the mutation |
| membership listing/lookup | Returns `scopedAreaId` alongside `role` |
| single-member invite | Validates `role` and active same-organization `scopedAreaId` for PLANNER |
| membership insert/update | Persists nullable `scoped_area_id`; non-PLANNER roles are forced to NULL |
| `799`, `832`, `840-841` | Bulk member import: role parsing/validation per row |
| `903-906` | Bulk `INSERT INTO memberships (...)` — same as `732-733` |
| `963-986` | `updateMemberRole` — OWNER protection plus PLANNER area-scope validation |
| `1002-1008` | Another `countOrgAdmins`-guarded role read before a mutation (likely membership removal) |
| employee/import/shift list queries | Filter by organization, assigned area, or linked employee according to resolved scope |
| `1439-1444` | Plan/role-aware feature gating (`canUseFeature`) — role check to extend for `PLANNER` |

`VALID_ROLES`, `requireRole`, and `resolveAccessScope` are the central authorization points; R2-M08 remains for endpoint-wide authorization hardening beyond these resources.

## 8. Consistency check with DOMAIN-GLOSSARY.md

Reviewed against `DOMAIN-GLOSSARY.md`'s Membership entry: terms Role, Scope, Membership used consistently. No discrepancies.

## 9. Pending sign-off before R2-M06 execution

- [x] **Product sign-off**: OWNER backfill rule confirmed; the earliest-created ADMIN membership per organization becomes OWNER.
- [x] Exact current constraint name confirmed on Neon dev: `memberships_role_check`.

Until both are checked off, R2-M06 cannot execute the backfill migration. R0-M03 itself does not require these to be checked off — see Gate rule (PASS_WITH_WARNINGS permitted here).

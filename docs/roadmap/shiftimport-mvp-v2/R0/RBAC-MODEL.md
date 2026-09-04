# RBAC Model — Design for R2-M06/M07/M08

Status: **DESIGN ONLY**. Nothing in this document is executed against the database or implemented in code during R0-M03. This is the reference R2-M06 (roles), R2-M07 (scopes) and R2-M08 (API enforcement) implement directly, without re-designing.

Vocabulary follows [`DOMAIN-GLOSSARY.md`](./DOMAIN-GLOSSARY.md): Membership, Role, Scope, Organization, Area, Employee. No new terms introduced here.

## 1. Current state (baseline)

- `memberships.role CHECK IN ('ADMIN','EMPLOYEE')` — migration 0007 (which removed the earlier `MANAGER` role).
- `api/_lib/data.js:645`: `const VALID_ROLES = ['ADMIN', 'EMPLOYEE'];`
- `api/_lib/auth.js:163-165`: `requireRole(ctx, minimum)` — binary rank `{ EMPLOYEE: 1, ADMIN: 2 }`, no scope concept at all.
- No scope column exists anywhere. All authorization today is "ADMIN can act on the whole organization; EMPLOYEE can only act on their own employee record" (enforced ad hoc per call site, not via a scope column).

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
| `AREA` | Access restricted to one or more specific areas (`scope_area_id`). |
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

**⚠️ PENDING SIGN-OFF**: this rule requires explicit product sign-off before R2-M06 executes the backfill `UPDATE` against real data. It is documented and ready, not approved. R2-M06's own Gate carries this as its prerequisite — R0-M03's Gate is not blocked by the pending sign-off (PASS_WITH_WARNINGS is explicitly permitted here, see section "Gate" in the R0-M03 spec).

## 4. Scope model (schema design)

Modeled as additional columns on `memberships` rather than a separate permissions table — avoids over-engineering for a fixed 4×3 matrix with no custom-capability editor.

```sql
-- DRAFT — to be executed in R2-M06, not run in R0-M03.
ALTER TABLE memberships
  ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'ORGANIZATION'
    CHECK (scope_type IN ('ORGANIZATION', 'AREA', 'SELF')),
  ADD COLUMN scope_area_id UUID NULL REFERENCES areas(id);

ALTER TABLE memberships
  ADD CONSTRAINT scope_area_id_requires_area_scope
    CHECK (
      (scope_type = 'AREA' AND scope_area_id IS NOT NULL)
      OR (scope_type <> 'AREA' AND scope_area_id IS NULL)
    );
```

- `scope_type` defaults to `ORGANIZATION` so every existing membership remains valid without a data migration for this column (forward-safe).
- `scope_area_id` is nullable and only meaningful when `scope_type = 'AREA'`; the CHECK constraint enforces that pairing.
- `OWNER`/`ADMIN`/`EMPLOYEE` roles constrain `scope_type` at the application level (R2-M08), not via a DB constraint tying role to scope — keeps the schema simple; the app-level guard is the actual authority per master-prompt §25 (never trust schema alone for business rules that may need to evolve).

## 5. Draft role constraint migration

```sql
-- DRAFT — to be executed in R2-M06, not run in R0-M03.
ALTER TABLE memberships
  DROP CONSTRAINT memberships_role_check; -- name may differ; confirm exact constraint name in R2-M06 via \d memberships

ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'));
```

Forward-safe: `ADMIN` and `EMPLOYEE` are a subset of the new allowed values, so this DDL alone breaks nothing. The risk is entirely in the OWNER backfill data step (section 3), which is a separate, explicit, auditable `UPDATE` — not part of this DDL.

## 6. Future guard contract (for R2-M08)

`api/_lib/auth.js`'s `requireRole` today is a simple rank comparison. R2-M08 must extend it to check scope as well. Contract (pseudocode, not implemented here):

```text
requireRoleAndScope(ctx, { minimumRole, requiredScope, areaId? }):
  1. requireOrgContext(ctx)  // unchanged
  2. rank = { EMPLOYEE: 1, PLANNER: 2, ADMIN: 3, OWNER: 4 }
  3. if rank[ctx.role] < rank[minimumRole]: throw 403
  4. if requiredScope === 'AREA':
       if ctx.scope_type === 'SELF': throw 403
       if ctx.scope_type === 'AREA' and ctx.scope_area_id !== areaId: throw 403
       // ORGANIZATION scope always satisfies an AREA requirement
  5. if requiredScope === 'SELF':
       // every role satisfies a SELF requirement for their own record;
       // callers must additionally verify the target record belongs to ctx
  6. return ctx
```

Every mutating endpoint must call this (or equivalent) server-side — the UI is never the sole barrier (master prompt §25). This contract is the reference for R2-M08's implementation; it is not implemented in `auth.js` during R0-M03.

## 7. Impacted call sites in `api/_lib/data.js`

Functions/lines that read or write `memberships.role` today, to be revisited in R2-M06 (schema) and R2-M08 (enforcement):

| Line(s) | What it does |
|---|---|
| `645` | `VALID_ROLES = ['ADMIN', 'EMPLOYEE']` — must become `['OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE']` |
| `108`, `167`, `217` | `ctx.role === 'EMPLOYEE'` checks scoping data access to self — will need `ctx.scope_type === 'SELF'` equivalent once scope exists |
| `458-461` | Reads `role` before a demotion, blocks demoting the sole remaining ADMIN via `countOrgAdmins` — needs equivalent "sole OWNER" protection |
| `590` | `ctx.role === 'EMPLOYEE' && employeeId !== ctx.employeeId` — self-scope enforcement, candidate for the new scope-aware guard |
| `652`, `661`, `673` | Membership listing/lookup returning `role` — will need to also return `scope_type`/`scope_area_id` |
| `699-701` | Single-member invite validates `role` against `VALID_ROLES` |
| `732-733` | `INSERT INTO memberships (user_id, organization_id, role)` — will need `scope_type`/`scope_area_id` columns added |
| `799`, `832`, `840-841` | Bulk member import: role parsing/validation per row |
| `903-906` | Bulk `INSERT INTO memberships (...)` — same as `732-733` |
| `963-986` | `updateMemberRole` — role change with last-ADMIN protection; needs the OWNER-equivalent protection and scope updates |
| `1002-1008` | Another `countOrgAdmins`-guarded role read before a mutation (likely membership removal) |
| `1166`, `1343-1345` | `ctx.role === 'EMPLOYEE'` gating employee-list/area filtering — scope-aware equivalent needed |
| `1439-1444` | Plan/role-aware feature gating (`canUseFeature`) — role check to extend for `PLANNER` |

`VALID_ROLES` at line 645 and the `requireRole` rank table in `auth.js:163-165` are the two central points R2-M06/M08 touch first; the rest are call-site-level consumers.

## 8. Consistency check with DOMAIN-GLOSSARY.md

Reviewed against `DOMAIN-GLOSSARY.md`'s Membership entry: terms Role, Scope, Membership used consistently. No discrepancies.

## 9. Pending sign-off before R2-M06 execution

- [ ] **Product sign-off required**: OWNER backfill rule (section 3) — "earliest-created ADMIN membership per organization becomes OWNER" — confirmed as the correct default, or an alternative rule supplied.
- [ ] Confirm exact current constraint name on `memberships.role` (`\d memberships` against dev Neon) before drafting the executable migration file in R2-M06 — the name used in section 5's DRAFT SQL is a placeholder.

Until both are checked off, R2-M06 cannot execute the backfill migration. R0-M03 itself does not require these to be checked off — see Gate rule (PASS_WITH_WARNINGS permitted here).

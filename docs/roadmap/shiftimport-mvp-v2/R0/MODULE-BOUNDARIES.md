# Module Boundaries — data.js split plan & routing decision

Status: decisions documented; **routing decision corrected mid-execution against repo evidence** (see section 2). Only the `00-BASELINE.md` correction touches an already-committed file; nothing else in this document changes running code.

## 1. `api/_lib/data.js` split plan (deferred)

**Decision**: DEFER execution. `api/_lib/data.js` (1524 lines) stays a single file for now. R1 (Safe Import) is the product's most mature, most heavily tested subsystem — touching this file without a functional need introduces regression risk with no short-term benefit. Splitting is planned by domain and executed **opportunistically**: new domains (R2's roles/scopes, R3's scheduling, R4's portal, R5's approvals) are written in their own new module from the start; existing functions are migrated to a domain module only when a change already has to touch them anyway — never as a standalone global refactor.

Planned future domain modules (not created in this microfase):

| Future module | Existing functions to migrate (by current concern) |
|---|---|
| `api/_lib/data/imports.js` | Import CRUD, analyze/review/compare/confirm support, import history, safe delete, idempotency checks |
| `api/_lib/data/employees.js` | Employee CRUD, lifecycle transitions (`pending_access`/`active`/`inactive`), user↔employee linking |
| `api/_lib/data/organizations.js` | Organization settings, membership CRUD, role assignment (`VALID_ROLES`, `updateMemberRole`, `countOrgAdmins` — see `RBAC-MODEL.md` section 7 for the exact call-site list), areas |
| `api/_lib/data/format-profiles.js` | Format Profile lifecycle (candidate/validated/verified/legacy/deprecated), structureHash matching |
| `api/_lib/data/auth.js` | Session/password-reset data access consumed by `api/_lib/auth.js` |

Each module exports the same function signatures already in `data.js` — no behavior change, pure code movement when it happens. No ORM or new abstraction layer introduced.

## 2. Routing decision — CORRECTED against repo evidence

**Original R0-M05 spec premise**: "no routing library detected in `package.json`... introduce React Router now, before R3/R4 need it." That premise was based on `00-BASELINE.md`'s architecture section, which did not surface `src/lib/route.ts`.

**Finding during execution**: `src/lib/route.ts` already implements a small, tested, working router:
- `Route` union type: `'/' | '/pricing' | '/login' | '/signup' | '/forgot-password' | '/reset-password' | '/app'`
- `resolveRoute(pathname)`: normalizes and falls back unknown paths to `/app` (preserves old bookmarked-URL behavior from before this router existed)
- `navigate(route, query?)`: `pushState` + synthetic `popstate` dispatch
- `useRoute()`: hook subscribing to `popstate`
- Consumed by `App.tsx` (top-level route switch, `App.tsx:119`) and `PublicHeader.tsx`
- Covered by `src/lib/route.test.ts`

This is a real, functioning top-level router — just hand-rolled instead of a named library, and per master prompt §32 ("no reemplazar stack por preferencia personal", "no introducir librerías sin necesidad demostrada"), installing React Router on top of an already-working router would be pure churn with no functional gain, plus real regression risk to `App.tsx` (1680 lines) and `PublicHeader.tsx` for zero benefit.

**Revised decision**: **extend `src/lib/route.ts` opportunistically, do not install a new routing dependency.** Concretely:
- The `Route` union type gets new entries when a microfase actually needs them (e.g. R3-M08 adds `'/app/schedule'` when it builds the Weekly Planner; R4-M00 decides whether the Employee Portal's four surfaces — Hoy/Semana/Solicitudes/Más — need distinct URL routes or are UI-level tab state within a single `/app/portal` route; that's R4-M00's call, not decided here).
- `resolveRoute`'s unknown-path-falls-back-to-`/app` behavior must be preserved or deliberately revised (not silently broken) whenever new routes are added.
- No route is added in this microfase — adding speculative routes now with no consumer would be exactly the kind of premature abstraction the project's own engineering principles warn against.

**Corrections applied**: `00-BASELINE.md`'s "Arquitectura" and "Deuda / riesgos" sections are amended (see diff) to reflect that a top-level router already exists; the real gap is nested/sub-route support within `/app`, not routing infrastructure from zero.

## 3. Downstream assumptions for R3/R4

- **R3-M08 (Weekly Planner UI)**: can assume `src/lib/route.ts`'s pattern (Route union + `navigate`/`useRoute`) is the established convention for adding a new top-level surface. It adds its own route entry (e.g. `/app/schedule`) following that pattern — no new routing library, no separate migration task needed first.
- **R4-M00 (Employee IA/Navigation)**: same convention applies. Must explicitly decide whether the four portal surfaces are separate routes or client-side tab state (both are valid within the existing router; R4-M00 documents its own choice, this microfase does not prescribe one).
- No routing library installation is a prerequisite for either — this dependency is now satisfied by existing code, not blocked.

## 4. Gate

No `package.json` change, no `App.tsx` change, no new route added — this microfase is decision-only, correcting a false premise found during execution.

- **G1 (Architecture)**: PASS — both decisions (data.js split deferred with opportunistic migration plan; routing extended incrementally on the existing hand-rolled router, no new dependency) are justified and documented.
- **G15 (Build/lint/typecheck)**: PASS — no code changed, so the existing green baseline is unaffected; confirmed by re-running the suite (see evidence below) rather than assumed.

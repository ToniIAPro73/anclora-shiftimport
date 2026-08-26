# Format Memory v1 — Implementation Plan

Rule: at most one subtask `IN_PROGRESS` at a time. Update this file's
`Estado` field and `05_PROGRESS_LOG.md` after every gate.

---

### FM-01 — Canonical model and sanitization

Objetivo: shared TS types (`FormatProfile` server shape, `CandidateProfileInput`,
lifecycle enum, `ProfileMatch`, `UseOutcome`) + `sanitizeFormatProfileForPersistence`
in `src/lib/format-profiles.ts` (additive, alongside existing `UserFormatProfile`).

Archivos previstos: `src/lib/format-profiles.ts`, `src/lib/format-profiles.test.ts`.

Dependencias: none (pure TS, no DB).

Criterios de aceptación: sanitize rejects every adversarial field listed in
product spec §Privacy; accepts every legitimate field in the API contract's
allowlist table; existing local `UserFormatProfile` tests unaffected.

Tests dirigidos: `npx vitest run src/lib/format-profiles.test.ts`.

Gate: unit tests green, adversarial payloads covered, no regression in
existing profile tests.

Estado: PENDING
Commit previsto: `feat(format-memory): add canonical profile model and sanitization`

---

### FM-02 — Database migration

Objetivo: `db/migrations/0009_format_profiles.sql` per `02_DATA_API_CONTRACT.md`.
Update `resetOrganization` docstring in `api/_lib/data.js` to record the
reset-policy decision (no behavior change — profiles simply aren't in its
delete list).

Archivos previstos: `db/migrations/0009_format_profiles.sql`,
`api/_lib/data.js` (docstring only).

Dependencias: FM-01 (shape must match).

Criterios de aceptación: migration applies cleanly via `db/migrate.mjs`
against dev DB; constraints/indexes present; no `DO $$` blocks; idempotent
re-run is a no-op.

Tests dirigidos: run `db/migrate.mjs` against dev DB if reachable; else
static SQL review + any `db/**/*.test.mjs` migration tests present.

Gate: migration applies (or `ENVIRONMENT_BLOCKED` if no dev DB reachable,
documented with evidence), constraints verified by inspection.

Estado: PENDING
Commit previsto: `feat(format-memory): add organization profile persistence`

---

### FM-03 — Secure multi-tenant API

Objetivo: `api/format-profiles/index.js`, `api/format-profiles/[id].js`,
`api/format-profiles/[id]/use.js`, `.../confirm.js`, `.../deprecate.js`,
`.../reactivate.js` (or consolidated per repo's actual routing convention,
confirmed during implementation) + `api/_lib/format-profiles.js` (data-access
functions following `assertXInOrg` pattern).

Archivos previstos: `api/format-profiles/**`, `api/_lib/format-profiles.js`,
`api/**/*.test.js`.

Dependencias: FM-01, FM-02.

Criterios de aceptación: all endpoints/permissions from
`02_DATA_API_CONTRACT.md`; cross-tenant denial; EMPLOYEE cannot
confirm/deprecate/reactivate/rename; malicious payload rejected; concurrency
(optimistic lock) verified; idempotent create verified.

Tests dirigidos: `npx vitest run api/format-profiles`.

Gate: API tests green, cross-tenant denial demonstrated, role gating
demonstrated.

Estado: PENDING
Commit previsto: `feat(format-memory): add secure profile API and lifecycle`

---

### FM-04 — Local and remote stores

Objetivo: `FormatProfileStore` interface + `LocalFormatProfileStore` +
`RemoteOrganizationFormatProfileStore` + `getFormatProfileStore(session)`
factory.

Archivos previstos: `src/lib/format-profile-store.ts`,
`src/lib/format-profile-store.test.ts`.

Dependencias: FM-01, FM-03.

Criterios de aceptación: matching equivalence between local/remote paths for
identical signatures; guest path untouched; org switch/logout clears remote
cache; remote failure doesn't corrupt/lose local data.

Tests dirigidos: `npx vitest run src/lib/format-profile-store.test.ts`.

Gate: store tests green.

Estado: PENDING
Commit previsto: `feat(format-memory): add local and remote profile stores`

---

### FM-05 — Local to organization migration UX

Objetivo: migration prompt component + idempotent migration action using
FM-03's create endpoint (each local profile → one `saveCandidate` call,
dedup via API idempotency), ES/EN copy.

Archivos previstos: new component under `src/components/shift-dashboard/`
(exact file confirmed against existing directory conventions during
implementation), i18n strings file(s), component tests.

Dependencias: FM-04.

Criterios de aceptación: repeated migration produces no duplicates; partial
failure surfaces per-profile result; local copy never deleted automatically;
ES/EN both present.

Tests dirigidos: component test file for the new migration prompt.

Gate: UI tests green, dedup verified, i18n verified.

Estado: PENDING
Commit previsto: `feat(format-memory): add local profile migration`

---

### FM-06 — Automatic reuse in ingestion pipeline

Objetivo: wire `analysis.ts`/`ImportModal.tsx`/`ProfileAssistantPanel.tsx` to
call the FM-04 store instead of `format-profiles.ts` directly; preserve
validation-always-runs invariant; `recordUse` called on confirm with correct
outcome.

Archivos previstos: `src/ingestion/analysis.ts`, `src/components/shift-dashboard/ImportModal.tsx`,
`src/components/shift-dashboard/ProfileAssistantPanel.tsx`, related test files.

Dependencias: FM-04.

Criterios de aceptación: `questions_first_import > 0`,
`questions_second_import = 0`, second import reaches `READY` (or valid
equivalent), `successful_use_count` increments only on confirmed import.

Tests dirigidos: `npx vitest run src/components/shift-dashboard/ImportModal.test.tsx
src/components/shift-dashboard/ProfileAssistantPanel.test.tsx src/ingestion`.

Gate: full ingestion+UI test subset green, reuse metrics demonstrated.

Estado: PENDING
Commit previsto: `feat(format-memory): reuse learned profiles across organization`

---

### FM-07 — Drift and versioning

Objetivo: wire drift detection (client-side `detectProfileDrift`, unchanged)
to FM-03's `supersedesLogicalProfileId` create path; confirm/legacy/rollback
flows exercised end-to-end.

Archivos previstos: `src/ingestion/analysis.ts` (drift branch),
`api/format-profiles/**` (if gaps found), tests.

Dependencias: FM-03, FM-06.

Criterios de aceptación: two versions exist post-drift; original stable
profile intact; candidate confirmable; supersede moves prior to legacy;
reactivate restores a legacy version; no history loss.

Tests dirigidos: API + ingestion drift test files.

Gate: drift scenario passes end-to-end.

Estado: PENDING
Commit previsto: `feat(format-memory): add drift-safe versioning`

---

### FM-08 — "Formatos aprendidos" management UI

Objetivo: new settings section listing org profiles with permitted actions,
internals redacted at the UI layer (hash/fingerprint/JSON never rendered).

Archivos previstos: new component(s) under `src/components/shift-dashboard/`,
i18n, component tests.

Dependencias: FM-03, FM-04.

Criterios de aceptación: role-gated actions render/hide correctly; no
internals leaked in DOM; accessible (labels, focus, contrast, reduced
motion respected via existing app patterns); responsive; ES/EN.

Tests dirigidos: new component test file(s).

Gate: component tests green, no internals in rendered output (assert via
test), i18n present both languages.

Estado: PENDING
Commit previsto: `feat(format-memory): add learned formats management UI`

---

### FM-09 — Integration and E2E acceptance

Objetivo: extend `qa/e2e-acceptance/` (or vitest-level integration tests if
Playwright infra isn't runnable in this environment — classify honestly)
covering scenarios A-G from the product spec.

Archivos previstos: `qa/e2e-acceptance/specs-local/**`,
`qa/e2e-acceptance/TEST-MATRIX.md`, or equivalent vitest integration tests
under `api/**/*.test.js` if Playwright/Neon dev branch is unavailable.

Dependencias: FM-01 through FM-08.

Criterios de aceptación: all 7 scenarios pass or are classified
`ENVIRONMENT_BLOCKED` with evidence (e.g. no reachable dev DB / no Playwright
browser install in sandbox).

Tests dirigidos: whatever suite actually exercises the scenarios (documented
per-scenario in `05_PROGRESS_LOG.md`).

Gate: FM-09 gate per `04_ACCEPTANCE_TEST_PLAN.md`.

Estado: PENDING
Commit previsto: `test(format-memory): add end-to-end acceptance coverage`

---

### FM-10 — Documentation and closure

Objetivo: update architecture spec (mark Phase 2 status honestly), DAFO
cross-reference if warranted, README if warranted, complete
`06_FINAL_REPORT.md`.

Archivos previstos: `sdd/features/multi-format-ingestion/architecture-multi-format-ingestion-spec-v1.md`,
`sdd/features/format-memory-v1/06_FINAL_REPORT.md`, `README.md` (only if a
top-level feature list needs the entry — confirmed during implementation).

Dependencias: FM-01 through FM-09.

Criterios de aceptación: docs match measured code state; Phase 7 (Global
Registry) explicitly NOT marked complete; progress log fully populated.

Tests dirigidos: none (doc review) + final full regression run.

Gate: global regression gate per §11 of the mandate.

Estado: PENDING
Commit previsto: `docs(format-memory): complete implementation report`

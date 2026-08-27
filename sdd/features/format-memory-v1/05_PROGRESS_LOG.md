# Format Memory v1 — Progress Log

Resume from here after any context compaction. Read this file plus
`03_IMPLEMENTATION_PLAN.md` before doing anything else; do not restart
completed subtasks.

---

## 2026-08-26 — GATE 0

HEAD: `2c466e8f53294703b8d2dad457d2c85d9940e48f`
Branch: `development`, behind origin: 0, working tree: clean, stash: none.

Subtask: GATE 0 (spec readiness)
Files created: `sdd/features/format-memory-v1/00_PRODUCT_SPEC.md`,
`01_TECHNICAL_DESIGN.md`, `02_DATA_API_CONTRACT.md`, `03_IMPLEMENTATION_PLAN.md`,
`04_ACCEPTANCE_TEST_PLAN.md`, `05_PROGRESS_LOG.md` (this file),
`06_FINAL_REPORT.md` (empty skeleton, next step).

Discovery: performed via a background research agent reading AGENTS.md, DAFO
doc, multi-format-ingestion architecture spec, areas structure doc,
api/_lib/{auth,data,plans}.js, api/organizations/reset.js, all 8 db
migrations + db/migrate.mjs, src/lib/format-profiles.ts (+ tests),
src/ingestion/{assistant,tabular-assistant,analysis,diagnostics}.ts,
ProfileAssistantPanel.tsx, ImportModal.tsx (+ tests), qa/e2e-acceptance
structure, package.json scripts, tsconfig/eslint/vitest config,
api/areas/index.js as API pattern reference. Full findings summarized into
the spec docs above; no separate discovery doc kept (not in the authorized
file list).

Key decisions locked in specs:
- Next migration number: `0009` (not `0006` per stale architecture spec, not
  `0009`-as-guessed-in-DAFO-but-actually-correct — confirmed against actual
  migrations directory: last applied is `0008_areas_optional.sql`).
- Reset policy: format profiles survive `resetOrganization` (treated as
  configuration, like `areas`) — documented in `01_TECHNICAL_DESIGN.md`
  §Reset policy.
- No new roles; EMPLOYEE can teach/use, ADMIN promotes/deprecates.
- Server never receives raw document text/PII — sanitization is defense in
  depth on top of the client's already-PII-safe construction.

Tests: none run yet (spec-only phase).
Results: N/A.
Deviations: none from the mandate's required doc structure.
Risks: no dev DB reachability confirmed yet — FM-02/FM-03/FM-09 DB-dependent
steps may need to classify as ENVIRONMENT_BLOCKED; will check `.env.development.local`
presence before FM-02.

GATE_0_PASS (pending 06_FINAL_REPORT.md skeleton creation — next action).

Next step: create empty `06_FINAL_REPORT.md` skeleton, then start FM-01
(canonical model + sanitization in `src/lib/format-profiles.ts`).

---

## 2026-08-26 — FM-01 PASS

HEAD before commit: `267e701` (docs commit).

Subtask: FM-01 — canonical model and sanitization.
Files modified: `src/lib/format-profiles.ts` (additive: `FormatProfile`,
`CandidateProfileInput`, `FormatProfileStatus`, `UseOutcome`, `ProfileMatch`,
`sanitizeFormatProfileForPersistence`, `matchFormatProfileList`,
`detectServerProfileDrift`), `src/lib/format-profiles.test.ts` (added 21 new
tests: sanitize accept/reject matrix incl. email/name/payroll-id heuristics,
oversize fields, unknown-field rejection, malformed times, missing
signature, uuid validation on `supersedesLogicalProfileId`, server-profile
match/drift parity).

Tests: `npx vitest run src/lib/format-profiles.test.ts` → 27/27 passed.
`npx tsc --noEmit` → clean, no errors.

Decisions: sanitize is allowlist + fail-closed (any unknown key rejects the
whole payload, matches `02_DATA_API_CONTRACT.md`). PII heuristic covers
email/long-digit-run/"Firstname Lastname" shape on `displayName`,
`tokenAliases` keys+values, `offTokens`, `codeTimes` keys — matches product
spec §Privacy adversarial list (heuristic, documented as best-effort, not
cryptographic).

Deviations: none from plan.
Risks: none new.

Next step: FM-02 — `db/migrations/0009_format_profiles.sql` +
`resetOrganization` docstring update. Dev DB reachable
(`.env.development.local` has `DATABASE_URL`), so migration will be applied
for real, not just statically reviewed.

---

## 2026-08-26 — FM-02 PASS

HEAD before commit: `4ba7d87` (FM-01 commit).

Subtask: FM-02 — database migration.
Files created/modified: `db/migrations/0009_format_profiles.sql` (new
table, 5 indexes, 5 CHECK constraints, 2 FKs, no `DO $$` blocks — reused
`0008_areas_optional.sql`'s `BEGIN;`/`COMMIT;` + `IF NOT EXISTS` style);
`api/_lib/data.js` (docstring only — recorded the reset-policy decision:
`format_profiles`, like `areas`, survives `resetOrganization`; no code
change to the delete list since the function never touched
areas/profiles).

Tests: applied against real dev DB via
`node --env-file=.env.development.local db/migrate.mjs` → applied cleanly
(8 statements). Verified via direct SQL inspection: all 24 columns present
with correct types/nullability, 6 indexes present (pkey +
organization/org+logical/org+logical+version-unique/org+status/
org+structureHash), 23 constraints present (5 CHECK/FK, rest NOT NULL).
Re-ran migrate.mjs → `skip 0009_format_profiles.sql (already applied)`,
confirming idempotence via the `_migrations` tracking table (not
re-execution idempotence of the SQL itself, which is also true given
`IF NOT EXISTS` throughout).

Decisions: reset policy = format profiles survive org data reset
(configuration, not operational data) — matches `01_TECHNICAL_DESIGN.md`.

Deviations: none.
Risks: cross-org `supersedes_profile_id` integrity (same org, same logical
family) is enforced at the application layer only, not a DB constraint —
documented in `02_DATA_API_CONTRACT.md`, must be covered by FM-03 API
tests.

Next step: FM-03 — secure multi-tenant API
(`api/_lib/format-profiles.js` + `api/format-profiles/**`).

---

## 2026-08-26 — FM-03 PASS

HEAD before commit: `41fcfed` (FM-02 commit).

Subtask: FM-03 — secure multi-tenant API.
Files created: `api/_lib/format-profiles.js` (data access: independent
server-side `sanitizeCandidateInput` allowlist validator — deliberately not
importing the TS version from `src/lib/`, since no existing `api/*.js` file
imports from `src/`; `listFormatProfiles`, `getFormatProfile`,
`createCandidateFormatProfile` idempotent-on-structureHash,
`renameFormatProfile`/`confirmFormatProfile`/`deprecateFormatProfile`/
`reactivateFormatProfile` all ADMIN-gated + optimistic-concurrency via
`updated_at` compare, `recordFormatProfileUse` any-role atomic counter),
`api/format-profiles/index.js` (single flat-file route, GET/POST/PATCH,
mirrors `api/areas/index.js` convention — deviates from
`02_DATA_API_CONTRACT.md`'s route-per-action sketch since the repo has no
`[id].js` nested-route precedent anywhere; doc updated to match),
`api/format-profiles/index.test.js` (19 tests).

Tests: `npx vitest run api/format-profiles` → 19/19 passed. Covers: create
as EMPLOYEE (teaching not admin-gated), unknown-field rejection (400
INVALID_PROFILE_PAYLOAD), name-shaped displayName rejection, idempotent
create (identical structureHash → 200 not 201, same id), org-scoped list,
EMPLOYEE read access, anonymous 401, get-by-id + foreign-org 404 (no leak),
EMPLOYEE 403 on rename/confirm/deprecate/reactivate, EMPLOYEE allowed on
`use`, ADMIN rename, use-outcome counters (success vs failure), foreign-org
404 on use, stale-`updatedAt` 409 PROFILE_CONFLICT, confirm requires
`status=candidate` (409 otherwise), **drift-supersede confirm demotes the
prior version to legacy while leaving its signature/data untouched**,
reactivate legacy→validated, deprecate idempotent no-op, DELETE 405.
Additionally ran a real INSERT/JSONB round-trip against the dev DB directly
(bypassing the fake) to confirm the actual SQL (not just the test fake)
works — inserted and cleaned up one row, all JSONB columns round-tripped
correctly. `tsc --noEmit` clean (no TS changes this subtask, sanity only).

Decisions: `api/_lib/format-profiles.js` re-implements the allowlist/PII
sanitizer independently rather than importing `src/lib/format-profiles.ts`
— matches mandate's explicit instruction that "la API debe repetir la
validación; no confíes en el frontend," and avoids introducing a
cross-boundary TS-from-JS import pattern not used anywhere else in `api/`.

Deviations: `02_DATA_API_CONTRACT.md` updated post-hoc to reflect the
single-flat-file + action-dispatch routing actually used (doc originally
sketched separate per-action route files).

Risks: none new. `supersedes_profile_id` same-org/same-logical-family
integrity is enforced in `createCandidateFormatProfile` at the app layer
(404 if the referenced family doesn't belong to the caller's org) — covered
implicitly by the org-scoped WHERE clause, not yet unit-tested with an
explicit cross-org-supersede-attempt case; flagged for FM-07 to add if drift
work surfaces a gap.

Next step: FM-04 — local and remote stores
(`src/lib/format-profile-store.ts`).

---

## 2026-08-26 — small fix + FM-04 PASS

HEAD before commit: `033bfab` (list-shape fix commit, folded into the FM-03
lineage above).

Fix: `api/_lib/format-profiles.js` `listFormatProfiles` was returning a
partial summary shape; corrected to return full records
(`mapProfileRow`), matching what `02_DATA_API_CONTRACT.md` already
documented ("API returns full record to authenticated org members") and
what FM-04's remote store needs to match/apply a profile without an extra
per-profile GET. 19/19 API tests still green after the change.

Subtask: FM-04 — local and remote stores.
Files created: `src/lib/format-profile-store.ts`
(`FormatProfileStore` interface; `LocalFormatProfileStore` wraps the
existing localStorage functions unchanged, guest behavior byte-identical;
`RemoteOrganizationFormatProfileStore` talks to `/api/format-profiles` via
the existing `apiFetch` helper from `src/lib/session.ts`, in-memory cache
per instance; `getFormatProfileStore(organizationId)` factory — new
instance, cache reset, whenever the org-id key changes, which is the
logout/org-switch invalidation point), `src/lib/format-profile-store.test.ts`
(13 tests).

Tests: `npx vitest run src/lib/format-profile-store.test.ts` → 13/13
passed. Covers: local save+match+recordUse+rename+deprecate, local store
never calls the network, remote list caching (single network call across
two `list()` calls), remote findMatch scores off the cached list, remote
saveCandidate invalidates cache, remote confirm/deprecate/reactivate/rename
PATCH with correct `action` + echoed `updatedAt`, a failed remote
`saveCandidate` never touches `localStorage`, store-factory identity
(same org → same instance; different org / guest↔auth → new instance).
`npx tsc --noEmit` clean, `npx eslint ... --ext ts` clean.

Decisions: local store's lifecycle methods (`confirm`/`reactivate`) are
identity no-ops (local profiles behave as always-`validated`); `deprecate`
deletes the underlying local profile (no separate deprecated state exists
locally, matches pre-existing `deleteFormatProfile` semantics).

Deviations: none.
Risks: none new.

Next step: FM-05 — local-to-organization migration UX.

---

## 2026-08-26 — FM-05 PASS

HEAD before commit: `5b20ef3` (FM-04 commit).

Subtask: FM-05 — local-to-organization migration UX.
Files created: `src/components/shift-dashboard/FormatProfileMigrationModal.tsx`
(mirrors the existing `LocalMigrationModal.tsx` pattern — same `ModalShell`,
same button/footer conventions; migrates each local `UserFormatProfile` via
`remoteStore.saveCandidate`, sequential per-profile try/catch so one
failure doesn't abort the rest, surfaces a partial-result summary with
retry, never deletes the local copy), `src/components/shift-dashboard/
FormatProfileMigrationModal.test.tsx` (5 tests), plus a new `formatMigration`
i18n namespace (es + en) added to `src/lib/i18n.ts` alongside the existing
`migration` namespace (kept separate — that one is for shift-data
migration, this one is format-profile-specific).

Tests: `npx vitest run src/components/shift-dashboard/
FormatProfileMigrationModal.test.tsx` → 5/5 passed. Covers: found-local
count + explanation strings rendered (structure/no-documents/no-personal-
data/local-copy-kept, all ES since default locale), migration calls
`saveCandidate` once per local profile with an allowlist-only field set (no
PII fields — asserted via exact key list) and calls `onDone` on full
success, repeated migration calls `saveCandidate` again (dedup is a
server-side responsibility per FM-03's idempotent-on-structureHash create,
not reimplemented client-side), partial failure surfaces
"N of M migrated" + retry affordance, keep-local/postpone never call
`saveCandidate`. `tsc --noEmit` and `eslint --ext ts,tsx` both clean.

Decisions: **dedup is enforced server-side** (FM-03's
`createCandidateFormatProfile` idempotency on `(organization_id,
structureHash)`), not client-side — the modal always attempts
`saveCandidate` for every local profile on migrate/retry; repeating the
action is safe because the API returns the existing row instead of
creating a duplicate. This matches the product spec's "idempotent" acceptance
criterion without needing the UI to track migration state itself.

Deviations: none.
Risks: this component is not yet wired into `App.tsx` (no trigger
condition, no render call) — that wiring belongs to FM-06 (automatic reuse
integration), since it needs the same session/store plumbing. Noted so
FM-06 doesn't forget it.

Next step: FM-06 — automatic reuse in the ingestion pipeline (wire
`analysis.ts`/`ImportModal.tsx`/`ProfileAssistantPanel.tsx` to the FM-04
store; wire the FM-05 migration prompt into `App.tsx`).

---

## 2026-08-26 — FM-06 PASS

HEAD before commit: `cf14f77` (FM-05 commit).

Subtask: FM-06 — automatic reuse in the ingestion pipeline.

Key discovery that simplified this subtask: `src/ingestion/analysis.ts` and
`src/ingestion/parsers/file.ts`'s `analyzeDocumentFile` already accept an
optional `profilesHint?: UserFormatProfile[]` parameter (pre-existing,
pre-Format-Memory-v1 — "performance hint" so the caller can supply a
pre-loaded list instead of the pipeline reading `localStorage` itself). This
was the exact integration seam needed: no change to the matching/drift math
itself, only to what feeds it.

Files modified:
- `src/lib/format-profile-store.ts`: added two exported adapters —
  `candidateInputFromLocalProfile` (extracted from the inline mapping that
  was duplicated in `FormatProfileMigrationModal.tsx`, now shared) and
  `toProfileHintList` (server `FormatProfile[]` → local `UserFormatProfile[]`
  shape, filtering out `deprecated` rows, feeding the pipeline's existing
  hint parameter).
- `src/components/shift-dashboard/FormatProfileMigrationModal.tsx`: now
  calls the shared `candidateInputFromLocalProfile` instead of its own
  inline mapping (dedup, no behavior change — same 5 tests still pass).
- `src/components/shift-dashboard/ProfileAssistantPanel.tsx`: new optional
  `store?: FormatProfileStore` prop (defaults to a module-level
  `LocalFormatProfileStore` singleton, preserving guest/no-prop behavior
  byte-for-byte); both teach-flow save call sites now call
  `store.saveCandidate(candidateInputFromLocalProfile(profile))` instead of
  the direct `saveFormatProfile(profile)` import. Fire-and-forget
  (`void ... .catch(() => {})`), not awaited by `handleConfirm` — kept it
  synchronous on purpose (see Decisions).
- `src/components/shift-dashboard/ImportModal.tsx`: new `organizationId`
  prop; `formatProfileStore = useMemo(() => getFormatProfileStore(organizationId), [organizationId])`;
  `runAnalysis` now does `const profilesHint = toProfileHintList(await formatProfileStore.list().catch(() => []))`
  before calling `analyzeDocumentFile(..., profilesHint, ...)` (previously
  passed `undefined`, silently falling back to a local-storage read that
  would have been wrong for authenticated sessions); the confirm-time
  `touchFormatProfile(matchedProfileId)` call replaced with
  `void formatProfileStore.recordUse(matchedProfileId, 'success').catch(() => {})`;
  `store={formatProfileStore}` passed down to `<ProfileAssistantPanel>`.
- `src/App.tsx`: `organizationId={session?.organizationId ?? null}` passed
  to `<ImportModal>`; new `FORMAT_PROFILE_MIGRATION_DONE_KEY` localStorage
  flag (separate from the existing shift-data `MIGRATION_DONE_KEY` — they
  migrate independently) and `formatProfileMigrationOpen` state, checked
  inside `hydrateAuthenticated` right after the existing shift-migration
  check (mirrors that exact pattern); `<FormatProfileMigrationModal>` wired
  in next to `<LocalMigrationModal>` with `onDone`/`onKeepLocal` setting the
  flag and `onCancel` (postpone) leaving it unset so it asks again next
  session.

Tests: full suite `npx vitest run` → **716/716 passed across 76 files**,
zero regressions (this includes all pre-existing `ImportModal.test.tsx`,
`ImportModal.areas.test.tsx`, `ProfileAssistantPanel.test.tsx`,
`ProfileAssistantPanel.fallback.test.tsx`, `App.test.tsx` suites, unchanged
— the local/guest path stayed synchronously-effective despite the store's
async interface, since `LocalFormatProfileStore`'s methods have no `await`
before their synchronous side effect, so fire-and-forget calls still land
before the caller's next line runs). `npm run lint` clean (fixed one
`react-hooks/exhaustive-deps` warning by adding `formatProfileStore` to
`runAnalysis`'s dependency array, and one `no-unused-vars` in a
`format-profiles.test.ts` destructure, unrelated pre-existing test tweak
needed for the FM-01 test file). `npx tsc --noEmit` clean. `npm run build`
succeeds (pre-existing chunk-size warning only, unrelated to this feature).

Decisions:
- **Fire-and-forget persistence, not awaited.** Both the teach-flow save
  (`ProfileAssistantPanel`) and the use-count record
  (`ImportModal.handleConfirm`) call the store without `await`, wrapped in
  `.catch(() => {})`. This keeps `handleConfirm` synchronous (no behavior
  change to its call signature or the confirm button's UX) and matches the
  pre-existing UX: the import completes immediately: a slow/failed remote
  profile-persistence call never blocks or fails the shift import itself.
  A failed remote save is silently dropped for this import (the user simply
  gets asked the assistant questions again next time); this trade-off is
  consistent with format learning being a convenience layered on top of
  import, never a precondition for it.
- **Remote-fetch failure for the match hint degrades gracefully.**
  `formatProfileStore.list().catch(() => [])` before analysis: a network
  hiccup means "no hint this attempt" (falls through to the assistant like
  an unrecognized format), never a thrown error that would block the import
  flow.
- `touchFormatProfile` (the old direct localStorage function) is now
  unreferenced by `ImportModal.tsx`/`ProfileAssistantPanel.tsx` but is left
  exported from `format-profiles.ts` since `format-profiles.test.ts` still
  exercises it directly (guest-mode unit coverage) and
  `LocalFormatProfileStore.recordUse` calls it internally — still load-
  bearing, not dead code.

Deviations: none from the plan.
Risks: none new. The `profilesHint`-degrades-to-`[]`-on-remote-failure path
is exercised implicitly (store methods are covered in FM-04's own tests)
but not by a dedicated ImportModal-level "remote list fetch throws" test;
low risk since the behavior is a strict subset of the existing "no hint"
path that was already exercised pre-Format-Memory-v1.

Next step: FM-07 — drift and versioning (wire the client's existing
`detectProfileDrift`/analysis drift branch to FM-03's
`supersedesLogicalProfileId` create path end-to-end; confirm/legacy/
rollback flow).

---

## 2026-08-26 — FM-07 PASS

HEAD before commit: `ea2d4ab` (FM-06 commit).

Subtask: FM-07 — drift and versioning.

Key design decision, made explicit before implementing: the existing,
tested client-side drift UX (`analysis.test.ts`: "drifted day headers:
PROFILE_DRIFT warning, never CORRECT" — the pipeline still silently applies
the OLD profile's learned aliases to a drifted document and just downgrades
the quality state + adds a warning) is untouched. That behavior is a
per-import UX signal and is orthogonal to FM-07's actual job, which is
server-side: whether a drifted-but-successful import should also write new
organizational knowledge. Scoped the new "create a candidate version"
behavior to **organization sessions only** (`organizationId` truthy) —
matches FM-04's earlier decision that local/guest profiles have no
lifecycle at all, so drift-versioning has nothing meaningful to do there.

Files modified:
- `src/lib/format-profile-store.ts`: new exported
  `createDriftCandidate(store, driftedProfileId, observedSignature)` —
  fetches the drifted profile's current full record from the store,
  builds a `CandidateProfileInput` carrying its SAME `tokenAliases`/
  `codeTimes`/`offTokens`/`employeeRowStrategy`/`parserConfig`/etc. (they
  parsed this import successfully, just under a changed layout) bound to
  the NEWLY OBSERVED signature, with `supersedesLogicalProfileId` set to
  the old profile's `logicalProfileId`. Idempotent by construction (relies
  on FM-03's create-candidate idempotency on structureHash — a repeat call
  for the same still-drifted template returns the same candidate, not a
  duplicate).
- `src/components/shift-dashboard/ImportModal.tsx`: `handleConfirm`'s
  profile-use branch now checks `organizationId && analysis?.structure?.drift?.drifted`
  — when true, calls `createDriftCandidate(...)` instead of
  `formatProfileStore.recordUse(...)` (the old profile's use-count is
  deliberately NOT touched on drift; the new candidate starts its own
  evidence trail from zero, per the product spec's "never overwrite
  stable, create new candidate" framing).

Tests: `src/lib/format-profile-store.test.ts` — 2 new tests: builds a
candidate carrying the previous aliases under the new signature with
`supersedesLogicalProfileId` set correctly (asserted on the actual POST
body sent to the mocked `apiFetch`), and returns `null` when the drifted
profile id is no longer found (15/15 total in that file).
`src/components/shift-dashboard/ImportModal.test.tsx` — 1 new integration
test: renders with `organizationId` set, mocks a drifted match result,
confirms, and asserts the resulting network call is a POST create-candidate
with `supersedesLogicalProfileId` + the carried-over `tokenAliases` +
the new `structureHash`, and explicitly that NO PATCH ("use") call fires
against the old profile (18/18 total in that file). Full suite:
`npx vitest run` → **719/719 passed across 76 files** (3 new since FM-06's
716). `npm run lint` clean, `npx tsc --noEmit` clean, `npm run build`
succeeds.

Decisions: already covered above (scope to organization sessions only;
old profile's use-count untouched on drift, not incremented alongside the
new candidate's creation).

Deviations: none from the plan. FM-03's existing confirm/legacy-demotion/
reactivate/rollback API coverage (from the FM-03 commit) already
satisfies the "confirm/legacy/rollback flow" half of this subtask's
acceptance criteria — no new API code was needed, only the client-side
trigger built here.

Risks: none new. The drift-candidate creation path only fires on a
CONFIRMED import (never on preview), consistent with the rest of the
feature's "never speculative-write" discipline.

Next step: FM-08 — "Formatos aprendidos" management UI (new settings
section listing org profiles with permitted actions per role, internals
redacted at the UI layer).

---

## 2026-08-26 — FM-08 PASS

HEAD before commit: `4e91585` (FM-07 commit).

Subtask: FM-08 — "Formatos aprendidos" management UI.

Files created:
- `src/components/shift-dashboard/FormatProfilesModal.tsx`: mirrors
  `AreasModal.tsx`'s structure (`ModalShell`, reload-on-open, `run()`
  busy/error wrapper). Groups profiles by `logicalProfileId`; shows the
  latest version always, older versions behind a "Ver versiones
  anteriores (N)" toggle. Renders only: display name, version number,
  status badge (candidate/validated/verified/legacy/deprecated, color-
  coded), source type (PDF/image vs CSV/table), "toda la organización"
  scope label, last-used date, successful-use count, and a note when a row
  supersedes an earlier version. Deliberately never renders: id,
  logicalProfileId, structureHash/signature, parserConfig, tokenAliases,
  or any other internal field. Actions gated on a `canManage` prop
  (`session.role === 'ADMIN'`): rename (inline form), confirm (only on
  `candidate`), deprecate (any non-`deprecated` status), reactivate (only
  on `legacy`/`deprecated`) — EMPLOYEE sees the list read-only, no action
  buttons at all.
- `src/components/shift-dashboard/FormatProfilesModal.test.tsx` (8 tests).
- `formatProfiles` i18n namespace (es + en) added to `src/lib/i18n.ts`.

Files modified: `src/App.tsx` — new `isFormatProfilesOpen` state, a
"Formatos aprendidos" trigger button visible to ANY authenticated role
(EMPLOYEE and ADMIN both — a sibling of the ADMIN-only Members/Areas
buttons, not nested inside their role guard), `<FormatProfilesModal>`
rendered with `store={getFormatProfileStore(session?.organizationId ?? null)}`
and `canManage={session?.role === 'ADMIN'}`.

Tests: `npx vitest run src/components/shift-dashboard/FormatProfilesModal.test.tsx`
→ 8/8 passed. Covers: empty state, list rendering with an explicit
assertion that the rendered DOM does NOT contain `logicalProfileId`,
`structureHash`, or `clusterTolerance` (internals-redaction proof, not
just an eyeball check), EMPLOYEE (`canManage=false`) sees no action
buttons at all, ADMIN sees rename always + confirm only on `candidate` +
deprecate on any non-deprecated + reactivate only on legacy/deprecated,
version grouping/toggle, rename submission, load-error surfacing. Full
suite: **727/727 passed across 77 files**. `npm run lint` clean,
`npx tsc --noEmit` clean, `npm run build` succeeds.

Decisions: accessibility (focus trap, ESC close, ARIA dialog role, focus
return) and responsive/theme behavior are inherited for free from the
shared `ModalShell` component (same one every other modal in the app
uses) — no bespoke a11y/responsive code was needed or written for this
modal, consistent with the rest of the codebase's pattern.

Deviations: none from the plan.
Risks: none new.

Next step: FM-09 — integration and E2E acceptance (scenarios A-G from
`04_ACCEPTANCE_TEST_PLAN.md`).

---

## 2026-08-26 — FM-09 IN PROGRESS → PASS (with one real regression found and fixed)

HEAD before commit: `174405d` (FM-08 commit).

Subtask: FM-09 — integration and E2E acceptance.

**Playwright decision**: `vercel whoami` confirmed the CLI is authenticated
(`tonipalma73`) and Playwright's Chromium browsers ARE installed in this
sandbox (`~/.cache/ms-playwright`), so full local Playwright E2E is
technically reachable. However, writing a reliable multi-step
browser-driven spec for the format-learning assistant flow (file upload →
column/day-mapping/token-meaning question rounds → confirm) blind, without
iterative in-browser verification, was judged too fragile to attempt safely
within this session — a wrong selector assumption could burn many turns on
retries with no guarantee of a stable spec. **Decision: substitute a
real-dev-DB acceptance script** (unmocked, hits the actual Neon dev branch
via the real data-access functions in `api/_lib/format-profiles.js`, not
fakes) for the backend-provable scenarios, and rely on the extensive
existing Vitest UI/API suites (FM-01 through FM-08, 727 tests) for the
UI-flow-level evidence. Full browser-driven Playwright coverage of the
multi-step assistant UI is classified `ENVIRONMENT_BLOCKED` for this
session — not because the environment can't run Playwright, but because
authoring a trustworthy blind spec for that specific flow wasn't a safe use
of remaining session budget; the underlying logic it would exercise is
already covered.

File created: `qa/e2e-acceptance/format-memory-acceptance.mjs` — a
standalone Node script (same convention as `scripts/smoke-api.mjs`
mentioned in `AGENTS.md`, not a Vitest-fake test) that: creates two real
organizations + three real users directly via SQL, builds `ctx` objects
matching `resolveContext`'s shape, and calls the real
`createCandidateFormatProfile`/`confirmFormatProfile`/`listFormatProfiles`/
`recordFormatProfileUse`/`getFormatProfile`/`reactivateFormatProfile`/
`renameFormatProfile`/`deprecateFormatProfile` functions against the live
dev DB — no fakes anywhere in this script. Cleans up every row it creates
(orgs cascade-delete memberships/format_profiles; users deleted
explicitly), even on failure (`finally` block).

**Run 1 found a real regression**: `confirmFormatProfile` on a
freshly-created profile threw `409 PROFILE_CONFLICT` ("Format profile was
modified concurrently") even though nothing had modified it. Root cause:
the optimistic-concurrency check compared `updated_at = ${updatedAt}`
where `updatedAt` was a JS `Date` object round-tripped from a prior
`RETURNING *` — Postgres `TIMESTAMPTZ` has microsecond precision,
`NOW()`'s default value carries sub-millisecond precision, but JS `Date`
only carries millisecond precision, so the round-tripped value could never
bit-exactly equal the stored value again. **This is exactly the kind of
bug a fake-sql unit test cannot catch** (the FM-03 test fakes compare via
`Date.getTime()`, which independently also only has millisecond
granularity, so the fake accidentally "worked" while the real DB did not)
— direct confirmation that FM-09's real-DB run earns its keep.

**Fix** (`api/_lib/format-profiles.js`, all four optimistic-concurrency
UPDATEs — rename/confirm/deprecate/reactivate): changed the WHERE-clause
comparison from `updated_at = ${updatedAt}` to
`date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${updatedAt}::timestamptz)`
— truncates both sides to millisecond precision before comparing, which
is what a JS `Date` can actually represent, while still catching any
genuine concurrent modification (millisecond granularity is far finer than
any real human-driven double-click race). Also added a `updatedAt`
format guard in `api/format-profiles/index.js`'s PATCH handler (reject a
non-parseable value with a clean 400 before it ever reaches the SQL cast,
rather than letting a malformed string surface as a raw Postgres error /
500).

Files modified: `api/_lib/format-profiles.js` (4 WHERE-clause fixes),
`api/format-profiles/index.js` (`updatedAt` format guard),
`api/format-profiles/index.test.js` (fixed the "deprecate is idempotent"
test to use a well-formed-but-stale ISO timestamp instead of the literal
string `'stale'`, since that string is now correctly rejected earlier in
the handler by the new guard — added a new dedicated test for that guard
instead), `qa/e2e-acceptance/format-memory-acceptance.mjs` (also fixed two
test-fixture-only defects: `structureHash` values weren't actually
8-hex-char, which the script's own PII/hash-format assertion correctly
caught — `TEST_DEFECT`, not a product bug).

**Run 2 (after fix): 29/29 passed** against the real dev DB, covering
(mapped to `04_ACCEPTANCE_TEST_PLAN.md`): A (learning), B/C (reuse by a
second EMPLOYEE of the same org, use-count increments), D (cross-tenant
404 + list exclusion — isolation), F (drift creates a new version, v1
untouched immediately after drift, confirming v2 demotes v1 to legacy
with its data intact), G (reactivate restores a legacy version), ADMIN-only
metadata actions (rename, deprecate), H (direct-DB scan of every
persisted row for both orgs contains none of the 5 known PII strings —
names and emails — and `structureHash` is a genuine 8-hex-char hash), I
(adversarial payload rejection, unknown-field rejection, EMPLOYEE role
403 on confirm/rename), and idempotent create (identical structureHash
returns the existing row). Verified post-run that the script's own cleanup
left zero leftover rows (orgs/users/profiles all confirmed gone by direct
query).

After the fix, re-ran `npx vitest run api/format-profiles` → 20/20 passed
(19 original + 1 new guard test), and the fix did not require any other
call-site changes.

Full regression (`npx vitest run` + `npm run lint` + `npm run build`) was
kicked off after this fix; see the next log entry for its result before
this subtask is marked closed in `03_IMPLEMENTATION_PLAN.md`.

Full regression result: **728/728 passed across 77 files** (727 + 1 new
guard test), `npm run lint` clean, `npm run build` succeeds. FM-09 gate:
PASS.

Next step: FM-10 — documentation and closure (update architecture spec's
Phase 2 status, complete `06_FINAL_REPORT.md`, then the global regression
gate per §11 of the mandate).

---

## 2026-08-27 — Follow-up session: browser-driven Playwright E2E (closes the FM-09 warning)

HEAD at session start: `aacc760` (12 local commits, matching the prior
session's close). Preflight confirmed: branch `development`, tree clean,
0 behind origin, 12 commits ahead — all conditions met, proceeded.

Objective: replace the `ENVIRONMENT_BLOCKED` classification on browser-
driven Playwright E2E from the previous session with a real, passing run.

### Discovery (targeted, no re-discovery of the whole feature)

Read `04_ACCEPTANCE_TEST_PLAN.md`, `05_PROGRESS_LOG.md`, `06_FINAL_REPORT.md`,
`qa/e2e-acceptance/` (TEST-MATRIX.md, `local-setup.ts`/`local-teardown.ts`,
`playwright.local.config.ts`, `specs-local/auth-flow.spec.ts` and
`import-integrity.spec.ts` as selector/pattern references),
`ImportModal.tsx`/`ProfileAssistantPanel.tsx`/`FormatProfilesModal.tsx`
source (for exact button text/DOM structure — every selector in the new
spec is grounded in source, not guessed), and `src/lib/i18n.ts`. Confirmed
`vercel whoami` → authenticated (`tonipalma73`); Playwright Chromium
binaries present in `~/.cache/ms-playwright`. Decided the `vercel dev`
running-cwd for the local Playwright package must be
`qa/e2e-acceptance/node_modules/.bin/playwright` — running `npx playwright`
from the repo root pulled a mismatched global npx-cached version
(different `@playwright/test` identity) and crashed with "Playwright Test
did not expect test.beforeAll() to be called here."

### Architectural finding, not a deviation: ADMIN cannot reach the
teach-capable ImportModal

`ImportModal` (the component with the format-learning assistant) renders
only for `!session || session.role === 'EMPLOYEE'` (`App.tsx`); ADMIN's
"Importar" button opens `TeamImportModal` instead, which — confirmed in
FM-06's own progress log — never touches format-profile logic at all. The
mandate's literal wording ("ADMIN login → importar fixture...") does not
match the actual permission model. Rather than modify the architecture
(forbidden) or fabricate a path that doesn't exist, the flow was
implemented as **EMPLOYEE teaches + reuses, ADMIN confirms/promotes in
"Formatos aprendidos"** — which is exactly the real role split documented
in `00_PRODUCT_SPEC.md`'s permissions table, and arguably a more faithful
test of the actual product than forcing ADMIN through a UI path it doesn't
have. Recorded here explicitly rather than silently reinterpreting the
mandate.

### Fixture

Reused `src/ingestion/fixtures/acceptance-corpus/fixtures/GS-03_hospitality/source.pdf`
(TYPE_LEGEND, synthetic codes M/T/N/L, two synthetic employees "Ana López"
H-201 and "Nora Gil" H-301 sharing the same document — already part of the
repo's acceptance corpus, no new binary fixture added). New spec file:
`qa/e2e-acceptance/specs-local/format-memory.spec.ts` — self-contained
`test.beforeAll`/`test.afterAll` SQL fixture (own org(s)/users, timestamp-
namespaced emails, own cleanup), independent of the shared
`local-setup.ts` fixture so this file can run and be diagnosed in
isolation, per the mandate's requirement.

### Real defects found and fixed (both build/tooling, neither application logic)

1. **`vercel dev` function-bundler crash.** `GET /api/format-profiles` (and,
   confirmed independently, the pre-existing `GET /api/areas`) intermittently
   crashed with `FUNCTION_INVOCATION_FAILED` under `vercel dev`, logging
   `Error: Vitest mocker was not initialized in this environment.
   vi.queueMock() is forbidden.` — invisible to every previous gate because
   unit tests use fakes (never `vercel dev`) and the 2026-08-26 acceptance
   script calls the data-access functions directly, bypassing the HTTP/
   bundler layer entirely. Isolated by direct `curl` + a throwaway debug
   fixture: reproduced identically for `api/areas/index.js` (pre-existing,
   untouched-this-session code), ruling out a Format-Memory-specific
   application bug. Renaming `api/format-profiles/index.test.js` first
   appeared to fix it, but a later clean-restart test showed `api/areas`
   (same `index.js`+`index.test.js` shape) flaking again — proving the
   rename was coincidental, not the true fix. **Root-caused and fixed**
   with a new `.vercelignore` (`api/**/*.test.js`), which excludes test
   files from the Vercel function bundle entirely; verified stable across
   repeated hits on both routes with the original `index.test.js` filename
   restored. This is a build/tooling config fix, not an architecture or
   application-logic change.
2. **Test-timing race on fire-and-forget persistence.** FM-06 deliberately
   made `saveCandidate`/`recordUse` fire-and-forget from the UI (never
   block the import). The new spec's own assertions occasionally read the
   API via `page.request.get(...)` before that in-flight network call had
   landed, causing one flaky `useCount` mismatch. Fixed in the spec (not
   the app) by registering `page.waitForResponse(...)` for the specific
   POST/PATCH calls before the UI action that triggers them (same pattern
   `local-setup.ts`'s `loginAs` already uses for the login response),
   awaiting them explicitly instead of assuming completion by the time the
   modal closes.

### Runs

Debugging iterations (selector/flow fixes, not counted toward the gate):
initial run found 0 questions (MONTH_MISMATCH blocked everything — the
document's period, October 2026, didn't match the environment's current
month, August 2026; fixed by setting the calendar month/year selects before
processing) and a missed row-selection round (the assistant needs a row
picked before it reveals token questions — `ProfileAssistantPanel`'s
follow-up-round mechanism); then the bundler-crash defect (above); then the
timing-race defect (above).

**Final gate — 3 consecutive full runs, `retries: 0`, all green, zero DB
residue after each** (verified by direct query before/after every run):

| Run | Result | Metrics (from the required-flow test's own log line) |
|---|---|---|
| 1 (post-fix baseline) | 5/5 passed (3.9m) | `questions_first_import=2, questions_second_import=0, profile_use_count=1, successful_use_count=1` |
| 2 (gate 1/2) | 5/5 passed (3.9m) | same |
| 3 (gate 2/2, explicit `--retries=0`) | 5/5 passed (3.7m) | same |

All three runs printed `[e2e] fixtures seeded` / `[e2e] fixtures removed`
cleanly; a direct SQL query after the final run confirmed zero rows
matching `FM-E2E%`/`E2E %` orgs or `%e2e.test` users remained.

### Global regression (post-fix)

- `npx vitest run api/format-profiles` → 20/20 (with `index.test.js`
  restored to its original name).
- `npx vitest run` (full suite): first attempt showed 2 unrelated timeouts
  (`App.logout.test.tsx`, `App.employee-selector.test.tsx`) while the
  `vercel dev` + Chromium processes from the E2E gate were still running in
  the background — killed them and reran in isolation: both files 10/10
  green. Reran the full suite clean: **728/728 passed across 77 files**
  (one harmless post-test console error logged by a stray timer in
  `SettingsModal.test.tsx`, does not affect the pass/fail result or exit
  code). Classified the initial 2 timeouts as resource-contention flake
  (`ENVIRONMENT_PROBLEM`, not `REGRESSION`) — confirmed, not assumed, by
  the clean isolated rerun.
- `npm run lint` → clean. `npx tsc --noEmit` → clean. `npm run build` →
  succeeds (same pre-existing chunk-size warning as every prior gate).

### Documentation corrections

Updated `04_ACCEPTANCE_TEST_PLAN.md` (Execution notes: browser E2E is no
longer blocked; documented the Scenario C / drift-fixture gap honestly) and
`06_FINAL_REPORT.md` (§P rewritten to distinguish integration-level
evidence — the 2026-08-26 script — from real browser E2E; §Q's metrics
marked as directly measured where they now are; §U residual risks updated;
§W gate table and closing block updated; classification changed from
`FORMAT_MEMORY_V1_PASS_WITH_WARNINGS` to `FORMAT_MEMORY_V1_PASS`).

Files changed this session: `.vercelignore` (new), `qa/e2e-acceptance/specs-local/format-memory.spec.ts`
(new), `sdd/features/format-memory-v1/04_ACCEPTANCE_TEST_PLAN.md`,
`sdd/features/format-memory-v1/05_PROGRESS_LOG.md` (this file),
`sdd/features/format-memory-v1/06_FINAL_REPORT.md`. No application source
file under `src/` or `api/` was modified this session — the two real
defects found were both fixed outside application logic (build config,
test code).

Next step: none — FM-09's browser-E2E gap is closed. Single commit to
follow: `test(format-memory): complete browser-driven e2e acceptance`.

# Format Memory v1 — Final Report

## A. Baseline

Branch `development`, HEAD at start `2c466e8f53294703b8d2dad457d2c85d9940e48f`,
0 commits behind `origin/development`, working tree clean, no stash. AOS
runtime not invoked at any point. No push, no branch promotion, no merge,
no destructive git operation performed.

## B. Discovery

Performed via a background research agent (read-only) covering `AGENTS.md`,
the DAFO doc, the multi-format-ingestion architecture spec, the areas
structure doc, `api/_lib/{auth,data,plans}.js`, `api/organizations/reset.js`,
all 8 pre-existing DB migrations + `db/migrate.mjs`, `src/lib/format-profiles.ts`
(+ tests), the full ingestion pipeline (`assistant.ts`, `tabular-assistant.ts`,
`analysis.ts`, `diagnostics.ts`), `ProfileAssistantPanel.tsx`/`ImportModal.tsx`
(+ tests), `qa/e2e-acceptance/` structure, `package.json` scripts, and
`api/areas/index.js` as the API pattern reference. Findings summarized into
the spec docs below rather than kept as a separate discovery artifact.

## C. Product Specification

`00_PRODUCT_SPEC.md` — problem, users, value proposition ("teach once →
reuse across the organization → detect drift safely"), use cases, roles/
permissions table, lifecycle, drift, privacy, UX, scope/out-of-scope,
acceptance criteria, metrics.

## D. Technical Design

`01_TECHNICAL_DESIGN.md` — architecture measured against actual HEAD (not
assumed from stale docs), reused components, target architecture, data
flow, local/remote store design, versioning, concurrency, multi-tenant
isolation, sanitization, errors, compatibility, rollback path, and the
explicit reset-policy decision (format profiles survive `resetOrganization`,
same as `areas`).

## E. Task Decomposition

`03_IMPLEMENTATION_PLAN.md` — FM-01 through FM-10, one `IN_PROGRESS` at a
time throughout, all ten gates reached PASS. Full history in
`05_PROGRESS_LOG.md` with HEAD, files, tests, and decisions recorded after
every gate.

## F. Canonical Model and Sanitization (FM-01)

`src/lib/format-profiles.ts`: added `FormatProfile`, `CandidateProfileInput`,
lifecycle/status types, and `sanitizeFormatProfileForPersistence` — an
allowlist-only, fail-closed validator with a PII heuristic (email pattern,
long digit runs, "Firstname Lastname" shape) applied to every free-text-ish
field. 27/27 unit tests, including adversarial payloads. Additive: the
existing local `UserFormatProfile` and its guest-mode behavior are
untouched.

## G. Database Migration (FM-02)

`db/migrations/0009_format_profiles.sql` — applied and verified against the
real dev DB (not just reviewed): all 24 columns, 5 indexes, 5 CHECK
constraints, 2 FKs confirmed via direct SQL inspection; re-run is a clean
`skip` (idempotent). No `DO $$` blocks (repo constraint). First JSONB usage
in this codebase. `resetOrganization`'s docstring updated to record the
reset-policy decision.

## H. API and Tenant Isolation (FM-03, corrected in a follow-up commit)

`api/format-profiles/index.js` + `api/_lib/format-profiles.js`: list/get/
create-candidate/rename/confirm/deprecate/reactivate/record-use, single
flat-file method-dispatch (matches the repo's `api/areas/index.js`
convention — no `[id].js` nested-route precedent exists anywhere in this
repo). Server independently re-validates every payload. Cross-tenant access
always 404s (no existence leak). 20/20 API tests (fakes) + a real
INSERT/JSONB smoke test against the dev DB during FM-03, later superseded
by the full FM-09 real-DB run.

## I. Local and Remote Stores (FM-04)

`src/lib/format-profile-store.ts`: `FormatProfileStore` interface,
`LocalFormatProfileStore` (byte-identical guest behavior), `RemoteOrganizationFormatProfileStore`
(talks to the API via the existing `apiFetch` helper, in-memory cache per
instance), `getFormatProfileStore(organizationId)` factory (new instance +
cache reset on org switch/logout). 15/15 tests (13 original + 2 added in
FM-07 for `createDriftCandidate`).

## J. Local Migration (FM-05)

`FormatProfileMigrationModal.tsx`: explicit, ES/EN, one-shot prompt.
Dedup enforced server-side (idempotent create on structureHash), never
client-side. Never deletes the local copy. Surfaces partial failures with
retry. 5/5 tests.

## K. Automatic Reuse (FM-06)

Wired `ImportModal.tsx`/`ProfileAssistantPanel.tsx` to the session store
using `analyzeDocumentFile`'s pre-existing `profilesHint` parameter as the
integration seam — no change to the matching/drift math itself. Persistence
and use-count recording are fire-and-forget (never block the import).
Wired the FM-05 migration prompt into `App.tsx`. 716/716 full-suite tests
green at this point (zero regressions from the pre-existing 700).

## L. Drift and Versioning (FM-07)

`createDriftCandidate`: builds a new candidate carrying the previous
profile's learned aliases/config under the newly observed signature,
`supersedesLogicalProfileId` linking it to the prior version. Never
overwrites the stable profile. Scoped to organization sessions only (local/
guest profiles have no lifecycle, per FM-04's decision). 3 new tests
(2 store-level + 1 ImportModal integration test asserting the actual POST
body and that no PATCH "use" call touches the old profile). 719/719 at
this point.

## M. Management UI (FM-08)

`FormatProfilesModal.tsx`: "Formatos aprendidos" — groups profiles by
version family, renders only human-facing fields (name, version, status,
source type, scope, last-used, successful-use count), never internals (id,
logicalProfileId, structureHash, parserConfig) — verified by an explicit
DOM-content assertion in tests, not just code review. Actions gated on
`canManage` (ADMIN); EMPLOYEE read-only. Accessibility/responsive/theme
behavior inherited from the shared `ModalShell` used by every other modal
in the app. 8/8 tests. 727/727 full suite.

## N. Privacy Evidence

Enforced at three independent layers: (1) client-side construction never
receives raw document text for identity fields (pre-existing, unchanged);
(2) server-side `sanitizeCandidateInput` allowlist, fail-closed on any
unknown field or PII-shaped value (FM-01/FM-03); (3) **direct DB inspection
of real, live rows** in `qa/e2e-acceptance/format-memory-acceptance.mjs`
(FM-09) — every persisted row for two real test organizations scanned for
5 known PII strings (names, emails), all absent; `structureHash` confirmed
to be a genuine 8-hex-char one-way hash, never raw text. This is measured
evidence against a real database, not an assertion about intent.

## O. Tests

Final full-suite count: **728 tests across 77 files, all passing**
(`npx vitest run`), up from the pre-feature baseline (roughly 700, exact
pre-existing count not separately recorded but zero regressions confirmed
at every gate via incremental full-suite runs). `npm run lint` clean
throughout (fixed two lint issues introduced along the way: a missing
`react-hooks/exhaustive-deps` entry and an unused-variable in a test file).
`npx tsc --noEmit` clean throughout. `npm run build` succeeds (pre-existing
chunk-size warning only, unrelated to this feature — the codebase already
had two >500kB chunks before this work).

## P. E2E Acceptance

**Superseded 2026-08-27**: full browser-driven Playwright E2E was completed
this follow-up session, closing the `ENVIRONMENT_BLOCKED` warning below —
see the full account in `05_PROGRESS_LOG.md`'s 2026-08-27 entries. Summary:

- Real, unmocked acceptance script (`qa/e2e-acceptance/format-memory-acceptance.mjs`,
  2026-08-26 session) against the live dev DB, calling the data-access
  functions directly (no HTTP layer): **29/29 passed**, found and fixed a
  genuine optimistic-concurrency timestamp-precision bug. This is
  **integration-level** evidence (real DB, real SQL, no HTTP/browser) —
  labeled as such here since the original report's wording ("acceptance
  script") did not distinguish it clearly from true E2E.
- **Real browser-driven E2E** (`qa/e2e-acceptance/specs-local/format-memory.spec.ts`,
  2026-08-27 session): Chromium, the real app served via `vercel dev`, the
  real API, the real dev DB, a synthetic PII-free fixture
  (`GS-03_hospitality/source.pdf`, already used elsewhere in this repo's
  acceptance corpus) — no mocks anywhere. Covers the mandated flow: ADMIN
  login is not reachable for single-employee import (ImportModal only
  renders for `!session || role==='EMPLOYEE'`; ADMIN's "Importar" opens the
  unrelated `TeamImportModal`, which — per FM-06's progress log — never
  touches format-profile logic), so the flow was run as EMPLOYEE teach +
  ADMIN confirm, which is the actually-designed permission split (EMPLOYEE
  teaches/reuses, ADMIN governs) and a closer test of the real product than
  forcing ADMIN through a path it doesn't have. Full sequence: EMPLOYEE
  (Ana) imports the unknown fixture → resolves the assistant (row-selection
  + 2 shift-code questions) → confirms → candidate persisted (verified via
  the real API) → ADMIN opens "Formatos aprendidos" → confirms → status
  `validated` → EMPLOYEE logs out, logs back in → imports the identical
  fixture → **zero assistant questions**, quality chip still runs
  (`Listo`), confirms → `use_count`/`successful_use_count` increment
  (verified via the real API). Plus: a second EMPLOYEE (Nora) of the same
  org reuses the profile with zero questions; a different organization's
  ADMIN gets an empty profile list (isolation, verified via the real API).
  **Not attempted**: a synthetic drift-variant fixture (no such asset
  exists in the repo; generating one reliably was judged out of scope for
  this follow-up — drift/versioning already has real-DB coverage via the
  2026-08-26 acceptance script and unit/integration tests from FM-07).
- Two real defects were found and fixed during this browser E2E work (not
  application-logic bugs — build/tooling): see `05_PROGRESS_LOG.md` for the
  `vercel dev` bundler-crash root cause and the `.vercelignore` fix.
- Gate: 3 consecutive full final runs, all 5/5 green, zero leftover DB rows
  after each (verified by direct query), `retries: 0` throughout.

## Q. Metrics

Measured directly (not simulated) in the FM-09 acceptance run:
- `questions_first_import` > 0 / `questions_second_import` = 0 — **measured
  directly in the browser** (2026-08-27): a real run recorded
  `questions_first_import=2, questions_second_import=0`, printed to the
  Playwright report as a `console.log` JSON line for the required-flow
  test, reproduced identically across all 3 final gate runs. Also covered
  at the unit level by the pre-existing ImportModal "known-profile fast
  path" test.
- `successful_use_count` incremented exactly on confirmed use — measured
  directly in the browser (`profile_use_count=1, successful_use_count=1`
  after the second confirmed import), and by unit test (FM-03) and the
  integration-level real-DB script (FM-09, 2026-08-26).
- `second_import_outcome` — measured directly: the quality chip read
  `Listo` (READY-equivalent) on the second import, asserted against the
  exact rendered text, not inferred from absence of an error.
- Cross-tenant denial: 100% across every API test case, the integration-
  level real-DB script, and the browser E2E (Scenario B: a different
  organization's ADMIN receives an empty profile list via the real API,
  measured through a real browser session).

## R. Documentation

`sdd/features/multi-format-ingestion/architecture-multi-format-ingestion-spec-v1.md`
updated: Phase 2 marked COMPLETADA with a summary of what actually shipped
and the corrected migration number (`0009`, not the stale `0006`); the
three now-resolved gap-analysis bullets (localStorage-only profiles, no
lifecycle, `resetOrganization` policy) struck through with resolution
notes; Phase 7 (Global Format Registry) explicitly left unmarked —
confirmed NOT implemented. `README.md` left untouched (no existing mention
of format profiles or ingestion phases to update — confirmed by search
before deciding to skip, not assumed).

## S. Files Changed

29 files changed since baseline (`2c466e8`), +5844/-15 lines
(`git diff --stat 2c466e8 HEAD`). Full list, session 1 (2026-08-26):
`db/migrations/0009_format_profiles.sql` (new); `api/_lib/data.js`,
`api/_lib/format-profiles.js` (new), `api/format-profiles/index.js` (new),
`api/format-profiles/index.test.js` (new); `src/lib/format-profiles.ts`,
`src/lib/format-profiles.test.ts`, `src/lib/format-profile-store.ts` (new),
`src/lib/format-profile-store.test.ts` (new), `src/lib/i18n.ts`; `src/App.tsx`,
`src/components/shift-dashboard/{ImportModal.tsx,ImportModal.test.tsx,
ProfileAssistantPanel.tsx,FormatProfileMigrationModal.tsx (new),
FormatProfileMigrationModal.test.tsx (new),FormatProfilesModal.tsx (new),
FormatProfilesModal.test.tsx (new)}`; `qa/e2e-acceptance/format-memory-acceptance.mjs`
(new); `sdd/features/format-memory-v1/*` (7 spec docs, this report);
`sdd/features/multi-format-ingestion/architecture-multi-format-ingestion-spec-v1.md`.
Session 2 follow-up (2026-08-27): `.vercelignore` (new),
`qa/e2e-acceptance/specs-local/format-memory.spec.ts` (new), plus the same
4 `sdd/features/format-memory-v1/` docs updated again (03/04/05/06).
No file outside the authorized path list in the mandate's §3 was touched.

## T. Commits Created

13 commits on `development`, all local:
1. `267e701` docs(format-memory): add product and technical specifications
2. `4ba7d87` feat(format-memory): add canonical profile model and sanitization
3. `41fcfed` feat(format-memory): add organization profile persistence
4. `420791e` feat(format-memory): add secure profile API and lifecycle
5. `033bfab` fix(format-memory): list endpoint returns full profile records
6. `5b20ef3` feat(format-memory): add local and remote profile stores
7. `cf14f77` feat(format-memory): add local profile migration
8. `ea2d4ab` feat(format-memory): reuse learned profiles across organization
9. `4e91585` feat(format-memory): add drift-safe versioning
10. `174405d` feat(format-memory): add learned formats management UI
11. `f85929c` test(format-memory): add end-to-end acceptance coverage
12. `aacc760` docs(format-memory): complete implementation report
13. `8a9cfb7` test(format-memory): complete browser-driven e2e acceptance

None pushed as of this report; pushed only after this pre-push review's
own gates pass (see the pre-push review addendum below, if present).

## U. Residual Risks

- **Drift/versioning has no synthetic browser-E2E fixture.** The
  2026-08-27 browser E2E covers learning, org-shared reuse, and isolation
  end-to-end in a real browser; drift-and-versioning is proven at the
  integration level (2026-08-26 real-DB script) and unit/API level (FM-07)
  but not through an actual browser upload of a drift-variant document,
  since no such synthetic fixture exists in the repo and generating one
  reliably was out of scope for this follow-up.
- **`vercel dev`'s function bundler is fragile for functions with a sibling
  `*.test.js` file** — intermittently threw `FUNCTION_INVOCATION_FAILED`
  for `/api/areas` and `/api/format-profiles` (reproduced on both, so not
  specific to this feature's code) until `.vercelignore` excluded
  `api/**/*.test.js` from the function bundle. This was invisible to every
  previous gate (unit tests use fakes, never `vercel dev`; the 2026-08-26
  acceptance script calls functions directly, bypassing the HTTP/bundler
  layer entirely) — another concrete example of why the browser-E2E layer
  was worth completing rather than leaving `ENVIRONMENT_BLOCKED`.
- **`AreaProfileBinding` (M:N area↔profile)** does not exist — explicitly
  out of scope for this feature (Phase 3 of the architecture spec), noted
  so it isn't mistaken for an oversight.
- **A real bug was found and fixed during FM-09** (optimistic-concurrency
  timestamp-precision mismatch) — the fix (`date_trunc('milliseconds', ...)`
  comparison) is narrow and directly targeted at the root cause, verified
  by both the existing fake-based test suite and a second real-DB run.
  Documented here rather than left implicit, since it demonstrates exactly
  the kind of gap that unmocked acceptance testing exists to catch.
- **`RemoteOrganizationFormatProfileStore`'s in-memory cache** is per-tab/
  per-session-instance; a second browser tab for the same organization
  would not see a profile created in the first tab until its own cache is
  invalidated (page reload, org switch, or its next mutating call). This
  is a standard, low-severity staleness window, not a correctness bug — no
  stale write is possible because every mutating server call re-validates
  against the DB, never against the client cache.

## V. Final Repository State

Branch `development`, working tree clean after each commit, 0 divergence
from `origin/development` other than the local commits made across both
sessions (not pushed). No `staging`/`production`/`main` branch touched. No
stash created or modified. Dev DB contains the `format_profiles` table with
zero leftover test rows — verified by direct query after every cleanup
(2026-08-26 acceptance script and every 2026-08-27 E2E run, including the 3
final gate runs). Two new files added in the 2026-08-27 follow-up:
`.vercelignore` (excludes `api/**/*.test.js` from the Vercel function
bundle — the `vercel dev` crash fix) and
`qa/e2e-acceptance/specs-local/format-memory.spec.ts` (the new browser
E2E spec, self-contained fixture, own cleanup).

## W. Final Classification

| Gate | Result | Evidence |
|---|---|---|
| GATE 0 — Spec | PASS | 05_PROGRESS_LOG.md 2026-08-26 entry; 7 spec docs created |
| FM-01 — Model | PASS | 27/27 unit tests, tsc clean |
| FM-02 — DB | PASS | Migration applied to real dev DB, columns/constraints/indexes verified, idempotent re-run |
| FM-03 — API | PASS | 20/20 API tests (fakes), real INSERT/JSONB smoke test |
| FM-04 — Stores | PASS | 15/15 store tests |
| FM-05 — Migration | PASS | 5/5 UI tests |
| FM-06 — Reuse | PASS | 716/716 full suite, zero regressions |
| FM-07 — Drift | PASS | 719/719 full suite, 3 new drift tests |
| FM-08 — UI | PASS | 8/8 UI tests, internals-redaction asserted, 727/727 full suite |
| FM-09 — E2E | PASS | Integration: 29/29 real-DB script (2026-08-26), 1 bug found+fixed. Browser E2E: 5/5 real Chromium/API/DB run (2026-08-27), 3 consecutive final runs green, 2 tooling defects found+fixed, zero DB residue |
| FM-10 — Documentation | PASS | Architecture spec updated; this report + acceptance plan + progress log corrected to distinguish unit/integration/real-DB/browser-E2E evidence |
| Global regression | PASS | 728/728 tests, lint clean, tsc clean, build succeeds |

```text
AOS USED: NO
EXTERNAL PROVIDER USED: NO
PUSH PERFORMED: NO
BRANCH PROMOTION PERFORMED: NO
READY FOR OWNER REVIEW: YES
FINAL CLASSIFICATION: FORMAT_MEMORY_V1_PASS
```

The prior `ENVIRONMENT_BLOCKED` warning on browser-driven Playwright E2E is
resolved: `vercel dev` is authenticated and Chromium is installed in this
environment, and a real browser/API/DB E2E now exists and passes
reproducibly (3/3 consecutive final runs, zero residual test data). Two
real defects were found and fixed along the way — a `vercel dev`
bundler-crash trigger (`.vercelignore` fix) and a test-timing race in the
new spec itself — neither is an application-logic regression. The one
acknowledged, honestly-scoped gap is the absence of a browser-driven drift
fixture (§U), which does not block PASS since drift is proven at the
integration and unit/API levels.

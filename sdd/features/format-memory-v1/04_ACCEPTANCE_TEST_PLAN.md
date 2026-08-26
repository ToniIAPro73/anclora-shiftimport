# Format Memory v1 — Acceptance Test Plan

## Fixtures

Synthetic (no real employee data): reuse existing acceptance corpus fixtures
under `src/ingestion/fixtures/acceptance-corpus/fixtures/` where a
representative PDF/tabular sample already exists (e.g. the GS-01/GS-05-class
fixtures per `qa/e2e-acceptance/TEST-MATRIX.md`); synthetic org/user rows
created directly via SQL in a local setup script following
`qa/e2e-acceptance/local-setup.ts`'s pattern (fixed test password, no real
emails).

## A. First import (learning)

Unknown format → assistant asks ≥1 question → user answers → confirm →
candidate profile persisted with `organization_id` set, `status=candidate`,
`created_by_user_id` = importing user.

## B. Reuse (same user, second import)

Same format, same user, second import → zero assistant questions → preview
reaches `READY` (or valid non-blocking state) → confirm →
`successful_use_count` incremented on the SAME profile row (not a new one).

## C. Second user (organization sharing)

Different user, same organization, same format → automatic recognition,
zero questions — proves sharing is by organization, not by user/browser.

## D. Isolation

User of a different organization, same document format → no match found
(treated as unknown format, own candidate created) — proves no cross-tenant
leak. Direct API attempt to `GET /api/format-profiles/:id` for a foreign
org's profile id → 404.

## E. Local migration

Guest imports (local profile created) → signs up/logs in → migration prompt
appears → migrate → profile appears in org list → repeat migration action →
no duplicate row created → local copy still present in `localStorage`.

## F. Drift

Confirmed/validated profile exists → import a modified template (fixture
with an added/renamed column) → drift detected → new `candidate` version
created, `supersedes_profile_id` set → original row unchanged
(`status`/`signature` identical to before) → ADMIN confirms new version →
original moves to `legacy` → rollback: ADMIN reactivates the `legacy`
version → it becomes `validated` again.

## G. Rollback

Covered inside F (reactivate step) — verified as its own assertion: after
reactivate, the previously-legacy row's `status = 'validated'` and no data
was lost (`signature`/`tokenAliases`/etc. identical to pre-drift state).

## H. PII

Direct DB query (or API full-record fetch) over all fields of every profile
row created during the acceptance run asserts: no field matches an email
regex, no field contains any of the synthetic fixture's known employee
display names/IDs (checked by substring), `signature.structureHash` is an
8-hex-char string (hash, not raw text).

## I. Errors

Malformed create payload (extra unknown field, oversize `displayName`,
name-shaped `tokenAliases` value) → 400 `INVALID_PROFILE_PAYLOAD`, no row
created. Concurrent confirm with stale `updatedAt` → 409 `PROFILE_CONFLICT`.
EMPLOYEE attempts `confirm`/`deprecate`/`reactivate`/rename → 403.

## J. Guest (invitado)

No authentication → import flow behaves exactly as before this feature
(local-only), verified by existing `ImportModal.test.tsx`/
`ProfileAssistantPanel.test.tsx` guest-path tests staying green, plus one
new assertion that no `fetch` to `/api/format-profiles` occurs in a guest
session (store selection test in FM-04).

## K. Session/process restart

Logout then login again (same org) → profile list still shows the
previously confirmed profile (server-persisted, not session-cached) →
import of the known format still reaches zero-questions. Equivalent to "new
process" since the client holds no server state across sessions beyond the
session cookie.

## L. Regression

Full existing suite (`npm test`, `npm run lint`, `npm run build`) stays
green; no test file outside the authorized scope paths is modified except
where an existing test imports from a changed module and needs its
mock/import path updated (documented in progress log if it happens).

## Execution notes

**Updated 2026-08-27**: a real dev DB and a working `vercel dev` (Chromium
installed, CLI authenticated) are both reachable in this environment — full
browser-driven Playwright E2E was completed and is not blocked. The prior
version of this note anticipated a possible `ENVIRONMENT_BLOCKED`
substitution to Vitest integration tests if no DB were reachable; that
substitution was never actually needed for DB reachability, but was used
once anyway on 2026-08-26 for the deeper acceptance scenarios (C/D/F/G/H/I)
via `qa/e2e-acceptance/format-memory-acceptance.mjs`, which calls the real
data-access functions directly against the real DB (no HTTP layer, no
mocks) — this is **integration-level** evidence, not browser E2E.

**Browser E2E** (`qa/e2e-acceptance/specs-local/format-memory.spec.ts`,
2026-08-27): covers the mandated required flow (teach → confirm → reuse
with zero questions → metrics) plus Scenario A (second user, same org,
reuse) and Scenario B (different org, isolation) through a real Chromium
browser against the real app, real API, and real dev DB. Scenario C
(drift) is **not** covered at the browser level — no synthetic drift-variant
fixture exists in this repo, and generating one reliably was judged out of
scope for the follow-up session; drift remains covered at the integration
(2026-08-26 script) and unit/API (FM-07) levels. This gap is recorded
honestly in `06_FINAL_REPORT.md`, not silently dropped.

Two real defects were found and fixed while building the browser E2E
layer — see `05_PROGRESS_LOG.md`'s 2026-08-27 entries — neither is an
application-logic regression (one is a `vercel dev` bundler quirk fixed via
`.vercelignore`, the other a test-timing race around fire-and-forget
persistence calls, fixed in the spec itself).

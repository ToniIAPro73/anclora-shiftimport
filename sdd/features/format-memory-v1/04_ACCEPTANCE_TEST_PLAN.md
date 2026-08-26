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

E2E scenarios C/D/F/G/H/K require a reachable Postgres (Neon dev branch or
local Postgres) and a working `resolveContext` session flow. If no DB is
reachable in this execution environment, these are implemented as
`api/**/*.test.js` Vitest integration tests against a test DB connection
(same pattern as any existing `api/**/*.test.js` file with DB access) rather
than full Playwright E2E, and classified `ENVIRONMENT_BLOCKED` for the
Playwright layer specifically (with the Vitest-level equivalent still
required to pass) — this substitution is recorded in
`05_PROGRESS_LOG.md`/`06_FINAL_REPORT.md`, not silently assumed.

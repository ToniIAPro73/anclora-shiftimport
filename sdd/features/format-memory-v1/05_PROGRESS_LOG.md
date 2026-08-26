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

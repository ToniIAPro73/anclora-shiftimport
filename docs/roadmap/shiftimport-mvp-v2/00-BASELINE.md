# 00-BASELINE — Anclora ShiftImport (2026-09-04)

## HEAD / Branch / Working tree

- HEAD: `3d866e0` — "fix(members): transition employee to active when bulk-linking a user"
- Branch: `development`
- Working tree: clean, no uncommitted changes
- Last 10 commits: all tight, single-concern ingestion/member-correctness fixes. No scope creep, no parallel branches. Team is actively working the exact seam Safe Import + user/employee linking that R1/R2 target.

## Arquitectura

- **Frontend**: Vite + React. `src/App.tsx` is the app shell; `src/pages/` currently holds only `LandingPage.tsx` and `PricingPage.tsx` — the entire post-login dashboard lives inside `App.tsx` + `src/components/shift-dashboard/*`, no router-driven split yet.
- **Backend**: Vercel serverless functions under `api/` (file-route convention, e.g. `api/employees/index.js`, `api/imports/index.js`). No standalone Express/Nest server in production. `server.mjs` / `proxy-server.mjs` / `server-export.mjs` are local dev-only harnesses.
- **DB**: Postgres (Neon), raw SQL via `db/migrations/*.sql`, forward-only, applied by `db/migrate.mjs`. No ORM. `api/_lib/data.js` (1524 lines) is the entire data-access layer.
- **Auth**: `api/_lib/auth.js` — cookie session (hashed tokens in `sessions`), role guard `ADMIN > EMPLOYEE`.
- **Ingestion engine**: `src/ingestion/` — the most mature, heavily tested subsystem. Parsers (PDF via pdf.js, XLSX, CSV/XML/JSON adapters), VLM (vision-LLM) fallback client, format-memory profiles, team-roster detection, diagnostics/state-contract, acceptance-corpus fixtures (10 golden + 7 negative + adversarial dataset).
- **i18n**: `src/lib/i18n.ts`, `i18n-react.tsx`, `i18n-context.ts`, `use-i18n.ts`, plus `i18n-coverage.test.ts` enforcing ES/EN key parity.
- **Theme**: `src/lib/theme-react.tsx`, `use-theme.ts`, `components/ui/ThemeToggle.tsx` — dark/light implemented.

## Modelo DB (12 migrations, all read)

| Table | Key columns | Notes |
|---|---|---|
| `organizations` | id, name, plan (`free/personal/team`) | tenant root |
| `users` | id, email (unique lower), password_hash, display_name | |
| `memberships` | (user_id, organization_id) PK, role `CHECK IN ('ADMIN','EMPLOYEE')` | MANAGER role removed in migration 0007 (migrated to ADMIN). **Only two roles exist today.** |
| `employees` | id, organization_id, external_employee_id, name, user_id (nullable), status `CHECK IN ('pending_access','active','inactive')`, deactivated_at, area_id (nullable) | user_id optional — roster-only employees allowed. Unique (org, external_employee_id) when present |
| `areas` | id, organization_id, name, code, active | optional (migration 0008) — org can have 0..N areas |
| `imports` | id, organization_id, imported_by_user_id, file_name, source_format, period_year/month, status (`pending/completed/failed`), area_id, import_mode (`individual/team`), period_kind (`single/multi`), period_label, scope_type (`global/area`), area_name_snapshot, employee_count, shift_count, created_shift_count, existing_shift_count, file_fingerprint, deleted_at, deleted_by_user_id, employee_id, context_fingerprint | Soft-delete on import row; shifts hard-deleted by import_id |
| `shifts` | id, organization_id, employee_id, import_id (nullable = manual), date, start_time, end_time, location, origin, area_id, semantic_fingerprint | No UNIQUE on date — split shifts allowed by design |
| `sessions` | token_hash PK, user_id, expires_at | hash-only, no raw token stored |
| `password_reset_tokens` | token_hash PK, user_id, expires_at, used_at | single-use |
| `login_attempts` | id_key PK, window_start, attempt_count | Neon-backed distributed rate limit |
| `format_profiles` | id, organization_id, logical_profile_id, version, status (`candidate/validated/verified/legacy/deprecated`), signature jsonb (contains structureHash), source_type (`pdf/tabular`), display_name, parser_config, token_aliases, code_times, off_tokens, employee_row_strategy, employee_row_index, day_column_map, tabular_memory, use_count, successful_use_count, last_used_at, created_by_user_id, supersedes_profile_id | Format Memory v1, no PII |

DB-level unique index on `(organization_id, structureHash) WHERE status != 'deprecated'` (migration 0012) closes a race that used to exist at app level only — already fixed (commit c863223), no open DB/code mismatch found.

**No tables exist yet** for: scheduling (Schedule/ScheduleVersion/ShiftAssignment), acknowledgement, change requests, approval, workflow engine, attendance, reconciliation. Confirmed MISSING at schema level, not just app level.

## Features DONE

- Auth (login/signup/session/reset/rate-limit) — `api/auth/{login,register,logout,request-reset,reset-password}.js`, `api/_lib/auth.js`, migrations 0001-0003
- Organizations / multi-tenancy — `organizations` table, org_id on every business row, `api/organizations/reset.js`, `api/onboarding.js`
- Employee lifecycle (pending_access/active/inactive) — migrations 0001/0005/0006; bulk-link transition bug just fixed in 3d866e0
- Areas (optional) — migration 0008, `api/areas/index.js`, `docs/product/APPLICATION_STRUCTURE_AREAS_OPTIONAL.md`
- Individual import — `ImportModal.tsx` + `analyzeDocumentFile`/`diagnostics.ts`
- Team/bulk import (CSV/XLSX/PDF) — `TeamImportModal`, `team-roster.ts`, `pdf-team-import.ts`, adapters for xlsx/json/xml/structured-rows
- Multi-employee detection — `team-roster.ts`, acceptance-corpus GS-01..10
- Learned formats / format memory (structureHash) — `format_profiles`, `api/format-profiles/index.js`, migration 0012 + c863223 (race closed)
- Unknown format recovery (NEEDS_USER_INPUT/BLOCKED/FAILED) — formalized today, `src/ingestion/diagnostics.ts`, 6-value `ImportState` enum, canonical state-contract fixtures. Decision on record: `BLOCKED` stays terminal, `NEEDS_USER_INPUT` is the only recoverable-with-assistant path.
- Import history — migration 0010
- Safe/logical delete of imports — migration 0010
- Import idempotency — migration 0011, unique indexes on (org, employee, file_fingerprint, context_fingerprint) and semantic_fingerprint
- Bulk user creation / one-time credentials — `MembersModal.tsx`, `credentials-export.ts` (60df5b2), client-side-only TXT, never persisted
- User↔employee linking — `api/_lib/data.js`, bug just fixed (3d866e0)
- i18n ES/EN — coverage test enforces key parity
- Dark/light theme

## Features PARTIAL

- **Memberships / roles**: only `ADMIN`/`EMPLOYEE` exist (`api/_lib/auth.js:163-165`, migration 0007 CHECK constraint). Target RBAC (OWNER/ADMIN/PLANNER/EMPLOYEE + ORGANIZATION/AREA/SELF scopes) is missing and must be designed as a migration from the current 2-role base, including a decision on who becomes OWNER on backfill — not a greenfield design.

## Features MISSING

- Future scheduling (Schedule / ScheduleVersion / ShiftAssignment, draft/publish) — zero grep hits, no schema
- Employee portal (mobile, acknowledgement, change requests) — zero grep hits
- Approval workflow — zero grep hits
- Workflow engine / attendance / reconciliation-reporting — zero grep hits (the only "reconciliation" hits in-repo are import-count reconciliation in the ingestion UI — an unrelated concept, not to be confused with R8)

## Tests existentes

- 95 test files under `src/` + `api/` (`*.test.ts(x)`, `*.test.js`). Runner: Vitest (`npm test` = `vitest run`).
- Ingestion coverage is disproportionately large and rigorous: acceptance-corpus (10 golden + 7 negative fixtures with expected.json + schema), adversarial dataset (8 hostile files), state-contract fixtures (6 canonical `ImportState` scenarios), PDF golden regression test against a real Sept-2026 roster, VLM fallback/trigger/acceptance tests, format-memory spec.
- E2E: `qa/e2e-acceptance/` (Playwright-style specs) + `qa/vlm-fallback/` and `qa/public-header-auth/` visual-regression screenshot sets (dark/light × breakpoints × ES/EN) — appears to be a manual/scripted QA evidence trail, not confirmed CI-gated.
- No test files for scheduling/portal/approval/workflow (consistent with MISSING above).

## Deuda / riesgos

- **Role model gap**: migrating 2 roles → 4 roles + 3 scopes is a real schema migration with a data-backfill decision (who becomes OWNER), not purely additive. Flag as R0-M03 / R2-M06 design risk.
- **No dashboard router split**: `src/App.tsx` hosts the whole post-login app; `src/pages/` only has landing/pricing. R3 (Scheduling) and R4 (Employee Portal) UI need a real routing decision, not an assumed structure.
- **`BLOCKED` is a terminal dead-end by explicit design decision** (dated 2026-09-04, commit 1ee5b8b). Any future capability to recover a `BLOCKED` import would require deliberately revisiting that decision.
- **`api/_lib/data.js` is a 1524-line single file** — the entire data-access layer. New domains (scheduling, approvals) will either bloat it further or force a module-boundary decision — relevant to R0-M05.
- No CI config confirmed in this pass — needs explicit check in R0-M00 whether lint/typecheck/tests run on push or only locally.
- Recent history shows single-writer discipline already in practice (small, sequential, same-day fixes) — worth preserving explicitly given `data.js`'s size and centrality.

## Contradicciones documentales

- **README.md / README.en.md** state the product is "B2C / Prosumer", "no es un HRIS", flow limited to `Importar → revisar → calendario`, badge "Estado: Phase 0". This directly contradicts the actual codebase (multi-tenant orgs, roles/memberships, bulk user provisioning + credential distribution, areas, import history/audit) — infrastructure well past "Phase 0" and clearly B2B/B2B2E. This is the single largest doc/code contradiction and is exactly what R0-M01 (Product Contract Rebaseline) exists to fix.
- `docs/product/APPLICATION_STRUCTURE_AREAS_OPTIONAL.md` and `docs/IMPORT_RECOVERY_FORMAT_MEMORY_REMEDIATION_2026-09-04.md` are current and accurate (same-day as the code they describe) — treat as trustworthy.
- `docs/standards/*` (branding, modal contract, localization contract, motion contract) are live governing contracts actively referenced from code (e.g. `diagnostics.ts` references AGENTS.md rules) — treat as authoritative, not stale.
- `AGENTS.md` content referenced by the global CLAUDE.md points to a path outside this repo (`/home/toni/...`), likely machine-specific — not found in-repo in this pass.

## Gaps a cerrar antes de escribir specs de detalle

- Confirm CI status (does `npm test`/lint/typecheck run automatically on push?) — part of R0-M00.
- Decide OWNER backfill rule before writing R0-M03 in detail.
- Decide dashboard routing approach before writing R3/R4 frontend sections in detail.

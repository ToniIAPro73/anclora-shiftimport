# Format Memory v1 — Technical Design

## Architecture measured today (HEAD 2c466e8)

- Client-only persistence: `src/lib/format-profiles.ts`, `UserFormatProfile[]`
  in `localStorage` key `anclora_shiftimport_format_profiles_v1`. No server
  component (`api/format-profiles/` does not exist).
- Matching/drift logic duplicated: `matchFormatProfile`/`detectProfileDrift`
  in `format-profiles.ts`, re-implemented as `matchProfileIn` in
  `src/ingestion/analysis.ts`.
- Use-count only bumped on confirmed import, from `ImportModal.tsx`
  (`touchFormatProfile(matchedProfileId)` in `handleConfirm`).
- Profile creation is pure-function, PII-safe by construction:
  `buildProfileFromAnswers` (`src/ingestion/assistant.ts`, positional/PDF) and
  `buildTabularProfileFromAnswers` (`src/ingestion/tabular-assistant.ts`,
  tabular/CSV). Both build the profile object field-by-field from analysis +
  user answers, never from raw document text for identity fields.
  `ProfileAssistantPanel.tsx` is the only call site of `saveFormatProfile`.
- Backend: Vercel Functions, Neon Postgres via `@neondatabase/serverless`.
  Auth/session/org-context resolution: `api/_lib/auth.js`
  (`resolveContext`/`requireOrgContext`/`requireRole`). Tenant-scoped data
  access: `api/_lib/data.js`, pattern `assertXInOrg(sql, ctx, id)` throwing
  403 on foreign-org id (no existence leak). Plan gating (unused by this
  feature): `api/_lib/plans.js`.
- Migrations: `db/migrations/000N_*.sql`, forward-only, tracked in
  `_migrations` table by `db/migrate.mjs`, statements split on `;` at EOL —
  **no PL/pgSQL `DO $$` blocks allowed**. Idempotent DDL
  (`IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`). No JSONB column exists yet
  anywhere in the schema. Best precedent for a new optional org-scoped
  entity: `0008_areas_optional.sql` + `api/areas/index.js`.
- `resetOrganization` (`api/_lib/data.js:797-837`) deletes `shifts`,
  `imports`, `employees` for the org inside one transaction; does **not**
  touch `areas`, `organizations`, `users`, `memberships`, `sessions`, or
  `plan`. No format-profiles table exists yet so today it trivially doesn't
  touch profiles either — this feature must make that omission an explicit,
  documented decision (see §Reset policy).

## Components reused (unchanged)

- `computeLayoutSignature`, `fnv1aHash`, `matchFormatProfile`,
  `detectProfileDrift` — canonical signature/matching/drift math stays
  client-side and unchanged; the server never recomputes a signature from a
  document (it never receives one), it only stores/compares the
  already-computed structural signature the client sends.
- `buildProfileFromAnswers` / `buildTabularProfileFromAnswers` — unchanged;
  still the only producers of a candidate profile shape, still PII-safe by
  construction.
- `ProfileAssistantPanel.tsx` / `ImportModal.tsx` — modified only at their
  persistence call sites (swap direct `format-profiles.ts` calls for the new
  `FormatProfileStore` abstraction), UI/UX flow otherwise unchanged.
- `api/_lib/auth.js`, `api/_lib/data.js` patterns (`assertXInOrg`,
  `resolveContext`/`requireOrgContext`/`requireRole`) — reused verbatim style
  for the new `api/format-profiles/*` routes.

## Architecture target

```
Guest session          Authenticated session
     |                          |
     v                          v
LocalFormatProfileStore   RemoteOrganizationFormatProfileStore
     |                          |
localStorage               api/format-profiles/*
                                 |
                                 v
                    api/_lib/data.js (format-profiles.js)
                                 |
                                 v
                    Postgres: format_profiles table (org-scoped)
```

A thin `FormatProfileStore` interface (see `03_IMPLEMENTATION_PLAN.md`
FM-04) is selected once per session based on auth state, not sprinkled as
`if (authenticated)` checks through ingestion/UI code. Ingestion pipeline
(`analysis.ts`) and UI (`ImportModal.tsx`, `ProfileAssistantPanel.tsx`) call
the store interface only, never `localStorage` or `fetch` directly.

## Data flow

1. Import file selected → `analyzeDocumentFile` → `computeLayoutSignature`
   (client) → `store.findMatch(signature)` (local lookup or API call).
2. Match found + status auto-selectable (`validated`/`verified`/compatible
   `legacy`) → aliases applied silently → preview → confirm →
   `store.recordUse(profileId, outcome)`.
3. Match found but drifted (signature differs per `detectProfileDrift`) →
   treated as no-match for auto-apply purposes → assistant flow → on
   completion, `store.saveCandidate(...)` with `logical_profile_id` inherited
   from the drifted profile and `supersedes_profile_id` set server-side.
4. No match → assistant flow → `store.saveCandidate(...)` with a fresh
   `logical_profile_id` (new logical family).
5. `store.saveCandidate` for a remote store is a `POST /api/format-profiles`
   → server independently re-validates/sanitizes the payload
   (`sanitizeFormatProfileForPersistence`) before insert.

## Local vs remote stores

- `LocalFormatProfileStore`: thin wrapper over existing
  `loadFormatProfiles`/`saveFormatProfile`/`deleteFormatProfile`/
  `touchFormatProfile`, unchanged storage key, used for guests.
- `RemoteOrganizationFormatProfileStore`: talks to `api/format-profiles/*`,
  scoped implicitly by session (`organization_id` never sent by client).
  In-memory cache per store instance only (no cross-tab broadcast needed for
  v1); cache invalidated on `logout` / organization switch by discarding the
  store instance (see `03_IMPLEMENTATION_PLAN.md` FM-04 for exact trigger
  points — session/org-context change, not a timer).
- Store selection happens once at the point session state is known (mirrors
  how `ImportModal` already receives `identityLocked`/`areas` as props derived
  from session) — implemented as a factory `getFormatProfileStore(session)`
  in `src/lib/format-profile-store.ts`.

## Versioning

- `logical_profile_id` (UUID) identifies "the same real-world format" across
  versions; stable across drift. `id` (UUID, PK) identifies one specific row
  (one version). `version` (int, starts at 1) increments per
  `logical_profile_id`.
- Only one row per `logical_profile_id` may be
  `validated`/`verified`/`candidate`-and-newest at a time in terms of
  auto-selection eligibility — enforced at the query level (pick highest
  version among non-`deprecated` rows for a `logical_profile_id`), not via a
  DB constraint (multiple historical rows legitimately coexist with
  different statuses).
- `supersedes_profile_id` references the previous version's `id` (nullable,
  self-referential FK within the same org).

## Concurrency

- Optimistic concurrency on mutating endpoints (`confirm`, `deprecate`,
  `reactivate`, metadata update) via an `updated_at` compare-and-swap: client
  sends the `updated_at` it last read; server `UPDATE ... WHERE id = $1 AND
  updated_at = $2`, 0 rows updated → `409 Conflict` with the current row
  returned so the client can retry against fresh state.
- `record use` (increment `use_count`/`successful_use_count`,
  set `last_used_at`) is a single atomic
  `UPDATE ... SET use_count = use_count + 1 ... WHERE id = $1 AND
  organization_id = $2 RETURNING *` — no read-modify-write race, no
  optimistic-concurrency token needed (monotonic counter, order doesn't
  matter).
- `saveCandidate` under drift is idempotent per (`logical_profile_id`,
  `signature`) pair within a short window: if an identical candidate already
  exists for that signature and is not deprecated, the API returns the
  existing row instead of creating a duplicate (prevents duplicate candidate
  spam from concurrent imports of the same changed template).

## Multi-tenant isolation

- Every query filters `WHERE organization_id = ${ctx.organizationId}`
  (never client-supplied) — identical discipline to
  `assertEmployeeInOrg`/`assertAreaInOrg`.
- A profile id belonging to another org resolves as 404 "Format profile not
  found" (no existence leak, matches `areas` pattern), not 403 (403 is
  reserved for role-insufficiency on an in-org resource).
- No endpoint accepts a client-supplied `organization_id`.

## Sanitization

`sanitizeFormatProfileForPersistence(input, context)` in
`src/lib/format-profiles.ts` (shared, imported by both the client save path
for early UX feedback and the API for authoritative enforcement):

- allowlist-only field copy (unknown keys dropped, not merely ignored —
  logged as a rejection reason in dev, silent drop in prod);
- string length caps per field (display_name ≤ 80, token alias key/value ≤
  40, off-token ≤ 20, etc. — exact caps in `02_DATA_API_CONTRACT.md`);
- heuristic PII screen on any free-text-ish field (`display_name`, alias
  values): reject if it matches an email pattern, a long digit run
  (payroll/ID-like), or looks like "Firstname Lastname" (two+ capitalized
  words with no digits/symbols) — heuristic, documented as best-effort, not
  a cryptographic guarantee; combined with the structural fact that the
  client never constructs these fields from raw document text;
  `codeTimes`/`dayColumnMap`/`tabular` indices are numeric/enum-shaped and
  not subject to the text heuristic;
- signature fields are hash-only strings/counts already (structureHash from
  `fnv1aHash`), never raw tokens — enforced by type shape, not scanned.

## Errors

Canonical error shape reused from existing API conventions
(`HttpError { status, message, code? }` → `handleError`). New codes:
`PROFILE_NOT_FOUND` (404), `INVALID_PROFILE_PAYLOAD` (400),
`PROFILE_CONFLICT` (409, optimistic concurrency or duplicate),
`INSUFFICIENT_ROLE` (403, reuses existing role-check path).

## Compatibility

- Existing local-only guest flow: byte-for-byte unchanged behavior and
  storage key.
- Existing `UserFormatProfile` type: kept as the client-side/local shape;
  a new server-canonical `FormatProfile` type is added alongside it (not a
  replacement) in `src/lib/format-profiles.ts`, with an explicit mapping
  function between the two shapes (`toServerCandidateInput`,
  `fromServerProfile`) so existing local tests/behavior are untouched.

## Rollback

- DB: forward-only per repo convention (`01`-style migrations have no down
  script). Rollback of this feature = a follow-up migration that drops the
  new table/columns; not written as part of this feature since it isn't
  needed unless explicitly requested. Documented here as the recovery path.
- API/UI: standard git revert of the feature's commits; no data migration
  is destructive to existing tables (only additive — one new table, no
  column changes to existing tables).

## Reset policy (decision required by architecture spec §5)

Decision: **format profiles are organizational configuration and survive
`resetOrganization`**, analogous to `areas` (which also survive today).
Rationale: profiles encode "how do we read our own roster template," which
persists in meaning across a data reset — the org didn't stop using that
template just because they cleared operational history. Full org deletion
(if/when a "delete organization" flow exists — not implemented in this
repo today, confirmed no such endpoint found) would still cascade-delete via
`organization_id ON DELETE CASCADE` on the new table, so the profiles are
not immortal, only reset-of-operational-data-resistant.
`resetOrganization`'s docstring updated to state this explicitly (see
`03_IMPLEMENTATION_PLAN.md` FM-02).

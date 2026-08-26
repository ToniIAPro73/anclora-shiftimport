# Format Memory v1 — Data & API Contract

## Table: `format_profiles`

Migration file: `db/migrations/0009_format_profiles.sql`.

```sql
CREATE TABLE IF NOT EXISTS format_profiles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  logical_profile_id     UUID NOT NULL,
  version                INTEGER NOT NULL DEFAULT 1,
  status                 TEXT NOT NULL DEFAULT 'candidate'
                           CHECK (status IN ('candidate','validated','verified','legacy','deprecated')),
  signature              JSONB NOT NULL,
  source_type            TEXT NOT NULL CHECK (source_type IN ('pdf','tabular')),
  display_name           TEXT NOT NULL,
  parser_config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_aliases          JSONB NOT NULL DEFAULT '{}'::jsonb,
  code_times             JSONB NOT NULL DEFAULT '{}'::jsonb,
  off_tokens             JSONB NOT NULL DEFAULT '[]'::jsonb,
  employee_row_strategy  TEXT NOT NULL CHECK (employee_row_strategy IN ('identifier','name','manual-row')),
  employee_row_index     INTEGER,
  day_column_map         JSONB,
  tabular_memory         JSONB,
  use_count              INTEGER NOT NULL DEFAULT 0,
  successful_use_count   INTEGER NOT NULL DEFAULT 0,
  last_used_at           TIMESTAMPTZ,
  created_by_user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  supersedes_profile_id  UUID REFERENCES format_profiles (id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS format_profiles_organization_idx
  ON format_profiles (organization_id);

CREATE INDEX IF NOT EXISTS format_profiles_org_logical_idx
  ON format_profiles (organization_id, logical_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS format_profiles_org_logical_version_idx
  ON format_profiles (organization_id, logical_profile_id, version);

CREATE INDEX IF NOT EXISTS format_profiles_org_status_idx
  ON format_profiles (organization_id, status);
```

(No functional/GIN index on `signature` JSONB in v1 — matching is done by
exact `structureHash` equality via a generated column would be an
optimization; v1 queries `signature->>'structureHash'` directly with a
btree expression index only if profile of an org grows large. Deferred; not
required to pass acceptance at expected data volumes.)

Add expression index for the hot lookup path:

```sql
CREATE INDEX IF NOT EXISTS format_profiles_org_structurehash_idx
  ON format_profiles (organization_id, (signature->>'structureHash'));
```

Wrapped in `BEGIN;`/`COMMIT;` per `0007`/`0008` convention. No `DO $$`
blocks.

## Invariants

- `organization_id` required, immutable after insert (no UPDATE ever sets
  it).
- `supersedes_profile_id`, when present, must reference a row with the same
  `organization_id` and same `logical_profile_id` — enforced at the
  application layer (API), not a DB constraint (cross-column FK constraints
  spanning organization_id require a trigger, which the migration
  convention forbids; app-layer enforcement documented here as the
  authoritative check, covered by API tests).
- `status` restricted to the 5-value enum above via `CHECK`.
- Uniqueness: `(organization_id, logical_profile_id, version)` unique —
  no duplicate version numbers within a logical family.
- Index coverage: by organization (tenant scan), by
  (organization, logical_profile_id) (version history lookup), by
  (organization, status) (auto-selection candidate scan), by
  (organization, structureHash) (match lookup).
- Cascade: `organization_id ON DELETE CASCADE` (org deletion removes
  profiles — no such endpoint exists today, documented for future-proofing).
  `created_by_user_id ON DELETE SET NULL` (user deletion doesn't orphan the
  organization's knowledge). `supersedes_profile_id ON DELETE SET NULL`
  (deleting a superseded row, which the product flow never does, doesn't
  cascade-delete its successor).
- Zero-PII: no column may ever contain employee names, external/payroll IDs,
  emails, raw document text, or free text notes — enforced by API-side
  `sanitizeFormatProfileForPersistence`, not by a DB constraint (Postgres
  cannot semantically detect PII).

## Statuses (lifecycle)

`candidate` → `validated` → `verified`; `candidate`/`validated`/`verified` →
`legacy` (on being superseded); any non-`deprecated` status → `deprecated`
(manual, terminal for auto-selection, reversible only by explicit
`reactivate` which moves a `deprecated`/`legacy` row back to `validated`).

## Endpoints

Base path `api/format-profiles/`. All require `resolveContext` +
`requireOrgContext`; specific role gates noted per endpoint. Vercel routing:
`index.js` (collection), `[id].js` (item + sub-actions via method+body, or
nested files as the repo's existing convention allows — mirrors
`api/areas/index.js`'s single-file method-dispatch pattern extended with an
`[id]` file for item-scoped operations, consistent with existing
`api/employees/[id].js`-style routes already in the repo).

### `GET /api/format-profiles`

Any authenticated org role. Query: optional `logicalProfileId` (returns full
version history for one family), optional `status` filter. Returns array of
sanitized `FormatProfile` (no internals — `parser_config` internals limited
to what UI needs; see `06`/UI redaction rule below applies at the UI layer,
API returns full record to authenticated org members since it's their own
org's config, not exposed to end users of other orgs).

Response 200:
```json
{ "profiles": [ { "id": "...", "logicalProfileId": "...", "version": 1,
  "status": "validated", "displayName": "Cuadrante mensual",
  "sourceType": "pdf", "useCount": 12, "successfulUseCount": 11,
  "lastUsedAt": "2026-08-20T10:00:00Z", "createdAt": "...", "updatedAt": "...",
  "supersedesProfileId": null } ] }
```

### `GET /api/format-profiles/:id`

Any authenticated org role. Full record including `signature`,
`tokenAliases`, `codeTimes`, `offTokens`, `employeeRowStrategy`,
`employeeRowIndex`, `dayColumnMap`, `tabularMemory`, `parserConfig` — needed
by the client to apply the profile during import. 404 if not found or
belongs to another org.

### `POST /api/format-profiles` (create candidate)

Any authenticated org role (teaching is not admin-gated — matches product
spec §Roles). Body: candidate input (allowlisted fields only — see
Payload limits below). Server re-runs
`sanitizeFormatProfileForPersistence`; on drift (client passes
`supersedesLogicalProfileId` when it knows it's re-teaching a changed
format), server sets `logical_profile_id` = existing family,
`version` = max+1, `supersedes_profile_id` = current newest non-deprecated
row of that family; when no `supersedesLogicalProfileId` given, a fresh
`logical_profile_id` is generated. `status` always starts `candidate`,
`created_by_user_id` = session user, `created_at`/`updated_at` server-side.
Idempotency: if an identical, non-deprecated `(logical_profile_id,
structureHash)` row already exists, return it (200) instead of creating a
duplicate (201).

201 (created) / 200 (idempotent existing) response: the created/returned
`FormatProfile` full record.

400 `INVALID_PROFILE_PAYLOAD` on any disallowed field, oversize field, or
PII heuristic hit — response includes a sanitized, non-specific
`reason` string (never echoes back the rejected raw value).

### `PATCH /api/format-profiles/:id` (update allowed metadata)

ADMIN only. Only `displayName` is mutable via this endpoint (rename).
Requires `updatedAt` in body for optimistic concurrency; mismatch → 409
`PROFILE_CONFLICT` with current row.

### `POST /api/format-profiles/:id/use` (record use)

Any authenticated org role. Body: `{ outcome: "success" | "failure" }`.
Atomic `use_count += 1`, `successful_use_count += 1` iff
`outcome === "success"`, `last_used_at = NOW()`. No optimistic concurrency
needed (monotonic counters). 200 with updated counts.

### `POST /api/format-profiles/:id/confirm`

ADMIN only. Moves `candidate` → `validated`. Side effect (single
transaction): if `supersedes_profile_id` is set, the referenced row (and
transitively any other non-deprecated row in the same
`logical_profile_id` family with a lower version) is moved to `legacy`.
Requires `updatedAt` for optimistic concurrency. 409 if not currently
`candidate`.

### `POST /api/format-profiles/:id/deprecate`

ADMIN only. Any status → `deprecated`. Requires `updatedAt`. Idempotent
(deprecating an already-deprecated row is a no-op 200, not an error).

### `POST /api/format-profiles/:id/reactivate`

ADMIN only. `legacy` or `deprecated` → `validated`. Does not automatically
demote the currently-newest version of that family (multiple
`validated`/`verified` rows can coexist post-reactivation; auto-selection
picks the highest-version non-deprecated row — see `01_TECHNICAL_DESIGN.md`
§Versioning — so reactivating an old version only matters if the newer one
is later deprecated too). Requires `updatedAt`.

### `GET /api/format-profiles?logicalProfileId=...` (list versions)

Covered by the base `GET` above via query param — not a separate route.

## Permissions summary

| Endpoint | EMPLOYEE | ADMIN |
|---|---|---|
| GET list / get one | yes | yes |
| POST create candidate | yes | yes |
| POST use | yes | yes |
| PATCH rename | no (403) | yes |
| POST confirm | no (403) | yes |
| POST deprecate | no (403) | yes |
| POST reactivate | no (403) | yes |

## Idempotency

- Create candidate: idempotent on `(organization_id, logical_profile_id,
  structureHash)` for non-deprecated rows (see above).
- Confirm/deprecate/reactivate: idempotent in the sense of returning current
  state with 200 when already in target status, EXCEPT confirm requires
  status `candidate` (409 otherwise, since "confirm" implies a state
  transition, not idempotent no-op — deprecate/reactivate are terminal
  admin actions that tolerate replay, confirm is not to avoid double-firing
  the legacy-demotion side effect on an already-validated row).

## Optimistic concurrency

`updated_at` echoed by client on every state-changing PATCH/POST except
`use` (counter-only, no conflict possible) and `create` (no prior state to
conflict with).

## Payload limits (create candidate body)

| Field | Type | Limit |
|---|---|---|
| `displayName` | string | 1-80 chars, PII heuristic screened |
| `sourceType` | enum | `pdf` \| `tabular` |
| `signature` | object | fixed shape (`documentType`, `structureHash` ≤64 chars, `dayHeaderCount` int, `columnCount` int, `hasLegend` bool) |
| `tokenAliases` | map | ≤ 60 entries, key ≤ 40 chars, value ≤ 40 chars |
| `codeTimes` | map | ≤ 60 entries, `{startTime, endTime}` HH:mm strings |
| `offTokens` | array | ≤ 60 entries, each ≤ 20 chars |
| `employeeRowStrategy` | enum | `identifier` \| `name` \| `manual-row` |
| `employeeRowIndex` | int \| null | 0-9999 |
| `dayColumnMap` | map | ≤ 31 entries, int→int |
| `tabularMemory` | object \| null | fixed shape, indices only |
| `parserConfig` | object | fixed shape (`clusterTolerance`, `columnMatchMaxDistance`, numeric) |
| `supersedesLogicalProfileId` | uuid \| omitted | must belong to caller's org (else 404) |

Overall JSON body size cap: 32KB (defensive; well above realistic shape,
rejects abuse). Any field not in this table → entire request rejected
(no partial-accept).

## Allowlist

Exact field allowlist enforced by
`sanitizeFormatProfileForPersistence` = the table above. No passthrough of
unknown keys, ever — not even stored-and-ignored; request is rejected
outright so a client bug surfaces immediately in dev rather than silently
losing data in prod.

## Zero-PII invariants (repeated as explicit contract, not just design prose)

1. No column stores a person's name, external/payroll ID, email, phone, or
   free-text note.
2. No column stores raw document text or an uploaded file.
3. No column stores a concrete shift instance (date + specific employee).
4. `employee_row_index` is a zero-based row position, never row content.
5. `signature.structureHash` is a one-way FNV-1a hash of normalized
   structural tokens — never the tokens themselves.
6. Any request containing a field outside the allowlist is rejected, not
   truncated/ignored (fail closed).

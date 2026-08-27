# Format Memory v1 — Product Spec

Status: DRAFT → GATE 0
Author: Claude Code (autonomous), owner review pending
Related: `sdd/features/multi-format-ingestion/architecture-multi-format-ingestion-spec-v1.md` (Phase 2), `docs/DAFO_ANCLORA_SHIFTIMPORT_2026-08-26.md` (D4, O2, P1)

## Problem

`UserFormatProfile` (learned shift-table format) lives only in browser `localStorage`
(`src/lib/format-profiles.ts`). Nothing is shared across the users of an organization.
Every teammate who imports the same roster template must re-answer the same
assistant questions the first time they use it on their own device. If someone
clears browser storage or switches machine, the learned profile is gone. There is
no lifecycle (candidate/validated/legacy/deprecated), no drift-safe versioning, no
audit of who taught what.

## Users affected

- EMPLOYEE — imports own roster, benefits from a teammate's prior teaching (zero
  repeated questions), can view but not administer profiles.
- ADMIN — same import rights, plus can confirm a candidate profile as
  organization-trusted, deprecate, reactivate legacy versions.
- Guest (unauthenticated) — unaffected; keeps today's local-only behavior.

## Value proposition

> Teach once → reuse across the organization → detect drift safely.

First user to import a given roster template answers the assistant's questions.
That knowledge becomes an organization asset. Every subsequent import of the same
template, by any authorized user in that organization, is recognized automatically
and imported without repeated questions. When the source template changes, the
system detects the drift, never silently overwrites the working profile, and asks
for a light confirmation instead of re-teaching from scratch.

## Use cases

1. First import of an unknown format → assistant resolves ambiguity → profile
   saved as `candidate` in the organization.
2. Second import, same org, same or different user, same format → automatic
   match, zero questions, straight to preview → import.
3. Template changes slightly (new column, renamed legend) → drift detected →
   existing profile untouched → new `candidate` version created, linked via
   `supersedes`.
4. ADMIN reviews a candidate (first-use or drifted) and confirms it →
   `validated`. Repeated successful use later promotes to `verified` (evidence
   threshold, no manual step required).
5. ADMIN deprecates a profile that is no longer valid (e.g. company changed
   payroll vendor) → never auto-selected again, but visible in version history.
6. ADMIN reactivates a `legacy` version if drift promotion was wrong.
7. User who used the app before authentication migrates local profiles into the
   organization on first login (opt-in, explicit, non-destructive to local copy).

## Guest (unauthenticated) behavior

Unchanged: local `UserFormatProfile[]` in `localStorage`, matched/persisted
exactly as today. No network calls to the format-profiles API happen for guests.

## Authenticated behavior

On login, profile store switches to the remote, organization-scoped store. Read
(`list`, `findMatch`) is available to EMPLOYEE and ADMIN. Write:
`saveCandidate`/`recordUse` available to any authenticated org member (learning
and using is not an admin-only act); `confirm`/`deprecate`/`reactivate` restricted
to ADMIN (promotion of trust is an administrative act, mirrors `areas` write
gating).

## Organizational behavior

Profiles are strictly scoped to `organization_id`. No cross-org visibility, no
global registry (explicitly out of scope, see §Out of scope). A profile learned
in Org A is invisible to Org B even if the underlying template is identical.

## Roles and permissions

| Action | Guest | EMPLOYEE | ADMIN |
|---|---|---|---|
| Use local profile | yes | n/a | n/a |
| List org profiles | no | yes | yes |
| Match/reuse profile on import | no | yes | yes |
| Create candidate (teach) | no | yes | yes |
| Record use (import outcome) | no | yes (own imports) | yes |
| Confirm candidate → validated | no | no | yes |
| Deprecate | no | no | yes |
| Reactivate legacy version | no | no | yes |
| Rename (display_name) | no | no | yes |
| Migrate local profiles to org | no | yes (own local data) | yes |

No new roles introduced. Existing `ADMIN`/`EMPLOYEE` only.

## Lifecycle

```
candidate → validated → verified
    ^            |
    |            v
    +------ legacy (superseded by newer candidate/validated on drift)
                 |
                 v
             deprecated (manual, terminal for auto-selection)
```

- `candidate`: newly created (first teaching, or drift-triggered new version).
  Never auto-applied without a preview/validation pass; always surfaced for
  review.
- `validated`: ADMIN confirmed, or evidence threshold reached automatically
  (see `01_TECHNICAL_DESIGN.md` promotion rule). Auto-selected on match, still
  runs full validation on every import.
- `verified`: validated profile with a higher successful-use evidence bar.
  Functionally same auto-selection behavior as validated; distinguishes
  "lightly confirmed" from "heavily proven" for the UI and future promotion
  policies (e.g. global registry contribution — out of scope here, but the
  distinction is what Phase 7 would need).
- `legacy`: superseded by a newer version for the same `logical_profile_id`.
  Still usable if explicitly reactivated; never auto-selected while a newer
  non-deprecated version exists.
- `deprecated`: manually retired by ADMIN. Never auto-selected. Visible in
  history for audit.

## Drift

Drift = observed layout signature differs from a stored profile's signature
enough that blind reuse would risk a wrong parse (see `01_TECHNICAL_DESIGN.md`
for exact drift predicate, reusing `detectProfileDrift`). On drift:

- the previously stable profile is never overwritten in place;
- a new row is created with `version = previous + 1`, `status = candidate`,
  `supersedes_profile_id = previous.id`, same `logical_profile_id`;
- the previous version's status is left untouched by the write itself; a
  human confirmation of the new candidate is what moves the previous version
  to `legacy` (server-enforced, see `02_DATA_API_CONTRACT.md`);
- import that triggered the drift falls back to the assistant for that run
  (treated like an unmatched format), so the user is not blocked waiting for
  ADMIN review.

## Privacy

Zero-PII invariant, enforced server-side (never trust the client):

- Rejected at persistence time: employee names, external/payroll IDs, emails,
  raw document text, concrete shift instances, free-text notes, medical/leave
  content, any object key not on the allowlist.
- Allowed: structural signature (hashed), token→meaning aliases (shift-code
  strings, never names), code start/end times, off-token list, employee-row
  strategy (`identifier`/`name`/`manual-row` + numeric row index — never the
  row's text), day-column map, tabular column indices, a user-chosen display
  name for the format (validated against a denylist heuristic, not just
  accepted as-is).
- Enforcement point: both the client (unchanged, already field-constructs
  profiles without PII) and the API (new — must independently re-validate,
  see FM-01/FM-03).

## UX

- Import flow visuals unchanged for the happy path (quality chip, preview,
  confirm) — the only visible difference is that the assistant now triggers
  less often (org-wide reuse) and, for ADMIN, a new "Formatos aprendidos"
  section exists under organization settings/dashboard.
- New: a one-time, dismissible "migrate your local formats" prompt on first
  authenticated session with local profiles present.
- New: drift surfaces as a light in-context notice at import time
  ("plantilla distinta, versión nueva creada") rather than a blocking modal —
  the import itself proceeds through the assistant like a first-time format.
- ES/EN i18n required for all new user-facing strings (repo already runs a
  bilingual UI).

## Scope (this feature)

FM-01 through FM-10 as defined in `03_IMPLEMENTATION_PLAN.md`: canonical model
+ sanitization, DB migration, org-scoped API + lifecycle, local/remote store
abstraction, local→org migration UX, automatic reuse in the ingestion
pipeline, drift-safe versioning, "Formatos aprendidos" management UI, E2E
acceptance, documentation.

## Out of scope

Billing/Stripe, pricing/plans changes, transactional email, cross-tenant
Global Format Registry, profile exchange between organizations, VLM/AI
providers/serverless OCR, iCal/WebCal/Google/Apple/Outlook calendar
integrations, JSON/XML ingestors, full XLSX rewrite, new roles, native mobile
app, global redesign, wholesale legacy code removal, persisting original
uploaded documents, self-modifying code.

## Acceptance criteria

1. First import of unknown format asks questions once; profile persists to
   the organization on confirm.
2. A second import (same or different user, same org, same format) asks zero
   repeated questions and reaches `READY`/valid preview automatically.
3. A user from a different organization cannot list, match, or use another
   org's profile (verified structurally, not just by absence of UI).
4. Template drift never overwrites the stable profile; produces a new
   `candidate` version; the prior version remains intact and inspectable.
5. No PII field ever reaches the `format_profiles` table, verified by direct
   DB inspection in the acceptance corpus.
6. Local (guest) profile behavior is unchanged; migrating to an org is
   explicit, idempotent, and does not delete the local copy.
7. Reset of organization operational data does not silently destroy the
   learned format configuration (decision recorded in
   `01_TECHNICAL_DESIGN.md` §Reset policy).
8. Full existing regression suite stays green; no `staging`/`production`/
   `main` branch touched; no push performed.

## Metrics (measurable within this repo's test/acceptance tooling, not a live telemetry claim)

- `questions_first_import` > 0, `questions_second_import` = 0 for the same
  fixture (acceptance test assertion).
- `successful_use_count` increments only on confirmed import (unit + API
  test assertion).
- Cross-tenant denial rate = 100% across the API test matrix (no leak case).

# Import Reversion Contract

> Los registros de importación anteriores pueden incluir entidades legacy. El runtime nuevo conserva la reversión de esos efectos sin reactivar el modelo Plan Empresa.

Status: active (migrations 0044–0045). Supersedes the "delete = logical rollback" semantics of the legacy Safe Delete
(`R1-M10`, kept as historical roadmap only).

## 1. Why

An import is no longer "the shifts with its `import_id`". It can touch the current calendar (including `EFFECTIVE → SUPERSEDED`
transitions and pending proposals), legacy company-plan revision rows from older imports, Planning drafts and assignments, annotations (DCF / observations)
and calendar changes. New imports do not create company-plan revisions. Deleting by `import_id` is therefore not a rollback. **Revert** restores the state that existed before the
import **without destroying legitimate later changes**.

## 2. What the database records (effect ledger)

`import_effects` — BEFORE/AFTER of every row an import mutates, written by `AFTER ROW` triggers (`record_import_effect`) in the **same
transaction** as the business write. A write path declares the import with the transaction-local setting `app.import_id`
(`api/_lib/import-ledger.js`: advisory lock + `set_config`). Covered tables: `shifts`, `shift_assignments`, `schedules`,
`schedule_versions`, `company_plan_revisions` (plus coverage markers), `calendar_annotations`, `calendar_changes`.

Write paths instrumented: `confirm-split` (smart import), the legacy row-by-row path (`PATCH /api/shifts` with `importId`, including
replace-style `deleteIds`), and imported annotations. Manual edits are **not** ledgered: that is how a later human change is detected
(the current row no longer equals the ledger's AFTER).

Dependencies are **derived** from the ledger (two imports touching the same `resource_key`; the later one depends on the earlier one).
No separate dependency table exists (documented decision: it would only duplicate `import_effects`). Resource keys: `day:<employee>:<date>`,
`asg:<schedule>:<employee>:<date>`, `sch:<schedule>`, `ann:<employee>:<date>:<kind>:<origin>`, `plan:<scope>:<employeeKey>:<YYYY-MM>`.

## 3. Operation

* `POST /api/imports/reversions/preview { importIds }` — **read-only**. Closes the dependency set, orders the execution
  (dependents first: C → B → A), simulates every inverse against the current state, returns `READY | BLOCKED`, impact and `planHash`.
  The order the client sends is irrelevant (same set ⇒ same plan).
* `POST /api/imports/reversions/confirm { importIds, planHash, reason? }` — recomputes the plan; a different hash is
  `409 REVERSION_PLAN_STALE`; a blocked plan is `409 REVERSION_BLOCKED`. Executes everything (guarded inverse operations, effect
  invalidation, import state, ledger rows) in **one transaction**: all or nothing. Replaying the same confirmation returns the same
  operation (`import_reversions` is unique per `(organization, plan_hash)`), never a second effect.
* `GET /api/imports/reversions/detail?importId=` — the operation that reverted an import.
* `DELETE /api/imports` is only an alias of a single-import reversion; an import that needs related imports or is blocked answers
  `409 USE_REVERSION_API`. There is no second, contradictory deletion semantics.
* OWNER / ADMIN only (the level of the former delete). PLANNER and EMPLOYEE are refused.

## 4. Inverse rules (never a generic "delete by import_id")

| Effect | Inverse (only if the current row still equals the ledger AFTER) |
|---|---|
| insert | delete the row |
| update / state transition | restore BEFORE |
| delete (legacy replace) | re-insert the full BEFORE row (same id) |
| plan revision insert | mark `reverted_at` (history kept, never renumbered; baselines ignore reverted revisions) |
| calendar change insert | delete only if no shift still references it |
| annotation insert/update | delete / restore; a DCF whose hours a human completed becomes an independent `MANUAL` annotation |
| schedule version / assignments | drafts; **or** a `PUBLISHED` version if and only if the same import published it, it has not changed since, and its materialised shifts have no dependents (amendment F0, applies from F1); otherwise `PUBLISHED_DEPENDENCY` |

Anything a human changed afterwards (row differs from AFTER) is **never overwritten**: the plan is `BLOCKED` (`LATER_MANUAL_CHANGE_UNSAFE`).
Published history is never rewritten except to invert a publication performed by the same import under the rule above; no compensating draft is generated (blocked instead). `employee_source_identifiers` is never touched.

## 5. Import state and idempotency

`imports.reverted_at / reverted_by_user_id / reversion_id` (distinct from the legacy `deleted_*`); the row stays in the history as
`Revertida`. The unique idempotency key `(organization, employee, file_fingerprint, context_fingerprint)` is kept (deployed code relies
on its exact `ON CONFLICT` predicate); a reversion releases it by moving the original value to `reverted_context_fingerprint` and
suffixing the live one, so the same file can be imported again (a **new** import event). Duplicate lookups ignore reverted imports and
reverted plan revisions.

## 6. Legacy imports (no ledger)

`LEGACY_SAFE_SHIFT_ONLY`: only plain `EFFECTIVE` shifts of that import, no assignments / annotations / plan revisions / related calendar
changes, untouched since (`updated_at` ≈ `created_at`). Synthetic effects make them part of the dependency graph. Anything else is
`BLOCKED_INSUFFICIENT_PROVENANCE` (no partial rollback).

## 7. Limits (explicit)

* Published planning is never reconstructed: blocked.
* Preview is the authoritative reversibility check; the history list only carries a light hint.
* The reversion ledger stores only structured row states, never document content.

## 4.1 Auto-published imports (amendment F0, applies from F1)

Reversal is **complete or `BLOCKED`**, never silently partial. A shift materialised by an auto-publication is inverted only if it still equals the ledger AFTER state and nothing depends on it: a `change_requests`, `shift_acknowledgements` or `shift_comments` row referencing it yields `PUBLISHED_SHIFT_HAS_DEPENDENTS`; a later version of the same schedule yields `PUBLISHED_DEPENDENCY`; a later manual edit yields `LATER_MANUAL_CHANGE_UNSAFE`. Unread `SHIFT_PUBLISHED` notifications pointing at deleted shifts are removed in the same transaction. Specification: canonical spec §4.1.5.

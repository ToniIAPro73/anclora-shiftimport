# State Model — Shift lifecycle, Acknowledgement, Change Request (design)

Status: **DESIGN ONLY** — forward design for R3/R4/R5. No tables, endpoints, or UI created here. Vocabulary follows [`DOMAIN-GLOSSARY.md`](./DOMAIN-GLOSSARY.md); roles follow [`RBAC-MODEL.md`](./RBAC-MODEL.md).

Per master prompt §17: three separate state machines, never fused into one mega-state-machine. A published Shift stays `PUBLISHED` while a Change Request against it is `PENDING` — they are independent resources, not a compound Shift state.

## 1. Shift lifecycle (R3)

Applies only to shifts produced by future Scheduling (R3: `Schedule` → `ScheduleVersion` → `ShiftAssignment`). Does **not** apply retroactively to shifts created today by Import (see section 5).

```text
DRAFT → PUBLISHED → LOCKED → COMPLETED
```

| Transition | Trigger | Role required |
|---|---|---|
| (create) → `DRAFT` | PLANNER/ADMIN/OWNER creates or edits a schedule draft (R3-M04/M05) | `PLANNER` (scope `ORGANIZATION` or their `AREA`), `ADMIN`, `OWNER` |
| `DRAFT` → `PUBLISHED` | Explicit publish action (R3-M10) | `PLANNER`, `ADMIN`, `OWNER` — same scope rule as draft creation |
| `PUBLISHED` → `LOCKED` | Version becomes immutable per R3-M11 (published version locking) — either automatic on publish, or a later explicit lock action; exact trigger decided in R3-M11, not here | `PLANNER`, `ADMIN`, `OWNER` |
| `LOCKED` → `COMPLETED` | The shift's date has passed (system-driven, not a manual role action) | System (no role — time-based) |

No transition returns a shift to `DRAFT` once `PUBLISHED`. Editing a published/locked shift requires creating a new `ScheduleVersion` in `DRAFT` (R3-M11's immutability rule) — this is a new version, not a state regression on the existing one.

## 2. Acknowledgement (R4)

Independent resource, one per `(Shift, Employee)` pair, only created once the Shift is `PUBLISHED`.

```text
PENDING → ACKNOWLEDGED
```

| Transition | Trigger | Role required |
|---|---|---|
| (create) → `PENDING` | System creates one Acknowledgement per assigned employee when a Shift becomes `PUBLISHED` | System |
| `PENDING` → `ACKNOWLEDGED` | Employee views/confirms their shift (R4-M04) | `EMPLOYEE`, and only for their own Acknowledgement (`SELF` scope) |

Creating or resolving an Acknowledgement never mutates the Shift's own lifecycle state. A Shift can be `PUBLISHED` with some Acknowledgements `PENDING` and others `ACKNOWLEDGED` simultaneously — this is expected steady state, not an error.

## 3. Change Request (R4/R5)

Independent resource, tied to one Shift and one Employee. Creating it does **not** mutate the Shift's state.

```text
PENDING → APPROVED
PENDING → REJECTED
PENDING → CANCELLED
```

| Transition | Trigger | Role required |
|---|---|---|
| (create) → `PENDING` | Employee submits a change request against their own shift (R4-M06) | `EMPLOYEE`, `SELF` scope, own shift only |
| `PENDING` → `APPROVED` | Approver approves (R5-M04), per the `ApprovalPolicy` in effect (`NO_APPROVAL` / `AREA_RESPONSIBLE` / `ORGANIZATION_ADMIN`, see R5-M01) | `AREA_RESPONSIBLE`-equivalent `ADMIN`/`PLANNER`, or `ADMIN`/`OWNER` depending on policy — resolved in R5-M01/M09, not here |
| `PENDING` → `REJECTED` | Approver rejects with mandatory reason (R5-M05) | Same as APPROVED |
| `PENDING` → `CANCELLED` | The requesting employee withdraws it before resolution | `EMPLOYEE`, `SELF` scope, own change request only |

**Explicit rule** (the one master-prompt §17 exists to enforce): a Shift in state `PUBLISHED` remains `PUBLISHED` for the entire time a Change Request against it sits in `PENDING`. The Shift does **not** transition to a `CHANGE_REQUESTED` state — no such state exists on the Shift lifecycle. Multiple concurrent `PENDING` change requests against the same Shift (e.g. from different employees on a shared shift, or sequential requests) are representable precisely because the Shift's own state is untouched by them.

Example: Shift #123 is `PUBLISHED`. Employee A submits Change Request #1 (`PENDING`). Shift #123 is still `PUBLISHED`. An approver rejects #1 (`REJECTED`). Employee A submits Change Request #2 (`PENDING`). Shift #123 is still `PUBLISHED` throughout. Only when/if #2 is `APPROVED` does R5-M07 ("Apply Approved Change") decide how the underlying data changes — that's a separate concern from the Shift's lifecycle state, resolved in R5, not here.

## 4. Authorization matrix summary

| Machine | Transition | Minimum role | Scope |
|---|---|---|---|
| Shift lifecycle | create/edit draft, publish | `PLANNER` | `ORGANIZATION` or assigned `AREA` |
| Shift lifecycle | lock, complete | System | — |
| Acknowledgement | create | System | — |
| Acknowledgement | acknowledge | `EMPLOYEE` | `SELF`, own record only |
| Change Request | create, cancel | `EMPLOYEE` | `SELF`, own shift only |
| Change Request | approve, reject | per `ApprovalPolicy` (R5-M01) | resolved in R5-M09 |

Enforcement of this matrix is implemented in R3-M13 (Shift lifecycle) and R4/R5-M09 (Acknowledgement/Change Request) — this table is the reference, not the implementation.

## 5. Compatibility with current import

Shifts created today by Safe Import (R1) have no lifecycle state at all — there is no `DRAFT`/`PUBLISHED`/`LOCKED`/`COMPLETED` column on `shifts`, and none is added by this microfase. The Shift lifecycle designed above applies only to shifts produced by future Scheduling (R3) going forward. Import-created shifts are not retroactively migrated into this lifecycle for the MVP; R1's import pipeline (analyze → review → compare → confirm) is unaffected by this design and requires no changes.

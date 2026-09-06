# Import Outcome Contract

## Purpose

Every authenticated import attempt produces one explicit outcome. The outcome is
separate from document analysis: `src/ingestion/diagnostics.ts` describes whether
the file can be understood, while this contract describes what the persistence
operation did.

## Terminal statuses

| Status | Meaning | Persistence rule |
|---|---|---|
| `completed` | All eligible rows were persisted or were already present | Must report at least one created or existing shift |
| `partial` | A subset was persisted and the remainder was rejected with a reason | Counts identify both sides |
| `blocked` | No shift was persisted because the user can resolve a condition | The import row remains visible with reason and next action |
| `failed` | No shift was persisted because of a document or system error | The import row remains visible and says whether retry is possible |

`deleted` is a presentation state derived from the existing soft-delete fields;
it is not a write outcome.

## Structured reason

`outcome_reason` is one of:

```text
EMPLOYEE_PENDING_ACCESS
EMPLOYEE_INACTIVE
EMPLOYEE_AMBIGUOUS
EMPLOYEE_UNKNOWN
SELF_IDENTITY_NOT_FOUND
PLAN_LIMIT
AREA_MISMATCH_DECLINED
DOCUMENT_ERROR
SYSTEM_ERROR
```

`blocking_employee_id` is optional, organization-scoped, and never contains a
file row or a credential. `outcome_detail` contains only bounded counts and
context already visible to the actor.

## Idempotency

Completed imports preserve the existing key:

```text
organization + employee + file fingerprint + context fingerprint
```

Blocked and failed attempts are recorded for traceability but do **not** consume
that key. A later retry with the same file and context can therefore complete.

## User-facing minimum

Every non-success outcome states:

1. what happened;
2. what was and was not persisted, in numbers;
3. the structured reason in user vocabulary;
4. the named next action;
5. that the result remains available until the user closes it.

No import outcome is communicated only through a native browser dialog or a
transient toast.

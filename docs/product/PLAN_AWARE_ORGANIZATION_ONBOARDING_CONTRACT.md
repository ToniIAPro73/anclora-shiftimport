# Plan-aware organization onboarding contract

**Phase**: P5.3 — Plan-Aware Organization Onboarding & Initial Governance
**Status**: Implemented locally; final gate evidence recorded in the P5.3 Gate.

## Invariants

- The authenticated User becomes exactly one `OWNER` membership. OWNER does not require an ADMIN.
- User and Employee are different entities. The OWNER and optional ADMIN become Employees only after explicit opt-in; an owner-only organization is valid.
- Areas are optional. No-area organizations use `area_id = NULL`; no pseudo-area is created.
- The plan is selected before submission and persisted in the initial organization insert. Supported pre-billing plans are `free`, `personal`, and `team`, as defined by `api/_lib/plans.js`.
- `team` alone enables the optional areas and initial ADMIN steps. Personal/Free submissions containing those structures are rejected server-side.
- No payment, subscription, trial, invoice, or billing state is created.

## Final submit

The client keeps wizard state until the summary is confirmed. The API accepts one structured payload:

```json
{
  "plan": "team",
  "organization": { "name": "Anclora Group" },
  "areas": [{ "name": "Operations", "ref": "area-0" }],
  "owner": { "isEmployee": false },
  "admin": { "name": "Admin", "email": "admin@example.com", "isEmployee": false }
}
```

The backend validates the plan, plan-specific steps, duplicate area names, email and identity
constraints, then creates organization, areas, memberships and optional Employees through one
transaction. New ADMIN users reuse the existing temporary-password mechanism; existing Users are
reused without changing their password or memberships in other organizations.

Deterministic bootstrap identifiers make a retried final submit converge on the same bootstrap
organization without a schema change. A normal post-success retry is rejected by the existing
zero-membership onboarding guard.

## Valid configuration

An organization is configured when it exists with a valid plan and at least one OWNER membership.
Employee, ADMIN, Area, Shift, Import and Schedule are not required. In particular, OWNER without an
Employee must enter the management dashboard and must not receive an “incomplete configuration”
state; only an unlinked `EMPLOYEE` role is blocked from personal data.

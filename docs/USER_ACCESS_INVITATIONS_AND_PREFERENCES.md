# User access invitations and preferences

Migration `0039_user_access_invitations_and_preferences.sql` prepares the
persistent domain for secure account invitations and later account activation.
It is forward-only; invitation acceptance, Resend delivery, CSV workflows and
the UI are intentionally deferred.

## Entities and compatibility

- `users` remains the global application identity. Its existing `email`,
  nullable `password_hash` and `display_name` keep their current semantics.
  Nullable password hashes continue to support Google/GitHub OAuth-only users.
- `account_status` distinguishes `PENDING_INVITATION`, `ACTIVE` and
  `SUSPENDED`. Existing users receive `ACTIVE` through the migration default.
  Password login and session resolution must accept only `ACTIVE` accounts.
- `organization_people` remains the organization-scoped person and keeps its
  existing `user_id` link. `employee_profiles` remains the employment profile;
  its existing deferred integrity triggers allow only `PENDING_INVITATION`
  people to be unlinked temporarily.
- `users.display_name` is the canonical global visible name. It is deliberately
  not duplicated in `user_preferences`, so changing “Sebas” cannot change an
  employee name such as “Sebastián Pozo Mendoza”.
- `user_preferences` is a sparse, global one-to-one table for `locale` and
  `theme`. The persisted canonical values are the frontend values `es|en` and
  `system|light|dark`; no row is backfilled for every user.

## Invitation lifecycle

`user_access_invitations` stores only a SHA-256 token hash, never a raw token
or temporary password. Its lifecycle is:

`PENDING -> ACCEPTED`

`PENDING -> REVOKED`

`PENDING -> EXPIRED`

Acceptance must later compare a hash, verify expiry and `PENDING` status, and
atomically create/link the user, organization person, membership and password
hash. The database state constraints make accepted and revoked invitations
non-reusable. Expired links are not valid even before a cleanup job marks the
row `EXPIRED`.

Pending uniqueness is scoped to `(organization_id, email_normalized)` and,
when present, `(organization_id, organization_person_id)`. The same email may
therefore be invited by two organizations. A composite foreign key prevents a
person from being referenced across organizations. A pending person must have
exactly one matching pending invitation, and a person-bound pending invitation
must point to a pending person; two deferred constraint triggers validate both
directions so activation can update all rows in one transaction.

`invited_by_user_id` is `NOT NULL` and uses `ON DELETE RESTRICT` to preserve
provenance. The sender must be an active member whose current temporal role is
`OWNER` or `ADMIN`, or an organization-scoped `PLANNER`; an ended role cannot
authorize a new invitation. Physical user deletion is therefore not the
preferred lifecycle operation—deactivation preserves auditability.

The `BEFORE INSERT OR UPDATE` mutation guard keeps the SHA-256 token hash
immutable. `ACCEPTED`, `REVOKED` and `EXPIRED` rows cannot return to pending or
change identity, tenancy, sender, expiry or terminal timestamps. Delivery
metadata remains mutable for future provider callbacks and idempotent retry
bookkeeping. `EXPIRED` can only be recorded after `expires_at`.

Delivery is represented by `delivery_status`, `last_sent_at`,
`last_delivery_at` and `send_attempts`. No complete provider response or
sensitive delivery message is stored. These fields support later idempotent
retry logic without storing credentials or clear tokens.

## Account and employee invariants

- OWNER, ADMIN and PLANNER memberships do not require an employee profile.
- An active `employee_profiles` row must belong to an `organization_people` row
  with a non-null `user_id`; a pending invitation may be temporarily unlinked.
- A pending `organization_people` row is permitted only while its matching
  invitation is pending. Existing `0036` temporal triggers continue to permit
  the unlinked staging state but 0039 closes the missing-invitation gap.
- One global user may have memberships in multiple organizations.
- `users.account_status` is global. Organization suspension is represented by
  the tenant-scoped person/membership state and never rewrites the global
  account to `SUSPENDED`; inviting an already active user to another
  organization does not change the global state or password.
- Roles, scopes, areas and reporting periods remain in the temporal model from
  migrations `0036` and `0037`; 0039 does not duplicate them.

## Security and deferred scope

Token generation, hashing, expiry checks and account activation belong to the
future server endpoint and must execute in one transaction. Password hashes
must continue using the existing scrypt format. No password is emailed or
stored as a temporary credential. Resend configuration is server-only and
validated by `api/_lib/email/config.js`; tests use an injected transport.

Still pending: invitation/acceptance endpoints, final email templates, real
Resend transport, delivery webhooks and the password-setting UI.

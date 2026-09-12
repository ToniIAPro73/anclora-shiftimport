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
  `theme`. Defaults are resolved by column defaults and no row is backfilled
  for every user.

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
person from being referenced across organizations, while a deferred trigger
requires the sender to be a member of the invitation organization.

Delivery is represented by `delivery_status`, `last_sent_at`,
`last_delivery_at` and `send_attempts`. No complete provider response or
sensitive delivery message is stored. These fields support later idempotent
retry logic without storing credentials or clear tokens.

## Account and employee invariants

- OWNER, ADMIN and PLANNER memberships do not require an employee profile.
- An active `employee_profiles` row must belong to an `organization_people` row
  with a non-null `user_id`; a pending invitation may be temporarily unlinked.
- One global user may have memberships in multiple organizations.
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

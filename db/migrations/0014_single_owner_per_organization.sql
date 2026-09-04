-- Migration 0014: preserve the exactly-one-OWNER domain invariant.
-- R2-M06 backfills one OWNER per existing organization; this partial unique
-- index prevents a later role mutation from creating a second OWNER.

CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_owner_per_org_idx
  ON memberships (organization_id)
  WHERE role = 'OWNER';

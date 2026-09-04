-- Migration 0012: race-safe uniqueness for Format Memory candidate lookup.
--
-- api/_lib/format-profiles.js already deduplicates on save via a
-- check-then-insert (SELECT ... WHERE organization_id = ? AND
-- status != 'deprecated' AND signature->>'structureHash' = ? — return the
-- existing row instead of inserting) — this is NOT a bug fix, no duplicate
-- rows exist in dev or production as of this migration (verified via direct
-- query, both < 5 rows total). It closes the one real gap: that
-- check-then-insert has no transaction/locking around it, so two
-- near-simultaneous saves of the identical structureHash for the same org
-- could both pass the SELECT before either INSERT commits, producing a true
-- duplicate. This constraint makes that impossible at the database level
-- instead of only at the application level.
--
-- Partial (WHERE status != 'deprecated'): a deprecated profile is
-- intentionally retired and must not block learning a fresh candidate with
-- the same structural signature — mirrors the existing check's own filter.
--
-- Deliberately excludes the app's own composite-family model
-- (GlobalFormatProfile / OrganizationOverride / AreaProfileBinding) named in
-- some remediation requests — that model does not exist in this schema.
-- format_profiles is the only layer; org_id + structureHash is the correct
-- and complete identity key here.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS format_profiles_org_structurehash_active_idx
  ON format_profiles (organization_id, (signature->>'structureHash'))
  WHERE status != 'deprecated';

COMMIT;

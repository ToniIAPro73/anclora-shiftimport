-- Reconcile the organization type required by the current multi-tenant model.
-- Older databases may have materialized this column outside the recorded
-- migration chain, so keep the migration safe for both fresh and drifted DBs.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS type TEXT;

UPDATE organizations
   SET type = CASE WHEN plan = 'team' THEN 'company' ELSE 'personal' END
 WHERE type IS NULL;

ALTER TABLE organizations
  ALTER COLUMN type SET DEFAULT 'personal';

ALTER TABLE organizations
  ALTER COLUMN type SET NOT NULL;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_type_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_type_check
  CHECK (type IN ('personal', 'company'));

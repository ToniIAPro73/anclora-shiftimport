-- Employee status: add PENDING_ACCESS for employees detected during import
-- but not yet linked to a User account (onboarding state).
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_status_check,
  ADD CONSTRAINT employees_status_check
    CHECK (status IN ('pending_access', 'active', 'inactive'));

-- Update default to active (unchanged behavior for existing rows)
-- No data migration needed: existing rows are 'active' or 'inactive'
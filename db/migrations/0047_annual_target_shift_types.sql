-- Annual objectives define which worked shift types contribute to their totals.
-- Existing objectives retain the new product default: count Regular only.
ALTER TABLE employee_annual_targets
  ADD COLUMN IF NOT EXISTS included_shift_types TEXT[] NOT NULL DEFAULT ARRAY['Regular']::TEXT[];

ALTER TABLE employee_annual_targets
  DROP CONSTRAINT IF EXISTS employee_annual_targets_included_shift_types_check;

ALTER TABLE employee_annual_targets
  ADD CONSTRAINT employee_annual_targets_included_shift_types_check
  CHECK (cardinality(included_shift_types) > 0 AND array_position(included_shift_types, NULL::TEXT) IS NULL);

-- An elevated user may explicitly confirm a timed manual shift on a date
-- already occupied by exactly one full-day record. Provenance lets effective
-- calendar/statistics distinguish that approved exception from invalid legacy
-- or imported combinations.
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_provenance_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_provenance_check CHECK (provenance IS NULL OR provenance IN (
  'COMPANY_IMPORT', 'MANUAL_ADMIN_CHANGE', 'MANUAL_CONFIRMED_WHOLE_DAY_OVERRIDE',
  'EMPLOYEE_REQUEST', 'SCHEDULE_PUBLICATION', 'MIGRATION', 'SYSTEM'
));

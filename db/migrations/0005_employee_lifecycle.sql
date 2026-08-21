-- Employee lifecycle (ADMIN-only deactivate/reactivate/delete):
-- deactivated_at records when an employee was deactivated and is NULL while
-- active. Permanent delete is gated in the API (only employees without shift
-- history; shifts.employee_id is ON DELETE CASCADE), so no extra schema
-- constraint is needed here.
ALTER TABLE employees
  ADD COLUMN deactivated_at TIMESTAMPTZ;

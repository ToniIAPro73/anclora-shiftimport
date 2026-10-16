-- FOR TONI TO RUN MANUALLY (never executed by agents): removes the QA identity's ADMIN membership
-- from the real ShiftImport organization. The QA mirror membership is untouched.
-- Review the SELECT first; run the DELETE only if exactly one row is returned.
SELECT u.email, m.role, m.organization_id
FROM memberships m JOIN users u ON u.id = m.user_id
WHERE m.organization_id = 'a4cf0768-f08d-49e6-bb81-0d3635d58028'
  AND lower(u.email) = 'qa.shiftimport@anclora.test';

-- DELETE FROM memberships
-- WHERE organization_id = 'a4cf0768-f08d-49e6-bb81-0d3635d58028'
--   AND user_id = (SELECT id FROM users WHERE lower(email) = 'qa.shiftimport@anclora.test');

# Tasks — preserve untouched schedule dates

- [x] Verify production rows for October 16–18 using read-only SELECT queries.
- [x] Add failing regression assertions for date-scoped schedule precedence.
- [x] Restore employee/date-scoped filtering in calendar and statistics reads.
- [x] Run focused validation: 118 API tests passed, targeted ESLint passed, and `git diff --check` passed.
- [x] Verify with the restored read predicate that production returns the three existing shifts; perform no production writes.
- [x] Create the implementation commit.
- [x] Push to `development`; stop before promotion.

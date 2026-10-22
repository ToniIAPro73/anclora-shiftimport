# Implementation plan — preserve untouched schedule dates

1. Add regression assertions for employee/date-scoped supersession in calendar and statistics reads.
2. Restore the later-version assignment match in each read query.
3. Run focused API tests and relevant static checks.
4. Confirm the patch changes read logic only; do not mutate production records.
5. Commit and push to `development`; await explicit authorization before promotion.

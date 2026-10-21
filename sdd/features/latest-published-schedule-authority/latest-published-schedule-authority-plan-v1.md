# Latest published schedule is authoritative — plan v1

1. Add query-level regression coverage for calendar and effective-statistics reads.
2. Filter schedule-linked shift rows to the newest version in a published lifecycle state in both read models.
3. Run focused tests and the minimum relevant static checks.
4. Commit and push to `development`; stop before promotion.

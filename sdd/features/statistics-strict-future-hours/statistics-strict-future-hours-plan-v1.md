# Plan — strict future hours in monthly statistics

1. Add a regression case where a current-day shift must be excluded from the current-month planned card.
2. Compute current-month planned hours using the next operational date as the inclusive lower boundary, for both local and server-backed statistics.
3. Keep annual buckets unchanged and document the date boundary.
4. Run the focused statistics tests and the required project validation gates.

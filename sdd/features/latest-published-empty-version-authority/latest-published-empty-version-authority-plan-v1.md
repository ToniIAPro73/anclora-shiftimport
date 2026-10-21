# Implementation plan — empty published version authority

1. Add regression coverage for the SQL authority rule used by statistics and calendar shift listing.
2. Remove the per-date assignment requirement from the correlated latest-published-version check in both readers.
3. Preserve filtering by same schedule, higher version number, and published lifecycle status.
4. Run focused tests, the full unit suite, typecheck/build, and lint as required by repository QA policy.
5. Confirm the change only affects reads and does not mutate production data.

## Data diagnosis

Read-only inspection on 2026-10-21 found that the schedule covering 2026-10-26 through 2026-11-01 has published v3 with zero assignments, while its v2 has four future eight-hour shifts on October 26–29. The statistics query currently admits those four v2 shifts because v3 has no matching assignment rows. The schedule covering October 19–25 has v4 published and its October 25 materialized row is only 04:00–12:00; no 05:00–13:00 row remains in `EFFECTIVE` or `REQUIRES_REVIEW` state for that date.

The four residual v2 rows account for 32 of the reported 56 planned October hours. Applying the schedule-version authority rule removes these rows; the remaining future work rows visible in the inspected schedule data total 24 hours from October 23–25. Confirm the user's expected planned horizon if it differs from the schedule contents.

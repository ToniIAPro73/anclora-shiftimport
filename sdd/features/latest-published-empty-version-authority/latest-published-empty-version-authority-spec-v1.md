# Empty published schedule versions are authoritative — spec v1

## Problem

Calendar and statistics reads currently suppress a materialized shift from an older schedule version only when a newer published version contains an assignment for the same employee and date. If the newest published version intentionally contains no assignment, older materialized shifts remain visible to these readers and inflate future-hour statistics.

## Requirement

For every schedule, only materialized shifts linked to its highest-numbered version in a published lifecycle state (`PUBLISHED`, `LOCKED`, or `COMPLETED`) may be read as current. This remains true when that version contains no assignments. Draft versions do not replace the current published version. Shifts with no schedule version remain unaffected.

Calendar and statistics must use the same rule.

## Acceptance criteria

- A published v3 with no assignments suppresses all materialized shifts from v2 of the same schedule.
- A published v3 with assignments suppresses all materialized shifts from v2, including dates omitted from v3.
- A draft v3 does not suppress published v2 shifts.
- Rows from other schedules and rows with `schedule_version_id IS NULL` remain unaffected.
- Calendar and statistics SQL enforce the same schedule-version authority rule.
- No production data is modified.

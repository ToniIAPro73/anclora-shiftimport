# Latest published schedule is authoritative — spec v1

## Problem
Calendar and effective statistics can still read effective shift rows materialized from an older schedule version when that version was published before prior-version retirement was implemented.

## Requirement
For each schedule, operational calendar and effective-statistics reads must include schedule-derived rows only from its highest-numbered version in a published lifecycle state (`PUBLISHED`, `LOCKED`, or `COMPLETED`). Draft versions must not hide the currently published plan. Non-schedule shifts remain unaffected.

## Acceptance criteria
- When v3 is the latest published version and contains only a 04:00–12:00 shift for a date, reads do not include shifts from v1 or v2 for that schedule.
- Calendar and annual/monthly effective statistics apply the same version rule.
- Draft versions do not supersede the current published version.
- Rows not linked to a schedule version remain unchanged.
- No production data mutation or schema migration is required.

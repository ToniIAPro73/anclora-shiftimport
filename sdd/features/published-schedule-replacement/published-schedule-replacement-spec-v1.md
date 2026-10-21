# Published schedule replacement — spec v1

## Problem
Publishing a new draft version of an existing schedule materializes its assignments in `shifts`, but previously materialized assignments from earlier versions remain `EFFECTIVE`. The operational calendar then displays both the old and replacement shifts for the same schedule period.

## Requirement
Publishing a valid DRAFT must atomically replace the calendar rows materialized by earlier versions of the same schedule. Prior effective rows linked to those versions become `SUPERSEDED`; assignments from the newly published version become the only effective rows for that schedule. Rows belonging to another schedule or to non-schedule calendar sources must remain unchanged.

Publication remains one transaction: if validation fails, neither the version transition nor shift state changes may persist. Publishing a new version must materialize its rows even when their values equal rows from an older version.

## Acceptance criteria
- Publishing version N+1 supersedes effective shifts materialized from earlier versions of that same schedule.
- The new version's assignments are materialized as effective calendar shifts, including exact copies of old assignments.
- Shifts from other schedules, manual changes, and unrelated calendar sources are untouched.
- Failed publication leaves prior effective rows unchanged.
- No schema migration is required.

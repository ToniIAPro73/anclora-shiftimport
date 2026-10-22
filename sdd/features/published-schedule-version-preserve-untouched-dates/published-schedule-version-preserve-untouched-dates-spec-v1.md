# Published schedule revisions preserve untouched employee dates — spec v1

## Problem

Calendar and statistics currently hide every materialized shift from an earlier published version whenever any newer version of the same schedule exists. Planner revisions can leave unchanged employee/date assignments out of a newer version, so this rule hides valid shifts from dates the revision did not change. Production data confirms that Sebastián Pozo Mendoza has effective 13:00–21:00 shifts on 16–18 October 2026 in version 2, while version 3 has no assignments for him on those dates; the current read query hides all three.

## Requirement

A later published schedule version supersedes an earlier materialized shift only when it contains an assignment for the same employee and date. Dates omitted from the later version retain the earlier effective shift. Calendar and statistics must use this same rule. Draft versions do not supersede published rows.

## Acceptance criteria

- A published v3 assignment replaces v2 rows for the same employee/date.
- A published v3 with no assignment for a date leaves that date's v2 row visible.
- Draft versions do not supersede published rows.
- Calendar and effective-statistics queries implement the same employee/date-scoped precedence.
- No production data is modified.

## Production diagnosis

Read-only inspection of the production ShiftImport organization found one effective 13:00–21:00 row for Sebastián on each of October 16, 17, and 18, linked to published version 2 of the October 12–18 schedule. Published version 3 has no assignment for those employee/date pairs. The rows are being hidden by the whole-schedule version filter introduced in commit `61f28a1`.

# Day-scoped schedule version replacement — spec v1

## Problem
A new published schedule version may contain only the assignments changed by the planner. Treating the newest version as a full replacement hides or retires unchanged days from prior published versions.

## Requirement
Publishing a version replaces prior effective rows only for employee/date pairs represented by assignments in that version. Calendar and effective-statistics reads apply the same rule retroactively: an older scheduled row is ignored only when a later published lifecycle version of the same schedule contains an assignment for that same employee and date. Unchanged employee/date pairs retain their previous effective rows. Non-schedule rows are unaffected.

## Acceptance criteria
- A changed employee/date pair is represented by its newest published version only.
- A date absent from the newer version retains its prior effective row.
- Draft versions do not supersede published rows.
- Calendar and annual/monthly statistics use the same date-scoped rule.
- No production data query, mutation, or migration is needed for this code change.

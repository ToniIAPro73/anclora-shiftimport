# Day-scoped schedule version replacement — plan v1

1. Add regression assertions for publication, calendar, and statistics queries.
2. Scope publication retirement to employee/date pairs assigned in the new version.
3. Scope read-side version filtering to a later published assignment for the same employee/date.
4. Run targeted tests, lint, typecheck, and build; push to `development` and stop before promotion.

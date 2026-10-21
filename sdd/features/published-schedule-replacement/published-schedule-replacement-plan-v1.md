# Published schedule replacement — implementation plan v1

1. Add a regression assertion to the schedule publication test for superseding prior materialized rows by schedule lineage.
2. Update the atomic publication CTE to transition prior-version shifts for the same schedule to `SUPERSEDED` before materializing the new version.
3. Scope duplicate detection to avoid suppressing an identical row merely because it exists in a superseded prior version.
4. Run the targeted publication tests and repository build/lint gates required by the local contract.

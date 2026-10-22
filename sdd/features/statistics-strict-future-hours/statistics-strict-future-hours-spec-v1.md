# Strict future hours in monthly statistics — spec v1

## Problem

The current-month “Planificado futuro (resto del mes)” bucket includes shifts dated today. This inflates the future figure by the hours scheduled for the current day, even though the label means dates after today.

## Requirement

For monthly statistics, planned future hours include only shifts whose operational date is strictly later than today. The annual planned bucket and overall calendar rows keep their existing today-inclusive behavior.

## Acceptance criteria

- In the current month, a shift dated today is not included in the “rest of the month” planned card.
- Shifts dated after today remain planned, and past shifts remain in the realized bucket.
- Local-first and production-backed statistics use the same boundary.
- Annual projection behavior remains unchanged.
- No production database records are modified.

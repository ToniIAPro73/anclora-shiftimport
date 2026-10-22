# Tasks — strict future hours in monthly statistics

- [x] Add regression coverage for excluding today's shifts from the current-month planned card.
- [x] Apply the strict-future boundary to local and backend monthly statistics.
- [x] Verify current-month statistics tests and TypeScript/Vite production build.
- [x] Keep annual statistics on their prior boundary; no production records were changed.

Validation: `npm test -- --run src/components/shift-dashboard/StatisticsModal.test.tsx api/_lib/calendar-version-authority.test.js` (21 passed); `npm run build` (passed; Vite reports the existing large-chunk advisory).

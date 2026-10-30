# Mobile diagnostics (F1-M00)

`diagnose.mjs` measures horizontal overflow per screen and viewport with the **whole API mocked in the browser**
(no backend, no Neon, no session writes). Run a Vite dev server first:

```bash
npx vite --port 5199 --strictPort &
node qa/mobile-diagnostics/diagnose.mjs http://localhost:5199 qa/mobile-diagnostics/measurements
```

`html, body { overflow: hidden }` hides document overflow from `documentElement.scrollWidth`, so the script also lifts the
root overflow and lists *unclipped* offenders (past the viewport with no clipping ancestor).

## Findings (baseline `7979b35`, spec §5.1.0)

- 360–430 px: **no document overflow and no unclipped offenders** in Calendar, Planner grid and Planner table. The wide
  month grid (780 px) and planner table (860–880 px) live inside `overflow-x: auto` containers.
- The Samsung screenshots are consistent with a **~980 CSS px layout viewport**, not with an overflow: at 930–980 px the planner
  renders employee column 190 px and day columns 99 px (ratio 1.92; screenshot 1.93), `day-focus` 8–11 px wide (the squeezed
  strip) and the overflow hint as a 116 px side column. Likely browser "desktop site" mode / a viewport that ignores
  `width=device-width`; not reproducible as an app defect. To confirm on the device: open the page and read `innerWidth`.
- Real defects reproduced at ≤980 px and fixed in F1-M02: `day-focus` squeezed (specificity `.weekly-planner__toolbar > div`),
  overflow hint rendered beside the grid, planner toolbar not stacking on narrow widths, "1 turnos".

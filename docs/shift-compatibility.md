# Shift compatibility domain

The current model is a set of non-overlapping half-open time segments per
employee and date. `Ausencia` is a timed, non-exclusive event: it stores its
date, start time, end time, type and `counts_as_work = false`, while its hours
are accounted as absence hours. `Libre`, `Vacaciones` and a configured
full-day `Baja` are exclusive all-day events.

| Existing / incoming | Timed interval | Full-day event |
| --- | --- | --- |
| Timed interval | Allowed when the half-open intervals do not overlap | Rejected |
| Full-day event | Rejected | Rejected |

This allows `Regular 08:00–11:00 + Ausencia 11:00–12:00 + Regular
12:00–16:00`, and rejects actual interval intersections. The authoritative
server validator lives in `api/_lib/shift-compatibility.js`; the local-first
calendar uses the equivalent domain rule in `src/lib/shift-compatibility.ts`.
The frontend only anticipates the rule; authenticated writes are revalidated
by the API.

The model deliberately does not support an absence exception superimposed on
a planned interval. A future exception model would need separate planned,
worked and absent quantities to prevent double counting and requires an
independent functional specification.

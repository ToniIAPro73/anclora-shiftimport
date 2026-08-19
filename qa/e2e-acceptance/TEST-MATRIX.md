# E2E Acceptance Matrix — anclora-shiftimport development

Target URL: https://anclora-shiftimport-git-development-pmi140979-6354s-projects.vercel.app
Deployment: dpl_8YYL4FyASeoPUg19z5JE5LavEPxC, SHA 822efbe6284e80d991697e3490b25c32b6b6f785 == origin/development.

Fixture root: `src/ingestion/fixtures/acceptance-corpus/fixtures/`
Expectations: per-fixture `expected.json` (assignments filtered by employee_id + month) — coder must read each file for exact expected counts/dates.

## Positive cases

| CASE_ID | Fixture source | Type | Doc | Month/Year (UI selects) | Employee (Nombre / ID inputs) | Expected |
|---|---|---|---|---|---|---|
| GS-01-SEP-CARLOS | GS-01_multi-month/source.pdf | PDF | TYPE_MULTI | Septiembre 2026 | Carlos Ruiz / EMP-102 | 30 shifts, only 2026-09 dates, never October, no "61 días" |
| GS-01-OCT-CARLOS | GS-01_multi-month/source.pdf | PDF | TYPE_MULTI | Octubre 2026 | Carlos Ruiz / EMP-102 | 31 shifts, only 2026-10 dates, never September |
| GS-01-SEP-LUCIA | GS-01_multi-month/source.pdf | PDF | TYPE_MULTI | Septiembre 2026 | Lucía Martín / EMP-101 | 30 shifts, only September |
| GS-01-OCT-JORGE | GS-01_multi-month/source.pdf | PDF | TYPE_MULTI | Octubre 2026 | Jorge Vidal / EMP-104 | 31 shifts, only October |
| GS-02-CLEAN | GS-02_rotating-scan/clean.pdf | PDF scan | OCR | Octubre 2026 | per expected.json profile TEAM-A | 31 assignments; OCR browser path |
| GS-02-DEGRADED | GS-02_rotating-scan/degraded.pdf | PDF scan | OCR | Octubre 2026 | TEAM-A | 31 (degraded tolerance ≥95%) |
| GS-03-ANA | GS-03_hospitality/source.pdf | PDF | TYPE_LEGEND | Octubre 2026 | Ana López / H-201 | 14 assignments (2026-10-01..14) |
| GS-03-NORA | GS-03_hospitality/source.pdf | PDF | TYPE_LEGEND | Octubre 2026 | Nora Gil / H-301 | 14 assignments |
| GS-04-MIGUEL | GS-04_restaurant-xlsx/source.xlsx | XLSX | weekly | week 2026-10-05 (Octubre 2026) | Miguel Cano / R-002 | 7 — Node corpus FAILS (MALFORMED_INPUT, m0_partial); record actual |
| GS-05-SARA | GS-05_hospital-xlsx/source.xlsx | XLSX | monthly grid | Octubre 2026 | Sara Vidal / N-12 | 31 — Node corpus FAILS (MALFORMED_INPUT); record actual |
| GS-06-OP001 | GS-06_irregular-csv/source.csv | CSV | roster | week 2026-10-05 (Octubre 2026) | OP-001 per expected.json | 3 assignments |
| GS-08-CLEAN-AP017 | GS-08_dense-image/clean.png | PNG | OCR | week 2026-10-19 (Octubre 2026) | AP-017 | 7 |
| GS-08-CLEAN-AP048 | GS-08_dense-image/clean.png | PNG | OCR | week 2026-10-19 | AP-048 | 7 |
| GS-08-LOWRES | GS-08_dense-image/low-resolution.jpg | JPG | OCR | week 2026-10-19 | AP-017 | 7 (tolerance) |
| GS-08-SKEWED | GS-08_dense-image/skewed.jpg | JPG | OCR | week 2026-10-19 | AP-017 | 7 (tolerance) |
| GS-08-LOWCONTRAST | GS-08_dense-image/low-contrast.jpg | JPG | OCR | week 2026-10-19 | AP-017 | 7 (tolerance) |
| GS-08-PERSPECTIVE | GS-08_dense-image/perspective.jpg | JPG | OCR | week 2026-10-19 | AP-017 | 7 (tolerance) |
| GS-09-CLEAN | GS-09_mobile-calendar/clean.jpg | JPG | OCR | Octubre 2026 | EMP-778 | 31 |
| GS-09-CROPPED | GS-09_mobile-calendar/cropped.jpg | JPG | OCR | Octubre 2026 | EMP-778 | 31 (tolerance) |
| GS-09-COMPRESSED | GS-09_mobile-calendar/compressed.jpg | JPG | OCR | Octubre 2026 | EMP-778 | 31 (tolerance) |
| GS-10-EVA | GS-10_domain-edge-cases/source.csv | CSV | row-per-day | Octubre 2026 | Eva Test / EDGE-01 | 10 golden rows incl. split shift, crosses_midnight, VAC/BAJA/AUS/L/XYZ statuses — Node corpus PARTIAL 9/10; record actual |

## Negative / safe-failure cases

| CASE_ID | Fixture | Input | Expected UI |
|---|---|---|---|
| GS-07-DOCX | GS-07_docx-unsupported/source.docx | any | `Error: Formato de archivo no soportado.` — no silent import |
| GN-01-UNKNOWN-EMP | GS-03_hospitality/source.pdf | Persona Inexistente / H-999, Octubre 2026 | `Error: No se ha encontrado a este empleado en el documento.` |
| GN-02-AMBIGUOUS | _negative/GN-02_ambiguous-employee/source.pdf | Ana López (no ID), Octubre 2026 | ambiguity or unsupported-layout error; NEVER silent import |
| GN-03-EMPTY | _negative/GN-03_empty-document/source.pdf | any | error (empty / no recognizable structure) |
| GN-04-MALFORMED-CSV | _negative/GN-04_malformed-csv/source.csv | any | `Error: El archivo tiene un formato interno no válido o dañado.` or safe equivalent |
| GN-05-TXT | _negative/GN-05_unsupported-format/source.txt | any | `Error: Formato de archivo no soportado.` |
| GN-06-NO-SHIFTS | _negative/GN-06_no-shifts-found/source.csv | NS-01, Octubre 2026 | no importable shifts / NO_SHIFTS_FOUND error; confirm disabled |
| GN-07-LAYOUT | _negative/GN-07_unsupported-layout/source.png | any | UNSUPPORTED_LAYOUT error or assistant; no fabricated shifts |

## Assertions per case (DOM, not visual)

- Selected month/year preserved or auto-detected correctly (no silent change after user sets them for multi-month).
- Quality chip `[data-testid="import-quality-state"]` state.
- Detected counter `N encontrados`.
- Preview table rows: dates, shift codes; assert set of dates ⊆ expected month/week; count match.
- Confirm button `Confirmar Importación (ready/total listos)` count.
- After confirm: `anclora_shifts_v1` length/dates, calendar `.month-shift-badge` count for target month.
- Zero cross-month leakage: no dates outside target month after import.
- Console: no uncaught exceptions / failed requests from app defects.

## Interaction handling

- Seed localStorage pre-load: `anclora_shiftimport_onboarding_v1={"version":1,"completed":true,"step":"CONFIRMED"}`, `anclora-cookie-consent-v1={"necessary":true,"analytics":false,"marketing":false}`, locale `es`. Clear `anclora_shifts_v1`, `anclora_shiftimport_format_profiles_v1`, `anclora_shiftimport_shift_types_v1`, profile between cases.
- Assistant panel: if row-selection appears pick correct candidate; token questions answer per expected.json semantics (work/free); day-mapping confirm if correct.
- If import-conflict modal appears (re-import), click `Omitir turno` repeatedly.

## Responsive QA

- Desktop 1440x900: GS-01-SEP-CARLOS + GS-03-ANA full flow.
- Mobile 390x844: same two cases; verify modal fits, scrolling works, buttons reachable, employee selector usable.

## Failure classification

APP_BUG / FIXTURE_PROBLEM / TEST_AUTOMATION_PROBLEM / DEPLOYMENT_PROBLEM / ENVIRONMENT_PROBLEM / EXPECTATION_MISMATCH.
Known Node-corpus reds to compare against: GS-04, GS-05 (MALFORMED_INPUT), GS-10 (9/10), GN-02/GN-03 (error code mismatch).
